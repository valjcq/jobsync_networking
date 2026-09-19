import prisma from "@/lib/db";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { contactSearchFilter } from "@/lib/networking/contacts";
import { OPEN_STEP_WHERE } from "@/lib/networking/interactions";
import { formatDateOnly } from "@/lib/networking/dateOnly";

export interface FindContactInput {
  query: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export async function handleFindContact(
  input: FindContactInput,
  userId: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return {
      content: [{ type: "text", text: `Rate limit exceeded. Try again in ${resetSec}s.` }],
    };
  }

  try {
    const query = input.query.trim();
    if (!query) {
      return { content: [{ type: "text", text: "Validation error: query is required" }] };
    }
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    // Same filter as the Contacts page search: name, email or title contains.
    const where = { createdBy: userId, OR: contactSearchFilter(query) };
    const [rows, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        take: limit,
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          title: true,
          lastContactedAt: true,
          Company: { select: { label: true } },
          interactions: { where: OPEN_STEP_WHERE, select: { id: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No saved contact matches "${query}" — call add_contact to create one.`,
          },
        ],
      };
    }

    const lines = rows.map((row) => {
      const role = [row.title, row.Company?.label].filter(Boolean).join(" @ ");
      const last = row.lastContactedAt
        ? formatDateOnly(row.lastContactedAt)
        : "never";
      const steps = row.interactions.length;
      return (
        `- ${row.name} (id: ${row.id}${role ? `, ${role}` : ""}, ` +
        `last contacted: ${last}, open next steps: ${steps})`
      );
    });
    const more =
      total > rows.length
        ? `\nShowing ${rows.length} of ${total} — narrow the query to see the rest.`
        : "";

    return {
      content: [
        {
          type: "text",
          text:
            `Found ${total} contact${total === 1 ? "" : "s"} matching "${query}":\n` +
            lines.join("\n") +
            more +
            `\nPass an id as contactId to log_interaction to avoid any name ambiguity.`,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err?.message ?? "Unknown error"}` }],
    };
  }
}
