import { handleListFollowups } from "@/lib/mcp/tools/listFollowups";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: { interaction: { findMany: vi.fn() } },
}));

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;

const followUp = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  nextStep: "Send portfolio",
  nextStepDate: new Date(2026, 8, 12),
  Contact: { id: "c1", name: "Sam Lee", Company: { label: "Acme" } },
  Purpose: { id: "p1", label: "Coffee Chat" },
  Job: null,
  ...over,
});

describe("handleListFollowups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkMcpRateLimit as any).mockReturnValue({ allowed: true, resetIn: 0 });
    db.interaction.findMany.mockResolvedValue([followUp()]);
  });

  it("returns a rate-limit message and does not query", async () => {
    (checkMcpRateLimit as any).mockReturnValue({ allowed: false, resetIn: 2000 });
    const res = await handleListFollowups("user-1");
    expect(res.content[0].text).toBe("Rate limit exceeded. Try again in 2s.");
    expect(db.interaction.findMany).not.toHaveBeenCalled();
  });

  it("asks for the same rows as the follow-ups card, scoped to the token's user", async () => {
    await handleListFollowups("user-1");
    const args = db.interaction.findMany.mock.calls[0][0];
    expect(args.where.createdBy).toBe("user-1");
    expect(args.where.nextStep).toEqual({ not: null });
    expect(args.where.nextStepDoneAt).toBeNull();
    expect(args.where.nextStepDate.not).toBeNull();
    expect(args.where.nextStepDate.lte).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ nextStepDate: "asc" });
  });

  it("lists step, contact, purpose, due date and both ids", async () => {
    const res = await handleListFollowups("user-1");
    expect(res.content[0].text).toContain("1 follow-up due");
    expect(res.content[0].text).toContain(
      "- Send portfolio — Sam Lee (Acme), Coffee Chat, due 2026-09-12 (interaction id: i1, contact id: c1)",
    );
  });

  it("includes the linked job when there is one", async () => {
    db.interaction.findMany.mockResolvedValue([
      followUp({
        Job: { id: "j1", JobTitle: { label: "Engineer" }, Company: { label: "Globex" } },
      }),
    ]);
    const res = await handleListFollowups("user-1");
    expect(res.content[0].text).toContain("job: Engineer @ Globex");
  });

  it("says so when nothing is due", async () => {
    db.interaction.findMany.mockResolvedValue([]);
    const res = await handleListFollowups("user-1");
    expect(res.content[0].text).toBe("No follow-ups are due.");
  });

  it("surfaces database errors instead of throwing", async () => {
    db.interaction.findMany.mockRejectedValue(new Error("boom"));
    const res = await handleListFollowups("user-1");
    expect(res.content[0].text).toBe("Error: boom");
  });
});
