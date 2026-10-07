import Link from "next/link";
import { ListChecks } from "lucide-react";
import { format } from "date-fns";
import { Card } from "../../ui/card";

type JobTodosCardProps = {
  todos: { id: string; title: string; dueDate: Date | null }[];
};

// Open todos linked to this job. Nothing when there are none, so a job without
// todos looks the same as before.
export function JobTodosCard({ todos }: JobTodosCardProps) {
  if (todos.length === 0) return null;

  return (
    <Card className="p-4" data-testid="job-todos">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ListChecks className="h-4 w-4" />
        Open todos ({todos.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-baseline justify-between gap-3">
            <Link href="/dashboard/tasks" className="truncate hover:underline">
              {todo.title}
            </Link>
            {todo.dueDate && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {format(new Date(todo.dueDate), "MMM d")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
