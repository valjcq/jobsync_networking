import {
  handleAddContactsBatch,
  handleLogInteractionsBatch,
} from "@/lib/mcp/tools/networkingBatches";
import { handleAddContact } from "@/lib/mcp/tools/addContact";
import { handleLogInteraction } from "@/lib/mcp/tools/logInteraction";

vi.mock("@/lib/mcp/tools/addContact", () => ({ handleAddContact: vi.fn() }));
vi.mock("@/lib/mcp/tools/logInteraction", () => ({ handleLogInteraction: vi.fn() }));

const ok = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const out = (r: any) => r.content[0].text as string;

beforeEach(() => vi.clearAllMocks());

describe("add_contacts_batch", () => {
  it("runs each item through add_contact in order with the token's user, labelled", async () => {
    (handleAddContact as any)
      .mockResolvedValueOnce(ok('Added contact "Ann" (id: c1).'))
      .mockResolvedValueOnce(ok('Added contact "Bob" (id: c2).'));
    const res = await handleAddContactsBatch(
      { contacts: [{ name: "Ann", status: "drafted" }, { name: "Bob" }] },
      "user-1",
    );
    expect(handleAddContact).toHaveBeenNthCalledWith(1, { name: "Ann", status: "drafted" }, "user-1");
    expect(handleAddContact).toHaveBeenNthCalledWith(2, { name: "Bob" }, "user-1");
    expect(out(res)).toBe(
      '[1/2] Ann: Added contact "Ann" (id: c1).\n\n[2/2] Bob: Added contact "Bob" (id: c2).',
    );
  });

  it("a refused duplicate or a thrown error does not stop the remaining items", async () => {
    (handleAddContact as any)
      .mockResolvedValueOnce(ok("No contact created: 1 existing contact may be the same person:\n- Ann (id: c0)"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(ok("Added contact"));
    const res = await handleAddContactsBatch(
      { contacts: [{ name: "Ann" }, { name: "Bob" }, { name: "Cy" }] },
      "user-1",
    );
    expect(handleAddContact).toHaveBeenCalledTimes(3);
    expect(out(res)).toContain("[1/3] Ann: No contact created");
    expect(out(res)).toContain("[2/3] Bob: Error: boom");
    expect(out(res)).toContain("[3/3] Cy: Added contact");
  });

  it("stops at the rate limit and says how many were not attempted", async () => {
    (handleAddContact as any)
      .mockResolvedValueOnce(ok("Added contact"))
      .mockResolvedValueOnce(ok("Rate limit exceeded. Try again in 30s."));
    const res = await handleAddContactsBatch(
      { contacts: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }] },
      "user-1",
    );
    expect(handleAddContact).toHaveBeenCalledTimes(2);
    expect(out(res)).toContain("Stopped after the rate limit — 2 item(s) not attempted.");
  });
});

describe("log_interactions_batch", () => {
  it("runs each item through log_interaction and labels by contact and purpose", async () => {
    (handleLogInteraction as any)
      .mockResolvedValueOnce(ok("Logged Coffee Chat with Ann"))
      .mockResolvedValueOnce(ok("Already logged: Follow-up with Bob"))
      .mockResolvedValueOnce(ok('Nothing logged: no contact matches "Zed".'));
    const res = await handleLogInteractionsBatch(
      {
        interactions: [
          { contactName: "Ann", purpose: "Coffee Chat" },
          { contactId: "c2", purpose: "Follow-up" },
          { contactName: "Zed", purpose: "Thank-you" },
        ],
      },
      "user-1",
    );
    expect(handleLogInteraction).toHaveBeenNthCalledWith(2, { contactId: "c2", purpose: "Follow-up" }, "user-1");
    expect(out(res)).toBe(
      "[1/3] Ann — Coffee Chat: Logged Coffee Chat with Ann\n\n" +
        "[2/3] c2 — Follow-up: Already logged: Follow-up with Bob\n\n" +
        '[3/3] Zed — Thank-you: Nothing logged: no contact matches "Zed".',
    );
  });

  it("stops at the rate limit", async () => {
    (handleLogInteraction as any).mockResolvedValue(ok("Rate limit exceeded. Try again in 5s."));
    const res = await handleLogInteractionsBatch(
      { interactions: [{ contactId: "a", purpose: "x" }, { contactId: "b", purpose: "x" }] },
      "user-1",
    );
    expect(handleLogInteraction).toHaveBeenCalledTimes(1);
    expect(out(res)).toContain("1 item(s) not attempted");
  });
});
