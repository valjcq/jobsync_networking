import {
  requestPasswordReset,
  resetPassword,
} from "@/actions/passwordReset.actions";
import prisma from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  hashResetToken,
  resetRateLimitForTests,
} from "@/lib/passwordReset";
import bcrypt from "bcryptjs";

vi.mock("@/lib/db", () => {
  const mockPrisma: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) =>
      typeof arg === "function" ? arg(mockPrisma) : Promise.all(arg),
    ),
  };
  return { default: mockPrisma };
});

vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "1.2.3.4" })),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("new-hash") },
}));

const user = {
  id: "user-1",
  name: "Ada",
  email: "ada@example.com",
  password: "old-hash",
};

describe("password reset actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitForTests();
    process.env.NEXTAUTH_URL = "https://jobs.example.com/";
  });

  describe("requestPasswordReset", () => {
    it("stores only a hash of the token and emails a link to the public URL", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(user);

      const result = await requestPasswordReset({ email: user.email });

      expect(result).toEqual({ success: true });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      });
      const created = (prisma.passwordResetToken.create as any).mock.calls[0][0]
        .data;
      const mail = (sendEmail as any).mock.calls[0][0];
      expect(mail.to).toBe(user.email);
      const token = new URL(
        mail.text.match(/https:\/\/\S+/)[0],
      ).searchParams.get("token")!;
      expect(mail.text).toContain(
        "https://jobs.example.com/reset-password?token=",
      );
      expect(created.tokenHash).toBe(hashResetToken(token));
      expect(created.tokenHash).not.toBe(token);
      expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("gives the same answer for an unknown email and sends nothing", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const result = await requestPasswordReset({ email: "nobody@example.com" });

      expect(result).toEqual({ success: true });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("stops sending after 3 requests for the same email in an hour", async () => {
      (prisma.user.findUnique as any).mockResolvedValue(user);

      for (let i = 0; i < 5; i++) {
        expect(await requestPasswordReset({ email: user.email })).toEqual({
          success: true,
        });
      }

      expect(sendEmail).toHaveBeenCalledTimes(3);
    });

    it("rejects an invalid email", async () => {
      const result = await requestPasswordReset({ email: "nope" });
      expect(result.error).toBeDefined();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("reports when the server has no public URL to link to", async () => {
      delete process.env.NEXTAUTH_URL;
      delete process.env.AUTH_URL;
      const result = await requestPasswordReset({ email: user.email });
      expect(result.error).toMatch(/not set up/);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    const validToken = {
      id: "tok-1",
      userId: user.id,
      tokenHash: hashResetToken("the-token"),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };
    const input = {
      token: "the-token",
      password: "brand-new-pw",
      confirmPassword: "brand-new-pw",
    };

    it("changes the password and uses up the token", async () => {
      (prisma.passwordResetToken.findUnique as any).mockResolvedValue(
        validToken,
      );
      (prisma.passwordResetToken.updateMany as any).mockResolvedValue({
        count: 1,
      });

      const result = await resetPassword(input);

      expect(result).toEqual({ success: true });
      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashResetToken("the-token") },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith("brand-new-pw", 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { password: "new-hash" },
      });
    });

    it.each([
      ["unknown", null],
      ["expired", { ...validToken, expiresAt: new Date(Date.now() - 1) }],
      ["used", { ...validToken, usedAt: new Date() }],
    ])("rejects an %s token", async (_label, record) => {
      (prisma.passwordResetToken.findUnique as any).mockResolvedValue(record);

      const result = await resetPassword(input);

      expect(result.error).toMatch(/invalid or has expired/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("does not change the password if the token was claimed concurrently", async () => {
      (prisma.passwordResetToken.findUnique as any).mockResolvedValue(
        validToken,
      );
      (prisma.passwordResetToken.updateMany as any).mockResolvedValue({
        count: 0,
      });

      const result = await resetPassword(input);

      expect(result.error).toMatch(/invalid or has expired/);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects mismatched passwords before touching the database", async () => {
      const result = await resetPassword({
        ...input,
        confirmPassword: "something-else",
      });
      expect(result.error).toBe("Passwords do not match.");
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    });
  });
});
