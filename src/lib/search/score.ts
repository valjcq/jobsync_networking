import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";

// Pure name/keyword scoring for the MCP `search` tool. Done in memory over slim
// per-entity indexes rather than in SQL: SQLite's LIKE only folds ASCII case,
// so "jose" would miss "José", and personal-scale data fits in memory.

export type MatchKind = "exact" | "prefix" | "tokens" | "fuzzy";

export interface SearchField {
  text: string | null | undefined;
  // Primary fields (a title, a name) outweigh secondary ones (a location).
  weight: number;
}

export interface Score {
  score: number;
  kind: MatchKind;
}

const BASE: Record<MatchKind, number> = {
  exact: 100,
  prefix: 80,
  tokens: 60,
  fuzzy: 35,
};

// Across several fields at once ("acme data engineer": company + title).
const COMBINED_WEIGHT = 0.8;

export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Short tokens must match exactly; typos are only forgiven in longer words so
// "ai" never fuzzily matches "at".
function allowedEdits(token: string): number {
  if (token.length >= 9) return 2;
  if (token.length >= 5) return 1;
  return 0;
}

const tokenize = (canonical: string) => canonical.split(" ").filter(Boolean);

function tokensContained(queryTokens: string[], haystack: string): boolean {
  return queryTokens.every((t) => haystack.includes(t));
}

function tokensFuzzy(queryTokens: string[], haystack: string): boolean {
  const words = tokenize(haystack);
  return queryTokens.every((t) => {
    if (haystack.includes(t)) return true;
    const max = allowedEdits(t);
    if (max === 0) return false;
    return words.some((w) => levenshtein(t, w, max) <= max);
  });
}

function scoreOne(query: string, queryTokens: string[], text: string): Score | null {
  if (text === query) return { score: BASE.exact, kind: "exact" };
  if (text.startsWith(query)) return { score: BASE.prefix, kind: "prefix" };
  if (tokensContained(queryTokens, text)) {
    return { score: BASE.tokens, kind: "tokens" };
  }
  if (tokensFuzzy(queryTokens, text)) return { score: BASE.fuzzy, kind: "fuzzy" };
  return null;
}

export function scoreFields(
  rawQuery: string,
  fields: SearchField[],
): Score | null {
  const query = canonicalizeEntityValue(rawQuery);
  if (!query) return null;
  const queryTokens = tokenize(query);

  const canonical = fields
    .filter((f) => f.text && f.text.trim())
    .map((f) => ({
      text: canonicalizeEntityValue(f.text!, { stripLegalSuffix: true }),
      weight: f.weight,
    }));

  let best: Score | null = null;
  const consider = (candidate: Score | null) => {
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  };

  for (const field of canonical) {
    const s = scoreOne(query, queryTokens, field.text);
    if (s) consider({ score: s.score * field.weight, kind: s.kind });
  }

  // The query may span fields: every word has to appear somewhere.
  if (queryTokens.length > 1) {
    const combined = canonical.map((f) => f.text).join(" ");
    if (tokensContained(queryTokens, combined)) {
      consider({ score: BASE.tokens * COMBINED_WEIGHT, kind: "tokens" });
    } else if (tokensFuzzy(queryTokens, combined)) {
      consider({ score: BASE.fuzzy * COMBINED_WEIGHT, kind: "fuzzy" });
    }
  }

  return best;
}
