export interface InteractionPurpose {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: { interactions: number };
}

export interface Interaction {
  id: string;
  contactId: string;
  Contact: {
    id: string;
    name: string;
    Company: { label: string } | null;
  };
  purposeId: string;
  Purpose: { id: string; label: string };
  occurredAt: Date;
  outcome: string | null;
  nextStep: string | null;
  nextStepDate: Date | null;
  nextStepDoneAt: Date | null;
  jobId: string | null;
  Job: {
    id: string;
    JobTitle: { label: string };
    Company: { label: string };
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

// A row of the Networking contact panel: the person, where they work, and
// how much is open with them.
export interface NetworkingContact {
  id: string;
  name: string;
  title: string | null;
  Company: { id: string; label: string } | null;
  Role: { id: string; label: string } | null;
  lastContactedAt: Date | null;
  _count: { interactions: number };
  openSteps: number;
}
