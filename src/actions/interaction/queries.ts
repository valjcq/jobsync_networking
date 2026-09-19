"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import { APP_CONSTANTS } from "@/lib/constants";
import { INTERACTION_INCLUDE, OPEN_STEP_WHERE, endOfToday } from "./shared";

export const getInteractionList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  contactId?: string,
  purposeId?: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const where: any = { createdBy: user.id };
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
  } catch (error) {
    return handleError(error, "Failed to fetch interactions. ");
  }
};

// Only steps that are due and not done: an undated step is not "due", and it
// stays visible in the timeline.
export const getFollowUps = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const data = await prisma.interaction.findMany({
      where: {
        createdBy: user.id,
        ...OPEN_STEP_WHERE,
        nextStepDate: { not: null, lte: endOfToday() },
      },
      include: INTERACTION_INCLUDE,
      orderBy: { nextStepDate: "asc" },
    });
    return { data };
  } catch (error) {
    return handleError(error, "Failed to fetch follow-ups. ");
  }
};

export const getNetworkingContacts = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const rows = await prisma.contact.findMany({
      where: { createdBy: user.id },
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
  } catch (error) {
    return handleError(error, "Failed to fetch contacts. ");
  }
};

// What the form's job picker consumes: id/label/value, like every other
// picker, with the value carrying what is worth searching on.
export const getJobRefs = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const rows = await prisma.job.findMany({
      where: { userId: user.id },
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
  } catch (error) {
    return handleError(error, "Failed to fetch jobs. ");
  }
};
