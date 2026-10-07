import prisma from "@/lib/db";
import { setJobStatusForUser } from "@/lib/jobs/status";
import { plainTextToHtml, toPlainText } from "@/lib/tasks/description";
import { OPEN_TASK_STATUSES } from "@/lib/tasks/tasks";
import { formatDateOnly } from "@/lib/networking/dateOnly";
import { runTool, text, type ToolResult } from "./toolResult";

const NOT_FOUND = "Job not found";
const NOTES_SHOWN = 5;
const INTERACTIONS_SHOWN = 5;
const clip = (value: string, max = 200) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export async function handleGetJob(
  input: { jobId: string },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, userId },
      select: {
        id: true,
        jobUrl: true,
        applied: true,
        appliedDate: true,
        dueDate: true,
        matchScore: true,
        descriptionCompleteness: true,
        salaryRange: true,
        salaryCurrency: true,
        createdVia: true,
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
        Location: { select: { label: true } },
        Status: { select: { value: true } },
        tags: { select: { label: true } },
        Notes: {
          orderBy: { createdAt: "desc" },
          take: NOTES_SHOWN,
          select: { content: true, createdAt: true },
        },
        contactLinks: {
          select: {
            Contact: { select: { id: true, name: true } },
            Role: { select: { label: true } },
          },
        },
        interactions: {
          orderBy: { occurredAt: "desc" },
          take: INTERACTIONS_SHOWN,
          select: {
            id: true,
            occurredAt: true,
            outcome: true,
            nextStep: true,
            nextStepDoneAt: true,
            Contact: { select: { name: true } },
            Purpose: { select: { label: true } },
          },
        },
        tasks: {
          where: { status: { in: OPEN_TASK_STATUSES } },
          select: { id: true, title: true, dueDate: true },
        },
      },
    });
    if (!job) throw new Error(NOT_FOUND);

    const lines = [
      `${job.JobTitle.label} @ ${job.Company.label} (id: ${job.id})`,
      `Status: ${job.Status.value}${job.applied ? ", applied" : ""}` +
        `${job.appliedDate ? ` on ${formatDateOnly(job.appliedDate)}` : ""}` +
        `${job.dueDate ? `, due ${formatDateOnly(job.dueDate)}` : ""}`,
    ];
    if (job.Location) lines.push(`Location: ${job.Location.label}`);
    if (job.jobUrl) lines.push(`URL: ${job.jobUrl}`);
    if (job.salaryRange) {
      lines.push(`Salary: ${job.salaryRange}${job.salaryCurrency ? ` ${job.salaryCurrency}` : ""}`);
    }
    lines.push(
      `Match: ${job.matchScore != null ? `${job.matchScore}%` : "not scored"}; ` +
        `description: ${job.descriptionCompleteness ?? "unknown"}; ` +
        `tags: ${job.tags.length ? job.tags.map((t) => t.label).join(", ") : "none"}`,
    );

    lines.push(
      job.contactLinks.length
        ? `Linked contacts:\n${job.contactLinks
            .map((l) => `- ${l.Contact.name} (id: ${l.Contact.id}, ${l.Role.label})`)
            .join("\n")}`
        : "Linked contacts: none",
    );
    lines.push(
      job.interactions.length
        ? `Recent interactions:\n${job.interactions
            .map(
              (i) =>
                `- ${formatDateOnly(i.occurredAt)} ${i.Purpose.label} with ${i.Contact.name}` +
                `${i.outcome ? `: ${clip(i.outcome)}` : ""}` +
                `${i.nextStep ? ` [next step: ${clip(i.nextStep, 80)}${i.nextStepDoneAt ? ", done" : ""}]` : ""} (id: ${i.id})`,
            )
            .join("\n")}`
        : "Recent interactions: none",
    );
    lines.push(
      job.tasks.length
        ? `Open todos:\n${job.tasks
            .map(
              (t) =>
                `- ${t.title} (id: ${t.id}${t.dueDate ? `, due ${formatDateOnly(t.dueDate)}` : ""})`,
            )
            .join("\n")}`
        : "Open todos: none",
    );
    lines.push(
      job.Notes.length
        ? `Latest notes:\n${job.Notes.map(
            (n) => `- ${formatDateOnly(n.createdAt)}: ${clip(toPlainText(n.content))}`,
          ).join("\n")}`
        : "Notes: none",
    );

    return text(lines.join("\n"));
  });
}

export async function handleSetJobStatus(
  input: { jobId: string; status: string },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const [job, status] = await Promise.all([
      prisma.job.findFirst({
        where: { id: input.jobId, userId },
        select: {
          JobTitle: { select: { label: true } },
          Company: { select: { label: true } },
          Status: { select: { value: true } },
        },
      }),
      prisma.jobStatus.findUnique({ where: { value: input.status } }),
    ]);
    if (!job) throw new Error(NOT_FOUND);
    if (!status) throw new Error(`Invalid status "${input.status}"`);

    const name = `${job.JobTitle.label} @ ${job.Company.label}`;
    if (job.Status.value === status.value) {
      return text(`Already ${status.value}: ${name} (id: ${input.jobId}). Nothing changed.`);
    }

    await setJobStatusForUser(userId, input.jobId, status);
    return text(
      `Moved ${name} (id: ${input.jobId}) from ${job.Status.value} to ${status.value}.`,
    );
  });
}

export async function handleAddJobNote(
  input: { jobId: string; content: string },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const content = input.content.trim();
    if (!content) return text("Validation error: content is required");

    const job = await prisma.job.findFirst({
      where: { id: input.jobId, userId },
      select: {
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
      },
    });
    if (!job) throw new Error(NOT_FOUND);

    // Notes are Tiptap HTML, like task descriptions.
    const note = await prisma.note.create({
      data: { jobId: input.jobId, userId, content: plainTextToHtml(content) },
      select: { id: true },
    });
    return text(
      `Added a note to ${job.JobTitle.label} @ ${job.Company.label} (note id: ${note.id}).`,
    );
  });
}
