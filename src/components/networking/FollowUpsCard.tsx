"use client";
import { format, startOfDay } from "date-fns";
import { Check } from "lucide-react";
import { Card, CardContent, CardTitle } from "../ui/card";
import { ResponsiveCardHeader } from "../ResponsiveCardHeader";
import { Button } from "../ui/button";
import { toastActionResult } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { markNextStepDone } from "@/actions/interaction.actions";
import type { Interaction } from "@/models/interaction.model";

type FollowUpsCardProps = {
  followUps: Interaction[];
  onChanged: () => void;
};

function FollowUpsCard({ followUps, onChanged }: FollowUpsCardProps) {
  const today = startOfDay(new Date());

  const markDone = async (id: string) => {
    const res = await markNextStepDone(id);
    toastActionResult(res, {
      success: "Next step marked as done",
      onSuccess: onChanged,
    });
  };

  return (
    <Card data-testid="follow-ups-card">
      <ResponsiveCardHeader>
        <CardTitle>Follow-ups due</CardTitle>
      </ResponsiveCardHeader>
      <CardContent>
        {followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is due. Steps show up here on the day they are due.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {followUps.map((item) => {
              const overdue = !!item.nextStepDate && item.nextStepDate < today;
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{item.Contact.name}</span>
                    <span className="text-muted-foreground"> — </span>
                    <span>{item.nextStep}</span>
                    <span
                      className={cn(
                        "ml-2 text-xs",
                        overdue
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {overdue ? "Overdue since " : "Due "}
                      {item.nextStepDate ? format(item.nextStepDate, "PP") : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1"
                    onClick={() => markDone(item.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default FollowUpsCard;
