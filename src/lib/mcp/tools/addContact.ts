import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { AddContactFormSchema } from "@/models/addContactForm.schema";
import { createContactForUser } from "@/lib/networking/contacts";
import {
  findDuplicateContacts,
  formatContactCandidate,
  listContactIndexForUser,
} from "@/lib/networking/contactMatch";
import { parseDateOnly } from "@/lib/networking/dateOnly";
import {
  resolveCompany,
  resolveContactRole,
  resolveLocation,
  type ResolvedEntity,
} from "@/lib/jobs/resolve";

export interface AddContactInput {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  company?: string;
  location?: string;
  relationship?: string;
  role?: string;
  notes?: string;
  lastContactedAt?: string;
  allowDuplicate?: boolean;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

export async function handleAddContact(
  input: AddContactInput,
  userId: string,
): Promise<ToolResult> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return text(`Rate limit exceeded. Try again in ${resetSec}s.`);
  }

  try {
    const lastContactedAt = input.lastContactedAt
      ? parseDateOnly(input.lastContactedAt, "lastContactedAt")
      : null;

    // The Contacts form's own schema: same length limits, email and URL
    // checks, and "last contacted cannot be in the future".
    const parsed = AddContactFormSchema.safeParse({
      name: input.name,
      title: input.title,
      email: input.email,
      phone: input.phone,
      linkedinUrl: input.linkedinUrl,
      relationship: input.relationship,
      notes: input.notes,
      lastContactedAt,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return text(`Validation error: ${issues}`);
    }

    // Checked before anything is resolved or created, so a refused duplicate
    // leaves no stray company/location/role behind.
    if (!input.allowDuplicate) {
      const index = await listContactIndexForUser(userId);
      const duplicates = findDuplicateContacts(index, {
        name: parsed.data.name,
        email: parsed.data.email,
        linkedinUrl: parsed.data.linkedinUrl,
      });
      if (duplicates.length > 0) {
        const lines = duplicates.map(
          (d) => `- ${formatContactCandidate(d.contact)} — ${d.reasons.join(", ")}`,
        );
        return text(
          `No contact created: ${duplicates.length} existing contact${duplicates.length === 1 ? "" : "s"} may be the same person:\n` +
            lines.join("\n") +
            `\nUse the existing id (log_interaction accepts contactId). ` +
            `If this really is a different person, call add_contact again with allowDuplicate: true.`,
        );
      }
    }

    const resolved: Array<[string, ResolvedEntity]> = [];
    const track = async (
      kind: string,
      value: string | undefined,
      resolve: (label: string, userId: string) => Promise<ResolvedEntity>,
    ) => {
      if (!value?.trim()) return undefined;
      const entity = await resolve(value, userId);
      resolved.push([kind, entity]);
      return entity.id;
    };
    const company = await track("company", input.company, resolveCompany);
    const location = await track("location", input.location, resolveLocation);
    const contactRole = await track("role", input.role, resolveContactRole);

    const created = await createContactForUser(userId, {
      ...parsed.data,
      company,
      location,
      contactRole,
    });

    const report = resolved.length
      ? " " +
        resolved
          .map(
            ([kind, e]) =>
              `${kind}: "${e.label}" (${e.created ? "created" : "matched existing"}).`,
          )
          .join(" ")
      : "";
    return text(`Added contact "${created.name}" (id: ${created.id}).${report}`);
  } catch (err: any) {
    return text(`Error: ${err?.message ?? "Unknown error"}`);
  }
}
