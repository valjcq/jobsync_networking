import { render, screen } from "@testing-library/react";
import { JobTodosCard } from "@/components/myjobs/job-details/JobTodosCard";

describe("JobTodosCard", () => {
  it("renders nothing without todos", () => {
    const { container } = render(<JobTodosCard todos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists open todos with their due date", () => {
    render(
      <JobTodosCard
        todos={[
          { id: "t1", title: "Send CV", dueDate: new Date(2026, 9, 12) },
          { id: "t2", title: "Research the team", dueDate: null },
        ]}
      />,
    );
    expect(screen.getByText("Open todos (2)")).toBeInTheDocument();
    expect(screen.getByText("Send CV")).toBeInTheDocument();
    expect(screen.getByText("Oct 12")).toBeInTheDocument();
    expect(screen.getByText("Research the team")).toBeInTheDocument();
  });
});
