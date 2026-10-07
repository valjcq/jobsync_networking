import prisma from "@/lib/db";
import { markNextStepDoneForUser } from "@/lib/networking/interactions";

import { OPEN_TASK_STATUSES } from "@/lib/tasks/tasks";
import { formatDateOnly } from "@/lib/networking/dateOnly";
import { runTool, text, type ToolResult } from "./toolResult";

const INTERACTIONS_SHOWN = 8;
const clip = (value: string, max = 200) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export async function handleGetContact(
  input: { contactId: string },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: userId },
      select: {
        id: true,
        name: true,
        title: true,
        email: true,
        phone: true,
        linkedinUrl: true,
        relationship: true,
        notes: true,
        lastContactedAt: true,
        Company: { select: { label: true } },
        Location: { select: { label: true } },
        Role: { select: { label: true } },
        jobLinks: {
          select: {
            Job: {
              select: {
                id: true,
                JobTitle: { select: { label: true } },
                Company: { select: { label: true } },
              },
            },
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
            nextStepDate: true,
            nextStepDoneAt: true,
            Purpose: { select: { label: true } },
          },
        },
        tasks: {
          where: { status: { in: OPEN_TASK_STATUSES } },
          select: { id: true, title: true, dueDate: true },
        },
      },
    });
    if (!contact) throw new Error("Contact not found");

    const role = [contact.title, contact.Company?.label].filter(Boolean).join(" @ ");
    const lines = [`${contact.name}${role ? `, ${role}` : ""} (id: ${contact.id})`];
    const facts = [
      contact.Role ? `role: ${contact.Role.label}` : null,
      contact.email ? `email: ${contact.email}` : null,
      contact.phone ? `phone: ${contact.phone}` : null,
      contact.linkedinUrl ? `LinkedIn: ${contact.linkedinUrl}` : null,
      contact.Location ? `location: ${contact.Location.label}` : null,
      contact.relationship ? `relationship: ${contact.relationship}` : null,
      `last contacted: ${contact.lastContactedAt ? formatDateOnly(contact.lastContactedAt) : "never"}`,
    ].filter(Boolean);
    lines.push(facts.join("; "));
    if (contact.notes) lines.push(`Notes: ${clip(contact.notes, 400)}`);

    lines.push(
      contact.jobLinks.length
        ? `Linked jobs:\n${contact.jobLinks
            .map(
              (l) =>
                `- ${l.Job.JobTitle.label} @ ${l.Job.Company.label} (id: ${l.Job.id}, ${l.Role.label})`,
            )
            .join("\n")}`
        : "Linked jobs: none",
    );
    lines.push(
      contact.interactions.length
        ? `Recent interactions:\n${contact.interactions
            .map(
              (i) =>
                `- ${formatDateOnly(i.occurredAt)} ${i.Purpose.label}` +
                `${i.outcome ? `: ${clip(i.outcome)}` : ""}` +
                `${i.nextStep ? ` [next step: ${clip(i.nextStep, 80)}${i.nextStepDate ? ` due ${formatDateOnly(i.nextStepDate)}` : ""}${i.nextStepDoneAt ? ", done" : ""}]` : ""} (id: ${i.id})`,
            )
            .join("\n")}`
        : "Recent interactions: none",
    );
    lines.push(
      contact.tasks.length
        ? `Open todos:\n${contact.tasks
            .map(
              (t) =>
                `- ${t.title} (id: ${t.id}${t.dueDate ? `, due ${formatDateOnly(t.dueDate)}` : ""})`,
            )
            .join("\n")}`
        : "Open todos: none",
    );

    return text(lines.join("\n"));
  });
}

export async function handleCompleteFollowup(
  input: { interactionId: string; done?: boolean },
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const done = input.done ?? true;
    const step = await prisma.interaction.findFirst({
      where: { id: input.interactionId, createdBy: userId, nextStep: { not: null } },
      select: {
        nextStep: true,
        nextStepDoneAt: true,
        Contact: { select: { name: true } },
      },
    });
    if (!step) throw new Error("Next step not found");

    if (done === (step.nextStepDoneAt !== null)) {
      return text(
        `Already ${done ? "done" : "open"}: "${step.nextStep}" (${step.Contact.name}). Nothing changed.`,
      );
    }

    await markNextStepDoneForUser(userId, input.interactionId, done);
    return text(
      `Marked "${step.nextStep}" (${step.Contact.name}) ${done ? "done" : "open again"}. ` +
        `If something new is now due, call add_todo for it.`,
    );
  });
}

