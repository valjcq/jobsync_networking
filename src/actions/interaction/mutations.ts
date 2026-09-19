"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import type { InteractionFormValues } from "@/models/interactionForm.schema";
import { endOfToday } from "./shared";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const nullable = (value?: string | null) =>
  value && value.trim() ? value.trim() : null;

const toInteractionData = (values: InteractionFormValues) => ({
  contactId: values.contact,
  purposeId: values.interactionPurpose,
  occurredAt: values.occurredAt,
  outcome: nullable(values.outcome),
  nextStep: nullable(values.nextStep),
  nextStepDate: nullable(values.nextStep) ? (values.nextStepDate ?? null) : null,
  jobId: nullable(values.job),
});

type InteractionData = ReturnType<typeof toInteractionData>;

// Foreign keys prove a row exists, not that the caller owns it.
const assertRefsOwned = async (userId: string, data: InteractionData) => {
  const [contact, purpose, job] = await Promise.all([
    prisma.contact.count({ where: { id: data.contactId, createdBy: userId } }),
    prisma.interactionPurpose.count({
      where: { id: data.purposeId, createdBy: userId },
    }),
    data.jobId ? prisma.job.count({ where: { id: data.jobId, userId } }) : 1,
  ]);
  if (contact === 0) throw new Error("Contact not found");
  if (purpose === 0) throw new Error("Purpose not found");
  if (job === 0) throw new Error("Job not found");
};

// Recording an interaction moves "last contacted" forward only. A backdated
// entry never pulls it back, and a planned (future) one does not count yet.
const applyCreated = async (tx: Tx, contactId: string, occurredAt: Date) => {
  if (occurredAt > endOfToday()) return;
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: { lastContactedAt: true },
  });
  if (!contact) return;
  if (contact.lastContactedAt && contact.lastContactedAt >= occurredAt) return;
  await tx.contact.update({
    where: { id: contactId },
    data: { lastContactedAt: occurredAt },
  });
};

// Taking an interaction away only matters when it is what set the current
// value. Then it falls back to the latest remaining past interaction. With
// none left, a plain delete leaves the value alone (it may have been typed in
// by hand), while an edit clears it because the replacement is applied next.
const applyRemoved = async (
  tx: Tx,
  userId: string,
  contactId: string,
  removedId: string,
  removedAt: Date,
  clearIfNone: boolean,
) => {
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: { lastContactedAt: true },
  });
  if (!contact?.lastContactedAt) return;
  if (contact.lastContactedAt.getTime() !== removedAt.getTime()) return;

  const latest = await tx.interaction.findFirst({
    where: {
      contactId,
      createdBy: userId,
      id: { not: removedId },
      occurredAt: { lte: endOfToday() },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  if (!latest && !clearIfNone) return;
  await tx.contact.update({
    where: { id: contactId },
    data: { lastContactedAt: latest?.occurredAt ?? null },
  });
};

export const createInteraction = async (
  values: InteractionFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const data = toInteractionData(values);
    await assertRefsOwned(user.id, data);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.interaction.create({
        data: { ...data, createdBy: user.id },
      });
      await applyCreated(tx, data.contactId, data.occurredAt);
      return row;
    });
    return { success: true, data: created };
  } catch (error) {
    return handleError(error, "Failed to log interaction.");
  }
};

// An edit is a delete of the old interaction plus a create of the new one as
// far as "last contacted" goes, so a moved date or a changed contact updates
// both the old and the new person.
export const updateInteraction = async (
  values: InteractionFormValues,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    if (!values.id) throw new Error("Please provide an interaction id");

    const data = toInteractionData(values);
    await assertRefsOwned(user.id, data);

    await prisma.$transaction(async (tx) => {
      const old = await tx.interaction.findFirst({
        where: { id: values.id, createdBy: user.id },
      });
      if (!old) throw new Error("Interaction not found");

      // A different step or date is a new step, so it starts out not done.
      const stepChanged =
        old.nextStep !== data.nextStep ||
        old.nextStepDate?.getTime() !== data.nextStepDate?.getTime();

      await applyRemoved(
        tx,
        user.id,
        old.contactId,
        old.id,
        old.occurredAt,
        true,
      );
      await tx.interaction.update({
        where: { id: old.id },
        data: {
          ...data,
          ...(stepChanged || !data.nextStep ? { nextStepDoneAt: null } : {}),
        },
      });
      await applyCreated(tx, data.contactId, data.occurredAt);
    });
    return { success: true, data: { id: values.id } };
  } catch (error) {
    return handleError(error, "Failed to update interaction.");
  }
};

export const deleteInteractionById = async (
  interactionId: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    await prisma.$transaction(async (tx) => {
      const old = await tx.interaction.findFirst({
        where: { id: interactionId, createdBy: user.id },
      });
      if (!old) throw new Error("Interaction not found");

      await applyRemoved(
        tx,
        user.id,
        old.contactId,
        old.id,
        old.occurredAt,
        false,
      );
      await tx.interaction.delete({ where: { id: old.id } });
    });
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete interaction.");
  }
};

export const markNextStepDone = async (
  interactionId: string,
  done: boolean = true,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const res = await prisma.interaction.updateMany({
      where: { id: interactionId, createdBy: user.id, nextStep: { not: null } },
      data: { nextStepDoneAt: done ? new Date() : null },
    });
    if (res.count === 0) throw new Error("Next step not found");
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to update next step.");
  }
};
