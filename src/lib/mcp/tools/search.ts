import {
  SEARCH_TYPES,
  searchForUser,
  type SearchType,
} from "@/lib/search/search";
import { runTool, text } from "./toolResult";

export interface SearchInput {
  query: string;
  types?: SearchType[];
  limit?: number;
  includeDescription?: boolean;
}

// Which scope may read which kind of record, as the other tools gate them.
const TYPE_SCOPE: Record<SearchType, string> = {
  job: "jobs:write",
  company: "jobs:write",
  contact: "networking:write",
  interaction: "networking:write",
  task: "tasks:write",
};

export async function handleSearch(
  input: SearchInput,
  userId: string,
  scopes: string[],
) {
  return runTool(userId, async () => {
    const query = input.query.trim();
    if (!query) return text("Validation error: query is required");

    const requested = input.types?.length ? input.types : [...SEARCH_TYPES];
    const allowed = requested.filter((t) => scopes.includes(TYPE_SCOPE[t]));
    const skipped = requested.filter((t) => !allowed.includes(t));
    const skippedNote = skipped.length
      ? `\nNot searched (token lacks ${[...new Set(skipped.map((t) => TYPE_SCOPE[t]))].join(", ")}): ${skipped.join(", ")}.`
      : "";

    if (allowed.length === 0) {
      return text(
        `Nothing searched: this token has no scope for ${requested.join(", ")}.${skippedNote}`,
      );
    }

    const hits = await searchForUser(userId, query, {
      types: allowed,
      limit: input.limit,
      includeDescription: input.includeDescription,
    });

    if (hits.length === 0) {
      return text(
        `No ${allowed.join("/")} matches "${query}".${skippedNote}`,
      );
    }

    const fuzzyCount = hits.filter((h) => h.fuzzy).length;
    const lines = hits.map(
      (h) =>
        `- [${h.type}] ${h.line}` +
        `${h.fuzzy ? " — fuzzy match" : ""}` +
        `${h.note ? ` — ${h.note}` : ""}`,
    );
    const confirm = fuzzyCount
      ? `\n${fuzzyCount === 1 ? "A result is" : `${fuzzyCount} results are`} a fuzzy (typo-tolerant) match: ` +
        `confirm with the user before acting on ${fuzzyCount === 1 ? "it" : "them"}.`
      : "";

    return text(
      `${hits.length} result${hits.length === 1 ? "" : "s"} for "${query}", best first:\n` +
        lines.join("\n") +
        confirm +
        skippedNote,
    );
  });
}
