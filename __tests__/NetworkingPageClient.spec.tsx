import NetworkingPageClient from "@/app/dashboard/networking/NetworkingPageClient";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getInteractionList,
  getNetworkingContacts,
  getFollowUps,
  deleteInteractionById,
} from "@/actions/interaction.actions";

vi.mock("@/actions/interaction.actions", () => ({
  getInteractionList: vi.fn(),
  getNetworkingContacts: vi.fn(),
  getFollowUps: vi.fn(),
  getJobRefs: vi.fn(),
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  deleteInteractionById: vi.fn(),
  markNextStepDone: vi.fn(),
}));

vi.mock("@/actions/interactionPurpose.actions", () => ({
  getInteractionPurposes: vi.fn().mockResolvedValue([]),
  createInteractionPurpose: vi.fn(),
  renameInteractionPurpose: vi.fn(),
  deleteInteractionPurposeById: vi.fn(),
}));

vi.mock("@/actions/company.actions", () => ({
  getAllCompanies: vi.fn().mockResolvedValue([]),
  addCompany: vi.fn(),
}));

vi.mock("@/actions/jobLocation.actions", () => ({
  getAllJobLocations: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/actions/contact.actions", () => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastActionResult: vi.fn((res, opts) => res?.success && opts.onSuccess?.()),
}));

const contacts = [
  {
    id: "c1",
    name: "Pat Lee",
    title: "Recruiter",
    Company: { id: "co1", label: "Acme" },
    Role: null,
    lastContactedAt: new Date("2026-09-10T00:00:00"),
    _count: { interactions: 2 },
    openSteps: 1,
  },
  {
    id: "c2",
    name: "Sam Ortiz",
    title: null,
    Company: null,
    Role: null,
    lastContactedAt: null,
    _count: { interactions: 0 },
    openSteps: 0,
  },
] as any;

const purposes = [
  { id: "p1", label: "Advice Call", value: "advice call", createdBy: "u1" },
  { id: "p2", label: "Follow-up", value: "follow-up", createdBy: "u1" },
];

const interaction = {
  id: "i1",
  contactId: "c1",
  Contact: { id: "c1", name: "Pat Lee", Company: { label: "Acme" } },
  purposeId: "p1",
  Purpose: { id: "p1", label: "Advice Call" },
  occurredAt: new Date("2026-09-10T00:00:00"),
  outcome: "Went well",
  nextStep: "Send CV",
  nextStepDate: new Date("2026-09-12T00:00:00"),
  nextStepDoneAt: null,
  jobId: null,
  Job: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const renderPage = (over: Record<string, unknown> = {}) =>
  render(
    <NetworkingPageClient
      contacts={contacts}
      followUps={[]}
      purposes={purposes as any}
      jobs={[]}
      roles={[]}
      {...over}
    />,
  );

describe("NetworkingPageClient", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    vi.clearAllMocks();
    (getInteractionList as any).mockResolvedValue({ data: [interaction], total: 1 });
    (getNetworkingContacts as any).mockResolvedValue({ data: contacts });
    (getFollowUps as any).mockResolvedValue({ data: [] });
  });

  it("lists the people with organization, last contacted and open steps", async () => {
    renderPage();
    const panel = within(screen.getByTestId("networking-contacts"));
    expect(panel.getByText("Pat Lee")).toBeInTheDocument();
    expect(panel.getByText("Recruiter · Acme")).toBeInTheDocument();
    expect(panel.getByText(/Last contacted Sep 10, 2026/)).toBeInTheDocument();
    expect(panel.getByText("1 open")).toBeInTheDocument();
    expect(panel.getByText(/Last contacted never/)).toBeInTheDocument();
    await screen.findByText("Went well");
  });

  it("shows every interaction first, then narrows to the picked person", async () => {
    renderPage();
    await screen.findByText("Went well");
    expect(getInteractionList).toHaveBeenLastCalledWith(1, 25, undefined, undefined);

    // Anchored to the start: the row's own accessible name begins with the
    // contact's name, while the row's "Edit" button's name (e.g. "Edit Pat
    // Lee") would otherwise also match a loose /pat lee/i search.
    await user.click(screen.getByRole("button", { name: /^pat lee/i }));

    await waitFor(() =>
      expect(getInteractionList).toHaveBeenLastCalledWith(1, 25, "c1", undefined),
    );
    expect(await screen.findByText("Interactions with Pat Lee")).toBeInTheDocument();
  });

  it("narrows the timeline by purpose", async () => {
    renderPage();
    await screen.findByText("Went well");

    await user.selectOptions(screen.getByLabelText("Filter by purpose"), "p2");

    await waitFor(() =>
      expect(getInteractionList).toHaveBeenLastCalledWith(1, 25, undefined, "p2"),
    );
  });

  it("filters the people by name", async () => {
    renderPage();
    await user.type(screen.getByPlaceholderText("Search people..."), "sam");
    const panel = within(screen.getByTestId("networking-contacts"));
    expect(panel.queryByText("Pat Lee")).not.toBeInTheDocument();
    expect(panel.getByText("Sam Ortiz")).toBeInTheDocument();
  });

  it("shows the timeline's step with its date and a mark-done control", async () => {
    renderPage();
    const row = await screen.findByText(/Next: Send CV/);
    expect(row).toHaveTextContent("Sep 12, 2026");
    expect(screen.getByRole("button", { name: /mark done/i })).toBeInTheDocument();
  });

  it("reloads people, follow-ups and the timeline after a delete", async () => {
    (deleteInteractionById as any).mockResolvedValue({ success: true });
    renderPage();
    await screen.findByText("Went well");

    await user.click(screen.getByRole("button", { name: /delete interaction/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteInteractionById).toHaveBeenCalledWith("i1");
    await waitFor(() => expect(getNetworkingContacts).toHaveBeenCalled());
    expect(getFollowUps).toHaveBeenCalled();
    // initial load plus the reload
    await waitFor(() => expect(getInteractionList).toHaveBeenCalledTimes(2));
  });

  it("opens the log dialog", async () => {
    renderPage();
    await user.click(screen.getByTestId("log-interaction-btn"));
    expect(await screen.findByRole("dialog", { name: /log interaction/i })).toBeInTheDocument();
  });

  it("opens the purpose manager with use counts", async () => {
    renderPage({
      purposes: [{ ...purposes[0], _count: { interactions: 4 } }],
    });
    await user.click(screen.getByRole("button", { name: /^purposes$/i }));
    const dialog = await screen.findByRole("dialog", { name: /purposes/i });
    expect(within(dialog).getByText("4 used")).toBeInTheDocument();
  });
});
