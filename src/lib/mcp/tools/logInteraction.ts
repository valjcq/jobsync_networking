import prisma from "@/lib/db";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { InteractionFormSchema } from "@/models/interactionForm.schema";
import { createInteractionForUser } from "@/lib/networking/interactions";
import { createInteractionPurposeForUser } from "@/lib/networking/purposes";
import { findPurposeByLabel } from "@/lib/networking/purposeMatch";
import {
  formatContactCandidate,
  listContactIndexForUser,
  matchContactsByName,
} from "@/lib/networking/contactMatch";
import {
  formatDateOnly,
  parseDateOnly,
  todayLocalMidnight,
} from "@/lib/networking/dateOnly";

export interface LogInteractionInput {
  contactId?: string;
  contactName?: string;
  purpose: string;
  occurredAt?: string;
  outcome?: string;
  nextStep?: string;
  nextStepDate?: string;
  jobId?: string;
  allowDuplicate?: boolean;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

// Resolves to a contact, or to a ready-to-return message when the name cannot
// be settled without guessing. Nothing is written on either path.
async function resolveContact(
  userId: string,
  input: LogInteractionInput,
): Promise<{ contact: { id: string; name: string } } | { message: string }> {
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: userId },
      select: { id: true, name: true },
    });
    if (!contact) throw new Error("Contact not found");
    return { contact };
  }

  const name = input.contactName!.trim();
  const index = await listContactIndexForUser(userId);
  const { exact, partial } = matchContactsByName(index, name);

  if (exact.length === 1) {
    return { contact: { id: exact[0].id, name: exact[0].name } };
  }
  if (exact.length > 1) {
    return {
      message:
        `Nothing logged: "${name}" matches ${exact.length} contacts:\n` +
        exact.map((c) => `- ${formatContactCandidate(c)}`).join("\n") +
        `\nCall log_interaction again with the right contactId.`,
    };
  }
  if (partial.length > 0) {
    return {
      message:
        `Nothing logged: no contact is named exactly "${name}". Closest match${partial.length === 1 ? "" : "es"}:\n` +
        partial.map((c) => `- ${formatContactCandidate(c)}`).join("\n") +
        `\nIf one is the right person, call log_interaction again with its contactId; ` +
        `otherwise call add_contact first.`,
    };
  }
  return {
    message:
      `Nothing logged: no contact matches "${name}". Call add_contact to create them, ` +
      `then log_interaction with the new id.`,
  };
}

export async function handleLogInteraction(
  input: LogInteractionInput,
  userId: string,
): Promise<ToolResult> {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return text(`Rate limit exceeded. Try again in ${resetSec}s.`);
  }

  try {
    if (!!input.contactId === !!input.contactName?.trim()) {
      return text(
        "Validation error: provide exactly one of contactId or contactName",
      );
    }

    const occurredAt = input.occurredAt
      ? parseDateOnly(input.occurredAt, "occurredAt")
      : todayLocalMidnight();
    const nextStepDate = input.nextStepDate
      ? parseDateOnly(input.nextStepDate, "nextStepDate")
      : null;

    // The interaction form's own schema (length limits, "next step date needs
    // a next step", "not before the interaction"). Ids are placeholders here:
    // they are resolved after, and this must run before anything is created.
    const form = InteractionFormSchema.safeParse({
      contact: "pending",
      interactionPurpose: "pending",
      occurredAt,
      outcome: input.outcome,
      nextStep: input.nextStep,
      nextStepDate,
      job: input.jobId,
    });
    if (!form.success) {
      const issues = form.error.issues.map((i) => i.message).join("; ");
      return text(`Validation error: ${issues}`);
    }

    const resolution = await resolveContact(userId, input);
    if ("message" in resolution) return text(resolution.message);
    const { contact } = resolution;

    const purposeLabel = input.purpose.trim();
    let purpose = await findPurposeByLabel(userId, purposeLabel);

    // Idempotency: an agent retrying a call, or a scheduled run seeing the
    // same email twice, must not double-log. A purpose that does not exist
    // yet cannot have a prior interaction, so only look when it does.
    if (purpose && !input.allowDuplicate) {
      const existing = await prisma.interaction.findFirst({
        where: {
          createdBy: userId,
          contactId: contact.id,
          purposeId: purpose.id,
          occurredAt,
          outcome: form.data.outcome?.trim() || null,
        },
        select: { id: true },
      });
      if (existing) {
        return text(
          `Already logged: ${purpose.label} with ${contact.name} on ${formatDateOnly(occurredAt)} ` +
            `with the same outcome (interaction id: ${existing.id}). No new interaction was created; ` +
            `pass allowDuplicate: true to log another.`,
        );
      }
    }

    let purposeCreated = false;
    if (!purpose) {
      const created = await createInteractionPurposeForUser(userId, purposeLabel);
      purpose = { id: created.id, label: created.label };
      purposeCreated = true;
    }

    // Ownership of the contact, purpose and job is re-checked in the shared
    // core, which also applies the "last contacted" rules the UI uses.
    const interaction = await createInteractionForUser(userId, {
      ...form.data,
      contact: contact.id,
      interactionPurpose: purpose.id,
    });

    const after = await prisma.contact.findFirst({
      where: { id: contact.id, createdBy: userId },
      select: { lastContactedAt: true },
    });
    const last = after?.lastContactedAt
      ? formatDateOnly(after.lastContactedAt)
      : "not set";
    const step = form.data.nextStep?.trim()
      ? ` Next step: "${form.data.nextStep.trim()}"${nextStepDate ? ` due ${formatDateOnly(nextStepDate)}` : ""}.`
      : "";
    const created = purposeCreated
      ? ` Purpose "${purpose.label}" did not exist and was created.`
      : "";

    return text(
      `Logged ${purpose.label} with ${contact.name} on ${formatDateOnly(occurredAt)} ` +
        `(interaction id: ${interaction.id}). Last contacted: ${last}.${step}${created}`,
    );
  } catch (err: any) {
    return text(`Error: ${err?.message ?? "Unknown error"}`);
  }
}
