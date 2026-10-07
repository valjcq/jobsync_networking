import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";

export type ToolResult = { content: Array<{ type: "text"; text: string }> };

export const text = (t: string): ToolResult => ({
  content: [{ type: "text", text: t }],
});

// The rate limit and the error-to-text conversion every handler repeats.
export async function runTool(
  userId: string,
  fn: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return text(`Rate limit exceeded. Try again in ${resetSec}s.`);
  }
  try {
    return await fn();
  } catch (err: any) {
    return text(`Error: ${err?.message ?? "Unknown error"}`);
  }
}
