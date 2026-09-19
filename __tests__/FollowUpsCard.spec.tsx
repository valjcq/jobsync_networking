import FollowUpsCard from "@/components/networking/FollowUpsCard";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { markNextStepDone } from "@/actions/interaction.actions";
import { toastActionResult } from "@/lib/toast";

vi.mock("@/actions/interaction.actions", () => ({
  markNextStepDone: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toastActionResult: vi.fn((res, opts) => res?.success && opts.onSuccess?.()),
}));

const item = (over: Record<string, unknown> = {}) =>
  ({
    id: "i1",
    Contact: { id: "c1", name: "Pat Lee", Company: null },
    nextStep: "Send my CV",
    nextStepDate: new Date("2026-09-19T00:00:00"),
    ...over,
  }) as any;

describe("FollowUpsCard", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("says so when nothing is due", () => {
    render(<FollowUpsCard followUps={[]} onChanged={vi.fn()} />);
    expect(screen.getByText(/nothing is due/i)).toBeInTheDocument();
  });

  it("lists the person, the step and its due date", () => {
    render(<FollowUpsCard followUps={[item()]} onChanged={vi.fn()} />);
    expect(screen.getByText("Pat Lee")).toBeInTheDocument();
    expect(screen.getByText("Send my CV")).toBeInTheDocument();
    expect(screen.getByText(/Due Sep 19, 2026/)).toBeInTheDocument();
  });

  it("calls a step from an earlier day overdue", () => {
    render(
      <FollowUpsCard
        followUps={[item({ nextStepDate: new Date("2026-09-15T00:00:00") })]}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText(/Overdue since Sep 15, 2026/)).toBeInTheDocument();
  });

  it("marks a step done and reloads", async () => {
    (markNextStepDone as any).mockResolvedValue({ success: true });
    const onChanged = vi.fn();
    render(<FollowUpsCard followUps={[item()]} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(markNextStepDone).toHaveBeenCalledWith("i1");
    expect(toastActionResult).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it("does not reload when marking done fails", async () => {
    (markNextStepDone as any).mockResolvedValue({ success: false, message: "no" });
    const onChanged = vi.fn();
    render(<FollowUpsCard followUps={[item()]} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onChanged).not.toHaveBeenCalled();
  });
});
