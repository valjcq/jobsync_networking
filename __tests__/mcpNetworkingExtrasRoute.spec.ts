import { POST } from "@/app/api/mcp/route";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { MCP_TOOL_DESCRIPTIONS } from "@/lib/mcp/toolDescriptions";
import { handleUpdateContact } from "@/lib/mcp/tools/contactEdit";
import { handleGetProfile } from "@/lib/mcp/tools/profileTools";
import { handleAddContactsBatch } from "@/lib/mcp/tools/networkingBatches";

vi.mock("@/lib/mcp/auth", () => ({ resolveMcpToken: vi.fn() }));
vi.mock("@/lib/mcp/tools/contactEdit", () => ({
  handleUpdateContact: vi.fn(),
  handleDeleteContact: vi.fn(),
  handleMergeContacts: vi.fn(),
  handleAddContactNote: vi.fn(),
  handleLinkContactToJob: vi.fn(),
}));
vi.mock("@/lib/mcp/tools/interactionTools", () => ({
  handleUpdateInteraction: vi.fn(),
  handleDeleteInteraction: vi.fn(),
  handleListInteractions: vi.fn(),
}));
vi.mock("@/lib/mcp/tools/listContacts", () => ({ handleListContacts: vi.fn() }));
vi.mock("@/lib/mcp/tools/networkingBatches", () => ({
  handleAddContactsBatch: vi.fn(),
  handleLogInteractionsBatch: vi.fn(),
}));
vi.mock("@/lib/mcp/tools/profileTools", () => ({
  handleGetProfile: vi.fn(),
  handleUpdateProfile: vi.fn(),
}));

const NETWORKING = [
  "update_contact",
  "delete_contact",
  "merge_contacts",
  "add_contact_note",
  "link_contact_to_job",
  "list_contacts",
  "list_interactions",
  "update_interaction",
  "delete_interaction",
  "add_contacts_batch",
  "log_interactions_batch",
] as const;
const PROFILE = ["get_profile", "update_profile"] as const;
// Valid arguments per tool: the SDK validates the shape before the scope gate.
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  update_contact: { contactId: "c1", title: "x" },
  delete_contact: { contactId: "c1" },
  merge_contacts: { keepContactId: "a", mergeContactId: "b" },
  add_contact_note: { contactId: "c1", content: "hi" },
  link_contact_to_job: { contactId: "c1", jobId: "j1" },
  list_contacts: {},
  list_interactions: {},
  update_interaction: { interactionId: "i1", outcome: "x" },
  delete_interaction: { interactionId: "i1" },
  add_contacts_batch: { contacts: [{ name: "Ann" }] },
  log_interactions_batch: { interactions: [{ contactId: "c1", purpose: "Coffee Chat" }] },
  get_profile: {},
  update_profile: { headline: "x" },
};
const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

const authAs = (scopes: string[]) =>
  (resolveMcpToken as any).mockResolvedValue({ ok: true, userId: "user-1", scopes, tokenName: "t" });

async function rpc(method: string, params?: unknown) {
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer jsync_test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return res.json();
}
const call = (name: string, args: Record<string, unknown> = {}) =>
  rpc("tools/call", { name, arguments: args });

describe("contact/interaction/profile tools on the MCP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MCP_ENABLED", "true");
    authAs(["jobs:write", "questions:write", "resume:write", "networking:write", "tasks:write"]);
    (handleUpdateContact as any).mockResolvedValue(ok("updated"));
    (handleGetProfile as any).mockResolvedValue(ok("profile"));
    (handleAddContactsBatch as any).mockResolvedValue(ok("batch"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("registers every new tool with the shared description", async () => {
    const tools: Array<{ name: string; description: string }> = (await rpc("tools/list")).result.tools;
    for (const name of [...NETWORKING, ...PROFILE]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!.description).toBe(MCP_TOOL_DESCRIPTIONS[name]);
    }
  });

  it("exposes the contact status as an enum on add_contact, update_contact and list_contacts", async () => {
    const tools: any[] = (await rpc("tools/list")).result.tools;
    const statuses = ["drafted", "sent", "replied", "meeting_scheduled", "no_reply"];
    for (const name of ["add_contact", "list_contacts"]) {
      expect(tools.find((t) => t.name === name).inputSchema.properties.status.enum).toEqual(statuses);
    }
    expect(JSON.stringify(tools.find((t) => t.name === "update_contact").inputSchema.properties.status)).toContain(
      "meeting_scheduled",
    );
  });

  it.each(NETWORKING)("%s refuses a token without networking:write", async (name) => {
    authAs(["jobs:write", "resume:write"]);
    const body = await call(name, VALID_ARGS[name]);
    expect(body.result.content[0].text).toBe("Insufficient scope. Required: networking:write");
  });

  it.each(PROFILE)("%s refuses a token without resume:write", async (name) => {
    authAs(["networking:write", "jobs:write"]);
    const body = await call(name, VALID_ARGS[name]);
    expect(body.result.content[0].text).toBe("Insufficient scope. Required: resume:write");
    expect(handleGetProfile).not.toHaveBeenCalled();
  });

  it("dispatches with parsed input and the token's userId", async () => {
    await call("update_contact", { contactId: "c1", status: "meeting scheduled", email: null });
    expect(handleUpdateContact).toHaveBeenCalledWith(
      { contactId: "c1", status: "meeting_scheduled", email: null },
      "user-1",
    );
    await call("get_profile");
    expect(handleGetProfile).toHaveBeenCalledWith("user-1");
  });

  it("rejects an invalid status or an oversized or empty batch before any handler runs", async () => {
    const rejected = (body: any) =>
      body.error?.message ?? body.result?.content?.[0]?.text ?? "";
    expect(rejected(await call("update_contact", { contactId: "c1", status: "ghosted" }))).toMatch(
      /Invalid option|Validation error/,
    );
    expect(
      rejected(
        await call("add_contacts_batch", {
          contacts: Array.from({ length: 11 }, (_, i) => ({ name: `P${i}` })),
        }),
      ),
    ).toMatch(/too_big|Too big|<=10|Validation error|at most/i);
    expect(rejected(await call("add_contacts_batch", { contacts: [] }))).toMatch(
      /too_small|Too small|>=1|Validation error|at least/i,
    );
    expect(handleUpdateContact).not.toHaveBeenCalled();
    expect(handleAddContactsBatch).not.toHaveBeenCalled();
  });
});
