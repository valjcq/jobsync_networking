import prisma from "@/lib/db";
import type { TaskStatus } from "@/models/task.model";

// Session-free core of the task actions: every function takes the caller's
// userId and throws on failure. The "use server" actions wrap these with
// requireUser() and handleError; the MCP todo tools call them with the token's
// userId. Keep the rules here so both entry points cannot drift.

export const TASK_INCLUDE = { activityType: true } as const;

// A todo that still needs doing; what list_todos shows by default.
export const OPEN_TASK_STATUSES: TaskStatus[] = [
  "in-progress",
  "needs-attention",
];

export interface TaskValues {
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: number;
  percentComplete: number;
  dueDate?: Date | null;
  activityTypeId?: string | null;
  jobId?: string | null;
  contactId?: string | null;
  createdVia?: string | null;
}

// Foreign keys prove a row exists, not that the caller owns it.
const assertLinksOwned = async (
  userId: string,
  links: { jobId?: string | null; contactId?: string | null },
) => {
  const [job, contact] = await Promise.all([
    links.jobId
      ? prisma.job.count({ where: { id: links.jobId, userId } })
      : 1,
    links.contactId
      ? prisma.contact.count({
          where: { id: links.contactId, createdBy: userId },
        })
      : 1,
  ]);
  if (job === 0) throw new Error("Job not found");
  if (contact === 0) throw new Error("Contact not found");
};

// Keys left undefined are left out, so an edit that does not mention a link
// (the web form) never clears it, while an explicit null does.
const definedOnly = <T extends object>(values: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

export const createTaskForUser = async (userId: string, values: TaskValues) => {
  await assertLinksOwned(userId, values);

  return prisma.task.create({
    data: {
      title: values.title,
      description: values.description,
      status: values.status,
      priority: values.priority,
      percentComplete: values.percentComplete,
      dueDate: values.dueDate,
      activityTypeId: values.activityTypeId,
      ...definedOnly({
        jobId: values.jobId,
        contactId: values.contactId,
        createdVia: values.createdVia,
      }),
      userId,
    },
    include: TASK_INCLUDE,
  });
};

export const updateTaskForUser = async (
  userId: string,
  taskId: string,
  patch: Partial<Omit<TaskValues, "createdVia">>,
) => {
  await assertLinksOwned(userId, patch);

  const existing = await prisma.task.count({ where: { id: taskId, userId } });
  if (existing === 0) throw new Error("Task not found");

  return prisma.task.update({
    where: { id: taskId, userId },
    data: definedOnly(patch),
    include: TASK_INCLUDE,
  });
};

export const setTaskStatusForUser = (
  userId: string,
  taskId: string,
  status: TaskStatus,
) => updateTaskForUser(userId, taskId, { status });

export interface ListTasksOptions {
  statuses?: TaskStatus[];
  dueBefore?: Date;
  jobId?: string;
  contactId?: string;
  limit?: number;
}

const TASK_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  jobId: true,
  contactId: true,
  Job: {
    select: {
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
  },
  Contact: { select: { name: true } },
} as const;

// Soonest due first, undated last, then most important.
export const listTasksForUser = async (
  userId: string,
  options: ListTasksOptions = {},
) => {
  const where = {
    userId,
    ...(options.statuses ? { status: { in: options.statuses } } : {}),
    ...(options.dueBefore ? { dueDate: { lte: options.dueBefore } } : {}),
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.contactId ? { contactId: options.contactId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      take: options.limit,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      select: TASK_LIST_SELECT,
    }),
    prisma.task.count({ where }),
  ]);
  return { rows, total };
};
