import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  preprocessResume,
  describeResumeFailure,
} from "@/lib/ai/tools/preprocessing";
import { readResumeFileText } from "@/lib/resumes/resumeFileText";
import { Resume, SectionType } from "@/models/profile.model";

vi.mock("@/lib/resumes/resumeFileText", () => ({ readResumeFileText: vi.fn() }));
const mockRead = readResumeFileText as unknown as ReturnType<typeof vi.fn>;

const FILE_TEXT =
  "Jane Doe\nData Engineer\n\nEXPERIENCE\nAcme Corp, 2020-2024: built batch and " +
  "streaming pipelines in Python and Spark, owned the warehouse models, mentored " +
  "two engineers and cut the nightly load time by half.\n\nSKILLS\nPython, SQL, Spark, dbt";

const file = {
  fileName: "cv.pdf",
  filePath: "/uploads/files/resumes/cv.pdf",
  fileType: "application/pdf",
};

const fileOnly: Resume = { id: "r1", title: "CV", ResumeSections: [], File: file };

const withSummary = (content: string): Resume => ({
  id: "r2",
  title: "Structured",
  File: file,
  ResumeSections: [
    {
      id: "s1",
      resumeId: "r2",
      sectionTitle: "Summary",
      sectionType: SectionType.SUMMARY,
      summary: { id: "sum1", content },
    } as any,
  ],
});

beforeEach(() => mockRead.mockReset());

describe("preprocessResume — file fallback", () => {
  it("uses the attached file when the resume has no sections", async () => {
    mockRead.mockResolvedValue({ success: true, text: FILE_TEXT, truncated: false });

    const result = await preprocessResume(fileOnly);

    expect(mockRead).toHaveBeenCalledWith(file.filePath);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe("file");
      expect(result.data.normalizedText).toContain("Data Engineer");
    }
  });

  it("keeps using sections when they carry enough text, without reading the file", async () => {
    const result = await preprocessResume(withSummary("x ".repeat(150) + FILE_TEXT));

    expect(mockRead).not.toHaveBeenCalled();
    expect(result.success && result.data.source).toBe("sections");
  });

  it("falls back to the file when sections are too thin", async () => {
    mockRead.mockResolvedValue({ success: true, text: FILE_TEXT, truncated: false });

    const result = await preprocessResume(withSummary("Short."));

    expect(mockRead).toHaveBeenCalled();
    expect(result.success && result.data.source).toBe("file");
  });

  it("fails as before when there is neither content nor a file", async () => {
    const result = await preprocessResume({ id: "r3", title: "Empty", ResumeSections: [] });

    expect(mockRead).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, error: { code: "NO_CONTENT" } });
  });

  it("surfaces the file's error code", async () => {
    mockRead.mockResolvedValue({
      success: false,
      error: { code: "NO_TEXT", message: "no text" },
    });

    const result = await preprocessResume(fileOnly);

    expect(result).toMatchObject({ success: false, error: { code: "NO_TEXT" } });
  });
});

describe("describeResumeFailure", () => {
  it("names scanned PDFs", () => {
    expect(describeResumeFailure("NO_TEXT")).toMatch(/scanned/);
  });

  it("names a missing file", () => {
    expect(describeResumeFailure("FILE_NOT_FOUND")).toMatch(/missing/);
  });

  it("falls back to the too-little-content wording", () => {
    expect(describeResumeFailure("TOO_SHORT")).toMatch(/too little content/);
    expect(describeResumeFailure(undefined)).toMatch(/too little content/);
  });
});
