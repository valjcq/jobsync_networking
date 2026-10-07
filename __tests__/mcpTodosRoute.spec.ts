import { POST } from "@/app/api/mcp/route";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { MCP_TOOL_DESCRIPTIONS } from "@/lib/mcp/toolDescriptions";
import { handleSearch } from "@/lib/mcp/tools/search";
import { handleAddTodo, handleCompleteTodo, handleListTodos, handleUpdateTodo } from "@/lib/mcp/tools/todos";
import { handleAddJobNote, handleGetJob, handleSetJobStatus } from "@/lib/mcp/tools/jobTools";
import { handleCompleteFollowup, handleGetContact } from "@/lib/mcp/tools/contactTools";

vi.mock("@/lib/mcp/auth", () => ({ resolveMcpToken: vi.fn() }));
vi.mock("@/lib/mcp/tools/search", () => ({ handleSearch: vi.fn() }));
vi.mock("@/lib/mcp/tools/todos", () => ({
  handleAddTodo: vi.fn(),
  handleListTodos: vi.fn(),
  handleUpdateTodo: vi.fn(),
  handleCompleteTodo: vi.fn(),
}));
vi.mock("@/lib/mcp/tools/jobTools", () => ({
  handleGetJob: vi.fn(),
  handleSetJobStatus: vi.fn(),
  handleAddJobNote: vi.fn(),
}));
vi.mock("@/lib/mcp/tools/contactTools", () => ({
  handleGetContact: vi.fn(),
  handleCompleteFollowup: vi.fn(),
}));

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const OLD_SCOPES = ["jobs:write", "questions:write", "resume:write", "networking:write"];
const ALL_SCOPES = [...OLD_SCOPES, "tasks:write"];

const authAs = (scopes: string[]) =>
  (resolveMcpToken as any).mockResolvedValue({ ok: true, userId: "user-1", scopes, tokenName: "my-token" });

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
const call = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });

const NEW_TOOLS = [
  "search",
  "add_todo",
  "list_todos",
  "update_todo",
  "complete_todo",
  "get_job",
  "set_job_status",
  "add_job_note",
  "get_contact",
  "complete_followup",
] as const;

// Smallest valid arguments for each tool.
const ARGS: Record<string, Record<string, unknown>> = {
  search: { query: "acme" },
  add_todo: { title: "Call Marie" },
  list_todos: {},
  update_todo: { todoId: "t1", title: "New title" },
  complete_todo: { todoId: "t1" },
  get_job: { jobId: "j1" },
  set_job_status: { jobId: "j1", status: "Applied" },
  add_job_note: { jobId: "j1", content: "hello" },
  get_contact: { contactId: "c1" },
  complete_followup: { interactionId: "i1" },
};

const HANDLERS = [
  handleSearch, handleAddTodo, handleListTodos, handleUpdateTodo, handleCompleteTodo,
  handleGetJob, handleSetJobStatus, handleAddJobNote, handleGetContact, handleCompleteFollowup,
];

describe("search, todo and job/contact tools on the MCP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MCP_ENABLED", "true");
    authAs(ALL_SCOPES);
    for (const h of HANDLERS) (h as any).mockResolvedValue(ok("done"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("registers every tool with the shared description", async () => {
    const body = await rpc("tools/list");
    const tools: Array<{ name: string; description: string }> = body.result.tools;
    for (const name of NEW_TOOLS) {
      expect(tools.find((t) => t.name === name)?.description, name).toBe(MCP_TOOL_DESCRIPTIONS[name]);
    }
  });

  describe("scope", () => {
    it.each(["add_todo", "list_todos", "update_todo", "complete_todo"])(
      "%s refuses a token created before tasks:write existed",
      async (name) => {
        authAs(OLD_SCOPES);
        const body = await call(name, ARGS[name]);
        expect(body.result.content[0].text).toBe("Insufficient scope. Required: tasks:write");
        for (const h of HANDLERS) expect(h).not.toHaveBeenCalled();
      },
    );

    it.each(["get_job", "set_job_status", "add_job_note"])("%s needs jobs:write", async (name) => {
      authAs(["networking:write", "tasks:write"]);
      const body = await call(name, ARGS[name]);
      expect(body.result.content[0].text).toBe("Insufficient scope. Required: jobs:write");
      for (const h of HANDLERS) expect(h).not.toHaveBeenCalled();
    });

    it.each(["get_contact", "complete_followup"])("%s needs networking:write", async (name) => {
      authAs(["jobs:write", "tasks:write"]);
      const body = await call(name, ARGS[name]);
      expect(body.result.content[0].text).toBe("Insufficient scope. Required: networking:write");
      for (const h of HANDLERS) expect(h).not.toHaveBeenCalled();
    });

    it("search works with any one of the three scopes and passes them to the handler", async () => {
      authAs(["tasks:write"]);
      await call("search", ARGS.search);
      expect(handleSearch).toHaveBeenCalledWith({ query: "acme" }, "user-1", ["tasks:write"]);
    });

    it("search refuses a token with none of them", async () => {
      authAs(["questions:write", "resume:write"]);
      const body = await call("search", ARGS.search);
      expect(body.result.content[0].text).toContain("Insufficient scope");
      expect(handleSearch).not.toHaveBeenCalled();
    });

    it("an old token keeps its existing tools", async () => {
      authAs(OLD_SCOPES);
      const body = await rpc("tools/list");
      expect(body.result.tools.map((t: any) => t.name)).toEqual(
        expect.arrayContaining(["add_job", "find_contact", "log_interaction"]),
      );
    });
  });

  describe("dispatch", () => {
    it("add_todo gets the parsed input, the token's userId and its name", async () => {
      await call("add_todo", { title: "Call Marie", dueDate: "2026-10-12", jobId: "j1" });
      expect(handleAddTodo).toHaveBeenCalledWith(
        { title: "Call Marie", dueDate: "2026-10-12", jobId: "j1" },
        "user-1",
        "my-token",
      );
    });

    it("update_todo keeps null as an explicit clear", async () => {
      await call("update_todo", { todoId: "t1", dueDate: null, jobId: null });
      expect(handleUpdateTodo).toHaveBeenCalledWith({ todoId: "t1", dueDate: null, jobId: null }, "user-1");
    });

    it("set_job_status folds the status case", async () => {
      await call("set_job_status", { jobId: "j1", status: "Interview" });
      expect(handleSetJobStatus).toHaveBeenCalledWith({ jobId: "j1", status: "interview" }, "user-1");
    });

    it("rejects an unknown status and a short todo title before any handler runs", async () => {
      const bad = await call("set_job_status", { jobId: "j1", status: "winning" });
      expect(JSON.stringify(bad)).toMatch(/Validation error|Invalid/i);
      const short = await call("add_todo", { title: "x" });
      expect(JSON.stringify(short)).toMatch(/at least 2 characters/);
      expect(handleSetJobStatus).not.toHaveBeenCalled();
      expect(handleAddTodo).not.toHaveBeenCalled();
    });
  });

  describe("descriptions", () => {
    const d = MCP_TOOL_DESCRIPTIONS;

    it("search: use it for anything named without an id, never pick between candidates, confirm fuzzy", () => {
      expect(d.search).toContain("whenever the user names something without giving an id");
      expect(d.search).toContain("Never pick between several candidates");
      expect(d.search).toContain("fuzzy");
    });

    it("find_job points at search for name lookups", () => {
      expect(d.find_job).toContain("use search");
    });

    it("add_todo: ids from search, names only when unique, dedupe, YYYY-MM-DD", () => {
      expect(d.add_todo).toContain("search");
      expect(d.add_todo).toContain("exactly one record");
      expect(d.add_todo).toContain("allowDuplicate");
      expect(d.add_todo).toContain("YYYY-MM-DD");
    });
  });
});
