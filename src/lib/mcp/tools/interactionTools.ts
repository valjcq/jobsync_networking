import prisma from "@/lib/db";
import { InteractionFormSchema } from "@/models/interactionForm.schema";
import type {
  McpDeleteInteractionInput,
  McpListInteractionsInput,
  McpUpdateInteractionInput,
} from "@/models/mcp.schema";
import {
  INTERACTION_INCLUDE,
  OPEN_STEP_WHERE,
  deleteInteractionForUser,
  updateInteractionForUser,
} from "@/lib/networking/interactions";
import {
  createInteractionPurposeForUser,
  getInteractionPurposesForUser,
} from "@/lib/networking/purposes";
import { findPurposeByLabel } from "@/lib/networking/purposeMatch";
import { formatDateOnly, parseDateOnly } from "@/lib/networking/dateOnly";
import { runTool, text, type ToolResult } from "./toolResult";

const DEFAULT_LIMIT = 25;
const clip = (value: string, max = 200) =>
  value.length > max ? `${value.slice(0, max)}…` : value;
const validation = (message: string) => text(`Validation error: ${message}`);
const NOT_FOUND = "Interaction not found";

const PATCHABLE = [
  "contactId",
  "purpose",
  "occurredAt",
  "outcome",
  "nextStep",
  "nextStepDate",
  "jobId",
] as const;

export async function handleUpdateInteraction(
  input: McpUpdateInteractionInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const existing = await prisma.interaction.findFirst({
      where: { id: input.interactionId, createdBy: userId },
      select: {
        contactId: true,
        purposeId: true,
        occurredAt: true,
        outcome: true,
        nextStep: true,
        nextStepDate: true,
        jobId: true,
        Contact: { select: { name: true } },
        Purpose: { select: { id: true, label: true } },
      },
    });
    if (!existing) throw new Error(NOT_FOUND);

    const patched = PATCHABLE.filter((k) => input[k] !== undefined);
    if (patched.length === 0) {
      return validation("supply at least one field to change");
    }
    const has = (k: (typeof PATCHABLE)[number]) => input[k] !== undefined;

    const occurredAt = has("occurredAt")
      ? parseDateOnly(input.occurredAt!, "occurredAt")
      : existing.occurredAt;
    const nextStep = has("nextStep") ? (input.nextStep ?? "") : (existing.nextStep ?? "");
    // Clearing the step takes its date with it, as the form does.
    let nextStepDate = existing.nextStepDate;
    if (has("nextStepDate")) {
      nextStepDate = input.nextStepDate
        ? parseDateOnly(input.nextStepDate, "nextStepDate")
        : null;
    }
    if (has("nextStep") && !input.nextStep?.trim()) nextStepDate = null;

    const contactId = input.contactId ?? existing.contactId;
    const outcome = has("outcome") ? (input.outcome ?? "") : (existing.outcome ?? "");
    const jobId = has("jobId") ? (input.jobId ?? undefined) : (existing.jobId ?? undefined);

    const form = InteractionFormSchema.safeParse({
      contact: contactId,
      interactionPurpose: "pending",
      occurredAt,
      outcome,
      nextStep,
      nextStepDate,
      job: jobId,
    });
    if (!form.success) {
      return validation(form.error.issues.map((i) => i.message).join("; "));
    }

    let purpose: { id: string; label: string } | null = existing.Purpose;
    if (input.purpose !== undefined) {
      purpose = await findPurposeByLabel(userId, input.purpose.trim());
    }

    // A purpose that does not exist yet cannot already have this interaction.
    if (purpose && !input.allowDuplicate) {
      const twin = await prisma.interaction.findFirst({
        where: {
          createdBy: userId,
          id: { not: input.interactionId },
          contactId,
          purposeId: purpose.id,
          occurredAt,
          outcome: form.data.outcome?.trim() || null,
        },
        select: { id: true },
      });
      if (twin) {
        return text(
          `Nothing changed: another interaction (id: ${twin.id}) already has the same contact, date (${formatDateOnly(occurredAt)}), ` +
            `purpose and outcome. Delete one with delete_interaction, or pass allowDuplicate: true to keep both.`,
        );
      }
    }

    let purposeCreated = false;
    if (!purpose) {
      const created = await createInteractionPurposeForUser(userId, input.purpose!.trim());
      purpose = { id: created.id, label: created.label };
      purposeCreated = true;
    }

    // Ownership of the contact, purpose and job is re-checked in the shared
    // core, which also keeps "last contacted" right for the old and new contact.
    await updateInteractionForUser(userId, {
      ...form.data,
      id: input.interactionId,
      contact: contactId,
      interactionPurpose: purpose.id,
    });

    return text(
      `Updated interaction ${input.interactionId} (${purpose.label}, ${formatDateOnly(occurredAt)}): ${patched.join(", ")}.` +
        (purposeCreated ? ` Purpose "${purpose.label}" did not exist and was created.` : ""),
    );
  });
}

export async function handleDeleteInteraction(
  input: McpDeleteInteractionInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const existing = await prisma.interaction.findFirst({
      where: { id: input.interactionId, createdBy: userId },
      select: {
        occurredAt: true,
        Contact: { select: { name: true } },
        Purpose: { select: { label: true } },
      },
    });
    if (!existing) throw new Error(NOT_FOUND);

    await deleteInteractionForUser(userId, input.interactionId);
    return text(
      `Deleted ${existing.Purpose.label} with ${existing.Contact.name} on ${formatDateOnly(existing.occurredAt)} ` +
        `(interaction id: ${input.interactionId}). Last contacted was recalculated from what remains.`,
    );
  });
}

export async function handleListInteractions(
  input: McpListInteractionsInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const after = input.occurredAfter ? parseDateOnly(input.occurredAfter, "occurredAfter") : null;
    const before = input.occurredBefore ? parseDateOnly(input.occurredBefore, "occurredBefore") : null;
    if (after && before && after > before) {
      return validation("occurredAfter cannot be later than occurredBefore");
    }

    const where: Record<string, unknown> = { createdBy: userId };
    if (input.contactId) {
      const contact = await prisma.contact.count({
        where: { id: input.contactId, createdBy: userId },
      });
      if (contact === 0) throw new Error(`Contact not found (id: ${input.contactId})`);
      where.contactId = input.contactId;
    }
    if (input.purpose?.trim()) {
      const purpose = await findPurposeByLabel(userId, input.purpose.trim());
      if (!purpose) {
        const known = (await getInteractionPurposesForUser(userId)).map((p: any) => p.label);
        return text(
          `No interactions: there is no purpose named "${input.purpose.trim()}". Purposes: ${known.join(", ")}.`,
        );
      }
      where.purposeId = purpose.id;
    }
    if (after || before) {
      where.occurredAt = { ...(after ? { gte: after } : {}), ...(before ? { lte: before } : {}) };
    }
    if (input.openNextStepOnly) Object.assign(where, OPEN_STEP_WHERE);

    const limit = input.limit ?? DEFAULT_LIMIT;
    const [rows, total] = await Promise.all([
      prisma.interaction.findMany({
        where,
        take: limit,
        include: INTERACTION_INCLUDE,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.interaction.count({ where }),
    ]);
    if (rows.length === 0) return text("No interactions match.");

    const lines = rows.map((i: any) => {
      const company = i.Contact.Company?.label ? ` (${i.Contact.Company.label})` : "";
      const step = i.nextStep
        ? ` [next step: ${clip(i.nextStep, 80)}${i.nextStepDate ? ` due ${formatDateOnly(i.nextStepDate)}` : ""}${i.nextStepDoneAt ? ", done" : ""}]`
        : "";
      const job = i.Job ? `, job: ${i.Job.JobTitle.label} @ ${i.Job.Company.label}` : "";
      return (
        `- ${formatDateOnly(i.occurredAt)} ${i.Purpose.label} with ${i.Contact.name}${company}` +
        `${i.outcome ? `: ${clip(i.outcome)}` : ""}${step}${job} ` +
        `(interaction id: ${i.id}, contact id: ${i.Contact.id})`
      );
    });
    const head =
      total > rows.length
        ? `${rows.length} of ${total} interactions, newest first:`
        : `${total} interaction${total === 1 ? "" : "s"}, newest first:`;
    return text(`${head}\n${lines.join("\n")}`);
  });
}
