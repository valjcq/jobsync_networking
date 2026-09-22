"use client";
import { Loader } from "lucide-react";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { CreateResumeFormSchema } from "@/models/createResumeForm.schema";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Resume } from "@/models/profile.model";
import { toastSuccess, toastError } from "@/lib/toast";

type CreateResumeProps = {
  resumeDialogOpen: boolean;
  setResumeDialogOpen: (e: boolean) => void;
  resumeToEdit?: Resume | null;
  reloadResumes: () => Promise<void>;
  setNewResumeId: (id: string) => void;
};

// Derive a clean title from an uploaded filename
function titleFromFilename(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim();
}

function CreateResume({
  resumeDialogOpen,
  setResumeDialogOpen,
  resumeToEdit,
  reloadResumes,
  setNewResumeId,
}: CreateResumeProps) {
  const [isPending, startTransition] = useTransition();

  const pageTitle = resumeToEdit ? "Edit Resume Title" : "Create Resume";
  const pageDescription = resumeToEdit
    ? "Update the title of this resume."
    : "Create a new resume for your profile.";

  const form = useForm<z.infer<typeof CreateResumeFormSchema>>({
    resolver: zodResolver(CreateResumeFormSchema),
    mode: "onChange",
    defaultValues: { title: "" },
  });

  const {
    reset,
    watch,
    setValue,
    formState: { errors, isValid },
  } = form;

  const watchedFile = watch("file");

  // Populate form when editing an existing resume
  useEffect(() => {
    if (resumeToEdit) {
      reset({
        id: resumeToEdit.id ?? undefined,
        title: resumeToEdit.title ?? "",
        fileId: resumeToEdit.FileId ?? undefined,
      });
    }
  }, [resumeToEdit, reset]);

  // Auto-fill title from filename when file changes (new resume only), but
  // never once the user has typed their own title — the title field renders
  // above the file field, so a name typed first must survive attaching a file.
  useEffect(() => {
    if (
      !resumeToEdit &&
      watchedFile instanceof File &&
      watchedFile.name &&
      !form.formState.dirtyFields.title
    ) {
      const derived = titleFromFilename(watchedFile.name);
      if (derived) setValue("title", derived, { shouldValidate: true });
    }
  }, [watchedFile, resumeToEdit, setValue, form.formState]);

  const closeDialog = () => setResumeDialogOpen(false);

  const onSubmit = (data: z.infer<typeof CreateResumeFormSchema>) => {
    const formData = new FormData();
    formData.append("file", data.file as File);
    formData.append("title", data.title);
    if (resumeToEdit) {
      formData.append("id", data.id as string);
      if (resumeToEdit.FileId) {
        formData.append("fileId", data.fileId as string);
      }
    }

    startTransition(async () => {
      const res = await fetch("/api/profile/resume", {
        method: "POST",
        body: formData,
      });
      const response = await res.json();
      if (!response.success) {
        toastError(response?.message);
        return;
      }

      const newResumeId: string | undefined =
        response.data?.id ?? response.data?.resumes?.[0]?.id;

      reset();
      setResumeDialogOpen(false);
      await reloadResumes();
      if (newResumeId) {
        setNewResumeId(newResumeId);
      }
      toastSuccess(`Resume title has been ${resumeToEdit ? "updated" : "created"} successfully`);
    });
  };

  return (
    <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
      <DialogContent className="lg:max-h-screen overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{pageTitle}</DialogTitle>
          <DialogDescription>{pageDescription}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => {
              event.stopPropagation();
              form.handleSubmit(onSubmit)(event);
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
          >
            {/* RESUME TITLE */}
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resume Title</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Full Stack Developer Angular, Java"
                        data-testid="resume-title-input"
                      />
                    </FormControl>
                    <FormMessage>
                      {errors.title && (
                        <span className="text-red-500">
                          {errors.title.message}
                        </span>
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            {/* RESUME FILE */}
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="file"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Upload Resume (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={(e) => {
                          field.onChange(e.target.files?.[0] || null);
                        }}
                      />
                    </FormControl>
                    <FormMessage>
                      {errors.file?.message && (
                        <span className="text-red-500">
                          {errors.file.message}
                        </span>
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2 mt-4">
              <DialogFooter>
                <Button
                  type="reset"
                  variant="outline"
                  className="mt-2 md:mt-0"
                  onClick={closeDialog}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isValid || isPending}>
                  Save
                  {isPending && (
                    <Loader className="h-4 w-4 shrink-0 animate-spin" />
                  )}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateResume;
