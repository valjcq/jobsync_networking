"use client";
import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toastActionResult } from "@/lib/toast";
import {
  getInteractionPurposes,
  createInteractionPurpose,
  renameInteractionPurpose,
  deleteInteractionPurposeById,
} from "@/actions/interactionPurpose.actions";
import type { InteractionPurpose } from "@/models/interaction.model";

type PurposeManagerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  purposes: InteractionPurpose[];
  onPurposesChanged: (purposes: InteractionPurpose[]) => void;
};

function PurposeManager({
  open,
  setOpen,
  purposes,
  onPurposesChanged,
}: PurposeManagerProps) {
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Every change re-reads the list so the use counts stay right
  const reload = async () => {
    const list = await getInteractionPurposes();
    if (Array.isArray(list)) onPurposesChanged(list);
  };

  const run = async (
    action: Promise<any>,
    success: string,
    after?: () => void,
  ) => {
    toastActionResult(await action, {
      success,
      onSuccess: () => {
        after?.();
        reload();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purposes</DialogTitle>
          <DialogDescription>
            The reasons you reach out. A purpose that is in use cannot be
            deleted.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1">
          {purposes.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              {editingId === p.id ? (
                <>
                  <Input
                    className="h-8"
                    aria-label={`Rename ${p.label}`}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Save name"
                    onClick={() =>
                      run(
                        renameInteractionPurpose(p.id, editLabel),
                        "Purpose has been renamed",
                        () => setEditingId(null),
                      )
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{p.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {p._count?.interactions ?? 0} used
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Rename ${p.label}`}
                    onClick={() => {
                      setEditingId(p.id);
                      setEditLabel(p.label);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={`Delete ${p.label}`}
                    onClick={() =>
                      run(
                        deleteInteractionPurposeById(p.id),
                        "Purpose has been deleted",
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newLabel.trim()) return;
            run(createInteractionPurpose(newLabel), "Purpose has been added", () =>
              setNewLabel(""),
            );
          }}
        >
          <Input
            className="h-8"
            aria-label="New purpose"
            placeholder="New purpose, e.g. Conference intro"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PurposeManager;
