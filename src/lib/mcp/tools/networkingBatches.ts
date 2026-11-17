import type {
  McpAddContactsBatchInput,
  McpLogInteractionsBatchInput,
} from "@/models/mcp.schema";
import { handleAddContact } from "./addContact";
import { handleLogInteraction } from "./logInteraction";
import { text, type ToolResult } from "./toolResult";

// Sequential, not Promise.all: the duplicate and idempotency checks read what
// the previous item wrote, and SQLite serializes writes anyway. Same shape as
// add_jobs_batch: one labelled result per item, stop cleanly at the rate limit.
async function runBatch<T>(
  items: T[],
  label: (item: T, i: number, total: number) => string,
  run: (item: T) => Promise<ToolResult>,
): Promise<ToolResult> {
  const total = items.length;
  const lines: string[] = [];

  for (let i = 0; i < total; i++) {
    let result: string;
    try {
      result = (await run(items[i])).content[0].text;
    } catch (err: any) {
      result = `Error: ${err?.message ?? "Unknown error"}`;
    }
    lines.push(`${label(items[i], i, total)}: ${result}`);

    if (result.startsWith("Rate limit exceeded")) {
      const remaining = total - (i + 1);
      if (remaining > 0) {
        lines.push(
          `Stopped after the rate limit — ${remaining} item(s) not attempted. ` +
            `Retry them once the window resets.`,
        );
      }
      break;
    }
  }
  return text(lines.join("\n\n"));
}

export function handleAddContactsBatch(
  input: McpAddContactsBatchInput,
  userId: string,
): Promise<ToolResult> {
  return runBatch(
    input.contacts,
    (c, i, total) => `[${i + 1}/${total}] ${c.name}`,
    (c) => handleAddContact(c, userId),
  );
}

export function handleLogInteractionsBatch(
  input: McpLogInteractionsBatchInput,
  userId: string,
): Promise<ToolResult> {
  return runBatch(
    input.interactions,
    (it, i, total) =>
      `[${i + 1}/${total}] ${it.contactName ?? it.contactId ?? "?"} — ${it.purpose}`,
    (it) => handleLogInteraction(it, userId),
  );
}
