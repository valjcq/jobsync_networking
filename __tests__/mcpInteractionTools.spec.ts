import {
  handleDeleteInteraction,
  handleListInteractions,
  handleUpdateInteraction,
} from "@/lib/mcp/tools/interactionTools";
import {
  deleteInteractionForUser,
  updateInteractionForUser,
} from "@/lib/networking/interactions";
import { findPurposeByLabel } from "@/lib/networking/purposeMatch";
import {
  createInteractionPurposeForUser,
  getInteractionPurposesForUser,
} from "@/lib/networking/purposes";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    interaction: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    contact: { count: vi.fn() },
  },
}));
vi.mock("@/lib/networking/interactions", async (orig) => ({
  ...(await orig<typeof import("@/lib/networking/interactions")>()),
  updateInteractionForUser: vi.fn(),
  deleteInteractionForUser: vi.fn(),
}));
vi.mock("@/lib/networking/purposeMatch", () => ({ findPurposeByLabel: vi.fn() }));
vi.mock("@/lib/networking/purposes", () => ({
  createInteractionPurposeForUser: vi.fn(),
  getInteractionPurposesForUser: vi.fn(),
}));
vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const out = (r: any) => r.content[0].text as string;

const existing = {
  contactId: "c1",
  purposeId: "p1",
  occurredAt: new Date(2026, 9, 1),
  outcome: "Chatted",
  nextStep: "Send CV",
  nextStepDate: new Date(2026, 9, 8),
  jobId: null,
  Contact: { name: "Marie" },
  Purpose: { id: "p1", label: "Coffee Chat" },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.interaction.findFirst.mockImplementation(async (args: any) =>
    args.where.id?.not ? null : existing,
  );
  (updateInteractionForUser as any).mockResolvedValue({ id: "i1" });
});

describe("update_interaction", () => {
  it("passes a merged, validated edit to the shared core", async () => {
    const res = await handleUpdateInteraction(
      { interactionId: "i1", outcome: "Agreed to refer me", occurredAt: "2026-10-02" },
      "user-1",
    );
    expect(db.interaction.findFirst.mock.calls[0][0].where).toEqual({ id: "i1", createdBy: "user-1" });
    const [userId, values] = (updateInteractionForUser as any).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(values).toMatchObject({
      id: "i1",
      contact: "c1",
      interactionPurpose: "p1",
      outcome: "Agreed to refer me",
      nextStep: "Send CV",
    });
    expect(values.occurredAt).toEqual(new Date(2026, 9, 2));
    expect(out(res)).toBe("Updated interaction i1 (Coffee Chat, 2026-10-02): occurredAt, outcome.");
  });

  it("clearing the next step also clears its date", async () => {
    await handleUpdateInteraction({ interactionId: "i1", nextStep: null }, "user-1");
    const values = (updateInteractionForUser as any).mock.calls[0][1];
    expect(values.nextStep).toBe("");
    expect(values.nextStepDate).toBeNull();
  });

  it("returns not found and writes nothing", async () => {
    db.interaction.findFirst.mockResolvedValue(null);
    const res = await handleUpdateInteraction({ interactionId: "nope", outcome: "x" }, "user-1");
    expect(out(res)).toBe("Error: Interaction not found");
    expect(updateInteractionForUser).not.toHaveBeenCalled();
  });

  it("applies the form rules (step before the interaction) and a bad date", async () => {
    let res = await handleUpdateInteraction({ interactionId: "i1", occurredAt: "2026-10-20" }, "user-1");
    expect(out(res)).toBe("Validation error: The next step cannot be before the interaction date.");
    res = await handleUpdateInteraction({ interactionId: "i1", occurredAt: "next tuesday" }, "user-1");
    expect(out(res)).toContain("occurredAt must be a calendar date in YYYY-MM-DD");
    res = await handleUpdateInteraction({ interactionId: "i1" }, "user-1");
    expect(out(res)).toBe("Validation error: supply at least one field to change");
    expect(updateInteractionForUser).not.toHaveBeenCalled();
  });

  it("refuses an edit that duplicates another interaction unless allowed", async () => {
    (findPurposeByLabel as any).mockResolvedValue({ id: "p2", label: "Advice Call" });
    db.interaction.findFirst.mockImplementation(async (args: any) =>
      args.where.id?.not ? { id: "i-twin" } : existing,
    );
    let res = await handleUpdateInteraction({ interactionId: "i1", purpose: "advice call" }, "user-1");
    expect(out(res)).toContain("another interaction (id: i-twin)");
    expect(updateInteractionForUser).not.toHaveBeenCalled();
    res = await handleUpdateInteraction(
      { interactionId: "i1", purpose: "advice call", allowDuplicate: true },
      "user-1",
    );
    expect(out(res)).toContain("Updated interaction i1");
  });

  it("creates a missing purpose only after validation and duplicate checks pass", async () => {
    (findPurposeByLabel as any).mockResolvedValue(null);
    (createInteractionPurposeForUser as any).mockResolvedValue({ id: "p9", label: "Reunion" });
    const res = await handleUpdateInteraction({ interactionId: "i1", purpose: "Reunion" }, "user-1");
    expect(createInteractionPurposeForUser).toHaveBeenCalledWith("user-1", "Reunion");
    expect((updateInteractionForUser as any).mock.calls[0][1].interactionPurpose).toBe("p9");
    expect(out(res)).toContain('Purpose "Reunion" did not exist and was created.');
  });

  it("surfaces ownership failures from the shared core (foreign contact)", async () => {
    (updateInteractionForUser as any).mockRejectedValue(new Error("Contact not found"));
    const res = await handleUpdateInteraction({ interactionId: "i1", contactId: "c-foreign" }, "user-1");
    expect(out(res)).toBe("Error: Contact not found");
  });
});

describe("delete_interaction", () => {
  it("deletes through the shared core so last contacted is recalculated", async () => {
    (deleteInteractionForUser as any).mockResolvedValue(undefined);
    const res = await handleDeleteInteraction({ interactionId: "i1" }, "user-1");
    expect(deleteInteractionForUser).toHaveBeenCalledWith("user-1", "i1");
    expect(out(res)).toContain("Deleted Coffee Chat with Marie on 2026-10-01 (interaction id: i1)");
  });

  it("returns not found without deleting", async () => {
    db.interaction.findFirst.mockResolvedValue(null);
    const res = await handleDeleteInteraction({ interactionId: "nope" }, "user-1");
    expect(out(res)).toBe("Error: Interaction not found");
    expect(deleteInteractionForUser).not.toHaveBeenCalled();
  });
});

describe("list_interactions", () => {
  const listed = {
    id: "i1",
    occurredAt: new Date(2026, 9, 1),
    outcome: "Chatted",
    nextStep: "Send CV",
    nextStepDate: new Date(2026, 9, 8),
    nextStepDoneAt: null,
    Contact: { id: "c1", name: "Marie", Company: { label: "Acme" } },
    Purpose: { id: "p1", label: "Coffee Chat" },
    Job: null,
  };

  it("filters by contact, purpose and date range, scoped to the user", async () => {
    db.contact.count.mockResolvedValue(1);
    (findPurposeByLabel as any).mockResolvedValue({ id: "p1", label: "Coffee Chat" });
    db.interaction.findMany.mockResolvedValue([listed]);
    db.interaction.count.mockResolvedValue(1);
    const res = await handleListInteractions(
      { contactId: "c1", purpose: "coffee chat", occurredAfter: "2026-09-28", occurredBefore: "2026-10-04", openNextStepOnly: true },
      "user-1",
    );
    const where = db.interaction.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ createdBy: "user-1", contactId: "c1", purposeId: "p1", nextStep: { not: null }, nextStepDoneAt: null });
    expect(where.occurredAt).toEqual({ gte: new Date(2026, 8, 28), lte: new Date(2026, 9, 4) });
    expect(out(res)).toBe(
      "1 interaction, newest first:\n- 2026-10-01 Coffee Chat with Marie (Acme): Chatted [next step: Send CV due 2026-10-08] (interaction id: i1, contact id: c1)",
    );
  });

  it("says when nothing matches, and when the purpose or contact does not exist", async () => {
    db.interaction.findMany.mockResolvedValue([]);
    db.interaction.count.mockResolvedValue(0);
    expect(out(await handleListInteractions({}, "user-1"))).toBe("No interactions match.");

    (findPurposeByLabel as any).mockResolvedValue(null);
    (getInteractionPurposesForUser as any).mockResolvedValue([{ label: "Coffee Chat" }, { label: "Follow-up" }]);
    expect(out(await handleListInteractions({ purpose: "lunch" }, "user-1"))).toBe(
      'No interactions: there is no purpose named "lunch". Purposes: Coffee Chat, Follow-up.',
    );

    db.contact.count.mockResolvedValue(0);
    expect(out(await handleListInteractions({ contactId: "ghost" }, "user-1"))).toBe(
      "Error: Contact not found (id: ghost)",
    );
  });

  it("rejects a reversed range and a malformed date; reports truncation", async () => {
    expect(out(await handleListInteractions({ occurredAfter: "2026-10-05", occurredBefore: "2026-10-01" }, "user-1"))).toBe(
      "Validation error: occurredAfter cannot be later than occurredBefore",
    );
    expect(out(await handleListInteractions({ occurredAfter: "10/05" }, "user-1"))).toContain(
      "occurredAfter must be a calendar date",
    );
    db.interaction.findMany.mockResolvedValue([listed]);
    db.interaction.count.mockResolvedValue(40);
    expect(out(await handleListInteractions({ limit: 1 }, "user-1"))).toContain("1 of 40 interactions, newest first:");
  });
});
