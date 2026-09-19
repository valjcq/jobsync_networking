import { endOfDay } from "date-fns";

// Not a "use server" module: read by queries.ts and mutations.ts.
export const INTERACTION_INCLUDE = {
  Contact: {
    select: {
      id: true,
      name: true,
      Company: { select: { label: true } },
    },
  },
  Purpose: { select: { id: true, label: true } },
  Job: {
    select: {
      id: true,
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
  },
};

// A step is due once its day has begun, so "end of today" is the cutoff, the
// same rule as the contact form's "cannot be in the future" check.
export const endOfToday = () => endOfDay(new Date());

// An open step: written down, and not yet marked done.
export const OPEN_STEP_WHERE = {
  nextStep: { not: null },
  nextStepDoneAt: null,
} as const;
