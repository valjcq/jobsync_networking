import { describe, it, expect, vi, beforeEach } from "vitest";
import { convertResumeForMatch } from "@/lib/scraper/automation-run/resumeText";
import { readResumeFileText } from "@/lib/resumes/resumeFileText";
import type { ResumeWithSections } from "@/lib/scraper/automation-run/types";

vi.mock("@/lib/resumes/resumeFileText", () => ({ readResumeFileText: vi.fn() }));
const mockRead = readResumeFileText as unknown as ReturnType<typeof vi.fn>;

const base = {
  id: "r1",
  profileId: "p1",
  title: "Data CV",
  createdAt: new Date(),
  updatedAt: new Date(),
  FileId: "f1",
  reviewData: null,
  ContactInfo: null,
} as unknown as ResumeWithSections;

const FILE_TEXT = "Jane Doe, Data Engineer. ".repeat(20);

beforeEach(() => mockRead.mockReset());

describe("convertResumeForMatch — file fallback", () => {
  it("uses the attached file's text for a resume with no sections", async () => {
    mockRead.mockResolvedValue({ success: true, text: FILE_TEXT, truncated: false });

    const text = await convertResumeForMatch({
      ...base,
      ResumeSections: [],
      File: { filePath: "/u/files/resumes/cv.pdf" },
    });

    expect(mockRead).toHaveBeenCalledWith("/u/files/resumes/cv.pdf");
    expect(text).toBe(`# Data CV\n\n${FILE_TEXT}`);
  });

  it("keeps the section text when the file can't be read", async () => {
    mockRead.mockResolvedValue({ success: false, error: { code: "NO_TEXT", message: "x" } });

    const text = await convertResumeForMatch({
      ...base,
      ResumeSections: [],
      File: { filePath: "/u/files/resumes/scan.pdf" },
    });

    expect(text).toBe("# Data CV");
  });

  it("does not read the file when the sections carry enough text", async () => {
    const text = await convertResumeForMatch({
      ...base,
      File: { filePath: "/u/files/resumes/cv.pdf" },
      ResumeSections: [
        {
          sectionType: "summary",
          summary: { content: "Built data platforms. ".repeat(20) },
          workExperiences: [],
          educations: [],
          licenseOrCertifications: [],
          skills: [],
        },
      ],
    } as unknown as ResumeWithSections);

    expect(mockRead).not.toHaveBeenCalled();
    expect(text).toContain("## SUMMARY");
  });
});
