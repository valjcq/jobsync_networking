import { handleSearch } from "@/lib/mcp/tools/search";
import { searchForUser } from "@/lib/search/search";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    job: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    company: { findMany: vi.fn() },
    interaction: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const ALL = ["jobs:write", "networking:write", "tasks:write"];

const job = (id: string, title: string, company: string, over = {}) => ({
  id,
  createdAt: new Date(2026, 8, 1),
  appliedDate: null,
  JobTitle: { label: title },
  Company: { label: company },
  Location: null,
  Status: { value: "applied" },
  tags: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.job.findMany.mockResolvedValue([
    job("j1", "Data Engineer", "Acme Inc."),
    job("j2", "Designer", "Globex"),
  ]);
  db.contact.findMany.mockResolvedValue([
    {
      id: "c1",
      name: "José Acme-Lee",
      email: null,
      title: "Recruiter",
      lastContactedAt: null,
      createdAt: new Date(2026, 8, 1),
      Company: { label: "Acme" },
    },
  ]);
  db.company.findMany.mockResolvedValue([
    { id: "co1", label: "Acme Inc.", websiteUrl: null, industry: null, _count: { jobsApplied: 1, contacts: 1 } },
  ]);
  db.interaction.findMany.mockResolvedValue([]);
  db.task.findMany.mockResolvedValue([
    { id: "t1", title: "Prep for Acme interview", description: "<p>Read notes</p>", status: "in-progress", dueDate: null, createdAt: new Date(2026, 8, 2) },
  ]);
});

describe("searchForUser", () => {
  it("scopes every query to the user and ranks the best match first", async () => {
    const hits = await searchForUser("user-1", "acme", {
      types: ["job", "contact", "company", "task"],
    });
    expect(db.job.findMany.mock.calls[0][0].where.userId).toBe("user-1");
    expect(db.contact.findMany.mock.calls[0][0].where.createdBy).toBe("user-1");
    expect(db.company.findMany.mock.calls[0][0].where.createdBy).toBe("user-1");
    expect(db.task.findMany.mock.calls[0][0].where.userId).toBe("user-1");
    expect(hits[0]).toMatchObject({ type: "company", id: "co1" });
    expect(hits.map((h) => h.id)).toEqual(expect.arrayContaining(["j1", "c1", "t1"]));
    expect(hits.find((h) => h.id === "j2")).toBeUndefined();
  });

  it("finds an accented name from plain letters", async () => {
    const hits = await searchForUser("user-1", "jose", { types: ["contact"] });
    expect(hits.map((h) => h.id)).toEqual(["c1"]);
  });

  it("flags typo matches as fuzzy", async () => {
    const hits = await searchForUser("user-1", "enginer", { types: ["job"] });
    expect(hits).toHaveLength(1);
    expect(hits[0].fuzzy).toBe(true);
  });

  it("caps results per type", async () => {
    db.job.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => job(`j${i}`, "Engineer", "Acme")),
    );
    const hits = await searchForUser("user-1", "engineer", { types: ["job"] });
    expect(hits).toHaveLength(10);
  });

  it("breaks ties by recency", async () => {
    db.job.findMany.mockResolvedValue([
      job("old", "Engineer", "Acme", { createdAt: new Date(2026, 0, 1) }),
      job("new", "Engineer", "Acme", { createdAt: new Date(2026, 8, 1) }),
    ]);
    const hits = await searchForUser("user-1", "engineer", { types: ["job"] });
    expect(hits.map((h) => h.id)).toEqual(["new", "old"]);
  });

  it("only looks inside descriptions when asked, and tags those hits", async () => {
    await searchForUser("user-1", "kubernetes", { types: ["job"] });
    expect(db.job.findMany).toHaveBeenCalledTimes(1);

    db.job.findMany.mockReset();
    db.job.findMany
      .mockResolvedValueOnce([job("j2", "Designer", "Globex")])
      .mockResolvedValueOnce([{ id: "j2" }]);
    const hits = await searchForUser("user-1", "kubernetes", {
      types: ["job"],
      includeDescription: true,
    });
    expect(db.job.findMany.mock.calls.some((c: any) => c[0].where.description)).toBe(true);
    expect(hits).toHaveLength(1);
    expect(hits[0].note).toBe("matched in the job description");
  });
});

describe("handleSearch", () => {
  it("skips types the token cannot read, and says so", async () => {
    const res = await handleSearch({ query: "acme" }, "user-1", ["jobs:write"]);
    const out = res.content[0].text;
    expect(db.contact.findMany).not.toHaveBeenCalled();
    expect(db.task.findMany).not.toHaveBeenCalled();
    expect(out).toContain("[job] Data Engineer @ Acme Inc. (id: j1");
    expect(out).toContain("Not searched (token lacks networking:write, tasks:write)");
  });

  it("refuses when no requested type is readable", async () => {
    const res = await handleSearch({ query: "acme", types: ["task"] }, "user-1", ["jobs:write"]);
    expect(res.content[0].text).toContain("Nothing searched");
  });

  it("tells the agent to confirm fuzzy matches", async () => {
    const res = await handleSearch({ query: "enginer", types: ["job"] }, "user-1", ALL);
    expect(res.content[0].text).toContain("fuzzy match");
    expect(res.content[0].text).toContain("confirm with the user");
  });

  it("says when nothing matches", async () => {
    const res = await handleSearch({ query: "zebra" }, "user-1", ALL);
    expect(res.content[0].text).toContain('No job/contact/company/interaction/task matches "zebra"');
  });
});
