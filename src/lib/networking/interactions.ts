import { endOfDay } from "date-fns";
import prisma from "@/lib/db";
import { APP_CONSTANTS } from "@/lib/constants";
import type { InteractionFormValues } from "@/models/interactionForm.schema";

// Session-free core of the interaction actions: every function takes the
// caller's userId and throws on failure. The "use server" actions wrap these
// with requireUser() and handleError; the MCP tools call them with the token's
// userId. Keep the rules here so both entry points cannot drift.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const INTERACTION_INCLUDE = {
  Contact: {
    select: {
      id: true,
      name: true,
      Company: { select: { label: true } },
    },
  },
  Purpose: { select: { id: true, label: true } },
  Job: {
    select: {
      id: true,
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
  },
};

// A step is due once its day has begun, so "end of today" is the cutoff, the
// same rule as the contact form's "cannot be in the future" check.
export const endOfToday = () => endOfDay(new Date());

// An open step: written down, and not yet marked done.
export const OPEN_STEP_WHERE = {
  nextStep: { not: null },
  nextStepDoneAt: null,
} as const;

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

export const createInteractionForUser = async (
  userId: string,
  values: InteractionFormValues,
) => {
  const data = toInteractionData(values);
  await assertRefsOwned(userId, data);

  return prisma.$transaction(async (tx) => {
    const row = await tx.interaction.create({
      data: { ...data, createdBy: userId },
    });
    await applyCreated(tx, data.contactId, data.occurredAt);
    return row;
  });
};

// An edit is a delete of the old interaction plus a create of the new one as
// far as "last contacted" goes, so a moved date or a changed contact updates
// both the old and the new person.
export const updateInteractionForUser = async (
  userId: string,
  values: InteractionFormValues,
) => {
  if (!values.id) throw new Error("Please provide an interaction id");

  const data = toInteractionData(values);
  await assertRefsOwned(userId, data);

  await prisma.$transaction(async (tx) => {
    const old = await tx.interaction.findFirst({
      where: { id: values.id, createdBy: userId },
    });
    if (!old) throw new Error("Interaction not found");

    // A different step or date is a new step, so it starts out not done.
    const stepChanged =
      old.nextStep !== data.nextStep ||
      old.nextStepDate?.getTime() !== data.nextStepDate?.getTime();

    await applyRemoved(
      tx,
      userId,
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
  return { id: values.id };
};

export const deleteInteractionForUser = async (
  userId: string,
  interactionId: string,
) => {
  await prisma.$transaction(async (tx) => {
    const old = await tx.interaction.findFirst({
      where: { id: interactionId, createdBy: userId },
    });
    if (!old) throw new Error("Interaction not found");

    await applyRemoved(
      tx,
      userId,
      old.contactId,
      old.id,
      old.occurredAt,
      false,
    );
    await tx.interaction.delete({ where: { id: old.id } });
  });
};

export const markNextStepDoneForUser = async (
  userId: string,
  interactionId: string,
  done: boolean,
) => {
  const res = await prisma.interaction.updateMany({
    where: { id: interactionId, createdBy: userId, nextStep: { not: null } },
    data: { nextStepDoneAt: done ? new Date() : null },
  });
  if (res.count === 0) throw new Error("Next step not found");
};

export const getInteractionListForUser = async (
  userId: string,
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  contactId?: string,
  purposeId?: string,
) => {
  const where: any = { createdBy: userId };
  if (contactId) where.contactId = contactId;
  if (purposeId) where.purposeId = purposeId;

  const [data, total] = await Promise.all([
    prisma.interaction.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: INTERACTION_INCLUDE,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.interaction.count({ where }),
  ]);

  return { data, total };
};

// Only steps that are due and not done: an undated step is not "due", and it
// stays visible in the timeline.
export const getFollowUpsForUser = async (userId: string) => {
  const data = await prisma.interaction.findMany({
    where: {
      createdBy: userId,
      ...OPEN_STEP_WHERE,
      nextStepDate: { not: null, lte: endOfToday() },
    },
    include: INTERACTION_INCLUDE,
    orderBy: { nextStepDate: "asc" },
  });
  return { data };
};

export const getNetworkingContactsForUser = async (userId: string) => {
  const rows = await prisma.contact.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      name: true,
      title: true,
      Company: { select: { id: true, label: true } },
      Role: { select: { id: true, label: true } },
      lastContactedAt: true,
      _count: {
        select: {
          interactions: true,
        },
      },
      interactions: {
        where: OPEN_STEP_WHERE,
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    data: rows.map(({ interactions, ...contact }) => ({
      ...contact,
      openSteps: interactions.length,
    })),
  };
};

// What the form's job picker consumes: id/label/value, like every other
// picker, with the value carrying what is worth searching on.
export const getJobRefsForUser = async (userId: string) => {
  const rows = await prisma.job.findMany({
    where: { userId },
    select: {
      id: true,
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => {
    const label = `${row.JobTitle.label} @ ${row.Company.label}`;
    return { id: row.id, label, value: label.toLowerCase() };
  });
};
