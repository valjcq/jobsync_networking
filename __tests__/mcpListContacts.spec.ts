import { handleListContacts } from "@/lib/mcp/tools/listContacts";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({ default: { contact: { findMany: vi.fn() } } }));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const out = (r: any) => r.content[0].text as string;

const contact = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Marie Curie",
  title: "Recruiter",
  status: "sent",
  lastContactedAt: new Date(2026, 8, 1),
  Company: { label: "Acme" },
  Role: { label: "Recruiter" },
  interactions: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.contact.findMany.mockResolvedValue([
    contact(),
    contact({ id: "c2", name: "José Núñez", title: null, status: null, lastContactedAt: null, Company: { label: "Globex" }, Role: null, interactions: [{ id: "i1" }] }),
  ]);
});

describe("list_contacts", () => {
  it("pushes status and date filters to the query, scoped to the user", async () => {
    await handleListContacts(
      { status: "meeting scheduled" as any, lastContactedBefore: "2026-10-01", lastContactedAfter: "2026-08-01" },
      "user-1",
    );
    const where = db.contact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      createdBy: "user-1",
      status: "meeting_scheduled",
      lastContactedAt: { lt: new Date(2026, 9, 1), gte: new Date(2026, 7, 1) },
    });
  });

  it("filters neverContacted at the query level", async () => {
    await handleListContacts({ neverContacted: true }, "user-1");
    expect(db.contact.findMany.mock.calls[0][0].where.lastContactedAt).toBeNull();
  });

  it("matches company and role ignoring case and accents", async () => {
    let res = await handleListContacts({ company: "GLOBEX" }, "user-1");
    expect(out(res)).toContain("José Núñez");
    expect(out(res)).not.toContain("Marie");
    res = await handleListContacts({ role: "recruit" }, "user-1");
    expect(out(res)).toContain("Marie Curie");
    expect(out(res)).not.toContain("José");
  });

  it("filters on a next step being due, in both directions", async () => {
    let res = await handleListContacts({ nextStepDue: true }, "user-1");
    expect(out(res)).toContain("José Núñez");
    expect(out(res)).toContain("1 next step(s) due");
    expect(out(res)).not.toContain("Marie");
    res = await handleListContacts({ nextStepDue: false }, "user-1");
    expect(out(res)).toContain("Marie");
    expect(out(res)).not.toContain("José");
  });

  it("formats rows with ids, status and last contacted", async () => {
    const res = await handleListContacts({}, "user-1");
    expect(out(res)).toBe(
      "2 contacts:\n" +
        "- Marie Curie, Recruiter @ Acme (id: c1; role: Recruiter; status: sent; last contacted: 2026-09-01)\n" +
        "- José Núñez, Globex (id: c2; last contacted: never; 1 next step(s) due)",
    );
  });

  it("reports an empty result, truncation, and invalid input", async () => {
    expect(out(await handleListContacts({ company: "nowhere" }, "user-1"))).toBe("No contacts match.");
    expect(out(await handleListContacts({ limit: 1 }, "user-1"))).toContain("1 of 2 contacts:");
    expect(out(await handleListContacts({ status: "ghosted" as any }, "user-1"))).toContain("status must be one of");
    expect(out(await handleListContacts({ lastContactedBefore: "soon" }, "user-1"))).toContain(
      "lastContactedBefore must be a calendar date",
    );
    expect(out(await handleListContacts({ neverContacted: true, lastContactedBefore: "2026-10-01" }, "user-1"))).toContain(
      "cannot be combined",
    );
  });
});
