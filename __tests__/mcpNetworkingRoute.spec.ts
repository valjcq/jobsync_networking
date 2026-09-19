import { POST } from "@/app/api/mcp/route";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { MCP_TOOL_DESCRIPTIONS } from "@/lib/mcp/toolDescriptions";
import { handleFindContact } from "@/lib/mcp/tools/findContact";
import { handleAddContact } from "@/lib/mcp/tools/addContact";
import { handleLogInteraction } from "@/lib/mcp/tools/logInteraction";
import { handleListFollowups } from "@/lib/mcp/tools/listFollowups";
import { createMcpToken } from "@/actions/mcpToken.actions";
import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";

vi.mock("@/lib/mcp/auth", () => ({ resolveMcpToken: vi.fn() }));
vi.mock("@/lib/mcp/tools/findContact", () => ({ handleFindContact: vi.fn() }));
vi.mock("@/lib/mcp/tools/addContact", () => ({ handleAddContact: vi.fn() }));
vi.mock("@/lib/mcp/tools/logInteraction", () => ({ handleLogInteraction: vi.fn() }));
vi.mock("@/lib/mcp/tools/listFollowups", () => ({ handleListFollowups: vi.fn() }));
vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: { mcpAccessToken: { count: vi.fn(), create: vi.fn() } },
}));

const db = prisma as any;
const OLD_SCOPES = ["jobs:write", "questions:write", "resume:write"];
const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

const authAs = (scopes: string[]) =>
  (resolveMcpToken as any).mockResolvedValue({
    ok: true,
    userId: "user-1",
    scopes,
    tokenName: "my-token",
  });

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

const NETWORKING_TOOLS = ["find_contact", "add_contact", "log_interaction", "list_followups"] as const;

describe("networking tools on the MCP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MCP_ENABLED", "true");
    authAs([...OLD_SCOPES, "networking:write"]);
    (handleFindContact as any).mockResolvedValue(ok("found"));
    (handleAddContact as any).mockResolvedValue(ok("added"));
    (handleLogInteraction as any).mockResolvedValue(ok("logged"));
    (handleListFollowups as any).mockResolvedValue(ok("followups"));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("registers the four tools with the shared descriptions", async () => {
    const body = await rpc("tools/list");
    const tools: Array<{ name: string; description: string; inputSchema: any }> = body.result.tools;
    for (const name of NETWORKING_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!.description).toBe(MCP_TOOL_DESCRIPTIONS[name]);
    }
    const log = tools.find((t) => t.name === "log_interaction")!;
    expect(log.inputSchema.required).toEqual(["purpose"]);
    expect(Object.keys(log.inputSchema.properties)).toEqual(
      expect.arrayContaining(["contactId", "contactName", "occurredAt", "nextStepDate", "allowDuplicate"]),
    );
  });

  describe("scope", () => {
    it.each(NETWORKING_TOOLS)("%s refuses a token without networking:write", async (name) => {
      authAs(OLD_SCOPES);
      const body = await call(name, { query: "sam", name: "Sam", purpose: "Coffee Chat", contactId: "c1" });
      expect(body.result.content[0].text).toBe("Insufficient scope. Required: networking:write");
      for (const h of [handleFindContact, handleAddContact, handleLogInteraction, handleListFollowups]) {
        expect(h).not.toHaveBeenCalled();
      }
    });

    it("does not accept the wrong scope for these tools (jobs:write alone is not enough)", async () => {
      authAs(["jobs:write"]);
      const body = await call("find_contact", { query: "sam" });
      expect(body.result.content[0].text).toContain("Insufficient scope");
    });

    it("a token without the new scope keeps working for the existing tools", async () => {
      authAs(OLD_SCOPES);
      const body = await rpc("tools/list");
      expect(body.result.tools.map((t: any) => t.name)).toEqual(
        expect.arrayContaining(["add_job", "find_job", "add_question", "review_resume"]),
      );
    });
  });

  describe("dispatch", () => {
    it("find_contact passes parsed input and the token's userId", async () => {
      const body = await call("find_contact", { query: "sam", limit: 5 });
      expect(handleFindContact).toHaveBeenCalledWith({ query: "sam", limit: 5 }, "user-1");
      expect(body.result.content[0].text).toBe("found");
    });

    it("add_contact passes parsed input and the token's userId", async () => {
      await call("add_contact", { name: "Sam Lee", company: "Acme", allowDuplicate: true });
      expect(handleAddContact).toHaveBeenCalledWith(
        { name: "Sam Lee", company: "Acme", allowDuplicate: true },
        "user-1",
      );
    });

    it("log_interaction passes parsed input and the token's userId", async () => {
      await call("log_interaction", { contactId: "c1", purpose: "Coffee Chat", occurredAt: "2026-09-10" });
      expect(handleLogInteraction).toHaveBeenCalledWith(
        { contactId: "c1", purpose: "Coffee Chat", occurredAt: "2026-09-10" },
        "user-1",
      );
    });

    it("list_followups takes no input and uses the token's userId", async () => {
      const body = await call("list_followups");
      expect(handleListFollowups).toHaveBeenCalledWith("user-1");
      expect(body.result.content[0].text).toBe("followups");
    });

    it("keeps a malformed date for the handler to reject with its own message", async () => {
      await call("log_interaction", { contactId: "c1", purpose: "Coffee Chat", occurredAt: "10/09/2026" });
      expect(handleLogInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ occurredAt: "10/09/2026" }),
        "user-1",
      );
    });
  });

  describe("descriptions", () => {
    const d = MCP_TOOL_DESCRIPTIONS;

    it("log_interaction: find_contact first, never guess, show candidates, dates, source facts, idempotency", () => {
      expect(d.log_interaction).toContain("Call find_contact first");
      expect(d.log_interaction).toContain("Never guess a contact");
      expect(d.log_interaction).toContain("show them to the user");
      expect(d.log_interaction).toContain("YYYY-MM-DD");
      expect(d.log_interaction).toContain("Only record facts present in the source material");
      expect(d.log_interaction).toContain("allowDuplicate");
    });

    it("find_contact: called before log_interaction, never guess, show candidates", () => {
      expect(d.find_contact).toContain("before log_interaction");
      expect(d.find_contact).toContain("Never guess a contact");
      expect(d.find_contact).toContain("show the candidates to the user");
    });

    it("add_contact: refuses duplicates unless allowDuplicate, source facts, dates", () => {
      expect(d.add_contact).toContain("Refuses to create");
      expect(d.add_contact).toContain("allowDuplicate");
      expect(d.add_contact).toContain("Only record facts present in the source material");
      expect(d.add_contact).toContain("YYYY-MM-DD");
    });
  });
});

describe("new tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue({ id: "user-1" });
    db.mcpAccessToken.count.mockResolvedValue(0);
    db.mcpAccessToken.create.mockImplementation(async ({ data }: any) => ({
      id: "t1",
      createdAt: new Date(),
      lastUsedAt: null,
      ...data,
    }));
  });

  it("are issued with networking:write alongside the existing scopes", async () => {
    const res = await createMcpToken({ name: "agent", expiryDays: 30 });
    expect(res.success).toBe(true);
    const scopes = JSON.parse(db.mcpAccessToken.create.mock.calls[0][0].data.scopes);
    expect(scopes).toEqual(["jobs:write", "questions:write", "resume:write", "networking:write"]);
  });
});
