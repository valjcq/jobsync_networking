import { render, screen, fireEvent } from "@testing-library/react";
import TasksSidebar from "@/components/tasks/TasksSidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

describe("TasksSidebar phone-width filter", () => {
  const types = [
    { id: "a1", label: "Applying", value: "applying", taskCount: 3 },
    { id: "a2", label: "Empty", value: "empty", taskCount: 0 },
  ];

  it("offers All plus the types that have tasks, and reports a pick", () => {
    const onFilterChange = vi.fn();
    render(
      <TasksSidebar activityTypes={types} totalTasks={5} onFilterChange={onFilterChange} />,
    );
    const select = screen.getByLabelText("Filter by activity type") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["All (5)", "Applying (3)"]);
    fireEvent.change(select, { target: { value: "a1" } });
    expect(onFilterChange).toHaveBeenCalledWith("a1");
    fireEvent.change(select, { target: { value: "" } });
    expect(onFilterChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("DialogContent on a phone", () => {
  it("is capped to the dynamic viewport height and scrolls by default", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Hi</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const cls = screen.getByRole("dialog").className;
    expect(cls).toContain("max-h-[calc(100dvh-1rem)]");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("w-[calc(100%-1rem)]");
  });
});
