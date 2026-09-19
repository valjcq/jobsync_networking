import { handleFindContact } from "@/lib/mcp/tools/findContact";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: { contact: { findMany: vi.fn(), count: vi.fn() } },
}));

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Sam Lee",
  title: "Recruiter",
  lastContactedAt: new Date(2026, 8, 1),
  Company: { label: "Acme" },
  interactions: [{ id: "i1" }],
  ...over,
});

describe("handleFindContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkMcpRateLimit as any).mockReturnValue({ allowed: true, resetIn: 0 });
    db.contact.findMany.mockResolvedValue([row()]);
    db.contact.count.mockResolvedValue(1);
  });

  it("returns a rate-limit message and does not query", async () => {
    (checkMcpRateLimit as any).mockReturnValue({ allowed: false, resetIn: 5000 });
    const res = await handleFindContact({ query: "sam" }, "user-1");
    expect(res.content[0].text).toBe("Rate limit exceeded. Try again in 5s.");
    expect(db.contact.findMany).not.toHaveBeenCalled();
  });

  it("scopes the search to the token's user with the Contacts page filter", async () => {
    await handleFindContact({ query: " sam " }, "user-1");
    const args = db.contact.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      createdBy: "user-1",
      OR: [
        { name: { contains: "sam" } },
        { email: { contains: "sam" } },
        { title: { contains: "sam" } },
      ],
    });
  });

  it("lists id, role, last contacted and open next steps", async () => {
    const res = await handleFindContact({ query: "sam" }, "user-1");
    const text = res.content[0].text;
    expect(text).toContain("Sam Lee (id: c1, Recruiter @ Acme, last contacted: 2026-09-01, open next steps: 1)");
    expect(text).toContain("contactId");
  });

  it("says never when a contact has not been contacted", async () => {
    db.contact.findMany.mockResolvedValue([row({ lastContactedAt: null, interactions: [] })]);
    const res = await handleFindContact({ query: "sam" }, "user-1");
    expect(res.content[0].text).toContain("last contacted: never, open next steps: 0");
  });

  it("points at add_contact when nothing matches", async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.count.mockResolvedValue(0);
    const res = await handleFindContact({ query: "nobody" }, "user-1");
    expect(res.content[0].text).toContain('No saved contact matches "nobody"');
    expect(res.content[0].text).toContain("add_contact");
  });

  it("rejects a blank query", async () => {
    const res = await handleFindContact({ query: "   " }, "user-1");
    expect(res.content[0].text).toContain("query is required");
    expect(db.contact.findMany).not.toHaveBeenCalled();
  });

  it("clamps the limit and reports when more match than are shown", async () => {
    db.contact.count.mockResolvedValue(40);
    const res = await handleFindContact({ query: "a", limit: 999 }, "user-1");
    expect(db.contact.findMany.mock.calls[0][0].take).toBe(25);
    expect(res.content[0].text).toContain("Showing 1 of 40");
  });

  it("surfaces database errors instead of throwing", async () => {
    db.contact.findMany.mockRejectedValue(new Error("boom"));
    const res = await handleFindContact({ query: "sam" }, "user-1");
    expect(res.content[0].text).toBe("Error: boom");
  });
});
