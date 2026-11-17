import { handleGetProfile, handleUpdateProfile } from "@/lib/mcp/tools/profileTools";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => {
  const db: any = {
    user: { findUnique: vi.fn() },
    resume: { findFirst: vi.fn() },
    profile: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    contactInfo: { update: vi.fn() },
    summary: { update: vi.fn() },
    resumeSection: { create: vi.fn() },
  };
  db.$transaction = vi.fn((cb: any) => cb(db));
  return { default: db };
});
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const out = (r: any) => r.content[0].text as string;

const resume = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  title: "Main CV",
  ContactInfo: {
    id: "ci1",
    firstName: "Ada",
    lastName: "Lovelace",
    headline: "Engineer",
    url1: "https://ada.example",
    url1Label: "Website",
    url2: null,
    url2Label: null,
  },
  ResumeSections: [{ id: "s1", summary: { id: "sum1", content: "I build engines." } }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ defaultResumeId: "r1" });
  db.resume.findFirst.mockResolvedValue(resume());
  db.profile.findFirst.mockResolvedValue({
    id: "p1",
    targetRoles: JSON.stringify(["Data Engineer"]),
    targetLocations: JSON.stringify(["Calgary", "Remote"]),
  });
});

describe("get_profile", () => {
  it("reads the default resume's details and the stored targets, owner-scoped", async () => {
    const res = await handleGetProfile("user-1");
    expect(db.resume.findFirst.mock.calls[0][0].where).toEqual({ id: "r1", profile: { userId: "user-1" } });
    expect(out(res)).toBe(
      [
        'Profile (from default resume "Main CV")',
        "Name: Ada Lovelace",
        "Headline: Engineer",
        "Summary: I build engines.",
        "Target roles: Data Engineer",
        "Target locations: Calgary; Remote",
        "Links: Website: https://ada.example",
      ].join("\n"),
    );
  });

  it("degrades clearly with no default resume and no stored profile", async () => {
    db.user.findUnique.mockResolvedValue({ defaultResumeId: null });
    db.profile.findFirst.mockResolvedValue(null);
    const res = await handleGetProfile("user-1");
    expect(out(res)).toContain("no default resume is set");
    expect(out(res)).toContain("Target roles: not set");
  });

  it("tolerates corrupt stored lists", async () => {
    db.profile.findFirst.mockResolvedValue({ targetRoles: "{oops", targetLocations: null });
    expect(out(await handleGetProfile("user-1"))).toContain("Target roles: not set");
  });
});

describe("update_profile", () => {
  it("edits contact info, summary and links on the default resume, only the supplied fields", async () => {
    const res = await handleUpdateProfile(
      {
        headline: "Staff engineer",
        summary: "New summary",
        links: [{ label: "Website", url: "https://ada.dev" }, { url: "https://github.com/ada" }],
      },
      "user-1",
    );
    expect(db.contactInfo.update).toHaveBeenCalledWith({
      where: { id: "ci1" },
      data: {
        headline: "Staff engineer",
        url1: "https://ada.dev",
        url1Label: "Website",
        url2: "https://github.com/ada",
        url2Label: null,
      },
    });
    expect(db.summary.update).toHaveBeenCalledWith({ where: { id: "sum1" }, data: { content: "New summary" } });
    expect(out(res)).toBe("Updated profile: headline, summary, links.");
  });

  it("clears links with [] and creates a summary section when none exists", async () => {
    db.resume.findFirst.mockResolvedValue(resume({ ResumeSections: [] }));
    await handleUpdateProfile({ links: [], summary: "Fresh" }, "user-1");
    expect(db.contactInfo.update.mock.calls[0][0].data).toEqual({
      url1: null,
      url1Label: null,
      url2: null,
      url2Label: null,
    });
    expect(db.resumeSection.create.mock.calls[0][0].data).toMatchObject({
      Resume: { connect: { id: "r1" } },
      sectionType: "summary",
      summary: { create: { content: "Fresh" } },
    });
  });

  it("stores target roles and locations de-duplicated on the existing profile", async () => {
    const res = await handleUpdateProfile(
      { targetRoles: ["Data Engineer", " data engineer ", "ML Engineer"], targetLocations: [] },
      "user-1",
    );
    expect(db.profile.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        targetRoles: JSON.stringify(["Data Engineer", "ML Engineer"]),
        targetLocations: "[]",
      },
    });
    expect(db.contactInfo.update).not.toHaveBeenCalled();
    expect(out(res)).toBe("Updated profile: targetRoles, targetLocations.");
  });

  it("creates the profile row when the user has none, even without a default resume", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue({ defaultResumeId: null });
    await handleUpdateProfile({ targetRoles: ["PM"] }, "user-1");
    expect(db.profile.create).toHaveBeenCalledWith({
      data: { userId: "user-1", targetRoles: JSON.stringify(["PM"]) },
    });
  });

  it("errors clearly when a resume field is edited but there is no default resume or contact info", async () => {
    db.user.findUnique.mockResolvedValue({ defaultResumeId: null });
    expect(out(await handleUpdateProfile({ headline: "x" }, "user-1"))).toContain("No default resume is set");
    db.user.findUnique.mockResolvedValue({ defaultResumeId: "r1" });
    db.resume.findFirst.mockResolvedValue(resume({ ContactInfo: null }));
    expect(out(await handleUpdateProfile({ firstName: "Ada" }, "user-1"))).toContain("has no contact info yet");
    expect(db.contactInfo.update).not.toHaveBeenCalled();
  });

  it("rejects an empty call and a non-http link", async () => {
    expect(out(await handleUpdateProfile({}, "user-1"))).toBe(
      "Validation error: supply at least one field to change",
    );
    const res = await handleUpdateProfile({ links: [{ url: "javascript:alert(1)" }] }, "user-1");
    expect(out(res)).toContain("must be a full URL starting with https://");
    expect(db.contactInfo.update).not.toHaveBeenCalled();
  });
});
