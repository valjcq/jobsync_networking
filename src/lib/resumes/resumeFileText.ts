import "server-only";
import fs from "fs/promises";
import path from "path";
import { extractText, type ExtractionError } from "@/lib/ai/import/extract-text";
import { isResumeFilePath } from "@/lib/resumeFiles";

// Plain text of a resume's attached PDF/DOCX. The fallback for a resume with
// no parsed sections: since the AI structuring was removed, an uploaded resume
// is file-only, and matching/review would otherwise have nothing to read.

export type ResumeFileTextError =
  | { code: "FILE_NOT_FOUND"; message: string }
  | ExtractionError;

export type ResumeFileTextResult =
  | { success: true; text: string; truncated: boolean }
  | { success: false; error: ResumeFileTextError };

// Keyed by path + mtime + size, so a re-upload is never served stale text.
// Small on purpose: one user, a handful of resumes, and add_jobs_batch reading
// the same default resume N times is the case this exists for.
const MAX_ENTRIES = 16;
const cache = new Map<string, ResumeFileTextResult>();

const notFound: ResumeFileTextResult = {
  success: false,
  error: {
    code: "FILE_NOT_FOUND",
    message: "The resume's attached file could not be found.",
  },
};

export async function readResumeFileText(
  filePath: string,
): Promise<ResumeFileTextResult> {
  // The stored path comes from the resume row; still confine it, like the
  // download route does, so a tampered row cannot read outside the uploads.
  if (!isResumeFilePath(filePath)) return notFound;
  const fullPath = path.resolve(filePath);

  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return notFound;
  }

  const key = `${fullPath}:${stat.mtimeMs}:${stat.size}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const extracted = await extractText(await fs.readFile(fullPath));
  if (!extracted.success) return extracted; // not cached: a timeout may pass next time

  const result: ResumeFileTextResult = {
    success: true,
    text: extracted.data.text,
    truncated: extracted.data.truncated,
  };
  if (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value!);
  }
  cache.set(key, result);
  return result;
}

// Test hook only.
export function clearResumeFileTextCache(): void {
  cache.clear();
}
