import {
  getInteractionList,
  getFollowUps,
  getNetworkingContacts,
  createInteraction,
  updateInteraction,
  deleteInteractionById,
  markNextStepDone,
} from "@/actions/interaction.actions";
import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => {
  const client: any = {
    interaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    interactionPurpose: { count: vi.fn() },
    job: { count: vi.fn() },
  };
  // The transaction callback runs against the same mock client
  client.$transaction = vi.fn((fn: any) => fn(client));
  return { default: client };
});

vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as any;
const user = { id: "user-1" };

const day = (d: string) => new Date(`${d}T00:00:00`);

const values = (over: Record<string, unknown> = {}) => ({
  contact: "c1",
  interactionPurpose: "p1",
  occurredAt: day("2026-09-10"),
  outcome: "",
  nextStep: "",
  nextStepDate: null,
  job: "",
  ...over,
});

describe("interaction actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00"));
    (getCurrentUser as any).mockResolvedValue(user);
    db.contact.count.mockResolvedValue(1);
    db.interactionPurpose.count.mockResolvedValue(1);
    db.job.count.mockResolvedValue(1);
    db.interaction.create.mockResolvedValue({ id: "i1" });
  });

  afterEach(() => vi.useRealTimers());

  describe("auth and ownership", () => {
    it("refuses every action without a session", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const results = await Promise.all([
        getInteractionList(),
        getFollowUps(),
        getNetworkingContacts(),
        createInteraction(values() as any),
        updateInteraction(values({ id: "i1" }) as any),
        deleteInteractionById("i1"),
        markNextStepDone("i1"),
      ]);

      for (const res of results) {
        expect(res).toEqual({ success: false, message: "Not authenticated" });
      }
      expect(db.interaction.create).not.toHaveBeenCalled();
    });

    it.each([
      ["contact", () => db.contact.count.mockResolvedValue(0), "Contact not found"],
      ["purpose", () => db.interactionPurpose.count.mockResolvedValue(0), "Purpose not found"],
      ["job", () => db.job.count.mockResolvedValue(0), "Job not found"],
    ])("rejects a %s the caller does not own", async (_n, arrange, message) => {
      arrange();
      const res = await createInteraction(values({ job: "j1" }) as any);
      expect(res).toEqual({ success: false, message });
      expect(db.interaction.create).not.toHaveBeenCalled();
    });

    it("checks each reference against the caller", async () => {
      await createInteraction(values({ job: "j1" }) as any);
      expect(db.contact.count).toHaveBeenCalledWith({
        where: { id: "c1", createdBy: user.id },
      });
      expect(db.interactionPurpose.count).toHaveBeenCalledWith({
        where: { id: "p1", createdBy: user.id },
      });
      expect(db.job.count).toHaveBeenCalledWith({
        where: { id: "j1", userId: user.id },
      });
    });

    it("scopes lists to the user", async () => {
      db.interaction.findMany.mockResolvedValue([]);
      db.interaction.count.mockResolvedValue(0);
      await getInteractionList(1, 25, "c1", "p1");
      expect(db.interaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdBy: user.id, contactId: "c1", purposeId: "p1" },
        }),
      );
    });
  });

  describe("follow-ups", () => {
    it("asks only for due, open steps", async () => {
      db.interaction.findMany.mockResolvedValue([]);
      await getFollowUps();
      const where = db.interaction.findMany.mock.calls[0][0].where;
      expect(where.createdBy).toBe(user.id);
      expect(where.nextStep).toEqual({ not: null });
      expect(where.nextStepDoneAt).toBeNull();
      expect(where.nextStepDate.not).toBeNull();
      expect(where.nextStepDate.lte.getDate()).toBe(19);
      expect(where.nextStepDate.lte.getHours()).toBe(23);
    });

    it("marks a step done with a timestamp, and can undo it", async () => {
      db.interaction.updateMany.mockResolvedValue({ count: 1 });
      await markNextStepDone("i1");
      expect(db.interaction.updateMany).toHaveBeenLastCalledWith({
        where: { id: "i1", createdBy: user.id, nextStep: { not: null } },
        data: { nextStepDoneAt: new Date("2026-09-19T12:00:00") },
      });
      await markNextStepDone("i1", false);
      expect(db.interaction.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { nextStepDoneAt: null } }),
      );
    });

    it("reports a step that is not the caller's", async () => {
      db.interaction.updateMany.mockResolvedValue({ count: 0 });
      expect(await markNextStepDone("i1")).toEqual({
        success: false,
        message: "Next step not found",
      });
    });
  });

  describe("lastContactedAt on create", () => {
    it("sets it when the contact has none", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: null });
      await createInteraction(values() as any);
      expect(db.contact.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { lastContactedAt: day("2026-09-10") },
      });
    });

    it("moves it forward", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-01") });
      await createInteraction(values() as any);
      expect(db.contact.update).toHaveBeenCalled();
    });

    it("never moves it back for a backdated entry", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-15") });
      await createInteraction(values() as any);
      expect(db.contact.update).not.toHaveBeenCalled();
    });

    it("ignores a planned, future-dated interaction", async () => {
      await createInteraction(values({ occurredAt: day("2026-09-25") }) as any);
      expect(db.contact.findUnique).not.toHaveBeenCalled();
      expect(db.contact.update).not.toHaveBeenCalled();
    });

    it("counts one dated today", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: null });
      await createInteraction(values({ occurredAt: day("2026-09-19") }) as any);
      expect(db.contact.update).toHaveBeenCalled();
    });

    it("drops a step date when there is no step text", async () => {
      await createInteraction(
        values({ nextStep: "  ", nextStepDate: day("2026-09-20") }) as any,
      );
      expect(db.interaction.create.mock.calls[0][0].data).toMatchObject({
        nextStep: null,
        nextStepDate: null,
      });
    });
  });

  describe("lastContactedAt on delete", () => {
    const old = {
      id: "i1",
      contactId: "c1",
      occurredAt: day("2026-09-10"),
    };

    beforeEach(() => db.interaction.findFirst.mockResolvedValueOnce(old));

    it("falls back to the latest remaining interaction", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-10") });
      db.interaction.findFirst.mockResolvedValueOnce({ occurredAt: day("2026-09-04") });
      await deleteInteractionById("i1");
      expect(db.contact.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { lastContactedAt: day("2026-09-04") },
      });
      expect(db.interaction.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    });

    it("leaves a hand-typed date alone when nothing remains", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-10") });
      db.interaction.findFirst.mockResolvedValueOnce(null);
      await deleteInteractionById("i1");
      expect(db.contact.update).not.toHaveBeenCalled();
    });

    it("does nothing when the deleted one did not set the value", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-15") });
      await deleteInteractionById("i1");
      expect(db.contact.update).not.toHaveBeenCalled();
    });

    it("excludes the deleted row when looking for the latest", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-10") });
      db.interaction.findFirst.mockResolvedValueOnce(null);
      await deleteInteractionById("i1");
      expect(db.interaction.findFirst.mock.calls[1][0].where).toMatchObject({
        contactId: "c1",
        createdBy: user.id,
        id: { not: "i1" },
      });
    });

    it("refuses one that is not the caller's", async () => {
      db.interaction.findFirst.mockReset();
      db.interaction.findFirst.mockResolvedValueOnce(null);
      expect(await deleteInteractionById("i1")).toEqual({
        success: false,
        message: "Interaction not found",
      });
      expect(db.interaction.delete).not.toHaveBeenCalled();
    });
  });

  describe("editing is a delete of the old plus a create of the new", () => {
    const old = {
      id: "i1",
      contactId: "c1",
      occurredAt: day("2026-09-10"),
      nextStep: null,
      nextStepDate: null,
    };

    it("moves last contacted earlier when the date moves earlier", async () => {
      db.interaction.findFirst.mockResolvedValueOnce(old);
      // Old value came from this interaction; nothing else remains
      db.contact.findUnique
        .mockResolvedValueOnce({ lastContactedAt: day("2026-09-10") })
        .mockResolvedValueOnce({ lastContactedAt: null });
      db.interaction.findFirst.mockResolvedValueOnce(null);

      await updateInteraction(
        values({ id: "i1", occurredAt: day("2026-09-05") }) as any,
      );

      expect(db.contact.update).toHaveBeenNthCalledWith(1, {
        where: { id: "c1" },
        data: { lastContactedAt: null },
      });
      expect(db.contact.update).toHaveBeenNthCalledWith(2, {
        where: { id: "c1" },
        data: { lastContactedAt: day("2026-09-05") },
      });
    });

    it("updates both contacts when the contact changes", async () => {
      db.interaction.findFirst.mockResolvedValueOnce(old);
      db.contact.findUnique
        .mockResolvedValueOnce({ lastContactedAt: day("2026-09-10") }) // c1, removal
        .mockResolvedValueOnce({ lastContactedAt: day("2026-09-01") }); // c2, creation
      db.interaction.findFirst.mockResolvedValueOnce({
        occurredAt: day("2026-08-20"),
      });

      await updateInteraction(values({ id: "i1", contact: "c2" }) as any);

      expect(db.contact.update).toHaveBeenNthCalledWith(1, {
        where: { id: "c1" },
        data: { lastContactedAt: day("2026-08-20") },
      });
      expect(db.contact.update).toHaveBeenNthCalledWith(2, {
        where: { id: "c2" },
        data: { lastContactedAt: day("2026-09-10") },
      });
    });

    it("writes the row between the removal and the creation", async () => {
      db.interaction.findFirst.mockResolvedValueOnce(old);
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: null });
      const order: string[] = [];
      db.interaction.update.mockImplementation(async () => order.push("row"));
      db.contact.update.mockImplementation(async () => order.push("contact"));
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-01") });

      await updateInteraction(values({ id: "i1" }) as any);
      expect(order).toEqual(["row", "contact"]);
    });

    it("resets done when the step or its date changes, keeps it otherwise", async () => {
      const withStep = {
        ...old,
        nextStep: "Send CV",
        nextStepDate: day("2026-09-12"),
      };
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-30") });

      db.interaction.findFirst.mockResolvedValueOnce(withStep);
      await updateInteraction(
        values({ id: "i1", nextStep: "Send CV", nextStepDate: day("2026-09-12") }) as any,
      );
      expect(db.interaction.update.mock.calls[0][0].data).not.toHaveProperty(
        "nextStepDoneAt",
      );

      db.interaction.findFirst.mockResolvedValueOnce(withStep);
      await updateInteraction(
        values({ id: "i1", nextStep: "Send CV", nextStepDate: day("2026-09-14") }) as any,
      );
      expect(db.interaction.update.mock.calls[1][0].data.nextStepDoneAt).toBeNull();
    });

    it("refuses one that is not the caller's", async () => {
      db.interaction.findFirst.mockResolvedValueOnce(null);
      expect(await updateInteraction(values({ id: "i1" }) as any)).toEqual({
        success: false,
        message: "Interaction not found",
      });
      expect(db.interaction.update).not.toHaveBeenCalled();
    });

    it("requires an id", async () => {
      expect(await updateInteraction(values() as any)).toEqual({
        success: false,
        message: "Please provide an interaction id",
      });
    });
  });
});
