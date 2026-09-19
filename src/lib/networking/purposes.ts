import prisma from "@/lib/db";
import { INTERACTION_PURPOSES } from "@/lib/constants";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";

// Session-free core of the interaction-purpose actions: every function takes
// the caller's userId and throws on failure. See interactions.ts.

// Purposes are seeded lazily, on first read, so no migration or signup step
// has to know about them. One upsert per default: the (value, createdBy)
// unique key makes a concurrent first read harmless.
const seedDefaults = async (userId: string) => {
  for (const purpose of INTERACTION_PURPOSES) {
    await prisma.interactionPurpose.upsert({
      where: {
        value_createdBy: { value: purpose.value, createdBy: userId },
      },
      update: {},
      create: {
        label: purpose.label,
        value: purpose.value,
        createdBy: userId,
      },
    });
  }
};

export const getInteractionPurposesForUser = async (userId: string) => {
  const where = { createdBy: userId };
  if ((await prisma.interactionPurpose.count({ where })) === 0) {
    await seedDefaults(userId);
  }
  return prisma.interactionPurpose.findMany({
    where,
    include: { _count: { select: { interactions: true } } },
    orderBy: { label: "asc" },
  });
};

export const createInteractionPurposeForUser = async (
  userId: string,
  label: string,
) => {
  const trimmed = label.trim();
  const value = canonicalizeEntityValue(trimmed);
  if (!value) throw new Error("A non-empty label is required");

  const key = { value_createdBy: { value, createdBy: userId } };
  const existing = await prisma.interactionPurpose.findUnique({ where: key });
  if (existing) return existing;

  try {
    return await prisma.interactionPurpose.create({
      data: { label: trimmed, value, createdBy: userId },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const winner = await prisma.interactionPurpose.findUnique({
        where: key,
      });
      if (winner) return winner;
    }
    throw err;
  }
};

export const renameInteractionPurposeForUser = async (
  userId: string,
  purposeId: string,
  label: string,
) => {
  const trimmed = label.trim();
  const value = canonicalizeEntityValue(trimmed);
  if (!value) throw new Error("A non-empty label is required");

  const clash = await prisma.interactionPurpose.findFirst({
    where: { value, createdBy: userId, id: { not: purposeId } },
  });
  if (clash) throw new Error("A purpose with that name already exists");

  const res = await prisma.interactionPurpose.updateMany({
    where: { id: purposeId, createdBy: userId },
    data: { label: trimmed, value },
  });
  if (res.count === 0) throw new Error("Purpose not found");
};

export const deleteInteractionPurposeForUser = async (
  userId: string,
  purposeId: string,
) => {
  const uses = await prisma.interaction.count({
    where: { purposeId, createdBy: userId },
  });
  if (uses > 0) {
    throw new Error(
      `Purpose cannot be deleted due to ${uses} interaction${uses === 1 ? "" : "s"} using it! `,
    );
  }

  const res = await prisma.interactionPurpose.deleteMany({
    where: { id: purposeId, createdBy: userId },
  });
  if (res.count === 0) throw new Error("Purpose not found");
};
