import { z } from "zod";

export const InteractionFormSchema = z
  .object({
    id: z.string().optional(),
    contact: z.string().min(1, { message: "Pick a contact." }),
    // Named for ComboBox's `case "interactionPurpose"` create path
    interactionPurpose: z.string().min(1, { message: "Pick a purpose." }),
    occurredAt: z.date({ error: "Pick the date of the interaction." }),
    outcome: z.string().max(2000).default("").optional(),
    nextStep: z.string().max(500).default("").optional(),
    nextStepDate: z.date().nullable().optional(),
    job: z.string().optional(),
  })
  .refine((v) => !v.nextStepDate || !!v.nextStep?.trim(), {
    message: "Describe the next step.",
    path: ["nextStep"],
  })
  .refine((v) => !v.nextStepDate || v.nextStepDate >= v.occurredAt, {
    message: "The next step cannot be before the interaction date.",
    path: ["nextStepDate"],
  });

export type InteractionFormValues = z.infer<typeof InteractionFormSchema>;
