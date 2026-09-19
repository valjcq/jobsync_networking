// Tool descriptions are prompt surface, not documentation: the agent routes
// between add_job / update_job / add_jobs_batch on this text alone. Kept out
// of route.ts so evals/mcp-tools can assert against the exact strings the
// server registers instead of a copy that silently drifts.
export const MCP_TOOL_DESCRIPTIONS = {
  add_job:
    "Add a job application to JobSync. Resolves or creates company, job title, location, and source by name. Returns a transparency report of what was matched vs. created.",
  find_job:
    "Look up whether a job posting is already saved in JobSync, by URL. Call this before add_job when re-running a search. With no URL to look up, use add_job's upsert instead of skipping dedupe.",
  update_job:
    "Correct or enrich a job previously added through MCP. Only the fields you supply change. Supplying a fuller jobDescription re-classifies the posting and requests a fresh match analysis — use this instead of re-adding with allowDuplicate.",
  add_question:
    "Add an entry to the Question Bank. Resolves or creates tags by name. Returns a transparency report of what was matched vs. created.",
  save_match_result:
    "Persist a job-fit match analysis (produced by you, the agent) against a job previously created with add_job. Call this after add_job hands you a match directive.",
  add_jobs_batch:
    "Add several jobs in one call. Same per-item behaviour as add_job (including upsert and the match directive); returns one labelled result per item. Use this for scheduled runs instead of N sequential add_job calls.",
  save_match_results_batch:
    "Persist several job-fit match analyses in one call. Same per-item behaviour as save_match_result; returns one labelled result per item.",
  review_resume:
    "Fetch the user's default resume so you can review it. Returns the normalized resume text plus a directive — produce the review yourself, then call save_resume_review with the result.",
  save_resume_review:
    "Persist a resume review (produced by you, the agent) against the resume previously handed to you by review_resume. Call this after review_resume hands you a review directive.",
  find_contact:
    "Look up saved networking contacts by name, email or title. Call this before log_interaction (and before add_contact) to get the contact's id. Never guess a contact: if several match, or only partial matches come back, show the candidates to the user and let them choose — do not pick one yourself.",
  add_contact:
    "Add a person to the user's networking contacts. Resolves or creates company, location and role by name. Refuses to create a contact whose name, email or LinkedIn URL matches an existing one and returns those matches instead — use the existing contact, and set allowDuplicate only after the user confirms it is a different person. Only record facts present in the source material. Dates are YYYY-MM-DD.",
  log_interaction:
    "Record an interaction with a saved contact (a call, coffee chat, email, referral request…), with an optional outcome and follow-up step. Call find_contact first and pass the contactId; a contactName is accepted only when it matches exactly one contact. Never guess a contact: if the result lists candidates (ambiguous or partial matches), nothing was logged — show them to the user and wait for their choice rather than retrying with one. Dates are YYYY-MM-DD. Only record facts present in the source material — do not invent outcomes, next steps or dates. The purpose is matched against the user's list and created if missing. Logging the same contact, date, purpose and outcome again returns the existing entry instead of duplicating it, unless allowDuplicate is set.",
  list_followups:
    "List the user's follow-ups that are due today or earlier (open next steps from logged interactions), oldest first, with the contact and the linked job. Read-only.",
} as const;

export type McpToolName = keyof typeof MCP_TOOL_DESCRIPTIONS;
