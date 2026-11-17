import prisma from "@/lib/db";
import { AddContactFormSchema } from "@/models/addContactForm.schema";
import type {
  McpAddContactNoteInput,
  McpDeleteContactInput,
  McpLinkContactToJobInput,
  McpMergeContactsInput,
  McpUpdateContactInput,
} from "@/models/mcp.schema";
import {
  assertContactRefsOwned,
  toContactData,
} from "@/lib/networking/contacts";
import {
  findDuplicateContacts,
  formatContactCandidate,
  listContactIndexForUser,
} from "@/lib/networking/contactMatch";
import {
  formatDateOnly,
  parseDateOnly,
  todayLocalMidnight,
} from "@/lib/networking/dateOnly";
import {
  CONTACT_STATUSES,
  matchContactStatus,
} from "@/lib/networking/contactStatus";
import {
  resolveCompany,
  resolveContactRole,
  resolveLocation,
  type ResolvedEntity,
} from "@/lib/jobs/resolve";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";
import { runTool, text, type ToolResult } from "./toolResult";

const NOTES_MAX = 2000;
const validation = (message: string) => text(`Validation error: ${message}`);
const notFound = (id: string) => new Error(`Contact not found (id: ${id})`);

// Fields a caller may patch, in the order they are reported back.
const PATCHABLE = [
  "name",
  "title",
  "email",
  "phone",
  "linkedinUrl",
  "company",
  "location",
  "role",
  "relationship",
  "notes",
  "lastContactedAt",
  "status",
] as const;

export async function handleUpdateContact(
  input: McpUpdateContactInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const existing = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: userId },
    });
    if (!existing) throw notFound(input.contactId);

    const patched = PATCHABLE.filter((k) => input[k] !== undefined);
    if (patched.length === 0) {
      return validation("supply at least one field to change");
    }
    const has = (k: (typeof PATCHABLE)[number]) => input[k] !== undefined;
    const str = (v: string | null | undefined) => (v === null ? undefined : v);

    let lastContactedAt: Date | null = existing.lastContactedAt;
    if (has("lastContactedAt")) {
      lastContactedAt = input.lastContactedAt
        ? parseDateOnly(input.lastContactedAt, "lastContactedAt")
        : null;
    }

    let status: string | null = existing.status;
    if (has("status")) {
      const matched = input.status ? matchContactStatus(input.status) : null;
      if (input.status && !matched) {
        return validation(`status must be one of: ${CONTACT_STATUSES.join(", ")}`);
      }
      status = matched;
    }

    const merged = {
      name: input.name ?? existing.name,
      title: has("title") ? str(input.title) : (existing.title ?? undefined),
      email: has("email") ? str(input.email) : (existing.email ?? undefined),
      phone: has("phone") ? str(input.phone) : (existing.phone ?? undefined),
      linkedinUrl: has("linkedinUrl")
        ? str(input.linkedinUrl)
        : (existing.linkedinUrl ?? undefined),
      relationship: has("relationship")
        ? str(input.relationship)
        : (existing.relationship ?? undefined),
      notes: has("notes") ? str(input.notes) : (existing.notes ?? undefined),
      lastContactedAt,
    };

    // The Contacts form's own schema. Only complaints about a field being
    // changed are reported, so a stale value elsewhere cannot block the edit.
    const parsed = AddContactFormSchema.safeParse(merged);
    if (!parsed.success) {
      const issues = parsed.error.issues.filter(
        (i) => i.path.length === 0 || patched.includes(i.path[0] as never),
      );
      if (issues.length > 0) {
        return validation(issues.map((i) => i.message).join("; "));
      }
    }

    // Only identifiers being changed are probed, and the contact itself is
    // not its own duplicate.
    const nameChanged =
      input.name !== undefined &&
      canonicalizeEntityValue(input.name) !==
        canonicalizeEntityValue(existing.name);
    const emailChanged =
      has("email") &&
      (input.email ?? "").trim().toLowerCase() !==
        (existing.email ?? "").trim().toLowerCase();
    const linkedinChanged = has("linkedinUrl") && input.linkedinUrl !== existing.linkedinUrl;
    if (!input.allowDuplicate && (nameChanged || emailChanged || linkedinChanged)) {
      const index = (await listContactIndexForUser(userId)).filter(
        (c) => c.id !== existing.id,
      );
      const duplicates = findDuplicateContacts(index, {
        name: nameChanged ? merged.name : "",
        email: emailChanged ? merged.email : undefined,
        linkedinUrl: linkedinChanged ? merged.linkedinUrl : undefined,
      });
      if (duplicates.length > 0) {
        return text(
          `Nothing changed: ${duplicates.length} other contact${duplicates.length === 1 ? "" : "s"} already ${duplicates.length === 1 ? "has" : "have"} that name, email or LinkedIn URL:\n` +
            duplicates
              .map((d) => `- ${formatContactCandidate(d.contact)} — ${d.reasons.join(", ")}`)
              .join("\n") +
            `\nIf they are the same person, call merge_contacts. If they are different people, call update_contact again with allowDuplicate: true.`,
        );
      }
    }

    const resolved: Array<[string, ResolvedEntity]> = [];
    const pick = async (
      field: "company" | "location" | "role",
      current: string | null,
      resolve: (label: string, userId: string) => Promise<ResolvedEntity>,
    ) => {
      if (!has(field)) return current;
      const value = input[field];
      if (!value?.trim()) return null;
      const entity = await resolve(value, userId);
      resolved.push([field, entity]);
      return entity.id;
    };
    const companyId = await pick("company", existing.companyId, resolveCompany);
    const locationId = await pick("location", existing.locationId, resolveLocation);
    const roleId = await pick("role", existing.roleId, resolveContactRole);

    const data = toContactData({
      ...(parsed.success ? parsed.data : merged),
      name: merged.name,
      company: companyId ?? undefined,
      location: locationId ?? undefined,
      contactRole: roleId ?? undefined,
      workedAtCompany: existing.workedAtCompanyId ?? undefined,
      workedFrom: existing.workedFrom,
      workedTo: existing.workedTo,
      lastContactedAt,
      status,
    });
    await assertContactRefsOwned(userId, data);

    // updateMany: a unique-where cannot carry createdBy, so a count of 0 is
    // how a contact that is not the caller's surfaces.
    const res = await prisma.contact.updateMany({
      where: { id: existing.id, createdBy: userId },
      data,
    });
    if (res.count === 0) throw notFound(input.contactId);

    const report = resolved.length
      ? " " +
        resolved
          .map(
            ([kind, e]) =>
              `${kind}: "${e.label}" (${e.created ? "created" : "matched existing"}).`,
          )
          .join(" ")
      : "";
    return text(
      `Updated contact "${data.name}" (id: ${existing.id}): ${patched.join(", ")}.${report}`,
    );
  });
}

export async function handleDeleteContact(
  input: McpDeleteContactInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: userId },
      select: {
        name: true,
        _count: { select: { interactions: true, jobLinks: true, tasks: true } },
      },
    });
    if (!contact) throw notFound(input.contactId);

    const { interactions, jobLinks, tasks } = contact._count;
    const impact =
      `${interactions} logged interaction${interactions === 1 ? "" : "s"} and ` +
      `${jobLinks} job link${jobLinks === 1 ? "" : "s"} will be deleted with them; ` +
      `${tasks} linked todo${tasks === 1 ? "" : "s"} will be kept but unlinked`;

    if (!input.confirm) {
      return text(
        `Nothing deleted yet. Deleting "${contact.name}" (id: ${input.contactId}) cannot be undone: ${impact}. ` +
          `If these are duplicates, merge_contacts keeps the history instead. ` +
          `Once the user agrees, call delete_contact again with confirm: true.`,
      );
    }

    const res = await prisma.contact.deleteMany({
      where: { id: input.contactId, createdBy: userId },
    });
    if (res.count === 0) throw notFound(input.contactId);
    return text(`Deleted contact "${contact.name}" (id: ${input.contactId}); ${impact}.`);
  });
}

const MERGE_FILL = [
  "title",
  "email",
  "phone",
  "linkedinUrl",
  "relationship",
  "companyId",
  "locationId",
  "roleId",
  "workedAtCompanyId",
  "workedFrom",
  "workedTo",
  "status",
] as const;

const COMPARED_LABELS: Record<string, string> = {
  title: "title",
  email: "email",
  phone: "phone",
  linkedinUrl: "LinkedIn URL",
  relationship: "relationship",
  status: "status",
};

export async function handleMergeContacts(
  input: McpMergeContactsInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    if (input.keepContactId === input.mergeContactId) {
      return validation("keepContactId and mergeContactId must be different contacts");
    }
    const load = (id: string) =>
      prisma.contact.findFirst({
        where: { id, createdBy: userId },
        include: {
          jobLinks: { select: { id: true, jobId: true, roleId: true } },
          _count: { select: { interactions: true, tasks: true } },
        },
      });
    const [keep, dupe] = await Promise.all([
      load(input.keepContactId),
      load(input.mergeContactId),
    ]);
    if (!keep) throw notFound(input.keepContactId);
    if (!dupe) throw notFound(input.mergeContactId);

    // Notes are free text: combine them, or stop before anything is lost.
    let notes = keep.notes;
    if (dupe.notes && dupe.notes !== keep.notes) {
      notes = keep.notes
        ? `${keep.notes}\n\n[Merged from ${dupe.name}] ${dupe.notes}`
        : dupe.notes;
      if (notes.length > NOTES_MAX) {
        throw new Error(
          `The two contacts' notes are too long to combine (${notes.length} characters, limit ${NOTES_MAX}). ` +
            `Shorten one with update_contact, then merge again.`,
        );
      }
    }

    const fill: Record<string, unknown> = {};
    const conflicts: string[] = [];
    for (const field of MERGE_FILL) {
      const mine = keep[field];
      const theirs = dupe[field];
      if (mine == null && theirs != null) fill[field] = theirs;
      else if (mine != null && theirs != null && COMPARED_LABELS[field]) {
        if (String(mine).toLowerCase() !== String(theirs).toLowerCase()) {
          conflicts.push(`${COMPARED_LABELS[field]}: kept "${mine}", dropped "${theirs}"`);
        }
      }
    }
    if (
      dupe.lastContactedAt &&
      (!keep.lastContactedAt || dupe.lastContactedAt > keep.lastContactedAt)
    ) {
      fill.lastContactedAt = dupe.lastContactedAt;
    }
    if (notes !== keep.notes) fill.notes = notes;

    const keptLinks = new Set(keep.jobLinks.map((l) => `${l.jobId}|${l.roleId}`));
    const sameLinks = dupe.jobLinks.filter((l) => keptLinks.has(`${l.jobId}|${l.roleId}`));
    const movedLinks = dupe.jobLinks.filter((l) => !keptLinks.has(`${l.jobId}|${l.roleId}`));

    const summary =
      `"${dupe.name}" (id: ${dupe.id}) into "${keep.name}" (id: ${keep.id}): ` +
      `${dupe._count.interactions} interaction${dupe._count.interactions === 1 ? "" : "s"}, ` +
      `${movedLinks.length} job link${movedLinks.length === 1 ? "" : "s"} ` +
      `(${sameLinks.length} already linked) and ${dupe._count.tasks} todo${dupe._count.tasks === 1 ? "" : "s"} move over` +
      (Object.keys(fill).length
        ? `; empty fields filled from the duplicate: ${Object.keys(fill).join(", ")}`
        : "") +
      (conflicts.length ? `. Values not carried over — ${conflicts.join("; ")}` : "");

    if (!input.confirm) {
      return text(
        `Nothing merged yet. This would merge ${summary}. The duplicate is then deleted; this cannot be undone. ` +
          `Once the user agrees, call merge_contacts again with confirm: true.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const link of sameLinks) {
        await tx.jobContact.delete({ where: { id: link.id } });
      }
      for (const link of movedLinks) {
        await tx.jobContact.update({
          where: { id: link.id },
          data: { contactId: keep.id },
        });
      }
      await tx.interaction.updateMany({
        where: { contactId: dupe.id, createdBy: userId },
        data: { contactId: keep.id },
      });
      await tx.task.updateMany({
        where: { contactId: dupe.id, userId },
        data: { contactId: keep.id },
      });
      if (Object.keys(fill).length) {
        await tx.contact.update({ where: { id: keep.id }, data: fill });
      }
      await tx.contact.delete({ where: { id: dupe.id } });
    });

    return text(`Merged ${summary}.`);
  });
}

export async function handleAddContactNote(
  input: McpAddContactNoteInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const content = input.content.trim();
    if (!content) return validation("content is required");

    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: userId },
      select: { name: true, notes: true },
    });
    if (!contact) throw notFound(input.contactId);

    // A contact has one notes field, so a note is appended to it as a dated
    // line; nothing already written is changed.
    const line = `${formatDateOnly(todayLocalMidnight())}: ${content}`;
    const next = contact.notes ? `${contact.notes}\n${line}` : line;
    if (next.length > NOTES_MAX) {
      throw new Error(
        `Notes would exceed ${NOTES_MAX} characters (${next.length}). Condense the existing notes with update_contact first.`,
      );
    }

    const res = await prisma.contact.updateMany({
      where: { id: input.contactId, createdBy: userId },
      data: { notes: next },
    });
    if (res.count === 0) throw notFound(input.contactId);
    return text(`Added a note to ${contact.name} (id: ${input.contactId}).`);
  });
}

export async function handleLinkContactToJob(
  input: McpLinkContactToJobInput,
  userId: string,
): Promise<ToolResult> {
  return runTool(userId, async () => {
    const [contact, job] = await Promise.all([
      prisma.contact.findFirst({
        where: { id: input.contactId, createdBy: userId },
        select: { name: true, Role: { select: { id: true, label: true } } },
      }),
      prisma.job.findFirst({
        where: { id: input.jobId, userId },
        select: {
          JobTitle: { select: { label: true } },
          Company: { select: { label: true } },
        },
      }),
    ]);
    if (!contact) throw notFound(input.contactId);
    if (!job) throw new Error("Job not found");

    let role: { id: string; label: string } | null = contact.Role;
    if (input.role?.trim()) {
      const entity = await resolveContactRole(input.role, userId);
      role = { id: entity.id, label: entity.label };
    }
    if (!role) {
      return validation(
        `role is required: ${contact.name} has no role of their own (e.g. Recruiter, Referrer, Hiring Manager)`,
      );
    }

    const name = `${job.JobTitle.label} @ ${job.Company.label}`;
    const already = text(
      `Already linked: ${contact.name} is ${role.label} for ${name}. Nothing changed.`,
    );
    const existing = await prisma.jobContact.findFirst({
      where: { jobId: input.jobId, contactId: input.contactId, roleId: role.id },
      select: { id: true },
    });
    if (existing) return already;

    try {
      await prisma.jobContact.create({
        data: { jobId: input.jobId, contactId: input.contactId, roleId: role.id },
      });
    } catch (err: any) {
      if (err?.code === "P2002") return already;
      throw err;
    }
    return text(`Linked ${contact.name} to ${name} as ${role.label}.`);
  });
}
