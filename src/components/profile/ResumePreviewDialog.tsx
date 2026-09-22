"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfPreviewPane } from "@/components/pdf-export/PdfPreviewPane";

type ResumePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  title: string;
};

export function ResumePreviewDialog({
  open,
  onOpenChange,
  resumeId,
  title,
}: ResumePreviewDialogProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBlob(null);
    setHasError(false);
    setIsLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/profile/resume?resumeId=${encodeURIComponent(resumeId)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch resume file");
        const fetchedBlob = await res.blob();
        if (!cancelled) setBlob(fetchedBlob);
      } catch {
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, resumeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <PdfPreviewPane
            blob={blob}
            isGenerating={isLoading}
            hasError={hasError}
            canExport={!!blob}
            previewLabel="Resume preview"
            emptyMessage="No file to preview"
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
