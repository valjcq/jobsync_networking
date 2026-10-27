import { createHash, randomBytes } from "crypto";
import prisma from "@/lib/db";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP = 10;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

// Links are built from the configured public URL, never from the request's
// Host header: a forged Host would otherwise make us email a victim a reset
// link pointing at an attacker's server.
export function appBaseUrl(): string | undefined {
  const url = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  return url?.replace(/\/+$/, "");
}

export function resetPasswordUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/** The token row if it exists, is unused and has not expired. */
export async function findUsableResetToken(token: string) {
  if (!token) return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) return null;
  return record;
}

// In-memory, per process: fine for the single-container deployment, and it
// resets on restart, which only ever makes it more lenient.
const attempts = new Map<string, number[]>();

function allow(key: string, max: number, now: number): boolean {
  const recent = (attempts.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (recent.length >= max) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

export function allowResetRequest(email: string, ip: string | null): boolean {
  const now = Date.now();
  if (attempts.size > 10_000) attempts.clear();
  const ipOk = ip ? allow(`ip:${ip}`, MAX_REQUESTS_PER_IP, now) : true;
  const emailOk = allow(
    `email:${email.toLowerCase()}`,
    MAX_REQUESTS_PER_EMAIL,
    now,
  );
  return ipOk && emailOk;
}

export function resetRateLimitForTests(): void {
  attempts.clear();
}
