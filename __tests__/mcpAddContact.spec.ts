import { handleAddContact } from "@/lib/mcp/tools/addContact";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { resolveCompany, resolveLocation, resolveContactRole } from "@/lib/jobs/resolve";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    contact: { findMany: vi.fn(), create: vi.fn() },
    company: { count: vi.fn() },
    location: { count: vi.fn() },
    contactRole: { count: vi.fn() },
  },
}));

vi.mock("@/lib/jobs/resolve", () => ({
  resolveCompany: vi.fn(),
  resolveLocation: vi.fn(),
  resolveContactRole: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;

const existing = (over: Record<string, unknown> = {}) => ({
  id: "c-old",
  name: "Sam Lee",
  email: null,
  linkedinUrl: null,
  lastContactedAt: null,
  Company: { label: "Acme" },
  ...over,
});

describe("handleAddContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkMcpRateLimit as any).mockReturnValue({ allowed: true, resetIn: 0 });
    db.contact.findMany.mockResolvedValue([]);
    db.contact.create.mockImplementation(async ({ data }: any) => ({ id: "c-new", ...data }));
    db.company.count.mockResolvedValue(1);
    db.location.count.mockResolvedValue(1);
    db.contactRole.count.mockResolvedValue(1);
    (resolveCompany as any).mockResolvedValue({ id: "co1", label: "Acme", created: false });
    (resolveLocation as any).mockResolvedValue({ id: "lo1", label: "Calgary", created: true });
    (resolveContactRole as any).mockResolvedValue({ id: "ro1", label: "Recruiter", created: false });
  });

  it("returns a rate-limit message and writes nothing", async () => {
    (checkMcpRateLimit as any).mockReturnValue({ allowed: false, resetIn: 3000 });
    const res = await handleAddContact({ name: "Sam Lee" }, "user-1");
    expect(res.content[0].text).toBe("Rate limit exceeded. Try again in 3s.");
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("creates a contact owned by the token's user", async () => {
    const res = await handleAddContact({ name: "  Sam Lee " }, "user-1");
    const data = db.contact.create.mock.calls[0][0].data;
    expect(data.createdBy).toBe("user-1");
    expect(data.name).toBe("Sam Lee");
    expect(data.email).toBeNull();
    expect(res.content[0].text).toContain('Added contact "Sam Lee" (id: c-new)');
  });

  it("resolves company, location and role by name and reports matched vs created", async () => {
    const res = await handleAddContact(
      { name: "Sam Lee", company: "Acme", location: "Calgary", role: "Recruiter" },
      "user-1",
    );
    expect(resolveCompany).toHaveBeenCalledWith("Acme", "user-1");
    const data = db.contact.create.mock.calls[0][0].data;
    expect([data.companyId, data.locationId, data.roleId]).toEqual(["co1", "lo1", "ro1"]);
    const text = res.content[0].text;
    expect(text).toContain('company: "Acme" (matched existing)');
    expect(text).toContain('location: "Calgary" (created)');
  });

  it("re-checks ownership of the resolved references", async () => {
    db.company.count.mockResolvedValue(0);
    const res = await handleAddContact({ name: "Sam Lee", company: "Acme" }, "user-1");
    expect(res.content[0].text).toBe("Error: Company not found");
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  describe("duplicate protection", () => {
    it("refuses a same-name contact, folding case, spacing and diacritics, and returns it", async () => {
      db.contact.findMany.mockResolvedValue([existing({ name: "José Lee" })]);
      const res = await handleAddContact({ name: " jose   LEE" }, "user-1");
      const text = res.content[0].text;
      expect(text).toContain("No contact created");
      expect(text).toContain("José Lee (id: c-old, Acme, last contacted: never) — same name");
      expect(text).toContain("allowDuplicate: true");
      expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("refuses a matching email under a different name", async () => {
      db.contact.findMany.mockResolvedValue([existing({ name: "Samuel L.", email: "sam@x.com" })]);
      const res = await handleAddContact({ name: "Sam Lee", email: "SAM@x.com" }, "user-1");
      expect(res.content[0].text).toContain("same email");
      expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("refuses a matching LinkedIn URL despite scheme, www and trailing slash", async () => {
      db.contact.findMany.mockResolvedValue([
        existing({ name: "Somebody", linkedinUrl: "https://linkedin.com/in/sam-lee" }),
      ]);
      const res = await handleAddContact(
        { name: "Sam Lee", linkedinUrl: "http://www.linkedin.com/in/sam-lee/" },
        "user-1",
      );
      expect(res.content[0].text).toContain("same LinkedIn URL");
      expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("creates nothing else when refusing: no company is resolved", async () => {
      db.contact.findMany.mockResolvedValue([existing()]);
      await handleAddContact({ name: "Sam Lee", company: "Newco" }, "user-1");
      expect(resolveCompany).not.toHaveBeenCalled();
    });

    it("only compares against the token user's contacts", async () => {
      await handleAddContact({ name: "Sam Lee" }, "user-1");
      expect(db.contact.findMany.mock.calls[0][0].where).toEqual({ createdBy: "user-1" });
    });

    it("creates anyway with allowDuplicate", async () => {
      db.contact.findMany.mockResolvedValue([existing()]);
      const res = await handleAddContact({ name: "Sam Lee", allowDuplicate: true }, "user-1");
      expect(db.contact.create).toHaveBeenCalledTimes(1);
      expect(res.content[0].text).toContain("Added contact");
    });
  });

  describe("validation", () => {
    it("rejects an invalid email with the form's message", async () => {
      const res = await handleAddContact({ name: "Sam", email: "not-an-email" }, "user-1");
      expect(res.content[0].text).toContain("Validation error: Please enter a valid email address.");
      expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("rejects a LinkedIn URL that is not http(s)", async () => {
      const res = await handleAddContact({ name: "Sam", linkedinUrl: "linkedin.com/in/sam" }, "user-1");
      expect(res.content[0].text).toContain("Validation error");
    });

    it("rejects an empty name", async () => {
      const res = await handleAddContact({ name: "" }, "user-1");
      expect(res.content[0].text).toContain("Contact name cannot be empty.");
    });

    it("rejects a malformed lastContactedAt with a clear message", async () => {
      const res = await handleAddContact({ name: "Sam", lastContactedAt: "yesterday" }, "user-1");
      expect(res.content[0].text).toContain("lastContactedAt must be a calendar date in YYYY-MM-DD format");
      expect(db.contact.create).not.toHaveBeenCalled();
    });

    it("rejects a future lastContactedAt, as the form does", async () => {
      const res = await handleAddContact({ name: "Sam", lastContactedAt: "2099-01-01" }, "user-1");
      expect(res.content[0].text).toContain("Last contacted date cannot be in the future.");
    });

    it("stores lastContactedAt at local midnight", async () => {
      await handleAddContact({ name: "Sam", lastContactedAt: "2026-09-10" }, "user-1");
      const data = db.contact.create.mock.calls[0][0].data;
      expect(data.lastContactedAt.getTime()).toBe(new Date(2026, 8, 10).getTime());
    });
  });
});
