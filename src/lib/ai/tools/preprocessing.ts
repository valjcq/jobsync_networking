/**
 * Resume Preprocessing Module
 * Normalizes text, detects sections, extracts metadata, and validates resume content
 * Uses shared text processing utilities from text-processing.ts
 */

import {
  ContactInfo,
  Education,
  LicenseOrCertification,
  Resume,
  ResumeSection,
  SectionType,
  WorkExperience,
} from "@/models/profile.model";
import {
  removeHtmlTags,
  normalizeWhitespace,
  normalizeBullets,
  normalizeHeadings,
  extractMetadata,
  validateText,
  type TextMetadata,
} from "./text-processing";
import { readResumeFileText } from "@/lib/resumes/resumeFileText";

// TYPES

export type ResumeMetadata = TextMetadata;

// Where the text came from: the resume's sections, or its attached file.
export type ResumeTextSource = "sections" | "file";

export interface PreprocessedResume {
  normalizedText: string;
  metadata: ResumeMetadata;
  isValid: boolean;
  source?: ResumeTextSource;
}

export type PreprocessingResult =
  | { success: true; data: PreprocessedResume }
  | {
      success: false;
      error: { code: string; message: string; details?: object };
    };

// VALIDATION THRESHOLDS

export const MIN_CHAR_COUNT = 200;
const MAX_WORD_COUNT = 10000;

// Re-export shared utilities for backward compatibility
export {
  removeHtmlTags,
  normalizeWhitespace,
  normalizeBullets,
  normalizeHeadings,
  extractMetadata,
};

// VALIDATION - Resume-specific validation logic

export const validateResume = (
  text: string,
  metadata: ResumeMetadata,
): {
  isValid: boolean;
  error?: { code: string; message: string; details?: object };
} => {
  // Use shared generic validation first
  const genericValidation = validateText(
    text,
    MIN_CHAR_COUNT,
    MAX_WORD_COUNT * 5,
    "Resume",
  );
  if (!genericValidation.isValid) {
    return genericValidation;
  }

  // Resume-specific check: max word count
  if (metadata.wordCount > MAX_WORD_COUNT) {
    return {
      isValid: false,
      error: {
        code: "CORRUPTED",
        message: `Resume appears to be corrupted or contains excessive content. Found ${metadata.wordCount} words, maximum allowed: ${MAX_WORD_COUNT}.`,
        details: {
          wordCount: metadata.wordCount,
          maxWordCount: MAX_WORD_COUNT,
        },
      },
    };
  }

  return { isValid: true };
};

// RESUME TO TEXT CONVERSION (moved from ai.utils.ts)

export const convertResumeToText = (resume: Resume): Promise<string> => {
  return new Promise((resolve) => {
    const formatContactInfo = (contactInfo?: ContactInfo) => {
      if (!contactInfo) return "";
      const parts = [
        `Name: ${contactInfo.firstName} ${contactInfo.lastName}`,
        contactInfo.headline ? `Headline: ${contactInfo.headline}` : "",
        contactInfo.email ? `Email: ${contactInfo.email}` : "",
        contactInfo.phone ? `Phone: ${contactInfo.phone}` : "",
        contactInfo.address ? `Address: ${contactInfo.address}` : "",
        contactInfo.url1 ? `Link: ${contactInfo.url1}` : "",
        contactInfo.url2 ? `Link: ${contactInfo.url2}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    };

    const formatDate = (date: Date) => {
      const d = new Date(date);
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    };

    const formatWorkExperiences = (workExperiences?: WorkExperience[]) => {
      if (!workExperiences || workExperiences.length === 0) return "";
      return workExperiences
        .map((experience) => {
          const desc = removeHtmlTags(experience.description);
          const startDate = formatDate(experience.startDate);
          const endDate =
            experience.currentJob || !experience.endDate
              ? "Present"
              : formatDate(experience.endDate);
          const parts = [
            `Company: ${experience.Company.label}`,
            `Job Title: ${experience.jobTitle.label}`,
            `Location: ${experience.location.label}`,
            `Dates: ${startDate} - ${endDate}`,
            desc ? `Description: ${desc}` : "",
          ].filter(Boolean);
          return parts.join("\n");
        })
        .join("\n\n");
    };

    const formatEducation = (educations?: Education[]) => {
      if (!educations || educations.length === 0) return "";
      return educations
        .map((education) => {
          const desc = removeHtmlTags(education.description);
          const startDate = formatDate(education.startDate);
          const endDate = education.endDate
            ? formatDate(education.endDate)
            : "Present";
          const parts = [
            `Institution: ${education.institution}`,
            `Degree: ${education.degree}`,
            `Field of Study: ${education.fieldOfStudy}`,
            `Location: ${education.location.label}`,
            `Dates: ${startDate} - ${endDate}`,
            desc ? `Description: ${desc}` : "",
          ].filter(Boolean);
          return parts.join("\n");
        })
        .join("\n\n");
    };

    const formatCertifications = (certs?: LicenseOrCertification[]) => {
      if (!certs || certs.length === 0) return "";
      return certs
        .map((cert) => {
          const issueDate = cert.issueDate ? formatDate(cert.issueDate) : null;
          const expirationDate = cert.expirationDate
            ? formatDate(cert.expirationDate)
            : "No Expiration";
          const parts = [
            `Title: ${cert.title}`,
            `Organization: ${cert.organization}`,
            issueDate ? `Issue Date: ${issueDate}` : "",
            issueDate ? `Expiration Date: ${expirationDate}` : "",
            cert.credentialUrl ? `Credential URL: ${cert.credentialUrl}` : "",
          ].filter(Boolean);
          return parts.join("\n");
        })
        .join("\n\n");
    };

    const SECTION_ORDER: Record<string, number> = {
      [SectionType.SUMMARY]: 0,
      [SectionType.SKILLS]: 1,
      [SectionType.EXPERIENCE]: 2,
      [SectionType.EDUCATION]: 3,
      [SectionType.CERTIFICATION]: 4,
      [SectionType.LICENSE]: 5,
    };

    const formatResumeSections = (sections?: ResumeSection[]) => {
      if (!sections || sections.length === 0) return "";
      const sorted = [...sections].sort(
        (a, b) =>
          (SECTION_ORDER[a.sectionType] ?? 99) -
          (SECTION_ORDER[b.sectionType] ?? 99),
      );
      return sorted
        .map((section) => {
          switch (section.sectionType) {
            case SectionType.SUMMARY: {
              const content = removeHtmlTags(section.summary?.content);
              return content ? `## SUMMARY\n${content}` : "";
            }
            case SectionType.EXPERIENCE: {
              const content = formatWorkExperiences(section.workExperiences);
              return content ? `## EXPERIENCE\n${content}` : "";
            }
            case SectionType.EDUCATION: {
              const content = formatEducation(section.educations);
              return content ? `## EDUCATION\n${content}` : "";
            }
            case SectionType.CERTIFICATION:
            case SectionType.LICENSE: {
              const content = formatCertifications(
                section.licenseOrCertifications,
              );
              return content
                ? `## ${section.sectionTitle.toUpperCase()}\n${content}`
                : "";
            }
            case SectionType.SKILLS: {
              const skills = section.skills;
              if (!skills || skills.length === 0) return "";
              const sorted = [...skills].sort((a, b) => a.order - b.order);
              const grouped = new Map<string, typeof sorted>();
              for (const s of sorted) {
                const key = s.category ?? "";
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(s);
              }
              const lines = Array.from(grouped.entries()).map(([cat, items]) => {
                const labels = items.map((s) => s.Tag?.label).filter(Boolean).join(", ");
                return cat ? `${cat}: ${labels}` : labels;
              });
              return `## ${section.sectionTitle.toUpperCase()}\n${lines.join("\n")}`;
            }
            default:
              return "";
          }
        })
        .filter(Boolean)
        .join("\n\n");
    };

    const contactInfo = formatContactInfo(resume.ContactInfo);
    const sections = formatResumeSections(resume.ResumeSections);

    const parts = [
      contactInfo ? `## CONTACT\n${contactInfo}` : "",
      sections,
    ].filter(Boolean);

    return resolve(parts.join("\n\n"));
  });
};

// MAIN ORCHESTRATOR

// preprocessText accepts already-extracted raw text (used by the import flow)
export const preprocessText = async (
  rawText: string,
): Promise<PreprocessingResult> => {
  try {
    if (!rawText || rawText.trim().length < MIN_CHAR_COUNT) {
      const charCount = rawText?.trim().length || 0;
      return {
        success: false,
        error: {
          code: charCount === 0 ? "NO_CONTENT" : "TOO_SHORT",
          message:
            charCount === 0
              ? "Resume appears to be empty"
              : `Resume is too short (${charCount} characters, minimum ${MIN_CHAR_COUNT} required)`,
          details: { characterCount: charCount },
        },
      };
    }

    let normalizedText = rawText;
    normalizedText = normalizeWhitespace(normalizedText);
    normalizedText = normalizeBullets(normalizedText);
    normalizedText = normalizeHeadings(normalizedText);

    const metadata = extractMetadata(normalizedText);

    const validationResult = validateResume(normalizedText, metadata);
    if (!validationResult.isValid) {
      return { success: false, error: validationResult.error! };
    }

    return { success: true, data: { normalizedText, metadata, isValid: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: {
        code: "PREPROCESSING_ERROR",
        message: `Failed to preprocess resume: ${message}`,
      },
    };
  }
};

// Sections first; when they are too thin and a file is attached, the file's
// text instead. Uploaded resumes have no sections since the AI structuring was
// removed, so without the fallback every file-only resume fails here.
export const preprocessResume = async (
  resume: Resume,
): Promise<PreprocessingResult> => {
  const sectionText = await convertResumeToText(resume);
  const filePath = resume.File?.filePath;
  if (sectionText.trim().length >= MIN_CHAR_COUNT || !filePath) {
    return withSource(await preprocessText(sectionText), "sections");
  }

  const fromFile = await readResumeFileText(filePath);
  if (!fromFile.success) {
    return { success: false, error: fromFile.error };
  }
  return withSource(await preprocessText(fromFile.text), "file");
};

function withSource(
  result: PreprocessingResult,
  source: ResumeTextSource,
): PreprocessingResult {
  return result.success ? { success: true, data: { ...result.data, source } } : result;
}

// One wording for every surface that has to say why a resume can't be used.
export function describeResumeFailure(code: string | undefined): string {
  switch (code) {
    case "NO_TEXT":
      return "Its attached file has no readable text — it may be a scanned or image-only PDF (OCR isn't supported). Upload a text-based PDF or DOCX in Profile → Resumes.";
    case "ENCRYPTED":
      return "Its attached file is password-protected. Upload an unprotected copy in Profile → Resumes.";
    case "UNSUPPORTED_FORMAT":
      return "Its attached file isn't a PDF or DOCX. Upload one in Profile → Resumes.";
    case "FILE_NOT_FOUND":
      return "Its attached file is missing on the server. Re-upload it in Profile → Resumes.";
    case "EXTRACTION_FAILED":
    case "DECOMPRESSION_BOMB":
      return "Its attached file couldn't be read. Try re-uploading it in Profile → Resumes.";
    default:
      return "It has too little content (no attached file and few or no sections). Upload a file or add sections in Profile → Resumes.";
  }
}
