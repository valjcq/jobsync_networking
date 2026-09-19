"use client";
import { format } from "date-fns";
import { Check, Pencil, Trash2, Undo2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { Interaction } from "@/models/interaction.model";

type InteractionRowProps = {
  interaction: Interaction;
  showContact: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
};

function InteractionRow({
  interaction,
  showContact,
  onEdit,
  onDelete,
  onToggleDone,
}: InteractionRowProps) {
  const { nextStep, nextStepDate, nextStepDoneAt, Job } = interaction;

  return (
    <li className="flex flex-col gap-1 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {format(interaction.occurredAt, "PP")}
          </span>
          <Badge variant="secondary">{interaction.Purpose.label}</Badge>
          {showContact && (
            <span>
              {interaction.Contact.name}
              {interaction.Contact.Company && (
                <span className="text-muted-foreground">
                  {" "}
                  · {interaction.Contact.Company.label}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Edit interaction"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Delete interaction"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {Job && (
        <p className="text-xs text-muted-foreground">
          About: {Job.JobTitle.label} @ {Job.Company.label}
        </p>
      )}
      {interaction.outcome && <p>{interaction.outcome}</p>}

      {nextStep && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Next: {nextStep}
            {nextStepDate && ` (${format(nextStepDate, "PP")})`}
          </span>
          {nextStepDoneAt ? (
            <Badge variant="outline">Done {format(nextStepDoneAt, "PP")}</Badge>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2"
            onClick={onToggleDone}
          >
            {nextStepDoneAt ? (
              <Undo2 className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {nextStepDoneAt ? "Reopen" : "Mark done"}
          </Button>
        </div>
      )}
    </li>
  );
}

export default InteractionRow;
