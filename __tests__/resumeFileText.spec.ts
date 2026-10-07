import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  readResumeFileText,
  clearResumeFileTextCache,
} from "@/lib/resumes/resumeFileText";
import { extractText } from "@/lib/ai/import/extract-text";

vi.mock("@/lib/ai/import/extract-text", () => ({ extractText: vi.fn() }));
const mockExtract = extractText as unknown as ReturnType<typeof vi.fn>;

const originalUploads = APP_CONSTANTS.UPLOADS_DIR;
let tmp: string;
let resumes: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "resume-text-"));
  (APP_CONSTANTS as { UPLOADS_DIR: string }).UPLOADS_DIR = tmp;
  resumes = path.join(tmp, "files", "resumes");
  await fs.mkdir(resumes, { recursive: true });
  clearResumeFileTextCache();
  mockExtract.mockReset();
});

afterEach(async () => {
  (APP_CONSTANTS as { UPLOADS_DIR: string }).UPLOADS_DIR = originalUploads;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("readResumeFileText", () => {
  it("refuses a path outside the resumes directory without reading it", async () => {
    const outside = path.join(tmp, "secret.pdf");
    await fs.writeFile(outside, "%PDF-1.4");

    const result = await readResumeFileText(outside);

    expect(result).toMatchObject({ success: false, error: { code: "FILE_NOT_FOUND" } });
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("reports a missing file", async () => {
    const result = await readResumeFileText(path.join(resumes, "gone.pdf"));
    expect(result).toMatchObject({ success: false, error: { code: "FILE_NOT_FOUND" } });
  });

  it("returns the extracted text and reuses it for the same file", async () => {
    const file = path.join(resumes, "cv.pdf");
    await fs.writeFile(file, "%PDF-1.4 a");
    mockExtract.mockResolvedValue({
      success: true,
      data: { text: "Jane Doe — Data Engineer", truncated: false },
    });

    const first = await readResumeFileText(file);
    const second = await readResumeFileText(file);

    expect(first).toEqual({ success: true, text: "Jane Doe — Data Engineer", truncated: false });
    expect(second).toEqual(first);
    expect(mockExtract).toHaveBeenCalledTimes(1);
  });

  it("re-reads a file that changed on disk", async () => {
    const file = path.join(resumes, "cv.pdf");
    await fs.writeFile(file, "%PDF-1.4 a");
    mockExtract.mockResolvedValue({ success: true, data: { text: "v1", truncated: false } });
    await readResumeFileText(file);

    await fs.writeFile(file, "%PDF-1.4 a longer body");
    mockExtract.mockResolvedValue({ success: true, data: { text: "v2", truncated: false } });

    expect(await readResumeFileText(file)).toMatchObject({ success: true, text: "v2" });
    expect(mockExtract).toHaveBeenCalledTimes(2);
  });

  it("passes extraction errors through and does not cache them", async () => {
    const file = path.join(resumes, "scan.pdf");
    await fs.writeFile(file, "%PDF-1.4 scan");
    mockExtract.mockResolvedValue({
      success: false,
      error: { code: "NO_TEXT", message: "no text" },
    });

    expect(await readResumeFileText(file)).toMatchObject({
      success: false,
      error: { code: "NO_TEXT" },
    });
    await readResumeFileText(file);
    expect(mockExtract).toHaveBeenCalledTimes(2);
  });
});
