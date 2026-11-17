import {
  handleAddContactNote,
  handleDeleteContact,
  handleLinkContactToJob,
  handleMergeContacts,
  handleUpdateContact,
} from "@/lib/mcp/tools/contactEdit";
import { resolveCompany, resolveContactRole } from "@/lib/jobs/resolve";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => {
  const db: any = {
    contact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    job: { findFirst: vi.fn() },
    jobContact: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    interaction: { updateMany: vi.fn() },
    task: { updateMany: vi.fn() },
    company: { count: vi.fn() },
    location: { count: vi.fn() },
    contactRole: { count: vi.fn() },
  };
  db.$transaction = vi.fn((cb: any) => cb(db));
  return { default: db };
});
vi.mock("@/lib/jobs/resolve", () => ({
  resolveCompany: vi.fn(),
  resolveLocation: vi.fn(),
  resolveContactRole: vi.fn(),
}));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const out = (r: any) => r.content[0].text as string;

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Sam Lee",
  title: "Engineer",
  email: "sam@acme.test",
  phone: null,
  linkedinUrl: null,
  companyId: "co1",
  locationId: null,
  relationship: null,
  workedAtCompanyId: null,
  workedFrom: null,
  workedTo: null,
  roleId: null,
  notes: null,
  lastContactedAt: null,
  status: null,
  ...over,
});
const indexRow = (over: Record<string, unknown> = {}) => ({
  id: "c-other",
  name: "Samantha Other",
  email: null,
  linkedinUrl: null,
  lastContactedAt: null,
  Company: { label: "Acme" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (checkMcpRateLimit as any).mockReturnValue({ allowed: true, resetIn: 0 });
  db.contact.findMany.mockResolvedValue([]);
  db.contact.updateMany.mockResolvedValue({ count: 1 });
  db.company.count.mockResolvedValue(1);
  db.location.count.mockResolvedValue(1);
  db.contactRole.count.mockResolvedValue(1);
});

describe("update_contact", () => {
  it("changes only the supplied fields, scoped to the token's user", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    const res = await handleUpdateContact({ contactId: "c1", title: "Staff Engineer", status: "sent" }, "user-1");
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: "c1", createdBy: "user-1" });
    const call = db.contact.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1", createdBy: "user-1" });
    expect(call.data).toMatchObject({
      name: "Sam Lee",
      title: "Staff Engineer",
      email: "sam@acme.test",
      companyId: "co1",
      status: "sent",
    });
    expect(out(res)).toBe('Updated contact "Sam Lee" (id: c1): title, status.');
  });

  it("clears a field with null and resolves a new company by name", async () => {
    db.contact.findFirst.mockResolvedValue(row({ email: "old@x.test" }));
    (resolveCompany as any).mockResolvedValue({ id: "co2", label: "Globex", created: true });
    const res = await handleUpdateContact({ contactId: "c1", email: null, company: "Globex" }, "user-1");
    const data = db.contact.updateMany.mock.calls[0][0].data;
    expect(data.email).toBeNull();
    expect(data.companyId).toBe("co2");
    expect(out(res)).toContain('company: "Globex" (created).');
  });

  it("returns not found for an unknown or foreign contact and writes nothing", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await handleUpdateContact({ contactId: "nope", title: "x" }, "user-1");
    expect(out(res)).toBe("Error: Contact not found (id: nope)");
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an update with nothing to change", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    const res = await handleUpdateContact({ contactId: "c1" }, "user-1");
    expect(out(res)).toBe("Validation error: supply at least one field to change");
  });

  it("validates with the form's rules and does not write", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    const res = await handleUpdateContact({ contactId: "c1", email: "not-an-email" }, "user-1");
    expect(out(res)).toBe("Validation error: Please enter a valid email address.");
    const future = await handleUpdateContact({ contactId: "c1", lastContactedAt: "2999-01-01" }, "user-1");
    expect(out(future)).toContain("cannot be in the future");
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown status", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    const res = await handleUpdateContact({ contactId: "c1", status: "ghosted" as any }, "user-1");
    expect(out(res)).toContain("status must be one of: drafted, sent, replied, meeting_scheduled, no_reply");
  });

  it("refuses a duplicate email, naming the other contact, and creates nothing", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    db.contact.findMany.mockResolvedValue([
      { ...indexRow({ id: "c1", name: "Sam Lee" }), Company: null },
      indexRow({ id: "c-dup", name: "Other Person", email: "TAKEN@acme.test" }),
    ]);
    (resolveCompany as any).mockResolvedValue({ id: "co9", label: "X", created: true });
    const res = await handleUpdateContact({ contactId: "c1", email: "taken@acme.test", company: "X" }, "user-1");
    expect(out(res)).toContain("Nothing changed: 1 other contact already has that name, email or LinkedIn URL");
    expect(out(res)).toContain("c-dup");
    expect(out(res)).toContain("same email");
    expect(resolveCompany).not.toHaveBeenCalled();
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it("does not treat the contact itself as a duplicate, and allowDuplicate overrides", async () => {
    db.contact.findFirst.mockResolvedValue(row());
    db.contact.findMany.mockResolvedValue([indexRow({ id: "c1", name: "Sam Lee", email: "sam@acme.test" })]);
    // case-only rename of itself: not a conflict
    let res = await handleUpdateContact({ contactId: "c1", name: "sam lee", title: "x" }, "user-1");
    expect(out(res)).toContain("Updated contact");

    db.contact.findMany.mockResolvedValue([indexRow({ id: "c-dup", name: "Pat Kim" })]);
    res = await handleUpdateContact({ contactId: "c1", name: "Pat Kim" }, "user-1");
    expect(out(res)).toContain("Nothing changed");
    res = await handleUpdateContact({ contactId: "c1", name: "Pat Kim", allowDuplicate: true }, "user-1");
    expect(out(res)).toContain('Updated contact "Pat Kim"');
  });

  it("returns the rate-limit message", async () => {
    (checkMcpRateLimit as any).mockReturnValue({ allowed: false, resetIn: 4000 });
    const res = await handleUpdateContact({ contactId: "c1", title: "x" }, "user-1");
    expect(out(res)).toBe("Rate limit exceeded. Try again in 4s.");
  });
});

describe("delete_contact", () => {
  const found = { name: "Sam Lee", _count: { interactions: 3, jobLinks: 1, tasks: 2 } };

  it("only previews without confirm, stating the impact", async () => {
    db.contact.findFirst.mockResolvedValue(found);
    const res = await handleDeleteContact({ contactId: "c1" }, "user-1");
    expect(out(res)).toContain("Nothing deleted yet");
    expect(out(res)).toContain("3 logged interactions and 1 job link");
    expect(db.contact.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes with confirm, scoped to the user", async () => {
    db.contact.findFirst.mockResolvedValue(found);
    db.contact.deleteMany.mockResolvedValue({ count: 1 });
    const res = await handleDeleteContact({ contactId: "c1", confirm: true }, "user-1");
    expect(db.contact.deleteMany).toHaveBeenCalledWith({ where: { id: "c1", createdBy: "user-1" } });
    expect(out(res)).toContain('Deleted contact "Sam Lee"');
  });

  it("returns not found and deletes nothing", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await handleDeleteContact({ contactId: "nope", confirm: true }, "user-1");
    expect(out(res)).toBe("Error: Contact not found (id: nope)");
    expect(db.contact.deleteMany).not.toHaveBeenCalled();
  });
});

describe("merge_contacts", () => {
  const keep = row({ id: "keep", name: "Sam Lee", notes: "Met at conf", lastContactedAt: new Date(2026, 8, 1) });
  const dupe = row({
    id: "dupe",
    name: "Samuel Lee",
    email: "samuel@other.test",
    phone: "555-1",
    notes: "Likes Go",
    lastContactedAt: new Date(2026, 9, 5),
  });
  const withCounts = (c: any, links: any[] = [], interactions = 2, tasks = 1) => ({
    ...c,
    jobLinks: links,
    _count: { interactions, tasks },
  });
  const mockBoth = (k = withCounts(keep), d = withCounts(dupe, [{ id: "l1", jobId: "j1", roleId: "r1" }, { id: "l2", jobId: "j2", roleId: "r1" }])) =>
    db.contact.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === "keep" ? k : where.id === "dupe" ? d : null,
    );

  it("previews without confirm and changes nothing", async () => {
    mockBoth();
    const res = await handleMergeContacts({ keepContactId: "keep", mergeContactId: "dupe" }, "user-1");
    expect(out(res)).toContain("Nothing merged yet");
    expect(out(res)).toContain('email: kept "sam@acme.test", dropped "samuel@other.test"');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("moves interactions, links and todos, fills gaps, then deletes the duplicate", async () => {
    mockBoth(
      withCounts({ ...keep }, [{ id: "k1", jobId: "j1", roleId: "r1" }]),
    );
    const res = await handleMergeContacts({ keepContactId: "keep", mergeContactId: "dupe", confirm: true }, "user-1");
    expect(db.interaction.updateMany).toHaveBeenCalledWith({
      where: { contactId: "dupe", createdBy: "user-1" },
      data: { contactId: "keep" },
    });
    expect(db.task.updateMany).toHaveBeenCalledWith({
      where: { contactId: "dupe", userId: "user-1" },
      data: { contactId: "keep" },
    });
    // j1/r1 already linked on the kept contact: dropped; j2/r1 moves
    expect(db.jobContact.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
    expect(db.jobContact.update).toHaveBeenCalledWith({ where: { id: "l2" }, data: { contactId: "keep" } });
    const fill = db.contact.update.mock.calls[0][0].data;
    expect(fill.phone).toBe("555-1");
    expect(fill.email).toBeUndefined(); // the kept contact's own value wins
    expect(fill.lastContactedAt).toEqual(new Date(2026, 9, 5));
    expect(fill.notes).toBe("Met at conf\n\n[Merged from Samuel Lee] Likes Go");
    expect(db.contact.delete).toHaveBeenCalledWith({ where: { id: "dupe" } });
    expect(out(res)).toContain("Merged");
  });

  it("refuses to merge a contact with itself", async () => {
    const res = await handleMergeContacts({ keepContactId: "a", mergeContactId: "a", confirm: true }, "user-1");
    expect(out(res)).toContain("must be different contacts");
  });

  it("returns not found for either side and merges nothing", async () => {
    mockBoth();
    let res = await handleMergeContacts({ keepContactId: "keep", mergeContactId: "ghost", confirm: true }, "user-1");
    expect(out(res)).toBe("Error: Contact not found (id: ghost)");
    res = await handleMergeContacts({ keepContactId: "ghost", mergeContactId: "dupe", confirm: true }, "user-1");
    expect(out(res)).toBe("Error: Contact not found (id: ghost)");
    expect(db.contact.delete).not.toHaveBeenCalled();
  });

  it("stops instead of losing notes that cannot be combined", async () => {
    mockBoth(withCounts({ ...keep, notes: "a".repeat(1500) }), withCounts({ ...dupe, notes: "b".repeat(600) }));
    const res = await handleMergeContacts({ keepContactId: "keep", mergeContactId: "dupe", confirm: true }, "user-1");
    expect(out(res)).toContain("too long to combine");
    expect(db.contact.delete).not.toHaveBeenCalled();
  });
});

describe("add_contact_note", () => {
  it("appends a dated line without touching earlier notes", async () => {
    db.contact.findFirst.mockResolvedValue({ name: "Sam Lee", notes: "First" });
    const res = await handleAddContactNote({ contactId: "c1", content: " Prefers email " }, "user-1");
    const call = db.contact.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1", createdBy: "user-1" });
    expect(call.data.notes).toMatch(/^First\n\d{4}-\d{2}-\d{2}: Prefers email$/);
    expect(out(res)).toBe("Added a note to Sam Lee (id: c1).");
  });

  it("starts the notes when there are none", async () => {
    db.contact.findFirst.mockResolvedValue({ name: "Sam Lee", notes: null });
    await handleAddContactNote({ contactId: "c1", content: "Hello" }, "user-1");
    expect(db.contact.updateMany.mock.calls[0][0].data.notes).toMatch(/^\d{4}-\d{2}-\d{2}: Hello$/);
  });

  it("returns not found, rejects blank content and refuses to overflow the field", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(out(await handleAddContactNote({ contactId: "x", content: "hi" }, "user-1"))).toBe(
      "Error: Contact not found (id: x)",
    );
    expect(out(await handleAddContactNote({ contactId: "x", content: "   " }, "user-1"))).toBe(
      "Validation error: content is required",
    );
    db.contact.findFirst.mockResolvedValue({ name: "Sam", notes: "a".repeat(1995) });
    const res = await handleAddContactNote({ contactId: "c1", content: "too much" }, "user-1");
    expect(out(res)).toContain("Notes would exceed 2000 characters");
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });
});

describe("link_contact_to_job", () => {
  const contact = { name: "Sam Lee", Role: { id: "r-own", label: "Referrer" } };
  const job = { JobTitle: { label: "Data Engineer" }, Company: { label: "Acme" } };
  beforeEach(() => {
    db.contact.findFirst.mockResolvedValue(contact);
    db.job.findFirst.mockResolvedValue(job);
    db.jobContact.findFirst.mockResolvedValue(null);
    db.jobContact.create.mockResolvedValue({ id: "l1" });
  });

  it("links with an explicit role resolved by name, checking ownership of both sides", async () => {
    (resolveContactRole as any).mockResolvedValue({ id: "r1", label: "Recruiter", created: false });
    const res = await handleLinkContactToJob({ contactId: "c1", jobId: "j1", role: "recruiter" }, "user-1");
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: "c1", createdBy: "user-1" });
    expect(db.job.findFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "user-1" });
    expect(db.jobContact.create).toHaveBeenCalledWith({ data: { jobId: "j1", contactId: "c1", roleId: "r1" } });
    expect(out(res)).toBe("Linked Sam Lee to Data Engineer @ Acme as Recruiter.");
  });

  it("falls back to the contact's own role", async () => {
    await handleLinkContactToJob({ contactId: "c1", jobId: "j1" }, "user-1");
    expect(db.jobContact.create.mock.calls[0][0].data.roleId).toBe("r-own");
  });

  it("asks for a role when there is none to default to", async () => {
    db.contact.findFirst.mockResolvedValue({ name: "Sam Lee", Role: null });
    const res = await handleLinkContactToJob({ contactId: "c1", jobId: "j1" }, "user-1");
    expect(out(res)).toContain("Validation error: role is required");
    expect(db.jobContact.create).not.toHaveBeenCalled();
  });

  it("reports an existing link, including a race on the unique key, without error", async () => {
    db.jobContact.findFirst.mockResolvedValue({ id: "l0" });
    let res = await handleLinkContactToJob({ contactId: "c1", jobId: "j1" }, "user-1");
    expect(out(res)).toBe("Already linked: Sam Lee is Referrer for Data Engineer @ Acme. Nothing changed.");
    db.jobContact.findFirst.mockResolvedValue(null);
    db.jobContact.create.mockRejectedValue({ code: "P2002" });
    res = await handleLinkContactToJob({ contactId: "c1", jobId: "j1" }, "user-1");
    expect(out(res)).toContain("Already linked");
  });

  it("returns not found for a missing contact or job", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect(out(await handleLinkContactToJob({ contactId: "c9", jobId: "j1" }, "user-1"))).toBe(
      "Error: Contact not found (id: c9)",
    );
    db.contact.findFirst.mockResolvedValue(contact);
    db.job.findFirst.mockResolvedValue(null);
    expect(out(await handleLinkContactToJob({ contactId: "c1", jobId: "j9" }, "user-1"))).toBe(
      "Error: Job not found",
    );
    expect(db.jobContact.create).not.toHaveBeenCalled();
  });
});
