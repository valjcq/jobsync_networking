import {
  handleAddTodo,
  handleCompleteTodo,
  handleListTodos,
  handleUpdateTodo,
} from "@/lib/mcp/tools/todos";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    job: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    contact: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const created = (over = {}) => ({
  id: "t1",
  title: "Call Marie",
  priority: 5,
  dueDate: null,
  status: "in-progress",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.task.findFirst.mockResolvedValue(null);
  db.task.create.mockImplementation(async ({ data }: any) => created(data));
  db.task.count.mockResolvedValue(1);
  db.job.count.mockResolvedValue(1);
  db.contact.count.mockResolvedValue(1);
  db.job.findFirst.mockResolvedValue(null);
  db.contact.findFirst.mockResolvedValue(null);
});

describe("add_todo", () => {
  it("creates an open todo with provenance, plain text wrapped as HTML", async () => {
    const res = await handleAddTodo(
      { title: " Call Marie ", description: "About <the> role\n\nThanks", dueDate: tomorrow(), priority: 8 },
      "user-1",
      "my-token",
    );
    const data = db.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: "user-1",
      title: "Call Marie",
      status: "in-progress",
      priority: 8,
      percentComplete: 0,
      createdVia: "my-token",
      description: "<p>About &lt;the&gt; role</p><p>Thanks</p>",
    });
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(res.content[0].text).toContain('Created todo "Call Marie" (id: t1');
  });

  it("rejects a past due date and a malformed one without writing", async () => {
    const past = await handleAddTodo({ title: "Call Marie", dueDate: "2020-01-01" }, "user-1");
    expect(past.content[0].text).toContain("is in the past");
    const bad = await handleAddTodo({ title: "Call Marie", dueDate: "next week" }, "user-1");
    expect(bad.content[0].text).toContain("YYYY-MM-DD");
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("returns the existing open todo instead of duplicating", async () => {
    db.task.findFirst.mockResolvedValue({ id: "t9" });
    const res = await handleAddTodo({ title: "Call Marie", jobId: "j1" }, "user-1");
    expect(db.task.findFirst.mock.calls[0][0].where).toMatchObject({
      userId: "user-1",
      title: "Call Marie",
      jobId: "j1",
      contactId: null,
    });
    expect(res.content[0].text).toContain("Already open");
    expect(res.content[0].text).toContain("t9");
    expect(db.task.create).not.toHaveBeenCalled();

    await handleAddTodo({ title: "Call Marie", allowDuplicate: true }, "user-1");
    expect(db.task.create).toHaveBeenCalledTimes(1);
  });

  it("refuses a job or contact the caller does not own", async () => {
    db.job.count.mockResolvedValue(0);
    const res = await handleAddTodo({ title: "Call Marie", jobId: "foreign" }, "user-1");
    expect(res.content[0].text).toBe("Error: Job not found");
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("rejects both an id and a name for the same link", async () => {
    const res = await handleAddTodo({ title: "Call Marie", contactId: "c1", contactName: "Marie" }, "user-1");
    expect(res.content[0].text).toContain("not both");
  });

  describe("contactName", () => {
    const contactRow = (id: string, name: string) => ({
      id,
      name,
      email: null,
      linkedinUrl: null,
      lastContactedAt: null,
      Company: { label: "Acme" },
    });

    it("resolves a single exact match", async () => {
      db.contact.findMany.mockResolvedValue([contactRow("c1", "Marie Curie")]);
      await handleAddTodo({ title: "Call Marie", contactName: "marie curie" }, "user-1");
      expect(db.task.create.mock.calls[0][0].data.contactId).toBe("c1");
    });

    it("returns candidates and writes nothing when only partial or ambiguous", async () => {
      db.contact.findMany.mockResolvedValue([
        contactRow("c1", "Marie Curie"),
        contactRow("c2", "Marie Antoinette"),
      ]);
      const res = await handleAddTodo({ title: "Call Marie", contactName: "Marie" }, "user-1");
      expect(res.content[0].text).toContain("Nothing created");
      expect(res.content[0].text).toContain("c1");
      expect(res.content[0].text).toContain("c2");
      expect(db.task.create).not.toHaveBeenCalled();
    });
  });

  describe("jobQuery", () => {
    const jobRow = (id: string, title: string, company: string) => ({
      id,
      createdAt: new Date(2026, 8, 1),
      appliedDate: null,
      JobTitle: { label: title },
      Company: { label: company },
      Location: null,
      Status: { value: "applied" },
      tags: [],
    });

    it("resolves one solid match", async () => {
      db.job.findMany.mockResolvedValue([jobRow("j1", "Data Engineer", "Acme"), jobRow("j2", "Designer", "Globex")]);
      await handleAddTodo({ title: "Prep", jobQuery: "Globex" }, "user-1");
      expect(db.task.create.mock.calls[0][0].data.jobId).toBe("j2");
    });

    it("never resolves on a fuzzy match", async () => {
      db.job.findMany.mockResolvedValue([jobRow("j1", "Data Engineer", "Acme")]);
      const res = await handleAddTodo({ title: "Prep", jobQuery: "Acmee" }, "user-1");
      expect(res.content[0].text).toContain("only has fuzzy matches");
      expect(db.task.create).not.toHaveBeenCalled();
    });

    it("never resolves between several", async () => {
      db.job.findMany.mockResolvedValue([jobRow("j1", "Data Engineer", "Acme"), jobRow("j2", "Designer", "Acme")]);
      const res = await handleAddTodo({ title: "Prep", jobQuery: "Acme" }, "user-1");
      expect(res.content[0].text).toContain("matches several jobs");
      expect(db.task.create).not.toHaveBeenCalled();
    });
  });
});

describe("list_todos", () => {
  const row = (over = {}) => ({
    id: "t1",
    title: "Call Marie",
    description: "<p>About the role</p>",
    status: "in-progress",
    priority: 5,
    dueDate: new Date(2026, 9, 10),
    jobId: "j1",
    contactId: null,
    Job: { JobTitle: { label: "Data Engineer" }, Company: { label: "Acme" } },
    Contact: null,
    ...over,
  });

  beforeEach(() => {
    db.task.findMany.mockResolvedValue([row()]);
    db.task.count.mockResolvedValue(1);
  });

  it("defaults to open statuses for the caller, soonest due first", async () => {
    const res = await handleListTodos({}, "user-1");
    const args = db.task.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "user-1", status: { in: ["in-progress", "needs-attention"] } });
    expect(args.orderBy[0]).toEqual({ dueDate: { sort: "asc", nulls: "last" } });
    expect(res.content[0].text).toContain(
      "- Call Marie (id: t1, status: in-progress, priority: 5, due 2026-10-10, job: Data Engineer @ Acme) — About the role",
    );
  });

  it("applies status, link and dueBefore filters, with dueBefore inclusive of that day", async () => {
    await handleListTodos({ status: "all", jobId: "j1", contactId: "c1", dueBefore: "2026-10-10" }, "user-1");
    const where = db.task.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where).toMatchObject({ jobId: "j1", contactId: "c1" });
    expect(where.dueDate.lte.getHours()).toBe(23);
  });

  it("says when there are none", async () => {
    db.task.findMany.mockResolvedValue([]);
    db.task.count.mockResolvedValue(0);
    expect((await handleListTodos({}, "user-1")).content[0].text).toBe("No todos match.");
  });
});

describe("update_todo", () => {
  beforeEach(() => {
    db.task.update.mockImplementation(async ({ data }: any) => created(data));
  });

  it("changes only the supplied fields, and 100% on complete", async () => {
    await handleUpdateTodo({ todoId: "t1", status: "complete", priority: 2 }, "user-1");
    const args = db.task.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "t1", userId: "user-1" });
    expect(args.data).toEqual({ status: "complete", percentComplete: 100, priority: 2 });
  });

  it("clears a due date and unlinks a job with null", async () => {
    await handleUpdateTodo({ todoId: "t1", dueDate: null, jobId: null, description: null }, "user-1");
    expect(db.task.update.mock.calls[0][0].data).toEqual({ dueDate: null, jobId: null, description: null });
    expect(db.job.count).not.toHaveBeenCalled();
  });

  it("checks ownership of a new link and of the todo", async () => {
    db.contact.count.mockResolvedValue(0);
    const res = await handleUpdateTodo({ todoId: "t1", contactId: "foreign" }, "user-1");
    expect(res.content[0].text).toBe("Error: Contact not found");

    db.task.count.mockResolvedValue(0);
    const missing = await handleUpdateTodo({ todoId: "nope", title: "New title" }, "user-1");
    expect(missing.content[0].text).toBe("Error: Task not found");
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("refuses an empty update", async () => {
    const res = await handleUpdateTodo({ todoId: "t1" }, "user-1");
    expect(res.content[0].text).toContain("Nothing to update");
  });
});

describe("complete_todo", () => {
  it("completes an open todo", async () => {
    db.task.findFirst.mockResolvedValue({ status: "in-progress", title: "Call Marie" });
    db.task.update.mockResolvedValue(created({ status: "complete" }));
    const res = await handleCompleteTodo({ todoId: "t1" }, "user-1");
    expect(db.task.update.mock.calls[0][0].data).toEqual({ status: "complete", percentComplete: 100 });
    expect(res.content[0].text).toContain("complete");
  });

  it("is a no-op when already complete, and errors for another user's todo", async () => {
    db.task.findFirst.mockResolvedValue({ status: "complete", title: "Call Marie" });
    expect((await handleCompleteTodo({ todoId: "t1" }, "user-1")).content[0].text).toContain("Already complete");
    expect(db.task.update).not.toHaveBeenCalled();

    db.task.findFirst.mockResolvedValue(null);
    expect((await handleCompleteTodo({ todoId: "x" }, "user-1")).content[0].text).toBe("Error: Task not found");
  });
});
