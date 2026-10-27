"use server";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import {
  RESET_TOKEN_TTL_MS,
  allowResetRequest,
  appBaseUrl,
  findUsableResetToken,
  generateResetToken,
  resetPasswordUrl,
} from "@/lib/passwordReset";
import {
  ForgotPasswordFormSchema,
  ResetPasswordFormSchema,
} from "@/models/passwordReset.schema";

const INVALID_LINK =
  "This reset link is invalid or has expired. Please request a new one.";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")
  );
}

/**
 * Emails a reset link if the address belongs to an account. The reply is the
 * same either way, and the email is sent in the background, so the form
 * cannot be used to find out who has an account.
 */
export async function requestPasswordReset(formData: {
  email: string;
}): Promise<{ success?: boolean; error?: string }> {
  const parsed = ForgotPasswordFormSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: "Please enter a valid email." };
  }
  if (!isEmailConfigured() || !appBaseUrl()) {
    return {
      error:
        "Password reset by email is not set up on this server. Please contact the administrator.",
    };
  }

  const { email } = parsed.data;
  if (!allowResetRequest(email, await clientIp())) {
    return { success: true };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { success: true };
  }

  const { token, tokenHash } = generateResetToken();
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = resetPasswordUrl(token);
  sendEmail({
    to: user.email,
    subject: "Reset your JobSync password",
    text: [
      `Hi ${user.name},`,
      "",
      "Someone asked to reset the password for your JobSync account.",
      "Open this link to choose a new password. It works once and expires in 1 hour:",
      "",
      link,
      "",
      "If you did not ask for this, you can ignore this email. Your password stays the same.",
    ].join("\n"),
    html: `<p>Hi ${escapeHtml(user.name)},</p>
<p>Someone asked to reset the password for your JobSync account.</p>
<p><a href="${escapeHtml(link)}">Choose a new password</a></p>
<p>The link works once and expires in 1 hour.</p>
<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>`,
  }).catch((error) => {
    console.error("Failed to send password reset email:", error);
  });

  return { success: true };
}

export async function resetPassword(formData: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ success?: boolean; error?: string }> {
  const parsed = ResetPasswordFormSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  }

  const record = await findUsableResetToken(formData.token);
  if (!record) {
    return { error: INVALID_LINK };
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Claiming the token inside the transaction stops two concurrent
    // submissions of the same link from both succeeding.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: { password: hashedPassword },
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    });
    return true;
  });

  return updated ? { success: true } : { error: INVALID_LINK };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
