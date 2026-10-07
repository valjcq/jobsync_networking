import prisma from "@/lib/db";
import { plainTextToHtml, toPlainText } from "@/lib/tasks/description";
import {
  OPEN_TASK_STATUSES,
  createTaskForUser,
  listTasksForUser,
  updateTaskForUser,
} from "@/lib/tasks/tasks";
import type { TaskStatus } from "@/models/task.model";
import { searchForUser } from "@/lib/search/search";
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
import { runTool, text, type ToolResult } from "./toolResult";

export interface AddTodoInput {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: number;
  jobId?: string;
  contactId?: string;
  jobQuery?: string;
  contactName?: string;
  allowDuplicate?: boolean;
}

export interface ListTodosInput {
  status?: "open" | "all" | TaskStatus;
  dueBefore?: string;
  jobId?: string;
  contactId?: string;
  limit?: number;
}

export interface UpdateTodoInput {
  todoId: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: number;
  status?: TaskStatus;
  jobId?: string | null;
  contactId?: string | null;
}

const DEFAULT_LIST_LIMIT = 25;

const description = (value: string | null | undefined) =>
  value && value.trim() ? plainTextToHtml(value) : null;

type TodoRow = Awaited<ReturnType<typeof listTasksForUser>>["rows"][number];

function formatTodo(row: TodoRow): string {
  const links = [
    row.Job ? `job: ${row.Job.JobTitle.label} @ ${row.Job.Company.label}` : null,
    row.Contact ? `contact: ${row.Contact.name}` : null,
  ].filter(Boolean);
  const detail = toPlainText(row.description);
  return (
    `- ${row.title} (id: ${row.id}, status: ${row.status}, priority: ${row.priority}` +
    `${row.dueDate ? `, due ${formatDateOnly(row.dueDate)}` : ""}` +
    `${links.length ? `, ${links.join(", ")}` : ""})` +
    `${detail ? ` — ${detail.length > 120 ? `${detail.slice(0, 120)}…` : detail}` : ""}`
  );
}

// A job named in words resolves only when exactly one saved job matches
// without a typo. Anything else is returned as candidates, nothing written.
async function resolveJob(
  userId: string,
  query: string,
): Promise<{ id: string } | { message: string }> {
  const hits = await searchForUser(userId, query, { types: ["job"], limit: 5 });
  const solid = hits.filter((h) => !h.fuzzy);
  if (solid.length === 1) return { id: solid[0].id };
  if (hits.length === 0) {
    return {
      message: `Nothing created: no saved job matches "${query}". Call search or add_job first.`,
    };
  }
  return {
    message:
      `Nothing created: "${query}" ${solid.length > 1 ? "matches several jobs" : "only has fuzzy matches"}:\n` +
      hits.map((h) => `- ${h.line}${h.fuzzy ? " — fuzzy match" : ""}`).join("\n") +
      `\nShow them to the user, then call add_todo again with the right jobId.`,
  };
}

async function resolveContact(
  userId: string,
  name: string,
): Promise<{ id: string } | { message: string }> {
  const index = await listContactIndexForUser(userId);
  const { exact, partial } = matchContactsByName(index, name);
  if (exact.length === 1) return { id: exact[0].id };
  const candidates = exact.length > 1 ? exact : partial;
  if (candidates.length === 0) {
    return {
      message: `Nothing created: no contact matches "${name}". Call add_contact first.`,
    };
  }
  return {
    message:
      `Nothing created: "${name}" ${exact.length > 1 ? "matches several contacts" : "has no exact match; closest"}:\n` +
      candidates.map((c) => `- ${formatContactCandidate(c)}`).join("\n") +
      `\nShow them to the user, then call add_todo again with the right contactId.`,
  };
}

export async function handleAddTodo(
  input: AddTodoInput,
  userId: string,
  tokenName?: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    if (input.jobId && input.jobQuery) {
      return text("Validation error: provide jobId or jobQuery, not both");
    }
    if (input.contactId && input.contactName) {
      return text("Validation error: provide contactId or contactName, not both");
    }

    const title = input.title.trim();
    if (title.length < 2) {
      return text("Validation error: title must be at least 2 characters");
    }
    const dueDate = input.dueDate
      ? parseDateOnly(input.dueDate, "dueDate")
      : null;
    if (dueDate && dueDate < todayLocalMidnight()) {
      return text(
        `Validation error: dueDate ${input.dueDate} is in the past. Use today or later.`,
      );
    }

    let jobId = input.jobId ?? null;
    if (input.jobQuery) {
      const resolved = await resolveJob(userId, input.jobQuery);
      if ("message" in resolved) return text(resolved.message);
      jobId = resolved.id;
    }
    let contactId = input.contactId ?? null;
    if (input.contactName) {
      const resolved = await resolveContact(userId, input.contactName);
      if ("message" in resolved) return text(resolved.message);
      contactId = resolved.id;
    }

    // Idempotency: a retried call, or a scheduled run seeing the same email
    // twice, must not stack identical open todos.
    if (!input.allowDuplicate) {
      const existing = await prisma.task.findFirst({
        where: {
          userId,
          title,
          jobId,
          contactId,
          status: { in: OPEN_TASK_STATUSES },
        },
        select: { id: true },
      });
      if (existing) {
        return text(
          `Already open: "${title}" (todo id: ${existing.id}). No new todo was created; ` +
            `pass allowDuplicate: true to add another.`,
        );
      }
    }

    const task = await createTaskForUser(userId, {
      title,
      description: description(input.description),
      status: "in-progress",
      priority: input.priority ?? 5,
      percentComplete: 0,
      dueDate,
      jobId,
      contactId,
      createdVia: tokenName ?? "mcp",
    });

    const [job, contact] = await Promise.all([
      jobId
        ? prisma.job.findFirst({
            where: { id: jobId, userId },
            select: { JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
          })
        : null,
      contactId
        ? prisma.contact.findFirst({
            where: { id: contactId, createdBy: userId },
            select: { name: true },
          })
        : null,
    ]);
    const links = [
      job ? `job: ${job.JobTitle.label} @ ${job.Company.label}` : null,
      contact ? `contact: ${contact.name}` : null,
    ].filter(Boolean);

    return text(
      `Created todo "${task.title}" (id: ${task.id}` +
        `${dueDate ? `, due ${formatDateOnly(dueDate)}` : ""}` +
        `, priority ${task.priority}${links.length ? `, ${links.join(", ")}` : ""}).`,
    );
  });
}

export async function handleListTodos(
  input: ListTodosInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const status = input.status ?? "open";
    const statuses =
      status === "open"
        ? OPEN_TASK_STATUSES
        : status === "all"
          ? undefined
          : [status];
    const dueBefore = input.dueBefore
      ? parseDateOnly(input.dueBefore, "dueBefore")
      : undefined;
    // lte on a midnight value would drop todos stored later that same day.
    if (dueBefore) dueBefore.setHours(23, 59, 59, 999);

    const { rows, total } = await listTasksForUser(userId, {
      statuses,
      dueBefore,
      jobId: input.jobId,
      contactId: input.contactId,
      limit: input.limit ?? DEFAULT_LIST_LIMIT,
    });

    if (rows.length === 0) return text("No todos match.");

    const more =
      total > rows.length
        ? `\nShowing ${rows.length} of ${total} — narrow the filters to see the rest.`
        : "";
    return text(
      `${total} todo${total === 1 ? "" : "s"}, soonest due first:\n` +
        rows.map(formatTodo).join("\n") +
        more,
    );
  });
}

export async function handleUpdateTodo(
  input: UpdateTodoInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const title = input.title?.trim();
    if (input.title !== undefined && (title?.length ?? 0) < 2) {
      return text("Validation error: title must be at least 2 characters");
    }

    const patch: Parameters<typeof updateTaskForUser>[2] = {};
    if (title) patch.title = title;
    if (input.description !== undefined) {
      patch.description = description(input.description);
    }
    if (input.dueDate !== undefined) {
      patch.dueDate =
        input.dueDate === null ? null : parseDateOnly(input.dueDate, "dueDate");
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === "complete") patch.percentComplete = 100;
    }
    if (input.jobId !== undefined) patch.jobId = input.jobId;
    if (input.contactId !== undefined) patch.contactId = input.contactId;

    if (Object.keys(patch).length === 0) {
      return text("Nothing to update: supply at least one field besides todoId.");
    }

    const task = await updateTaskForUser(userId, input.todoId, patch);
    return text(
      `Updated todo "${task.title}" (id: ${task.id}, status: ${task.status}` +
        `${task.dueDate ? `, due ${formatDateOnly(task.dueDate)}` : ""}).`,
    );
  });
}

export async function handleCompleteTodo(
  input: { todoId: string },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const existing = await prisma.task.findFirst({
      where: { id: input.todoId, userId },
      select: { status: true, title: true },
    });
    if (!existing) throw new Error("Task not found");
    if (existing.status === "complete") {
      return text(`Already complete: "${existing.title}" (id: ${input.todoId}).`);
    }
    const task = await updateTaskForUser(userId, input.todoId, {
      status: "complete",
      percentComplete: 100,
    });
    return text(`Marked todo "${task.title}" (id: ${task.id}) complete.`);
  });
}
