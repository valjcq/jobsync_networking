import InteractionForm from "@/components/networking/InteractionForm";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createInteraction,
  updateInteraction,
} from "@/actions/interaction.actions";

vi.mock("@/actions/interaction.actions", () => ({
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
}));

vi.mock("@/actions/interactionPurpose.actions", () => ({
  createInteractionPurpose: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastActionResult: vi.fn((res, opts) => res?.success && opts.onSuccess?.()),
}));

const contacts = [
  { id: "c1", name: "Pat Lee", Company: { id: "co1", label: "Acme" } },
] as any;
const purposes = [{ id: "p1", label: "Advice Call", value: "advice call" }] as any;
const jobs = [{ id: "j1", label: "Dev @ Acme", value: "dev @ acme" }];

const editing = {
  id: "i1",
  contactId: "c1",
  purposeId: "p1",
  occurredAt: new Date("2026-09-10T00:00:00"),
  outcome: "Went well",
  nextStep: "Send CV",
  nextStepDate: new Date("2026-09-12T00:00:00"),
  jobId: "j1",
} as any;

const renderForm = (over: Record<string, unknown> = {}) => {
  const props = {
    open: true,
    setOpen: vi.fn(),
    editInteraction: null,
    contacts,
    purposes,
    jobs,
    onSaved: vi.fn(),
    ...over,
  };
  render(<InteractionForm {...(props as any)} />);
  return props;
};

describe("InteractionForm", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => vi.clearAllMocks());

  it("asks for a contact and a purpose before saving", async () => {
    renderForm();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Pick a contact.")).toBeInTheDocument();
    expect(screen.getByText("Pick a purpose.")).toBeInTheDocument();
    expect(createInteraction).not.toHaveBeenCalled();
  });

  it("starts on the contact that is selected on the page", () => {
    renderForm({ defaultContactId: "c1" });
    expect(screen.getByRole("combobox", { name: /contact/i })).toHaveTextContent(
      "Pat Lee",
    );
  });

  it("starts the date on today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T15:45:00"));
    try {
      renderForm({ defaultContactId: "c1" });
      expect(screen.getByText("Sep 19, 2026")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads an interaction for editing and saves it as an update", async () => {
    (updateInteraction as any).mockResolvedValue({ success: true });
    const props = renderForm({ editInteraction: editing });

    expect(screen.getByText("Edit Interaction")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Went well")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Send CV")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateInteraction).toHaveBeenCalled());
    expect(createInteraction).not.toHaveBeenCalled();
    expect(updateInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "i1",
        contact: "c1",
        interactionPurpose: "p1",
        occurredAt: new Date("2026-09-10T00:00:00"),
        nextStep: "Send CV",
        nextStepDate: new Date("2026-09-12T00:00:00"),
        job: "j1",
      }),
    );
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(props.setOpen).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and does not reload when the save fails", async () => {
    (updateInteraction as any).mockResolvedValue({ success: false, message: "no" });
    const props = renderForm({ editInteraction: editing });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateInteraction).toHaveBeenCalled());
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.setOpen).not.toHaveBeenCalledWith(false);
  });

  it("refuses a step date before the interaction date", async () => {
    renderForm({
      editInteraction: { ...editing, nextStepDate: new Date("2026-09-01T00:00:00") },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("The next step cannot be before the interaction date."),
    ).toBeInTheDocument();
    expect(updateInteraction).not.toHaveBeenCalled();
  });

  it("clears the related job", async () => {
    (updateInteraction as any).mockResolvedValue({ success: true });
    renderForm({ editInteraction: editing });

    const jobField = screen.getByRole("combobox", { name: /related job/i });
    await user.click(within(jobField.parentElement!).getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateInteraction).toHaveBeenCalledWith(expect.objectContaining({ job: "" })),
    );
  });
});
