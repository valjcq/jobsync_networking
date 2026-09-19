import { z } from "zod";
import { APP_CONSTANTS, JOB_STATUS_VALUES } from "@/lib/constants";
import { WORKPLACE_TYPES, matchEnumEntry } from "@/models/job.model";

// An enum rather than a described string, for the same reason status is one:
// a small local model fills an enum-constrained slot and ignores prose hints.
// It sent "On-site" — the posting's own spelling — and when that was rejected
// it dropped the field entirely, losing a value the posting stated. The
// preprocess folds case and separators through matchEnumEntry, so "On-site",
// "on site" and "REMOTE" all still validate for existing MCP callers.
// Verified this keeps the JSON-schema `enum: [...]` the model and the MCP SDK
// read. Shared by both shapes because they resolve through the same resolver.
const workplaceTypeField = z
  .preprocess(
    (v) => (typeof v === "string" ? (matchEnumEntry(WORKPLACE_TYPES, v)?.[1] ?? v) : v),
    z.enum(WORKPLACE_TYPES),
  )
  .optional()
  .describe(`Work arrangement stated in the posting. One of: ${Object.values(WORKPLACE_TYPES).join(", ")}.`);

// Raw input shape for MCP tool registration (no transforms — SDK uses this for JSON schema)
export const McpAddJobInputShape = {
  company: z.string().min(1, "company is required"),
  jobTitle: z.string().min(1, "jobTitle is required"),
  jobDescription: z.string()
    .refine((val) => val === "N/A" || val.length >= 10, "jobDescription must be at least 10 characters")
    .describe("The complete job posting text, copied in full — do not summarize, shorten, or paraphrase it. Markdown-formatted is supported; plain text also works. Use 'N/A' only if no description is available at all."),
  location: z.string().optional().describe("City, province/state, country, or 'Remote' — e.g. 'Calgary, AB'. Do not include a street address."),
  source: z.string().optional().describe("Job board or site the listing came from, e.g. 'LinkedIn', 'Indeed', 'company website'. If not stated explicitly, infer it from the job posting's URL/domain when possible instead of leaving it blank."),
  jobType: z.string().optional().describe("Employment type: 'Full-time', 'Part-time', or 'Contract'"),
  workplaceType: workplaceTypeField,
  // Lowercased before the enum check so a caller sending "Applied"/"Draft"
  // (capitalized, like the old free-text field silently tolerated via
  // resolveJobStatus's case-insensitive DB lookup) still validates instead
  // of being newly rejected by this stricter enum. Verified this preserves
  // the JSON-schema `enum: [...]` the MCP SDK exposes in tools/list (zod v4's
  // pipe-aware conversion keeps the target enum on the input side too) — it
  // is NOT just cosmetic.
  status: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(JOB_STATUS_VALUES),
    )
    .optional()
    .describe(
      `Application status. One of: ${JOB_STATUS_VALUES.join(", ")}. Defaults to '${APP_CONSTANTS.MCP_DEFAULT_STATUS}'.`,
    ),
  dueDate: z.string().datetime({ offset: true }).optional().describe("Application deadline as an ISO-8601 datetime string"),
  applied: z.boolean().optional().describe("Set true if you have already submitted the application"),
  appliedDate: z.string().datetime({ offset: true }).optional().describe("Date the application was submitted as an ISO-8601 datetime string"),
  jobUrl: z.string().url().optional().describe("Direct URL to the job posting"),
  salaryRange: z.string().optional().describe("Salary range as a free-form string, e.g. '$120k–$150k' or '100,000 CAD'"),
  tags: z.array(z.string()).optional().describe("Skills required for the job (max 10 applied, extras are dropped). Tags are created if they don't exist. e.g. ['React', 'TypeScript', 'Node.js']"),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe(
      "Force-create even if a matching job already exists. Prefer upsert:true for re-runs of the same search; use this only for a genuinely different posting.",
    ),
  upsert: z
    .boolean()
    .optional()
    .describe(
      "If this posting is already saved, update it with the fields supplied here instead of reporting a duplicate. A posting counts as already saved when it matches on URL, or on company+title within the dedupe window — so this works for postings with no URL at all. Set this on every re-run of a saved or scheduled search, whether or not you have a URL.",
    ),
};

// Full schema with transforms for parsing raw MCP input in the handler
export const McpAddJobSchema = z.object({
  ...McpAddJobInputShape,
  dueDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
  appliedDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
});

export type McpAddJobInput = z.infer<typeof McpAddJobSchema>;

// Raw input shape for MCP tool registration (no transforms — SDK uses this for JSON schema)
export const McpAddQuestionInputShape = {
  question: z.string()
    .min(APP_CONSTANTS.MIN_QUESTION_LENGTH, `question must be at least ${APP_CONSTANTS.MIN_QUESTION_LENGTH} characters`)
    .max(APP_CONSTANTS.MAX_QUESTION_LENGTH, `question cannot exceed ${APP_CONSTANTS.MAX_QUESTION_LENGTH} characters`),
  answer: z.string()
    .min(APP_CONSTANTS.MIN_QUESTION_ANSWER_LENGTH, `answer must be at least ${APP_CONSTANTS.MIN_QUESTION_ANSWER_LENGTH} characters`)
    .max(APP_CONSTANTS.MAX_QUESTION_ANSWER_LENGTH, `answer cannot exceed ${APP_CONSTANTS.MAX_QUESTION_ANSWER_LENGTH} characters`)
    .describe("Markdown-formatted answer/notes (required). Plain text also works."),
  tags: z.array(z.string()).optional()
    .describe("Skill/topic tags (max 10 applied, extras dropped). Created if they don't exist."),
};

export const McpAddQuestionSchema = z.object(McpAddQuestionInputShape);
export type McpAddQuestionInput = z.infer<typeof McpAddQuestionSchema>;

// Raw input shape for MCP tool registration (no transforms needed)
export const McpSaveMatchResultInputShape = {
  jobId: z.string().min(1).describe("The id of the job returned by add_job."),
  resumeId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The id of the resume this match was scored against, exactly as given in the add_job directive. Omit only if the directive had none.",
    ),
  matchText: z.string().min(20).describe(
    "Your full match analysis: a leading 'SCORES: match=<0-100> recommendation=<strong|good|partial|weak>' line, then a markdown body.",
  ),
};

export const McpSaveMatchResultSchema = z.object(McpSaveMatchResultInputShape);
export type McpSaveMatchResultInput = z.infer<typeof McpSaveMatchResultSchema>;

// No arguments — always reviews the caller's default resume.
export const McpReviewResumeInputShape = {};

export const McpReviewResumeSchema = z.object(McpReviewResumeInputShape);
export type McpReviewResumeInput = z.infer<typeof McpReviewResumeSchema>;

// Raw input shape for MCP tool registration (no transforms needed)
export const McpSaveResumeReviewInputShape = {
  resumeId: z
    .string()
    .min(1)
    .describe(
      "The id of the resume this review was produced for, exactly as given in the review_resume directive.",
    ),
  reviewText: z.string().min(20).describe(
    "Your full resume review: a leading 'SCORES: overall=<0-100> impact=<0-100> clarity=<0-100> ats=<0-100>' line, then a markdown body.",
  ),
};

export const McpSaveResumeReviewSchema = z.object(
  McpSaveResumeReviewInputShape,
);
export type McpSaveResumeReviewInput = z.infer<
  typeof McpSaveResumeReviewSchema
>;

// find_job — URL is the only lookup key; it's the one identifier an agent
// reliably has from a job board, and it's what add_job dedupes on.
export const McpFindJobInputShape = {
  jobUrl: z
    .string()
    .url()
    .describe(
      "Direct URL to the job posting. Matched against saved jobs using the same canonical key as add_job's duplicate detection, so tracking parameters and host casing don't matter.",
    ),
};

export const McpFindJobSchema = z.object(McpFindJobInputShape);
export type McpFindJobInput = z.infer<typeof McpFindJobSchema>;

// update_job — every field except jobId is optional; only supplied fields
// change. Mirrors add_job's field names exactly.
export const McpUpdateJobInputShape = {
  jobId: z
    .string()
    .min(1)
    .describe(
      "The id of the job to update, as returned by add_job or find_job. Only jobs created through MCP can be updated.",
    ),
  company: z.string().min(1).optional(),
  jobTitle: z.string().min(1).optional(),
  jobDescription: z
    .string()
    .min(10)
    .optional()
    .describe(
      "The complete job posting text, copied in full — do not summarize. Supplying this re-classifies the job's description completeness and, if it is now substantive enough, a fresh match analysis is requested.",
    ),
  location: z.string().optional(),
  source: z.string().optional(),
  jobType: z.string().optional().describe("Employment type: 'Full-time', 'Part-time', or 'Contract'"),
  workplaceType: workplaceTypeField,
  // Same lowercase-preprocess treatment as add_job's status (Task 1) — the
  // SDK validates against this exact shape, so the case-insensitivity has to
  // live here too, not just on the transformed McpUpdateJobSchema.
  status: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(JOB_STATUS_VALUES),
    )
    .optional()
    .describe(`Application status. One of: ${JOB_STATUS_VALUES.join(", ")}.`),
  dueDate: z.string().datetime({ offset: true }).optional(),
  applied: z.boolean().optional(),
  appliedDate: z.string().datetime({ offset: true }).optional(),
  jobUrl: z.string().url().optional(),
  salaryRange: z.string().optional(),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "Skills required for the job, e.g. ['React', 'TypeScript']. Replaces the job's existing tags wholesale rather than merging, so include the tags returned by find_job that should be kept (max 10 applied).",
    ),
};

export const McpUpdateJobSchema = z.object({
  ...McpUpdateJobInputShape,
  dueDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
  appliedDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
});

export type McpUpdateJobInput = z.infer<typeof McpUpdateJobSchema>;

// Batch wrappers — the per-item shapes are reused verbatim so the batch and
// single-item tools can never drift apart.
export const McpAddJobsBatchInputShape = {
  jobs: z
    .array(z.object(McpAddJobInputShape))
    .min(1)
    .max(APP_CONSTANTS.MCP_BATCH_MAX_ITEMS)
    .describe(
      `Up to ${APP_CONSTANTS.MCP_BATCH_MAX_ITEMS} jobs, each with the same fields as add_job. Processed in order; each item consumes one unit of the MCP rate-limit budget.`,
    ),
};

export const McpAddJobsBatchSchema = z.object({
  jobs: z.array(McpAddJobSchema).min(1).max(APP_CONSTANTS.MCP_BATCH_MAX_ITEMS),
});
export type McpAddJobsBatchInput = z.infer<typeof McpAddJobsBatchSchema>;

export const McpSaveMatchResultsBatchInputShape = {
  results: z
    .array(z.object(McpSaveMatchResultInputShape))
    .min(1)
    .max(APP_CONSTANTS.MCP_BATCH_MAX_ITEMS)
    .describe(
      `Up to ${APP_CONSTANTS.MCP_BATCH_MAX_ITEMS} match analyses, each with the same fields as save_match_result.`,
    ),
};

export const McpSaveMatchResultsBatchSchema = z.object({
  results: z
    .array(McpSaveMatchResultSchema)
    .min(1)
    .max(APP_CONSTANTS.MCP_BATCH_MAX_ITEMS),
});
export type McpSaveMatchResultsBatchInput = z.infer<
  typeof McpSaveMatchResultsBatchSchema
>;

// Networking tools. Dates are plain strings on purpose: the handlers parse
// YYYY-MM-DD at server-local midnight (as the UI does) and reject anything
// else with a message naming the field, which a model can act on; a zod
// regex here would surface as a protocol error instead. Length limits mirror
// the Contacts and Interaction forms.
const dateOnlyDescription = "YYYY-MM-DD (a calendar date, no time or timezone), e.g. '2026-09-20'.";

export const McpFindContactInputShape = {
  query: z
    .string()
    .min(1, "query is required")
    .describe(
      "Text to look for in the contact's name, email or title (substring, not case-sensitive for plain letters). A name is enough.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum contacts to return (default 10, max 25)."),
};

export const McpFindContactSchema = z.object(McpFindContactInputShape);
export type McpFindContactInput = z.infer<typeof McpFindContactSchema>;

export const McpAddContactInputShape = {
  name: z
    .string()
    .min(1, "name is required")
    .max(120, "name must be 120 characters or fewer")
    .describe("The person's full name, as written in the source."),
  title: z.string().max(120).optional().describe("Job title, if stated."),
  email: z.string().optional().describe("Email address, only if stated."),
  phone: z.string().max(40).optional().describe("Phone number, only if stated."),
  linkedinUrl: z
    .string()
    .optional()
    .describe("Full LinkedIn profile URL starting with https://, only if stated."),
  company: z
    .string()
    .optional()
    .describe("Where they work now. Matched to an existing company by name, or created."),
  location: z
    .string()
    .optional()
    .describe("City or region, if stated. Matched to an existing location by name, or created."),
  relationship: z
    .string()
    .max(120)
    .optional()
    .describe("How the user knows them, e.g. 'former manager', 'met at a conference'. Only if stated."),
  role: z
    .string()
    .optional()
    .describe("What this person is to the user, e.g. 'Recruiter', 'Referrer'. Matched to an existing role by name, or created."),
  notes: z.string().max(2000).optional().describe("Free-form notes. Only facts present in the source."),
  lastContactedAt: z
    .string()
    .optional()
    .describe(`Date the user last spoke to them. ${dateOnlyDescription} Not in the future.`),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe(
      "Create the contact even though an existing one has the same name, email or LinkedIn URL. Set only after the user has confirmed it is a different person.",
    ),
};

export const McpAddContactSchema = z.object(McpAddContactInputShape);
export type McpAddContactInput = z.infer<typeof McpAddContactSchema>;

export const McpLogInteractionInputShape = {
  contactId: z
    .string()
    .min(1)
    .optional()
    .describe("The contact's id, as returned by find_contact or add_contact. Preferred. Provide this or contactName, not both."),
  contactName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The contact's full name, accepted only when it matches exactly one saved contact. Anything ambiguous or partial logs nothing and returns candidates. Provide this or contactId, not both.",
    ),
  purpose: z
    .string()
    .min(1)
    .describe(
      "Why you were in touch, e.g. 'Coffee Chat', 'Advice Call', 'Referral Request', 'Follow-up', 'Thank-you'. Matched to the user's own list of purposes (case-insensitive); created if it isn't there.",
    ),
  occurredAt: z
    .string()
    .optional()
    .describe(`Day the interaction happened. ${dateOnlyDescription} Defaults to today. A future date records a planned interaction.`),
  outcome: z
    .string()
    .max(2000)
    .optional()
    .describe("What was said or decided. Only facts present in the source; do not embellish."),
  nextStep: z
    .string()
    .max(500)
    .optional()
    .describe("A follow-up action the user committed to or was asked to do. Only if stated in the source."),
  nextStepDate: z
    .string()
    .optional()
    .describe(`When the next step is due. ${dateOnlyDescription} Requires nextStep and cannot be before occurredAt. Only if a date is stated.`),
  jobId: z
    .string()
    .min(1)
    .optional()
    .describe("Id of a saved job this interaction relates to, as returned by add_job or find_job."),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe(
      "Log another interaction even though one with the same contact, date, purpose and outcome already exists. Leave unset when retrying or re-processing the same source.",
    ),
};

export const McpLogInteractionSchema = z.object(McpLogInteractionInputShape);
export type McpLogInteractionInput = z.infer<typeof McpLogInteractionSchema>;

// No arguments — always the caller's own due follow-ups.
export const McpListFollowupsInputShape = {};

export const McpListFollowupsSchema = z.object(McpListFollowupsInputShape);
export type McpListFollowupsInput = z.infer<typeof McpListFollowupsSchema>;
