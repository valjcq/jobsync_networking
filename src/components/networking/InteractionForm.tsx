"use client";
import { useEffect, useMemo, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { startOfDay } from "date-fns";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "../ui/textarea";
import { Combobox } from "../ComboBox";
import { DatePicker } from "../DatePicker";
import { FormDialogFooter } from "../FormDialogFooter";
import { toastActionResult } from "@/lib/toast";
import {
  createInteraction,
  updateInteraction,
} from "@/actions/interaction.actions";
import {
  InteractionFormSchema,
  type InteractionFormValues,
} from "@/models/interactionForm.schema";
import type {
  Interaction,
  InteractionPurpose,
  NetworkingContact,
} from "@/models/interaction.model";
import type { ContactRef } from "@/models/contact.model";

type InteractionFormProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  editInteraction: Interaction | null;
  defaultContactId?: string;
  contacts: NetworkingContact[];
  purposes: InteractionPurpose[];
  jobs: ContactRef[];
  onSaved: () => void;
};

// Dates are date-only, like Contact.lastContactedAt: local midnight of the
// picked day. The default is today's midnight, not "now".
const emptyValues = (contact = ""): InteractionFormValues => ({
  contact,
  interactionPurpose: "",
  occurredAt: startOfDay(new Date()),
  outcome: "",
  nextStep: "",
  nextStepDate: null,
  job: "",
});

function InteractionForm({
  open,
  setOpen,
  editInteraction,
  defaultContactId,
  contacts,
  purposes,
  jobs,
  onSaved,
}: InteractionFormProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<InteractionFormValues>({
    resolver: zodResolver(InteractionFormSchema),
    defaultValues: emptyValues(defaultContactId),
  });
  const { reset } = form;

  const contactOptions = useMemo(
    () =>
      contacts.map((c) => ({
        id: c.id,
        label: c.name,
        value: [c.name, c.Company?.label].filter(Boolean).join(" ").toLowerCase(),
      })),
    [contacts],
  );

  useEffect(() => {
    if (!open) return;
    if (editInteraction) {
      reset({
        id: editInteraction.id,
        contact: editInteraction.contactId,
        interactionPurpose: editInteraction.purposeId,
        occurredAt: new Date(editInteraction.occurredAt),
        outcome: editInteraction.outcome ?? "",
        nextStep: editInteraction.nextStep ?? "",
        nextStepDate: editInteraction.nextStepDate
          ? new Date(editInteraction.nextStepDate)
          : null,
        job: editInteraction.jobId ?? "",
      });
    } else {
      reset(emptyValues(defaultContactId));
    }
  }, [open, editInteraction, defaultContactId, reset]);

  const onSubmit = (values: InteractionFormValues) => {
    startTransition(async () => {
      const res = editInteraction
        ? await updateInteraction(values)
        : await createInteraction(values);
      toastActionResult(res, {
        success: `Interaction has been ${editInteraction ? "updated" : "logged"} successfully`,
        onSuccess: () => {
          setOpen(false);
          onSaved();
        },
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editInteraction ? "Edit Interaction" : "Log Interaction"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
          >
            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Contact</FormLabel>
                  <Combobox options={contactOptions} field={field} label="contact" fullWidth />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interactionPurpose"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Purpose</FormLabel>
                  <Combobox options={purposes} field={field} creatable label="purpose" fullWidth />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="occurredAt"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <DatePicker field={field} presets={false} isEnabled fullWidth />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="job"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Related job (optional)</FormLabel>
                  <div className="flex gap-2">
                    <Combobox options={jobs} field={field} label="job" fullWidth />
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange("")}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="outcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Outcome</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What came out of it?"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nextStep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next step</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Send my CV" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nextStepDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Next step date</FormLabel>
                  <div className="flex gap-2">
                    <DatePicker field={field} presets={false} isEnabled fullWidth />
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange(null)}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormDialogFooter
              isPending={isPending}
              saveDisabled={isPending}
              onCancel={() => setOpen(false)}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default InteractionForm;
