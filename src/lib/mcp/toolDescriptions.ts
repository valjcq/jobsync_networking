// Tool descriptions are prompt surface, not documentation: the agent routes
// between add_job / update_job / add_jobs_batch on this text alone. Kept out
// of route.ts so evals/mcp-tools can assert against the exact strings the
// server registers instead of a copy that silently drifts.
export const MCP_TOOL_DESCRIPTIONS = {
  add_job:
    "Add a job application to JobSync. Resolves or creates company, job title, location, and source by name. Returns a transparency report of what was matched vs. created.",
  find_job:
    "Look up whether a job posting is already saved in JobSync, by URL. Call this before add_job when re-running a search. With no URL to look up, use add_job's upsert instead of skipping dedupe. To find a job by company or title instead, use search.",
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
    "Add a person to the user's networking contacts. Resolves or creates company, location and role by name. Refuses to create a contact whose name, email or LinkedIn URL matches an existing one and returns those matches instead — use the existing contact, and set allowDuplicate only after the user confirms it is a different person. Only record facts present in the source material. Dates are YYYY-MM-DD. An optional status (drafted, sent, replied, meeting_scheduled, no_reply) records where the contact is in an outreach wave.",
  log_interaction:
    "Record an interaction with a saved contact (a call, coffee chat, email, referral request…), with an optional outcome and follow-up step. Call find_contact first and pass the contactId; a contactName is accepted only when it matches exactly one contact. Never guess a contact: if the result lists candidates (ambiguous or partial matches), nothing was logged — show them to the user and wait for their choice rather than retrying with one. Dates are YYYY-MM-DD. Only record facts present in the source material — do not invent outcomes, next steps or dates. The purpose is matched against the user's list and created if missing. Logging the same contact, date, purpose and outcome again returns the existing entry instead of duplicating it, unless allowDuplicate is set.",
  list_followups:
    "List the user's follow-ups that are due today or earlier (open next steps from logged interactions), oldest first, with the contact and the linked job. Read-only.",
  search:
    "Find saved jobs, contacts, companies, interactions and todos by name or keyword, returning ids. Use this whenever the user names something without giving an id or URL (\"the Acme job\", \"Marie\", \"my todo about the portfolio\"), then pass the id to the tool you need. Results are best first; one marked fuzzy is a typo-tolerant guess. Never pick between several candidates or act on a fuzzy match yourself: show them to the user and let them choose. Types the token has no scope for are skipped and named in the reply.",
  add_todo:
    "Create a todo for the user, optionally linked to a saved job and/or contact and with a due date (YYYY-MM-DD, today or later). Pass jobId/contactId from search, find_job or find_contact; jobQuery/contactName are accepted only when they match exactly one record, otherwise nothing is created and candidates come back for the user to choose from. An open todo with the same title and link is returned instead of duplicated, unless allowDuplicate is set. Only record tasks present in the source material. This is for the user's own to-dos; a follow-up tied to a logged conversation belongs in log_interaction's nextStep.",
  list_todos:
    "List the user's todos, soonest due first, with their linked job and contact. Defaults to open ones (in-progress and needs-attention); filter by status, dueBefore (overdue included), jobId or contactId. Read-only.",
  update_todo:
    "Change a todo: title, plain-text description, due date, priority, status, or its job/contact link (null unlinks). Only the fields you supply change. Get the todoId from list_todos or search. To simply finish one, use complete_todo.",
  complete_todo:
    "Mark a todo complete (status complete, 100%). Get the todoId from list_todos or search. Completing one that is already complete changes nothing.",
  get_job:
    "Read everything saved about one job: status, dates, match score, tags, linked contacts, recent interactions, open todos and the latest notes. Read-only. Get the jobId from search, find_job or add_job.",
  set_job_status:
    "Move any saved job to a new application status (applied, interview, offer, rejected…), including jobs added in the web app. Marking applied records today as the applied date. Get the jobId from search, find_job or add_job; only change a status the user actually reported.",
  add_job_note:
    "Add a plain-text note to any saved job, including jobs added in the web app. Notes are append-only here; only record facts present in the source material. Get the jobId from search, find_job or add_job.",
  get_contact:
    "Read everything saved about one contact: details, linked jobs, recent interactions with their next steps, and open todos. Read-only. Get the contactId from search or find_contact.",
  complete_followup:
    "Mark a follow-up (an interaction's next step, as shown by list_followups or get_contact) done, or reopen it with done: false. Use this once the user says they handled it. It does not create a new follow-up; use add_todo for what comes next.",
  update_contact:
    "Correct or enrich a saved contact: name, title, email, phone, LinkedIn URL, company, location, role, relationship, notes, last-contacted date, or outreach status. Only the fields you supply change; null clears a field. Get the contactId from find_contact, list_contacts or search. notes REPLACES all notes (use add_contact_note to append). Refuses a new name, email or LinkedIn URL that another contact already has and returns those matches: if they are the same person call merge_contacts; set allowDuplicate only after the user confirms they differ. Only change what the user actually said to change. Dates are YYYY-MM-DD.",
  update_interaction:
    "Correct a logged interaction: its contact, purpose, date, outcome, next step, next-step date or linked job. Only the fields you supply change; null clears outcome, nextStep, nextStepDate or jobId (clearing nextStep also clears its date). Get the interactionId from list_interactions or get_contact. Refuses an edit that would duplicate another interaction (same contact, date, purpose and outcome) and names it. Last contacted is recalculated. Dates are YYYY-MM-DD. To remove an interaction use delete_interaction.",
  delete_interaction:
    "Permanently delete one logged interaction (and its next step). Get the interactionId from list_interactions or get_contact. Only do this when the user asked to remove it; to fix a detail use update_interaction instead. Last contacted falls back to the latest remaining interaction.",
  delete_contact:
    "Permanently delete a contact together with all its logged interactions and job links (linked todos stay, unlinked). Two-step: without confirm: true nothing is deleted and the impact is returned; show it to the user and set confirm: true only after they agree. If the contact is a duplicate of another, use merge_contacts so the history is kept.",
  merge_contacts:
    "Fold a duplicate contact into the one to keep: interactions, job links and todos move over, empty fields are filled from the duplicate, the later last-contacted date and combined notes are kept, and the duplicate is deleted. The kept contact's own values win conflicts, and dropped values are listed. Two-step: without confirm: true it only previews; set confirm: true only after the user agrees. Get both ids from find_contact or the duplicate warning of add_contact.",
  get_profile:
    "Read the user's own profile: name, headline, summary, target roles, target locations and links (website etc.). Name, headline, summary and links come from the default resume; target roles and locations are stored on the profile. Read-only.",
  update_profile:
    "Edit the user's own profile: firstName, lastName, headline, summary, targetRoles, targetLocations, links (up to two, e.g. a website). Only the fields you supply change; lists and links replace the whole value, [] clears. Name, headline, summary and links edit the default resume, so it needs one (with contact info). Only change what the user asked for; call get_profile first when you need the current values.",
  list_contacts:
    "List saved contacts with optional filters: company, role, outreach status, last-contacted date (lastContactedBefore / lastContactedAfter / neverContacted) and nextStepDue (an open follow-up due today or earlier). Returns ids, status, last-contacted date and due follow-ups, by name. Use it for questions like \"who haven't I contacted since September\", \"who is marked sent\" or \"which recruiters have a follow-up due\". To find a person by name use find_contact. Read-only.",
  list_interactions:
    "List logged interactions, newest first, filtered by contact, purpose (exact label) and date range (occurredAfter / occurredBefore, inclusive), optionally only those with an open next step. Use it for \"what happened this week\" or \"what did I discuss with Marie\". For who has not replied, filter list_contacts by status instead. Returns interaction and contact ids. Read-only.",
  add_contacts_batch:
    "Add several contacts in one call (up to 10). Same per-item behaviour as add_contact, including the duplicate refusal and optional status; returns one labelled result per item, and a refused duplicate does not stop the rest. Use this when adding a list of people instead of N add_contact calls.",
  log_interactions_batch:
    "Log several interactions in one call (up to 10). Same per-item behaviour as log_interaction, including exact-name matching, no guessing between candidates and the duplicate guard; returns one labelled result per item. Use it for a wave of outreach instead of N log_interaction calls.",
  add_contact_note:
    "Add a plain-text note to a saved contact. It is appended to the contact's notes as a dated line; nothing already written changes. Only record facts present in the source material. Get the contactId from find_contact, list_contacts or search. To rewrite the notes use update_contact.",
  link_contact_to_job:
    "Attach a saved contact to a saved job with a role for that job (Recruiter, Referrer, Hiring Manager…). The role defaults to the contact's own role when it has one. Linking the same contact, job and role again changes nothing. Get ids from find_contact, search, find_job or add_job.",
} as const;

export type McpToolName = keyof typeof MCP_TOOL_DESCRIPTIONS;
