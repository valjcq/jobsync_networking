// Where a contact is in an outreach wave. The column is free text so the list
// can grow without a migration; MCP only ever writes these values.
export const CONTACT_STATUSES = [
  "drafted",
  "sent",
  "replied",
  "meeting_scheduled",
  "no_reply",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

// "Meeting scheduled", "meeting-scheduled" and "No reply" all land on a value.
export function matchContactStatus(input: string): ContactStatus | null {
  const key = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (CONTACT_STATUSES as readonly string[]).includes(key)
    ? (key as ContactStatus)
    : null;
}
