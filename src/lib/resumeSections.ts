import { APP_CONSTANTS } from "@/lib/constants";

export const hasMinResumeSections = (
  sectionCount: number | null | undefined,
): boolean =>
  (sectionCount ?? 0) >= APP_CONSTANTS.MIN_RESUME_SECTIONS_FOR_SELECTION;

// Usable for matching, review and as the default: an attached file is enough
// now that its text is read when sections are missing (preprocessResume).
export const isResumeUsable = (
  sectionCount: number | null | undefined,
  hasFile: boolean,
): boolean => hasFile || hasMinResumeSections(sectionCount);

export const UNUSABLE_RESUME_HINT = "or attach a file";

// The resume pickers that feed matching (automations) list only usable ones.
export const toSelectableResumes = (
  rows: Array<{
    id: string;
    title: string;
    FileId?: string | null;
    _count?: { ResumeSections?: number };
  }>,
): Array<{ id: string; title: string }> =>
  rows
    .filter((r) => isResumeUsable(r._count?.ResumeSections, !!r.FileId))
    .map((r) => ({ id: r.id, title: r.title }));

export const buildInsufficientSectionsMessage = (
  action: string,
  hint?: string,
): string => {
  const min = APP_CONSTANTS.MIN_RESUME_SECTIONS_FOR_SELECTION;
  return `Add at least ${min} sections${
    hint ? ` (${hint})` : ""
  } before ${action}.`;
};
