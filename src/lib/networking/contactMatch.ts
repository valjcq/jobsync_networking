import prisma from "@/lib/db";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";
import { formatDateOnly } from "./dateOnly";

// Name and duplicate matching for the MCP contact tools. Done in memory over a
// slim index rather than in SQL: SQLite's LIKE only folds ASCII case, so
// "jose" would miss "José", and a duplicate check that misses is worse than a
// personal contact list's few hundred rows.

export interface ContactIndexRow {
  id: string;
  name: string;
  email: string | null;
  linkedinUrl: string | null;
  lastContactedAt: Date | null;
  company: string | null;
}

export async function listContactIndexForUser(
  userId: string,
): Promise<ContactIndexRow[]> {
  const rows = await prisma.contact.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      name: true,
      email: true,
      linkedinUrl: true,
      lastContactedAt: true,
      Company: { select: { label: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    linkedinUrl: row.linkedinUrl,
    lastContactedAt: row.lastContactedAt,
    company: row.Company?.label ?? null,
  }));
}

// Same profile, whatever the scheme, "www." or trailing slash.
export function normalizeLinkedinUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname.replace(/^www\./i, "")}${parsed.pathname}`
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

// exact: the whole canonical name matches (case, diacritics, spacing and
// commas folded). partial: no exact match, but every word of the query appears
// in the name. Partial matches are only ever candidates, never a resolution.
export function matchContactsByName(
  index: ContactIndexRow[],
  name: string,
): { exact: ContactIndexRow[]; partial: ContactIndexRow[] } {
  const query = canonicalizeEntityValue(name);
  if (!query) return { exact: [], partial: [] };

  const exact = index.filter((c) => canonicalizeEntityValue(c.name) === query);
  if (exact.length > 0) return { exact, partial: [] };

  const tokens = query.split(" ");
  const partial = index.filter((c) => {
    const candidate = canonicalizeEntityValue(c.name);
    return tokens.every((t) => candidate.includes(t));
  });
  return { exact: [], partial };
}

export interface DuplicateMatch {
  contact: ContactIndexRow;
  reasons: string[];
}

export function findDuplicateContacts(
  index: ContactIndexRow[],
  probe: { name: string; email?: string | null; linkedinUrl?: string | null },
): DuplicateMatch[] {
  const name = canonicalizeEntityValue(probe.name);
  const email = probe.email?.trim().toLowerCase() || null;
  const linkedin = probe.linkedinUrl?.trim()
    ? normalizeLinkedinUrl(probe.linkedinUrl)
    : null;

  const matches: DuplicateMatch[] = [];
  for (const contact of index) {
    const reasons: string[] = [];
    if (name && canonicalizeEntityValue(contact.name) === name) {
      reasons.push("same name");
    }
    if (email && contact.email?.trim().toLowerCase() === email) {
      reasons.push("same email");
    }
    if (
      linkedin &&
      contact.linkedinUrl &&
      normalizeLinkedinUrl(contact.linkedinUrl) === linkedin
    ) {
      reasons.push("same LinkedIn URL");
    }
    if (reasons.length > 0) matches.push({ contact, reasons });
  }
  return matches;
}

export function formatContactCandidate(contact: ContactIndexRow): string {
  const company = contact.company ? `, ${contact.company}` : "";
  const last = contact.lastContactedAt
    ? formatDateOnly(contact.lastContactedAt)
    : "never";
  return `${contact.name} (id: ${contact.id}${company}, last contacted: ${last})`;
}
