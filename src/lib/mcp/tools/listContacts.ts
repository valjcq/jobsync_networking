import prisma from "@/lib/db";
import type { McpListContactsInput } from "@/models/mcp.schema";
import { OPEN_STEP_WHERE, endOfToday } from "@/lib/networking/interactions";
import { formatDateOnly, parseDateOnly } from "@/lib/networking/dateOnly";
import { matchContactStatus, CONTACT_STATUSES } from "@/lib/networking/contactStatus";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";
import { runTool, text, type ToolResult } from "./toolResult";

const DEFAULT_LIMIT = 25;

// Company and role are matched in memory over the user's own contacts, like
// the name matching in contactMatch.ts: SQLite's LIKE only folds ASCII case.
const contains = (haystack: string | null | undefined, needle: string) =>
  !!haystack && canonicalizeEntityValue(haystack).includes(needle);

export async function handleListContacts(
  input: McpListContactsInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const before = input.lastContactedBefore
      ? parseDateOnly(input.lastContactedBefore, "lastContactedBefore")
      : null;
    const after = input.lastContactedAfter
      ? parseDateOnly(input.lastContactedAfter, "lastContactedAfter")
      : null;
    let status: string | null = null;
    if (input.status) {
      status = matchContactStatus(input.status);
      if (!status) {
        return text(`Validation error: status must be one of: ${CONTACT_STATUSES.join(", ")}`);
      }
    }
    if (input.neverContacted && (before || after)) {
      return text(
        "Validation error: neverContacted cannot be combined with a last-contacted date filter",
      );
    }

    const company = input.company ? canonicalizeEntityValue(input.company) : "";
    const role = input.role ? canonicalizeEntityValue(input.role) : "";

    const rows = await prisma.contact.findMany({
      where: {
        createdBy: userId,
        ...(status ? { status } : {}),
        ...(input.neverContacted ? { lastContactedAt: null } : {}),
        ...(before || after
          ? {
              lastContactedAt: {
                ...(before ? { lt: before } : {}),
                ...(after ? { gte: after } : {}),
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        title: true,
        status: true,
        lastContactedAt: true,
        Company: { select: { label: true } },
        Role: { select: { label: true } },
        interactions: {
          where: { ...OPEN_STEP_WHERE, nextStepDate: { not: null, lte: endOfToday() } },
          select: { id: true },
        },
      },
    });

    const matched = rows.filter(
      (c) =>
        (!company || contains(c.Company?.label, company)) &&
        (!role || contains(c.Role?.label, role)) &&
        (input.nextStepDue === undefined ||
          (c.interactions.length > 0) === input.nextStepDue),
    );
    if (matched.length === 0) return text("No contacts match.");

    const limit = input.limit ?? DEFAULT_LIMIT;
    const lines = matched.slice(0, limit).map((c) => {
      const where = [c.title, c.Company?.label].filter(Boolean).join(" @ ");
      const facts = [
        c.Role ? `role: ${c.Role.label}` : null,
        c.status ? `status: ${c.status}` : null,
        `last contacted: ${c.lastContactedAt ? formatDateOnly(c.lastContactedAt) : "never"}`,
        c.interactions.length ? `${c.interactions.length} next step(s) due` : null,
      ].filter(Boolean);
      return `- ${c.name}${where ? `, ${where}` : ""} (id: ${c.id}; ${facts.join("; ")})`;
    });
    const head =
      matched.length > limit
        ? `${limit} of ${matched.length} contacts:`
        : `${matched.length} contact${matched.length === 1 ? "" : "s"}:`;
    return text(`${head}\n${lines.join("\n")}`);
  });
}
