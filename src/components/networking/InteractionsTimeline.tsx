"use client";
import { useCallback, useEffect, useState } from "react";
import { PlusCircle, Settings2 } from "lucide-react";
import { Card, CardContent, CardTitle } from "../ui/card";
import { ResponsiveCardHeader } from "../ResponsiveCardHeader";
import { Button } from "../ui/button";
import Loading from "../Loading";
import { RecordsCount } from "../RecordsCount";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import InteractionRow from "./InteractionRow";
import { toastActionResult } from "@/lib/toast";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  getInteractionList,
  deleteInteractionById,
  markNextStepDone,
} from "@/actions/interaction.actions";
import type {
  Interaction,
  InteractionPurpose,
} from "@/models/interaction.model";

type InteractionsTimelineProps = {
  contactId?: string;
  contactName?: string;
  purposes: InteractionPurpose[];
  // Changes whenever something elsewhere on the page changed the data
  version: number;
  onLog: () => void;
  onEdit: (interaction: Interaction) => void;
  onManagePurposes: () => void;
  onChanged: () => void;
};

function InteractionsTimeline({
  contactId,
  contactName,
  purposes,
  version,
  onLog,
  onEdit,
  onManagePurposes,
  onChanged,
}: InteractionsTimelineProps) {
  const [purposeId, setPurposeId] = useState("");
  const [rows, setRows] = useState<Interaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      const res = await getInteractionList(
        nextPage,
        APP_CONSTANTS.RECORDS_PER_PAGE,
        contactId,
        purposeId || undefined,
      );
      if (res?.data) {
        setRows((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setPage(nextPage);
      }
      setLoading(false);
    },
    [contactId, purposeId],
  );

  useEffect(() => {
    load(1);
  }, [load, version]);

  const onDelete = async () => {
    if (!deleteId) return;
    const res = await deleteInteractionById(deleteId);
    toastActionResult(res, {
      success: "Interaction has been deleted successfully",
      onSuccess: onChanged,
    });
  };

  const onToggleDone = async (item: Interaction) => {
    const res = await markNextStepDone(item.id, !item.nextStepDoneAt);
    toastActionResult(res, {
      success: item.nextStepDoneAt ? "Next step reopened" : "Next step marked as done",
      onSuccess: onChanged,
    });
  };

  return (
    <Card data-testid="interactions-timeline">
      <ResponsiveCardHeader>
        <div className="flex items-baseline gap-2">
          <CardTitle>
            {contactName ? `Interactions with ${contactName}` : "Interactions"}
          </CardTitle>
          {!loading && total > 0 && (
            <RecordsCount count={rows.length} total={total} label="interactions" />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
          <select
            aria-label="Filter by purpose"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={purposeId}
            onChange={(e) => setPurposeId(e.target.value)}
          >
            <option value="">All purposes</option>
            {purposes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={onManagePurposes}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Purposes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={onLog}
            data-testid="log-interaction-btn"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Log Interaction
          </Button>
        </div>
      </ResponsiveCardHeader>
      <CardContent>
        {loading && rows.length === 0 && <Loading />}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No interactions yet. Log the first time you reach out to someone.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((item) => (
            <InteractionRow
              key={item.id}
              interaction={item}
              showContact={!contactId}
              onEdit={() => onEdit(item)}
              onDelete={() => setDeleteId(item.id)}
              onToggleDone={() => onToggleDone(item)}
            />
          ))}
        </ul>
        {rows.length < total && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => load(page + 1)}
            >
              Load more
            </Button>
          </div>
        )}
      </CardContent>
      <DeleteAlertDialog
        pageTitle="interaction"
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onDelete={onDelete}
      />
    </Card>
  );
}

export default InteractionsTimeline;
