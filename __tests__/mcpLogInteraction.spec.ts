import { handleLogInteraction } from "@/lib/mcp/tools/logInteraction";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { todayLocalMidnight } from "@/lib/networking/dateOnly";
import prisma from "@/lib/db";

// The shared networking core runs for real against this mocked client, so the
// ownership checks and "last contacted" rules below are the ones the UI uses.
vi.mock("@/lib/db", () => {
  const client: any = {
    contact: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    interaction: { findFirst: vi.fn(), create: vi.fn() },
    interactionPurpose: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    job: { count: vi.fn() },
  };
  client.$transaction = vi.fn((fn: any) => fn(client));
  return { default: client };
});

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

const db = prisma as any;
const day = (d: string) => new Date(`${d}T00:00:00`);

const indexRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Sam Lee",
  email: null,
  linkedinUrl: null,
  lastContactedAt: null,
  Company: { label: "Acme" },
  ...over,
});

const base = { contactName: "Sam Lee", purpose: "Coffee Chat", occurredAt: "2026-09-10" };

describe("handleLogInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkMcpRateLimit as any).mockReturnValue({ allowed: true, resetIn: 0 });
    db.contact.findMany.mockResolvedValue([indexRow()]);
    db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Sam Lee", lastContactedAt: null });
    db.contact.findUnique.mockResolvedValue({ lastContactedAt: null });
    db.contact.count.mockResolvedValue(1);
    db.interactionPurpose.count.mockResolvedValue(7);
    db.interactionPurpose.findMany.mockResolvedValue([
      { id: "p1", label: "Coffee Chat", value: "coffee chat" },
    ]);
    db.interactionPurpose.findUnique.mockResolvedValue(null);
    db.interactionPurpose.create.mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    db.interaction.findFirst.mockResolvedValue(null);
    db.interaction.create.mockImplementation(async ({ data }: any) => ({ id: "i1", ...data }));
    db.job.count.mockResolvedValue(1);
  });

  const noWrites = () => {
    expect(db.interaction.create).not.toHaveBeenCalled();
    expect(db.interactionPurpose.create).not.toHaveBeenCalled();
    expect(db.contact.update).not.toHaveBeenCalled();
  };

  it("returns a rate-limit message and writes nothing", async () => {
    (checkMcpRateLimit as any).mockReturnValue({ allowed: false, resetIn: 4000 });
    const res = await handleLogInteraction(base, "user-1");
    expect(res.content[0].text).toBe("Rate limit exceeded. Try again in 4s.");
    noWrites();
  });

  describe("input validation", () => {
    it("needs exactly one of contactId / contactName", async () => {
      for (const input of [
        { purpose: "Coffee Chat" },
        { purpose: "Coffee Chat", contactId: "c1", contactName: "Sam Lee" },
      ]) {
        const res = await handleLogInteraction(input, "user-1");
        expect(res.content[0].text).toContain("exactly one of contactId or contactName");
      }
      noWrites();
    });

    it.each(["10/09/2026", "2026-02-30", "2026-09-10T10:00:00Z"])(
      "rejects malformed occurredAt %j and writes nothing",
      async (occurredAt) => {
        const res = await handleLogInteraction({ ...base, occurredAt }, "user-1");
        expect(res.content[0].text).toContain("occurredAt must be a calendar date in YYYY-MM-DD format");
        noWrites();
      },
    );

    it("rejects malformed nextStepDate", async () => {
      const res = await handleLogInteraction({ ...base, nextStep: "Ping", nextStepDate: "soon" }, "user-1");
      expect(res.content[0].text).toContain("nextStepDate must be a calendar date");
      noWrites();
    });

    it("applies the form rules: a next-step date needs a next step", async () => {
      const res = await handleLogInteraction({ ...base, nextStepDate: "2026-09-20" }, "user-1");
      expect(res.content[0].text).toContain("Describe the next step.");
      noWrites();
    });

    it("applies the form rules: next step cannot precede the interaction", async () => {
      const res = await handleLogInteraction(
        { ...base, nextStep: "Ping", nextStepDate: "2026-09-01" },
        "user-1",
      );
      expect(res.content[0].text).toContain("The next step cannot be before the interaction date.");
      noWrites();
    });

    it("validates before creating a missing purpose", async () => {
      await handleLogInteraction({ ...base, purpose: "Brand New", occurredAt: "nope" }, "user-1");
      expect(db.interactionPurpose.create).not.toHaveBeenCalled();
    });
  });

  describe("resolving the contact by name", () => {
    it("uses a single exact match (case and spacing folded) and logs it", async () => {
      const res = await handleLogInteraction({ ...base, contactName: " sam   LEE" }, "user-1");
      const data = db.interaction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ contactId: "c1", purposeId: "p1", createdBy: "user-1" });
      expect(res.content[0].text).toContain("Logged Coffee Chat with Sam Lee on 2026-09-10 (interaction id: i1)");
    });

    it("returns candidates and writes nothing when two contacts share the name", async () => {
      db.contact.findMany.mockResolvedValue([
        indexRow({ id: "c1", Company: { label: "Acme" } }),
        indexRow({ id: "c2", Company: { label: "Globex" }, lastContactedAt: day("2026-08-01") }),
      ]);
      const res = await handleLogInteraction(base, "user-1");
      const text = res.content[0].text;
      expect(text).toContain('"Sam Lee" matches 2 contacts');
      expect(text).toContain("id: c1, Acme, last contacted: never");
      expect(text).toContain("id: c2, Globex, last contacted: 2026-08-01");
      noWrites();
    });

    it("never accepts a single partial match: returns it as a candidate", async () => {
      db.contact.findMany.mockResolvedValue([indexRow({ id: "c9", name: "Samuel Lee" })]);
      const res = await handleLogInteraction({ ...base, contactName: "Sam" }, "user-1");
      const text = res.content[0].text;
      expect(text).toContain('no contact is named exactly "Sam"');
      expect(text).toContain("Samuel Lee (id: c9, Acme, last contacted: never)");
      expect(text).toContain("contactId");
      noWrites();
    });

    it("does not create the contact when nothing matches; points at add_contact", async () => {
      db.contact.findMany.mockResolvedValue([]);
      const res = await handleLogInteraction(base, "user-1");
      expect(res.content[0].text).toContain("add_contact");
      noWrites();
    });

    it("only searches the token user's contacts", async () => {
      await handleLogInteraction(base, "user-1");
      expect(db.contact.findMany.mock.calls[0][0].where).toEqual({ createdBy: "user-1" });
    });
  });

  describe("ownership", () => {
    it("rejects a contactId that is not the token user's", async () => {
      db.contact.findFirst.mockResolvedValue(null);
      const res = await handleLogInteraction({ purpose: "Coffee Chat", contactId: "other" }, "user-1");
      expect(res.content[0].text).toBe("Error: Contact not found");
      expect(db.contact.findFirst.mock.calls[0][0].where).toEqual({ id: "other", createdBy: "user-1" });
      noWrites();
    });

    it("rejects a jobId that is not the token user's", async () => {
      db.job.count.mockResolvedValue(0);
      const res = await handleLogInteraction({ ...base, jobId: "j-other" }, "user-1");
      expect(db.job.count).toHaveBeenCalledWith({ where: { id: "j-other", userId: "user-1" } });
      expect(res.content[0].text).toBe("Error: Job not found");
      expect(db.interaction.create).not.toHaveBeenCalled();
    });

    it("links a job the user owns", async () => {
      await handleLogInteraction({ ...base, jobId: "j1" }, "user-1");
      expect(db.interaction.create.mock.calls[0][0].data.jobId).toBe("j1");
    });
  });

  describe("purpose", () => {
    it("matches the user's list case-insensitively without creating", async () => {
      await handleLogInteraction({ ...base, purpose: " coffee  chat " }, "user-1");
      expect(db.interactionPurpose.create).not.toHaveBeenCalled();
      expect(db.interaction.create.mock.calls[0][0].data.purposeId).toBe("p1");
    });

    it("creates a missing purpose the way the UI does and says so", async () => {
      const res = await handleLogInteraction({ ...base, purpose: "Conference Chat" }, "user-1");
      expect(db.interactionPurpose.create.mock.calls[0][0].data).toEqual({
        label: "Conference Chat",
        value: "conference chat",
        createdBy: "user-1",
      });
      expect(db.interaction.create.mock.calls[0][0].data.purposeId).toBe("p-new");
      expect(res.content[0].text).toContain('Purpose "Conference Chat" did not exist and was created.');
    });

    it("seeds the defaults on first use, like the purposes page", async () => {
      db.interactionPurpose.count.mockResolvedValue(0);
      await handleLogInteraction(base, "user-1");
      expect(db.interactionPurpose.upsert).toHaveBeenCalledTimes(7);
    });
  });

  describe("idempotency", () => {
    it("returns the existing interaction instead of creating another", async () => {
      db.interaction.findFirst.mockResolvedValue({ id: "i-old" });
      const res = await handleLogInteraction({ ...base, outcome: " Sent CV " }, "user-1");
      expect(db.interaction.findFirst.mock.calls[0][0].where).toEqual({
        createdBy: "user-1",
        contactId: "c1",
        purposeId: "p1",
        occurredAt: day("2026-09-10"),
        outcome: "Sent CV",
      });
      expect(res.content[0].text).toContain("Already logged");
      expect(res.content[0].text).toContain("interaction id: i-old");
      expect(res.content[0].text).toContain("allowDuplicate");
      noWrites();
    });

    it("treats a missing outcome as null when comparing", async () => {
      await handleLogInteraction(base, "user-1");
      expect(db.interaction.findFirst.mock.calls[0][0].where.outcome).toBeNull();
    });

    it("logs another when allowDuplicate is set, without looking", async () => {
      db.interaction.findFirst.mockResolvedValue({ id: "i-old" });
      const res = await handleLogInteraction({ ...base, allowDuplicate: true }, "user-1");
      expect(db.interaction.findFirst).not.toHaveBeenCalled();
      expect(db.interaction.create).toHaveBeenCalledTimes(1);
      expect(res.content[0].text).toContain("Logged Coffee Chat");
    });
  });

  describe("dates and last contacted (same rules as the UI)", () => {
    it("parses occurredAt at server-local midnight", async () => {
      await handleLogInteraction(base, "user-1");
      expect(db.interaction.create.mock.calls[0][0].data.occurredAt.getTime()).toBe(day("2026-09-10").getTime());
    });

    it("defaults occurredAt to today", async () => {
      await handleLogInteraction({ contactName: "Sam Lee", purpose: "Coffee Chat" }, "user-1");
      const at = db.interaction.create.mock.calls[0][0].data.occurredAt;
      expect(at.getTime()).toBe(todayLocalMidnight().getTime());
    });

    it("moves last contacted forward", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-01") });
      db.contact.findFirst.mockResolvedValue({ id: "c1", name: "Sam Lee", lastContactedAt: day("2026-09-10") });
      const res = await handleLogInteraction(base, "user-1");
      expect(db.contact.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { lastContactedAt: day("2026-09-10") },
      });
      expect(res.content[0].text).toContain("Last contacted: 2026-09-10.");
    });

    it("never pulls last contacted back for a backdated entry", async () => {
      db.contact.findUnique.mockResolvedValue({ lastContactedAt: day("2026-09-15") });
      await handleLogInteraction({ ...base, occurredAt: "2026-09-01" }, "user-1");
      expect(db.contact.update).not.toHaveBeenCalled();
    });

    it("does not count a planned (future) interaction yet", async () => {
      await handleLogInteraction({ ...base, occurredAt: "2099-01-01" }, "user-1");
      expect(db.interaction.create).toHaveBeenCalledTimes(1);
      expect(db.contact.update).not.toHaveBeenCalled();
    });
  });

  it("records the next step with its date and reports it", async () => {
    const res = await handleLogInteraction(
      { ...base, outcome: "Went well", nextStep: "Send portfolio", nextStepDate: "2026-09-20" },
      "user-1",
    );
    const data = db.interaction.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ outcome: "Went well", nextStep: "Send portfolio" });
    expect(data.nextStepDate.getTime()).toBe(day("2026-09-20").getTime());
    expect(res.content[0].text).toContain('Next step: "Send portfolio" due 2026-09-20.');
  });

  it("surfaces database errors instead of throwing", async () => {
    db.interaction.create.mockRejectedValue(new Error("boom"));
    const res = await handleLogInteraction(base, "user-1");
    expect(res.content[0].text).toBe("Error: boom");
  });
});
