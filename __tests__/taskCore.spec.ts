import {
  createTaskForUser,
  listTasksForUser,
  setTaskStatusForUser,
  updateTaskForUser,
} from "@/lib/tasks/tasks";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    task: { create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    job: { count: vi.fn() },
    contact: { count: vi.fn() },
  },
}));

const db = prisma as any;
const base = { title: "Call Marie", status: "in-progress" as const, priority: 5, percentComplete: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  db.job.count.mockResolvedValue(1);
  db.contact.count.mockResolvedValue(1);
  db.task.count.mockResolvedValue(1);
  db.task.create.mockResolvedValue({ id: "t1" });
  db.task.update.mockResolvedValue({ id: "t1" });
});

describe("task core ownership", () => {
  it("creates against the caller, checking a linked job and contact belong to them", async () => {
    await createTaskForUser("user-1", { ...base, jobId: "j1", contactId: "c1" });
    expect(db.job.count).toHaveBeenCalledWith({ where: { id: "j1", userId: "user-1" } });
    expect(db.contact.count).toHaveBeenCalledWith({ where: { id: "c1", createdBy: "user-1" } });
    expect(db.task.create.mock.calls[0][0].data).toMatchObject({ userId: "user-1", jobId: "j1", contactId: "c1" });
  });

  it("rejects a job or contact that is not theirs, writing nothing", async () => {
    db.job.count.mockResolvedValue(0);
    await expect(createTaskForUser("user-1", { ...base, jobId: "x" })).rejects.toThrow("Job not found");
    db.job.count.mockResolvedValue(1);
    db.contact.count.mockResolvedValue(0);
    await expect(createTaskForUser("user-1", { ...base, contactId: "x" })).rejects.toThrow("Contact not found");
    await expect(updateTaskForUser("user-1", "t1", { contactId: "x" })).rejects.toThrow("Contact not found");
    expect(db.task.create).not.toHaveBeenCalled();
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("does not look up links that are absent or being cleared", async () => {
    await createTaskForUser("user-1", base);
    await updateTaskForUser("user-1", "t1", { jobId: null });
    expect(db.job.count).not.toHaveBeenCalled();
    expect(db.contact.count).not.toHaveBeenCalled();
  });

  it("leaves a link alone when the patch does not mention it, and clears it on null", async () => {
    await updateTaskForUser("user-1", "t1", { title: "New" });
    expect(db.task.update.mock.calls[0][0].data).toEqual({ title: "New" });
    await updateTaskForUser("user-1", "t1", { jobId: null });
    expect(db.task.update.mock.calls[1][0].data).toEqual({ jobId: null });
  });

  it("only updates the caller's own todo", async () => {
    db.task.count.mockResolvedValue(0);
    await expect(setTaskStatusForUser("user-1", "foreign", "complete")).rejects.toThrow("Task not found");
    expect(db.task.update).not.toHaveBeenCalled();
    db.task.count.mockResolvedValue(1);
    await setTaskStatusForUser("user-1", "t1", "complete");
    expect(db.task.update.mock.calls[0][0].where).toEqual({ id: "t1", userId: "user-1" });
  });

  it("lists only the caller's todos", async () => {
    db.task.findMany.mockResolvedValue([]);
    db.task.count.mockResolvedValue(0);
    await listTasksForUser("user-1", { jobId: "j1" });
    expect(db.task.findMany.mock.calls[0][0].where).toEqual({ userId: "user-1", jobId: "j1" });
  });
});
