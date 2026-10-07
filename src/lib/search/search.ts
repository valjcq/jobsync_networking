import prisma from "@/lib/db";
import { toPlainText } from "@/lib/tasks/description";
import { formatDateOnly } from "@/lib/networking/dateOnly";
import { scoreFields, type MatchKind, type SearchField } from "./score";

export const SEARCH_TYPES = [
  "job",
  "contact",
  "company",
  "interaction",
  "task",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const PER_TYPE_CAP = 10;
export const TOTAL_CAP = 25;

export interface SearchHit {
  type: SearchType;
  id: string;
  line: string;
  score: number;
  fuzzy: boolean;
  // For tie-breaking: newer first.
  recency: number;
  // Why it matched when it was not the name/title.
  note?: string;
}

interface Candidate {
  type: SearchType;
  id: string;
  fields: SearchField[];
  line: string;
  recency: Date | null | undefined;
}

const P = 1; // primary
const S = 0.7; // secondary
const T = 0.45; // tertiary

const date = (d: Date | null | undefined) => (d ? formatDateOnly(d) : null);
const join = (parts: Array<string | null | undefined>, sep: string) =>
  parts.filter(Boolean).join(sep);

async function jobCandidates(userId: string): Promise<Candidate[]> {
  const rows = await prisma.job.findMany({
    where: {
      userId,
      OR: [
        { discoveryStatus: null },
        { discoveryStatus: { not: "dismissed" } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      appliedDate: true,
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
      Location: { select: { label: true } },
      Status: { select: { value: true } },
      tags: { select: { label: true } },
    },
  });
  return rows.map((r) => ({
    type: "job",
    id: r.id,
    recency: r.appliedDate ?? r.createdAt,
    fields: [
      { text: r.JobTitle.label, weight: P },
      { text: r.Company.label, weight: 0.9 },
      { text: r.Location?.label, weight: T },
      { text: r.tags.map((t) => t.label).join(" "), weight: T },
    ],
    line:
      `${r.JobTitle.label} @ ${r.Company.label} (id: ${r.id}, status: ${r.Status.value}` +
      `${r.appliedDate ? `, applied ${date(r.appliedDate)}` : ""}` +
      `${r.Location ? `, ${r.Location.label}` : ""})`,
  }));
}

async function contactCandidates(userId: string): Promise<Candidate[]> {
  const rows = await prisma.contact.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      lastContactedAt: true,
      createdAt: true,
      Company: { select: { label: true } },
    },
  });
  return rows.map((r) => ({
    type: "contact",
    id: r.id,
    recency: r.lastContactedAt ?? r.createdAt,
    fields: [
      { text: r.name, weight: P },
      { text: r.Company?.label, weight: S },
      { text: r.title, weight: S },
      { text: r.email, weight: S },
    ],
    line:
      `${r.name} (id: ${r.id}` +
      `${join([r.title, r.Company?.label], " @ ") ? `, ${join([r.title, r.Company?.label], " @ ")}` : ""}` +
      `, last contacted: ${date(r.lastContactedAt) ?? "never"})`,
  }));
}

async function companyCandidates(userId: string): Promise<Candidate[]> {
  const rows = await prisma.company.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      label: true,
      websiteUrl: true,
      industry: true,
      _count: { select: { jobsApplied: true, contacts: true } },
    },
  });
  return rows.map((r) => ({
    type: "company",
    id: r.id,
    recency: null,
    fields: [
      { text: r.label, weight: P },
      { text: r.websiteUrl, weight: T },
      { text: r.industry, weight: T },
    ],
    line:
      `${r.label} (id: ${r.id}, ${r._count.jobsApplied} job${r._count.jobsApplied === 1 ? "" : "s"}, ` +
      `${r._count.contacts} contact${r._count.contacts === 1 ? "" : "s"})`,
  }));
}

async function interactionCandidates(userId: string): Promise<Candidate[]> {
  const rows = await prisma.interaction.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      occurredAt: true,
      outcome: true,
      nextStep: true,
      nextStepDoneAt: true,
      Contact: { select: { name: true } },
      Purpose: { select: { label: true } },
    },
  });
  return rows.map((r) => ({
    type: "interaction",
    id: r.id,
    recency: r.occurredAt,
    fields: [
      { text: r.Contact.name, weight: P },
      { text: r.Purpose.label, weight: S },
      { text: r.outcome, weight: T },
      { text: r.nextStep, weight: S },
    ],
    line:
      `${r.Purpose.label} with ${r.Contact.name}, ${date(r.occurredAt)} (id: ${r.id}` +
      `${r.nextStep ? `, next step: "${r.nextStep}"${r.nextStepDoneAt ? " (done)" : ""}` : ""})`,
  }));
}

async function taskCandidates(userId: string): Promise<Candidate[]> {
  const rows = await prisma.task.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      dueDate: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    type: "task",
    id: r.id,
    recency: r.dueDate ?? r.createdAt,
    fields: [
      { text: r.title, weight: P },
      { text: toPlainText(r.description), weight: T },
    ],
    line:
      `${r.title} (id: ${r.id}, status: ${r.status}` +
      `${r.dueDate ? `, due ${date(r.dueDate)}` : ""})`,
  }));
}

const LOADERS: Record<SearchType, (userId: string) => Promise<Candidate[]>> = {
  job: jobCandidates,
  contact: contactCandidates,
  company: companyCandidates,
  interaction: interactionCandidates,
  task: taskCandidates,
};

// Job descriptions are long, so they stay out of the in-memory index. This is
// a SQL `contains`, which only folds ASCII case — documented in the tool text.
async function descriptionMatchIds(
  userId: string,
  query: string,
): Promise<Set<string>> {
  const rows = await prisma.job.findMany({
    where: { userId, description: { contains: query } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

const DESCRIPTION_SCORE = 20;

export interface SearchOptions {
  types: SearchType[];
  limit?: number;
  includeDescription?: boolean;
}

export async function searchForUser(
  userId: string,
  query: string,
  options: SearchOptions,
): Promise<SearchHit[]> {
  const total = Math.min(Math.max(options.limit ?? TOTAL_CAP, 1), TOTAL_CAP);
  const perType = Math.min(PER_TYPE_CAP, total);

  const [pools, descriptionIds] = await Promise.all([
    Promise.all(options.types.map((t) => LOADERS[t](userId))),
    options.includeDescription && options.types.includes("job")
      ? descriptionMatchIds(userId, query.trim())
      : Promise.resolve(new Set<string>()),
  ]);

  const hits: SearchHit[] = [];
  for (const candidate of pools.flat()) {
    const match = scoreFields(query, candidate.fields);
    if (match) {
      hits.push({
        type: candidate.type,
        id: candidate.id,
        line: candidate.line,
        score: match.score,
        fuzzy: match.kind === "fuzzy",
        recency: candidate.recency?.getTime() ?? 0,
      });
    } else if (candidate.type === "job" && descriptionIds.has(candidate.id)) {
      hits.push({
        type: candidate.type,
        id: candidate.id,
        line: candidate.line,
        score: DESCRIPTION_SCORE,
        fuzzy: false,
        recency: candidate.recency?.getTime() ?? 0,
        note: "matched in the job description",
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || b.recency - a.recency);

  const counts: Partial<Record<SearchType, number>> = {};
  const kept: SearchHit[] = [];
  for (const hit of hits) {
    const n = counts[hit.type] ?? 0;
    if (n >= perType) continue;
    counts[hit.type] = n + 1;
    kept.push(hit);
    if (kept.length >= total) break;
  }
  return kept;
}

export type { MatchKind };
