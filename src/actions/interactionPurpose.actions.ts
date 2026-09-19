"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "./shared";
import { INTERACTION_PURPOSES } from "@/lib/constants";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";

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

export const getInteractionPurposes = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const where = { createdBy: user.id };
    if ((await prisma.interactionPurpose.count({ where })) === 0) {
      await seedDefaults(user.id);
    }
    return await prisma.interactionPurpose.findMany({
      where,
      include: { _count: { select: { interactions: true } } },
      orderBy: { label: "asc" },
    });
  } catch (error) {
    return handleError(error, "Failed to fetch purposes. ");
  }
};

export const createInteractionPurpose = async (
  label: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const trimmed = label.trim();
    const value = canonicalizeEntityValue(trimmed);
    if (!value) throw new Error("A non-empty label is required");

    const key = { value_createdBy: { value, createdBy: user.id } };
    const existing = await prisma.interactionPurpose.findUnique({ where: key });
    if (existing) return { success: true, data: existing };

    try {
      const created = await prisma.interactionPurpose.create({
        data: { label: trimmed, value, createdBy: user.id },
      });
      return { success: true, data: created };
    } catch (err: any) {
      if (err?.code === "P2002") {
        const winner = await prisma.interactionPurpose.findUnique({
          where: key,
        });
        if (winner) return { success: true, data: winner };
      }
      throw err;
    }
  } catch (error) {
    return handleError(error, "Failed to create purpose.");
  }
};

export const renameInteractionPurpose = async (
  purposeId: string,
  label: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const trimmed = label.trim();
    const value = canonicalizeEntityValue(trimmed);
    if (!value) throw new Error("A non-empty label is required");

    const clash = await prisma.interactionPurpose.findFirst({
      where: { value, createdBy: user.id, id: { not: purposeId } },
    });
    if (clash) throw new Error("A purpose with that name already exists");

    const res = await prisma.interactionPurpose.updateMany({
      where: { id: purposeId, createdBy: user.id },
      data: { label: trimmed, value },
    });
    if (res.count === 0) throw new Error("Purpose not found");
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to rename purpose.");
  }
};

export const deleteInteractionPurposeById = async (
  purposeId: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const uses = await prisma.interaction.count({
      where: { purposeId, createdBy: user.id },
    });
    if (uses > 0) {
      throw new Error(
        `Purpose cannot be deleted due to ${uses} interaction${uses === 1 ? "" : "s"} using it! `,
      );
    }

    const res = await prisma.interactionPurpose.deleteMany({
      where: { id: purposeId, createdBy: user.id },
    });
    if (res.count === 0) throw new Error("Purpose not found");
    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete purpose.");
  }
};
