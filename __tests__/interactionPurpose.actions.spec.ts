import {
  getInteractionPurposes,
  createInteractionPurpose,
  renameInteractionPurpose,
  deleteInteractionPurposeById,
} from "@/actions/interactionPurpose.actions";
import { INTERACTION_PURPOSES } from "@/lib/constants";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";
import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    interactionPurpose: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    interaction: { count: vi.fn() },
  },
}));

vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as any;
const user = { id: "user-1" };

describe("interactionPurpose actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(user);
    db.interactionPurpose.findMany.mockResolvedValue([]);
  });

  it("keeps every default's value equal to its canonical label", () => {
    for (const p of INTERACTION_PURPOSES) {
      expect(p.value).toBe(canonicalizeEntityValue(p.label));
    }
  });

  describe("lazy seeding", () => {
    it("seeds one upsert per default when the user has none", async () => {
      db.interactionPurpose.count.mockResolvedValue(0);
      await getInteractionPurposes();
      expect(db.interactionPurpose.upsert).toHaveBeenCalledTimes(
        INTERACTION_PURPOSES.length,
      );
      expect(db.interactionPurpose.upsert).toHaveBeenCalledWith({
        where: {
          value_createdBy: { value: "cold application", createdBy: user.id },
        },
        update: {},
        create: {
          label: "Cold Application",
          value: "cold application",
          createdBy: user.id,
        },
      });
    });

    it("does not seed again once the user has purposes", async () => {
      db.interactionPurpose.count.mockResolvedValue(3);
      await getInteractionPurposes();
      expect(db.interactionPurpose.upsert).not.toHaveBeenCalled();
    });

    it("reads only the caller's purposes", async () => {
      db.interactionPurpose.count.mockResolvedValue(3);
      await getInteractionPurposes();
      expect(db.interactionPurpose.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdBy: user.id } }),
      );
    });
  });

  describe("create", () => {
    it("returns the existing purpose instead of a duplicate", async () => {
      const existing = { id: "p1", label: "Coffee Chat", value: "coffee chat" };
      db.interactionPurpose.findUnique.mockResolvedValue(existing);
      const res = await createInteractionPurpose("  coffee  CHAT ");
      expect(res).toEqual({ success: true, data: existing });
      expect(db.interactionPurpose.create).not.toHaveBeenCalled();
    });

    it("creates with the canonical value and the trimmed label", async () => {
      db.interactionPurpose.findUnique.mockResolvedValue(null);
      db.interactionPurpose.create.mockResolvedValue({ id: "p9" });
      await createInteractionPurpose("  Conference Intro ");
      expect(db.interactionPurpose.create).toHaveBeenCalledWith({
        data: {
          label: "Conference Intro",
          value: "conference intro",
          createdBy: user.id,
        },
      });
    });

    it("returns the winner when a concurrent create loses the race", async () => {
      const winner = { id: "p2" };
      db.interactionPurpose.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      db.interactionPurpose.create.mockRejectedValue({ code: "P2002" });
      expect(await createInteractionPurpose("x")).toEqual({
        success: true,
        data: winner,
      });
    });

    it("rejects an empty label", async () => {
      expect(await createInteractionPurpose("   ")).toEqual({
        success: false,
        message: "A non-empty label is required",
      });
    });
  });

  describe("rename", () => {
    it("refuses a name another purpose already has", async () => {
      db.interactionPurpose.findFirst.mockResolvedValue({ id: "other" });
      const res = await renameInteractionPurpose("p1", "Advice Call");
      expect(res.success).toBe(false);
      expect(db.interactionPurpose.updateMany).not.toHaveBeenCalled();
    });

    it("renames only the caller's purpose", async () => {
      db.interactionPurpose.findFirst.mockResolvedValue(null);
      db.interactionPurpose.updateMany.mockResolvedValue({ count: 1 });
      await renameInteractionPurpose("p1", "Warm Intro");
      expect(db.interactionPurpose.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", createdBy: user.id },
        data: { label: "Warm Intro", value: "warm intro" },
      });
    });
  });

  describe("delete", () => {
    it("blocks deleting a purpose that is in use, with a count", async () => {
      db.interaction.count.mockResolvedValue(2);
      const res = await deleteInteractionPurposeById("p1");
      expect(res.success).toBe(false);
      expect(res.message).toContain("2 interactions");
      expect(db.interactionPurpose.deleteMany).not.toHaveBeenCalled();
    });

    it("says 'interaction' for exactly one", async () => {
      db.interaction.count.mockResolvedValue(1);
      const res = await deleteInteractionPurposeById("p1");
      expect(res.message).toContain("1 interaction using");
    });

    it("deletes an unused purpose, scoped to the caller", async () => {
      db.interaction.count.mockResolvedValue(0);
      db.interactionPurpose.deleteMany.mockResolvedValue({ count: 1 });
      expect(await deleteInteractionPurposeById("p1")).toEqual({ success: true });
      expect(db.interactionPurpose.deleteMany).toHaveBeenCalledWith({
        where: { id: "p1", createdBy: user.id },
      });
    });

    it("refuses without a session", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      expect(await deleteInteractionPurposeById("p1")).toEqual({
        success: false,
        message: "Not authenticated",
      });
    });
  });
});
