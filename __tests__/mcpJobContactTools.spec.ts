import {
  handleAddJobNote,
  handleGetJob,
  handleSetJobStatus,
} from "@/lib/mcp/tools/jobTools";
import { handleCompleteFollowup, handleGetContact } from "@/lib/mcp/tools/contactTools";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    job: { findFirst: vi.fn(), update: vi.fn() },
    jobStatus: { findUnique: vi.fn() },
    note: { create: vi.fn() },
    contact: { findFirst: vi.fn() },
    interaction: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const jobHead = {
  JobTitle: { label: "Data Engineer" },
  Company: { label: "Acme" },
  Status: { value: "draft" },
};

beforeEach(() => vi.clearAllMocks());

describe("get_job", () => {
  it("reads one owned job with its links, todos and notes", async () => {
    db.job.findFirst.mockResolvedValue({
      id: "j1",
      jobUrl: "https://acme.example/job",
      applied: true,
      appliedDate: new Date(2026, 8, 30),
      dueDate: null,
      matchScore: 82,
      descriptionCompleteness: "full",
      salaryRange: null,
      salaryCurrency: null,
      createdVia: null,
      ...jobHead,
      Status: { value: "applied" },
      Location: { label: "Remote" },
      tags: [{ label: "python" }],
      Notes: [{ content: "<p>Spoke to <b>HR</b></p>", createdAt: new Date(2026, 9, 1) }],
      contactLinks: [{ Contact: { id: "c1", name: "Marie" }, Role: { label: "Recruiter" } }],
      interactions: [],
      tasks: [{ id: "t1", title: "Send CV", dueDate: new Date(2026, 9, 12) }],
    });
    const res = await handleGetJob({ jobId: "j1" }, "user-1");
    expect(db.job.findFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "user-1" });
    const out = res.content[0].text;
    expect(out).toContain("Data Engineer @ Acme (id: j1)");
    expect(out).toContain("Status: applied, applied on 2026-09-30");
    expect(out).toContain("- Marie (id: c1, Recruiter)");
    expect(out).toContain("- Send CV (id: t1, due 2026-10-12)");
    expect(out).toContain("2026-10-01: Spoke to HR");
    expect(out).toContain("Match: 82%");
  });

  it("does not reveal another user's job", async () => {
    db.job.findFirst.mockResolvedValue(null);
    expect((await handleGetJob({ jobId: "x" }, "user-1")).content[0].text).toBe("Error: Job not found");
  });
});

describe("set_job_status", () => {
  beforeEach(() => {
    db.job.findFirst.mockResolvedValue(jobHead);
    db.job.update.mockResolvedValue({});
  });

  it("sets applied with the same side effects as the UI, for any owned job", async () => {
    db.jobStatus.findUnique.mockResolvedValue({ id: "s-applied", value: "applied" });
    const res = await handleSetJobStatus({ jobId: "j1", status: "applied" }, "user-1");
    const args = db.job.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "j1", userId: "user-1" });
    expect(args.data).toMatchObject({ statusId: "s-applied", applied: true });
    expect(args.data.appliedDate).toBeInstanceOf(Date);
    // not limited to jobs created through MCP
    expect(db.job.findFirst.mock.calls[0][0].where).toEqual({ id: "j1", userId: "user-1" });
    expect(res.content[0].text).toContain("from draft to applied");
  });

  it("interview marks applied without touching the applied date", async () => {
    db.jobStatus.findUnique.mockResolvedValue({ id: "s-int", value: "interview" });
    await handleSetJobStatus({ jobId: "j1", status: "interview" }, "user-1");
    expect(db.job.update.mock.calls[0][0].data).toEqual({ statusId: "s-int", applied: true });
  });

  it("is a no-op when the status is unchanged", async () => {
    db.jobStatus.findUnique.mockResolvedValue({ id: "s-draft", value: "draft" });
    const res = await handleSetJobStatus({ jobId: "j1", status: "draft" }, "user-1");
    expect(res.content[0].text).toContain("Already draft");
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it("errors for an unowned job", async () => {
    db.job.findFirst.mockResolvedValue(null);
    db.jobStatus.findUnique.mockResolvedValue({ id: "s", value: "applied" });
    expect((await handleSetJobStatus({ jobId: "x", status: "applied" }, "user-1")).content[0].text).toBe(
      "Error: Job not found",
    );
    expect(db.job.update).not.toHaveBeenCalled();
  });
});

describe("add_job_note", () => {
  it("stores escaped plain text as HTML on an owned job", async () => {
    db.job.findFirst.mockResolvedValue(jobHead);
    db.note.create.mockResolvedValue({ id: "n1" });
    const res = await handleAddJobNote({ jobId: "j1", content: "Said <hi>\nSecond line" }, "user-1");
    expect(db.note.create.mock.calls[0][0].data).toEqual({
      jobId: "j1",
      userId: "user-1",
      content: "<p>Said &lt;hi&gt;<br>Second line</p>",
    });
    expect(res.content[0].text).toContain("note id: n1");
  });

  it("writes nothing for an unowned job", async () => {
    db.job.findFirst.mockResolvedValue(null);
    expect((await handleAddJobNote({ jobId: "x", content: "hi" }, "user-1")).content[0].text).toBe(
      "Error: Job not found",
    );
    expect(db.note.create).not.toHaveBeenCalled();
  });
});

describe("get_contact", () => {
  it("reads one owned contact", async () => {
    db.contact.findFirst.mockResolvedValue({
      id: "c1",
      name: "Marie Curie",
      title: "Recruiter",
      email: "marie@acme.example",
      phone: null,
      linkedinUrl: null,
      relationship: null,
      notes: null,
      lastContactedAt: new Date(2026, 8, 1),
      Company: { label: "Acme" },
      Location: null,
      Role: { label: "Recruiter" },
      jobLinks: [{ Job: { id: "j1", JobTitle: { label: "Data Engineer" }, Company: { label: "Acme" } }, Role: { label: "Referrer" } }],
      interactions: [
        {
          id: "i1",
          occurredAt: new Date(2026, 8, 1),
          outcome: "Went well",
          nextStep: "Send CV",
          nextStepDate: new Date(2026, 8, 5),
          nextStepDoneAt: null,
          Purpose: { label: "Coffee Chat" },
        },
      ],
      tasks: [],
    });
    const res = await handleGetContact({ contactId: "c1" }, "user-1");
    expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: "c1", createdBy: "user-1" });
    const out = res.content[0].text;
    expect(out).toContain("Marie Curie, Recruiter @ Acme (id: c1)");
    expect(out).toContain("- Data Engineer @ Acme (id: j1, Referrer)");
    expect(out).toContain("2026-09-01 Coffee Chat: Went well [next step: Send CV due 2026-09-05] (id: i1)");
  });

  it("errors for another user's contact", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    expect((await handleGetContact({ contactId: "x" }, "user-1")).content[0].text).toBe("Error: Contact not found");
  });
});

describe("complete_followup", () => {
  const step = (over = {}) => ({ nextStep: "Send CV", nextStepDoneAt: null, Contact: { name: "Marie" }, ...over });

  it("marks an open step done through the shared core", async () => {
    db.interaction.findFirst.mockResolvedValue(step());
    db.interaction.updateMany.mockResolvedValue({ count: 1 });
    const res = await handleCompleteFollowup({ interactionId: "i1" }, "user-1");
    expect(db.interaction.updateMany.mock.calls[0][0].where).toEqual({
      id: "i1",
      createdBy: "user-1",
      nextStep: { not: null },
    });
    expect(db.interaction.updateMany.mock.calls[0][0].data.nextStepDoneAt).toBeInstanceOf(Date);
    expect(res.content[0].text).toContain("done");
  });

  it("reopens with done: false", async () => {
    db.interaction.findFirst.mockResolvedValue(step({ nextStepDoneAt: new Date() }));
    db.interaction.updateMany.mockResolvedValue({ count: 1 });
    await handleCompleteFollowup({ interactionId: "i1", done: false }, "user-1");
    expect(db.interaction.updateMany.mock.calls[0][0].data).toEqual({ nextStepDoneAt: null });
  });

  it("changes nothing when already in that state, and errors when not found", async () => {
    db.interaction.findFirst.mockResolvedValue(step({ nextStepDoneAt: new Date() }));
    expect((await handleCompleteFollowup({ interactionId: "i1" }, "user-1")).content[0].text).toContain("Already done");
    expect(db.interaction.updateMany).not.toHaveBeenCalled();

    db.interaction.findFirst.mockResolvedValue(null);
    expect((await handleCompleteFollowup({ interactionId: "x" }, "user-1")).content[0].text).toBe(
      "Error: Next step not found",
    );
  });
});
