import { render, screen } from "@testing-library/react";
import TasksTable from "@/components/tasks/TasksTable";
import type { Task } from "@/models/task.model";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  userId: "u1",
  title: "Call Marie",
  status: "in-progress",
  priority: 5,
  percentComplete: 0,
  createdAt: new Date(2026, 8, 1),
  updatedAt: new Date(2026, 8, 1),
  ...over,
});

const renderTable = (tasks: Task[]) =>
  render(
    <TasksTable
      tasks={tasks}
      deleteTask={vi.fn()}
      editTask={vi.fn()}
      onChangeTaskStatus={vi.fn()}
      onStartActivity={vi.fn()}
    />,
  );

describe("TasksTable job and contact chips", () => {
  it("links to the job and names the contact", () => {
    renderTable([
      task({
        Job: { id: "j1", JobTitle: { label: "Data Engineer" }, Company: { label: "Acme" } },
        Contact: { id: "c1", name: "Marie Curie" },
      }),
    ]);
    const chip = screen.getByTestId("task-job-chip");
    expect(chip).toHaveTextContent("Acme");
    expect(chip).toHaveAttribute("href", "/dashboard/myjobs/j1");
    expect(chip).toHaveAttribute("title", "Data Engineer @ Acme");
    expect(screen.getByTestId("task-contact-chip")).toHaveTextContent("Marie Curie");
  });

  it("shows no chips for an unlinked todo", () => {
    renderTable([task()]);
    expect(screen.queryByTestId("task-job-chip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-contact-chip")).not.toBeInTheDocument();
  });
});
