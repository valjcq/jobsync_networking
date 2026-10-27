# PLAN — JobSync next iteration (MCP search, todos, MCP roadmap, resume fix, mobile)

> Planning only. After approval this content is written to `PLAN.md` at the repo root (left uncommitted).
> No code is changed by this plan. `DEPLOY_FORK.md` and `UPDATE.md` stay untouched.

## Context

The networking iteration (contacts, interactions, `networking:write`) is live. Five follow-ups:
1. Claude can only find a job **by URL** (`find_job`) and a contact by substring (`find_contact`). It can't find anything by name or keyword without you pasting a link or ID.
2. MCP has no way to create todos.
3. You want a ranked list of other MCP additions.
4. A resume warning appears on every new job application.
5. Popups don't fit on a phone (~390px).

**Decisions you already made:** add a new `tasks:write` scope. Writes to UI-created jobs are allowed only through narrow status/notes tools, and `update_job` stays MCP-only. Item 4 gets **both** fixes: pre-select the default resume, and read the PDF text when a resume has no sections. Item 5 covers **all popups**.

**Baseline warning:** `main` (local and `origin/main`, at `527333e chore(release): 1.1.20`) does **not** contain `feature/networking`. `git cat-file -e main:src/lib/mcp/tools/findContact.ts` fails. All tracks below branch from **`feature/networking` @ `c6cfb4f`**, the code you actually deployed, not from `main`.

---

## 1. Repo findings per item

### Item 1 — MCP search
- **Server:** [src/app/api/mcp/route.ts](src/app/api/mcp/route.ts) is stateless (`McpServer` + `WebStandardStreamableHTTPServerTransport`, JSON responses). Each tool repeats the same block: scope check → `Schema.safeParse` → `handleX(parsed.data, userId[, tokenName])`.
- **Tool text:** descriptions live in [src/lib/mcp/toolDescriptions.ts](src/lib/mcp/toolDescriptions.ts), which `evals/mcp-tools` asserts against. Zod shapes live in [src/models/mcp.schema.ts](src/models/mcp.schema.ts).
- **Handlers:** in `src/lib/mcp/tools/*.ts`. Each one calls `checkMcpRateLimit(userId)` and returns `{content:[{type:"text",text}]}`.
- **What exists today:**
  - `find_job` ([findJob.ts](src/lib/mcp/tools/findJob.ts)) matches by URL only, through `findExistingJobByUrl`.
  - `find_contact` ([findContact.ts](src/lib/mcp/tools/findContact.ts)) runs a SQL `contains` on name/email/title via `contactSearchFilter` ([src/lib/networking/contacts.ts:80](src/lib/networking/contacts.ts#L80)). SQLite `LIKE` only folds ASCII case, so "jose" misses "José".
  - Nothing searches companies, interactions or tasks, and nothing searches jobs by title or company.
- **Code to reuse:**
  - `canonicalizeEntityValue` ([src/lib/jobs/canonicalize.ts](src/lib/jobs/canonicalize.ts)) folds case, diacritics and commas, and can strip legal suffixes.
  - [src/lib/networking/contactMatch.ts](src/lib/networking/contactMatch.ts) already matches names **in memory** over a slim index, on purpose, because of the SQLite case-folding issue. Search should follow the same approach.
- **Data:** SQLite through Prisma. There is no FTS, and none is needed at personal scale.

### Item 2 — Todos via MCP
- **Model:** the "todo" is the `Task` model ([prisma/schema.prisma](prisma/schema.prisma), `model Task`). Its fields are `title`, `description` (HTML from TipTap), `status` (`in-progress | complete | needs-attention | cancelled`, see [src/models/task.model.ts](src/models/task.model.ts)), `priority` 0–10, `percentComplete`, `dueDate`, an optional `activityTypeId`, and `activities[]`.
- **No link to Job or Contact** → **a migration is needed.**
- **No provenance field:** `Job` and `Question` have `createdVia`, but `Task` has nothing similar.
- **Server actions:** [src/actions/task/mutations.ts](src/actions/task/mutations.ts) and `queries.ts` depend on the session (`requireUser()`), so MCP can't call them.
  - [src/models/addTaskForm.schema.ts](src/models/addTaskForm.schema.ts) rejects past due dates. That's fine for the form, but MCP needs its own rules.
- **Pattern to copy:** commit `f2b26d1` extracted session-free cores into [src/lib/networking/interactions.ts](src/lib/networking/interactions.ts) ("every function takes the caller's userId and throws"). Tasks need the same treatment.
- **Backup:** Task is covered in [src/lib/backup/schema.ts](src/lib/backup/schema.ts) (`const Task`), [ordering.ts](src/lib/backup/ordering.ts) (`MODEL_SPECS.Task`, `INSERT_ORDER`) and [idmap.ts](src/lib/backup/idmap.ts) (`OPTIONAL_FKS`). `Task` is already inserted after `Job` and `Contact`, so new foreign keys don't require reordering.
- **Overlap:** `Interaction.nextStep` / `nextStepDate` / `nextStepDoneAt` is a second, contact-scoped kind of todo, and `list_followups` reads it. Todos and follow-ups should stay separate models, but the daily-agenda tool (item 3) shows both.

### Item 3 — Gaps that limit Claude today
- **`update_job` is MCP-only.** It filters on `createdVia: { not: null }` ([src/lib/jobs/updateJobFromNames.ts:65](src/lib/jobs/updateJobFromNames.ts#L65)), so Claude can't change the status of a job you added in the UI.
- **`Note` (job notes) has no MCP tool.**
- **No detail reads.** There's no `get_job` or `get_contact`, so Claude can't see notes, linked contacts or the interaction history.
- **Follow-ups can be listed but not completed** (`nextStepDoneAt` is never set via MCP).
- **No `server.prompt` or `server.resource`** is registered.
- **Reusable session-based logic:** `updateJobStatus` ([src/actions/job/status.ts](src/actions/job/status.ts)) holds the applied/interview side effects. It is session-based and needs a core extracted. The in-app agent tools in `src/lib/agent/tools/*` (getResume, matchJob, …) are also reusable references.

### Item 4 — Resume warning (source found and verified on live data)
- **Exact source:** [src/lib/mcp/tools/matchDirective.ts:82-88](src/lib/mcp/tools/matchDirective.ts#L82-L88), inside `buildMatchOffer()`:
  ```
  const pre = await preprocessResume(resume);
  if (!pre.success) → "Default resume couldn't be used for matching (it may be too short or missing content) — check it in Profile → Resumes."
  ```
  - `composeOfferMessage` appends it to every `add_job`, `add_jobs_batch` item and `update_job` response whose description isn't `title-only`.
  - The same check appears in [src/lib/mcp/tools/reviewResume.ts:54-60](src/lib/mcp/tools/reviewResume.ts#L54-L60).
- **Condition:** `preprocessResume` ([src/lib/ai/tools/preprocessing.ts](src/lib/ai/tools/preprocessing.ts)) → `convertResumeToText` builds text **only from `ContactInfo` and `ResumeSections`**, then `preprocessText` fails when the result is under `MIN_CHAR_COUNT = 200` characters (line 45, check at ~line 265). The attached PDF/DOCX file is never read.
- **Why it now fires every time:** commit `d826dc3` removed the AI auto-fill/structuring that turned an uploaded PDF into sections (`resumeImport.actions.ts`, `api/ai/resume/import/route.ts`, `useResumeImport.ts`, …). Your default resume **is** set, but it is file-only, so it can never pass.
  - **Verified:** calling `review_resume` on your instance just now returned `Default resume couldn't be used for review…`.
- **Same blind spot elsewhere:** [src/lib/agent/tools/matchJob.ts:68](src/lib/agent/tools/matchJob.ts#L68), [getResume.ts:35](src/lib/agent/tools/getResume.ts#L35), [reviewResume.ts:58](src/lib/agent/tools/reviewResume.ts#L58), [generateCoverLetter.ts:75](src/lib/agent/tools/generateCoverLetter.ts#L75) and [src/actions/automation/analyze.ts:77](src/actions/automation/analyze.ts#L77). In-app chat matching, cover letters and automation scoring are **all** broken the same way for file-only resumes.
- **Can it simply be removed?** Not safely. The note is the only signal that matching is off, and removing it leaves matching silently dead. A one-time "remembered" dismissal has the same flaw. The real fix is to give the pipeline text, after which the note only fires for genuine failures (no file, scanned PDF).
- **Building blocks that survived the removal:**
  - `extractText(buf)` in [src/lib/ai/import/extract-text.ts](src/lib/ai/import/extract-text.ts) handles PDF and DOCX, with a timeout and a `NO_TEXT` error for scans. It's still used by `src/app/api/profile/resume/route.ts`.
  - `isResumeFilePath` / `resumesDir` in [src/lib/resumeFiles.ts](src/lib/resumeFiles.ts) handle path confinement.
  - `resumeDetailInclude` already includes `File`.
- **"Pre-select the default resume":**
  - **UI:** [src/components/myjobs/AddJob.tsx](src/components/myjobs/AddJob.tsx) leaves `newJobDefaultValues` (≈line 119) without a `resume`. `getDefaultResumeId()` exists in [src/actions/profile/defaultResume.ts](src/actions/profile/defaultResume.ts).
  - **MCP:** `createJobFromNames` never sets `resumeId`.

### Item 5 — Mobile (~390px). Static audit; Track C confirms it with screenshots
**Popups (all of them):**
| Where | Problem at 390px | Severity |
|---|---|---|
| **Base `DialogContent`** [src/components/ui/dialog.tsx:41](src/components/ui/dialog.tsx#L41) | `w-full max-w-lg p-6`, centred with translate. No max-height and no scroll by default. Edge-to-edge, with no rounding below `sm`. | Root cause |
| `CreateResume`, `AddContactInfo`, `AddCompany`, `AddResumeSummary`, `CreateCoverLetter` | Use `lg:max-h-screen overflow-y-scroll` only, so below `lg` there's no height cap and the scroll does nothing. Taller content is cut off, and the footer/Save button can be unreachable. | **Unusable** |
| `AddJob` (AddJob.tsx:279) | `h-full … overflow-y-scroll`, plus `p-6` and a form `p-4` (~300px usable width). Comboboxes and the TipTap editor sit in a squeezed column. The Save button is at the very bottom of a long scroll. | Poor |
| `AddExperience`, `AddEducation`, `AddCertification` | Same `h-full md:h-[85%]` pattern as AddJob. | Poor |
| `AddContact`, `InteractionForm`, `TaskForm`, `QuestionForm`, `ActivitiesContainer` dialog, `NoteDialog`, `AutomationWizard`, `PurposeManager`, `AddSkills` | `max-h-[85–90vh]`. On iOS Safari `vh` includes the URL bar, and the on-screen keyboard covers the footer. Should use `dvh`. | Medium |
| `DiscoveredJobDetail` | `max-h-[90vh]` without `overflow-y-auto`, so long descriptions are clipped. | **Unusable** for long jobs |
| `PdfExportDialog`, `ResumePreviewDialog` | Fixed `h-[85/90vh]` with a PDF iframe at 390px wide. | Medium |
| **Chat AI panel** [src/components/agent/AgentChatPanel.tsx:58](src/components/agent/AgentChatPanel.tsx#L58) (button: [AgentChatTrigger.tsx](src/components/AgentChatTrigger.tsx)) | Full-width, **non-modal** sheet (`modal={false}`, no overlay), so the page behind still scrolls. `h-full` on `inset-y-0` with the keyboard open hides the input. The header row is crowded. [AgentMarkdown.tsx](src/components/agent/AgentMarkdown.tsx) has no `overflow-x` for tables or code, so wide content overflows. | Poor |
| AlertDialogs (delete/confirm) | Small; probably fine. Verify only. | Low |

**Pages:**
| Page | Problem | Severity |
|---|---|---|
| Settings [src/app/dashboard/settings/page.tsx:19](src/app/dashboard/settings/page.tsx#L19) + [SettingsSidebar.tsx:31](src/components/settings/SettingsSidebar.tsx#L31) | `flex gap-6` with a `w-48 shrink-0` side nav that's always shown, leaving ~150px for content. | **Unusable** |
| Job details tabs [src/components/myjobs/JobDetails.tsx:202](src/components/myjobs/JobDetails.tsx#L202) | 5 triggers plus badges in a `TabsList` with no `overflow-x`, which causes horizontal page scroll. | Poor |
| Tasks [TasksSidebar.tsx:32](src/components/tasks/TasksSidebar.tsx#L32) | `hidden md:flex`, so the activity-type filter isn't reachable on mobile. | Degraded |
| Tables (MyJobs, Contacts, Activities, Tasks) | Already hide columns at `sm`/`md`. | OK (verify) |
| Toolbars (`w-[140px]`, `w-[160px]`, `w-[180px]` selects) | They wrap. | OK (verify) |

---

## 2. Dependencies and conflicts between items

| File / area | Touched by |
|---|---|
| `src/app/api/mcp/route.ts`, `src/lib/mcp/toolDescriptions.ts`, `src/models/mcp.schema.ts`, `src/actions/mcpToken.actions.ts` (scope list), `wiki/mcp.md`, `evals/mcp-tools/*` | Item 1, Item 2, Item 3 → **kept in a single track (A)** |
| `prisma/schema.prisma` + new migration, `src/lib/backup/{schema,ordering,idmap}.ts` | Item 2 only (A) |
| `src/components/myjobs/AddJob.tsx` (+ `__tests__/AddJob.spec.tsx`) | Item 4 (default `resume` value) **and** Item 5 (`DialogContent` classes). Different lines; trivial merge. |
| `src/components/tasks/TaskForm.tsx`, `TasksTable.tsx` | Item 2 (show/pick the linked job/contact) **and** Item 5 (dialog classes). Small conflict. |
| `src/lib/jobs/createJobFromNames.ts` | Item 4 (default `resumeId`). Item 1/3 only read jobs → no conflict. |
| `src/lib/mcp/tools/matchDirective.ts`, `reviewResume.ts` | Item 4 (note wording only). A doesn't touch them. |
| `src/components/ui/dialog.tsx`, `ui/sheet.tsx` | Item 5 only, but they **change every dialog** → regression risk for A and B UI work |
| `playwright.config.ts` | Item 5 only |

**Order:** B is the smallest change and the most urgent, so merge it first. Then C; resolve the AddJob/TaskForm class conflicts there. Merge A last, or whenever it's ready, since its migration is independent.

---

## 3. Parallel tracks (git worktrees)

```bash
# base = deployed code, NOT main (main lacks feature/networking)
git worktree add ../jobsync-wt-mcp    -b feature/mcp-search-todos      feature/networking
git worktree add ../jobsync-wt-resume -b fix/resume-text-and-default   feature/networking
git worktree add ../jobsync-wt-mobile -b fix/mobile-popups             feature/networking
```
Each worktree needs its own `npm ci` (or a symlinked `node_modules`), its own `.env` with a **separate SQLite file** (`DATABASE_URL=file:./wt-<name>.db`), and a different dev port. Playwright's `baseURL` is `localhost:3737`; set it through an env override in C.

### Track A — MCP: search, todos, quick-win tools (items 1, 2, top of 3)
**Tasks**
1. **(Optional pre-step, its own commit)** Add a small `gate(scope, schema, handler)` helper in `route.ts` to remove the copy-pasted scope/validate block. It reduces the diff for the ~8 new tools. Same behaviour, same messages.
2. **Search library** `src/lib/search/` (pure, unit-tested):
   - **Index builders per entity, using slim `select`s:**
     - job: title, company, location, status, tags, `appliedDate`, `createdAt`
     - contact: name, email, title, company
     - company: label, website, plus job and contact counts
     - interaction: contact name, purpose, outcome, nextStep, date
     - task: title, plain-text description (`toPlainText` from `src/lib/tasks/description.ts`), status
   - **Scoring on `canonicalizeEntityValue`:** exact > prefix > all tokens contained > fuzzy token (Levenshtein ≤1 for tokens ≥5 chars, ≤2 for ≥9).
   - Per-field weights (title/name > company > other). Ties broken by recency.
   - **Optional `includeDescription`:** also SQL-`contains` on `Job.description` for keyword hunting, ASCII-only. That limitation is documented.
3. **New tool `search`:** `{ query, types?: ("job"|"contact"|"company"|"interaction"|"task")[], limit? }`.
   - Returns compact grouped lines, one per hit, each with an `id` and a short qualifier (e.g. `- [job] Data Engineer @ Acme (id: …, status: applied, applied 2026-09-30)`).
   - Says whether each match was exact or fuzzy, so Claude knows to confirm fuzzy ones.
   - **Scope-aware:** jobs and companies need `jobs:write`, contacts and interactions need `networking:write`, tasks need `tasks:write`. Types the token can't read are skipped with a one-line notice instead of failing the whole call.
   - **Description text** asserted in evals: "use this whenever the user names something without an id; never pick between fuzzy candidates yourself."
   - Update the `find_job` description to point to `search` for name lookups. Keep `find_contact` unchanged, since `log_interaction` relies on it.
4. **Migration `add_task_links`:**
   - `Task.jobId String?` → `Job` with `onDelete: SetNull`.
   - `Task.contactId String?` → `Contact` with `onDelete: SetNull`.
   - `Task.createdVia String?` (provenance, mirroring Job/Question).
   - Indexes `[userId, jobId]` and `[userId, contactId]`.
   - Back-relations on `Job` and `Contact`.
   - Additive and nullable → safe on existing data.
   - Generate it with `npx prisma migrate dev --name add_task_links --create-only` in the worktree DB and review the SQL.
5. **Backup:**
   - Add `jobId`, `contactId` and `createdVia` as optional fields in `backup/schema.ts`. Old backups must still validate.
   - Add `fks: { activityTypeId, jobId: "Job", contactId: "Contact" }` in `ordering.ts`.
   - Add `"Task.jobId"` and `"Task.contactId"` to `OPTIONAL_FKS`.
6. **Session-free task core** in `src/lib/tasks/tasks.ts`:
   - Functions: `createTaskForUser`, `listTasksForUser`, `updateTaskForUser`, `setTaskStatusForUser`.
   - Each validates that a linked `jobId` or `contactId` belongs to the user.
   - Refactor `src/actions/task/mutations.ts` to wrap them (the `f2b26d1` pattern).
   - **Description:** plain text in, wrapped as `<p>` HTML for TipTap.
7. **MCP tools gated on new scope `tasks:write`:**
   - `add_todo` `{title, description?, dueDate? YYYY-MM-DD, priority?, jobId?, contactId?, jobQuery?/contactName?}`
     - A name is accepted only when it resolves to exactly one record; otherwise the tool returns the candidates (same rule as `log_interaction`).
     - Duplicate guard: same title, same link and an open status → returns the existing todo unless `allowDuplicate` is set.
   - `list_todos` `{status? (default open = in-progress + needs-attention), dueBefore?, jobId?, contactId?, limit?}`
   - `update_todo` `{todoId, title?, description?, dueDate?, priority?, status?, jobId?/contactId? (null to unlink)}`
   - `complete_todo` `{todoId}` → status `complete` and `percentComplete` 100.
   - Add `"tasks:write"` to the scope array in `mcpToken.actions.ts:46` and to the schema comment in `prisma/schema.prisma` (`McpAccessToken.scopes`).
8. **Item-3 quick wins (ranked #1–#5 below):**
   - `get_job`, `set_job_status` (any owned job; extract a session-free core from `src/actions/job/status.ts`), `add_job_note`, `get_contact`, `complete_followup`.
   - Status and notes go under `jobs:write`; contact and follow-up tools go under `networking:write`.
9. **Minimal UI for todo links:**
   - Show a job/contact chip in a `TasksTable` row.
   - Show the job's open todos in a small section on job details.
   - Pickers in `TaskForm` are optional (see questions).
10. **Docs:** add a section to `wiki/mcp.md` (tools + the `tasks:write` scope), and update `wiki/tasks.md`.

**Tests**
- **Vitest, following the `mcpFindContact.spec.ts` / `mcpNetworkingRoute.spec.ts` style:**
  - Scorer unit tests: diacritics, legal suffix, typo, token order, ties.
  - Per-tool handler tests with a mocked Prisma.
  - A route test for scope gating, including an old token missing `tasks:write` getting "Insufficient scope".
  - Task-core tests for ownership of linked IDs.
- **Backup round-trip:** extend `backupRoundTrip.spec.ts` with a linked task. Check that an old backup without the fields still imports.
- **Evals:** `evals/mcp-tools` gets routing cases: "add a todo to call Marie about the Acme job" → `search` then `add_todo`. "Mark Acme as interviewing" → `search` then `set_job_status`.
- **E2E:** extend `e2e/mcp-add-job.spec.ts` style with a search + add_todo flow against a worktree DB.

**Risks**
- **Context size:** search results must stay compact (cap 10 per type, 25 total).
- **Fuzzy matching:** false positives must never auto-resolve a write.
- **Old tokens:** existing tokens lack `tasks:write`, so you must create a new token, as with `networking:write`.
- **Migration on deploy:** goes through the existing entrypoint (`docker-entrypoint.sh`). Additive only.
- **`set_job_status` on UI jobs** widens MCP write access. It's limited to status and notes, as you decided.

### Track B — Resume: text fallback + default pre-selection (item 4)
**Tasks**
1. Add `src/lib/resumes/resumeText.ts` → `getResumePlainText(resume)`:
   - Use the sections text when it's ≥ `MIN_CHAR_COUNT`.
   - Otherwise, if `resume.File`, read the file through a confined path (`isResumeFilePath`) and run `extractText()`.
   - Memoise in-process by `resume.id + updatedAt + FileId`, so `add_jobs_batch` doesn't parse the PDF N times.
2. Make `preprocessResume` ([src/lib/ai/tools/preprocessing.ts](src/lib/ai/tools/preprocessing.ts)) use it. This one choke point fixes **all seven callers** (MCP match/review, agent match/getResume/review/cover letter, automation analyze) at once.
3. Keep the note, but only for real failures, and make it precise: "default resume has no readable text (scanned PDF? OCR isn't supported)" or "has no file and no sections". Touches `matchDirective.ts` and `reviewResume.ts` (MCP + agent).
4. **UI pre-selection:** in `AddJob.tsx`, for **new** jobs only, set `resume` to the default resume ID once `loadResumes()` resolves, if it's in the list and the field is untouched. Load the ID with `getDefaultResumeId()`. Edit mode is unchanged.
5. **MCP pre-selection:** `createJobFromNames` sets `resumeId = user.defaultResumeId` when the job is created with `applied: true` (see open question). No schema change.

**Tests**
- Unit tests for `getResumePlainText`: sections path, file path (PDF fixture in `__tests__/fixtures`), scanned PDF → `NO_TEXT`, path outside `resumesDir` rejected.
- Update `mcpAddJob.spec.ts` and `mcpReviewResume.spec.ts` for a file-only resume → directive, not the note.
- `AddJob.spec.tsx`: the default resume is pre-selected in create mode and not in edit mode.
- **Manual:** after deploying, call `review_resume` via MCP. It should return the resume text instead of today's error.

**Risks**
- PDF extraction cost and latency on every match (mitigated by the memo and the existing timeout).
- Extracted text quality: columns and ordering. Acceptable for matching, but the match prompt should say the text was extracted from a file.
- Privacy: the full resume text is already sent through `review_resume` by design, so nothing new is exposed.

### Track C — Mobile popups and pages (item 5)
**Tasks**
1. **Measure first.**
   - Add a Playwright project `mobile-390` (`viewport 390×844`, `isMobile`, `hasTouch`, WebKit + Chromium) to `playwright.config.ts`.
   - Add `e2e/mobile-audit.spec.ts`. It visits each dashboard route and opens every popup via its trigger. It asserts that `scrollWidth <= innerWidth`, that the dialog box fits inside the viewport, and that the footer/submit button can be scrolled into view and clicked.
   - It saves screenshots to `screenshots/mobile/` so we have before/after evidence.
2. **Fix at the primitive level:**
   - `ui/dialog.tsx` default: `w-[calc(100%-1rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg p-4 sm:p-6`.
   - `ui/sheet.tsx`: `h-dvh` for the side variants.
   - Then strip the per-dialog overrides that fight it (`h-full`, `overflow-y-scroll` without a height cap, `max-h-[85vh]` → `dvh`).
3. **AddJob / Experience / Education / Certification:** full-screen sheet-style on mobile (`h-dvh w-full rounded-none` below `sm`) with a **sticky footer** (Cancel/Save always visible). Drop the double padding.
4. **Chat AI panel:** make it modal below `lg` (stops page scroll bleed), use `h-dvh` and keyboard-safe input (`env(safe-area-inset-bottom)`), add `overflow-x-auto` for tables and `pre` in `AgentMarkdown`, and compact the header.
5. **DiscoveredJobDetail:** add `overflow-y-auto`.
6. **Pages:**
   - Settings: below `md`, swap the side nav for a horizontal scrollable tab row or a select.
   - JobDetails `TabsList`: `w-full overflow-x-auto justify-start`.
   - Tasks: put the activity-type filter in a mobile `Select` in the toolbar.

**Tests**
- The mobile spec above must pass in CI-like local runs.
- Run the existing desktop e2e suite to catch regressions from the `dialog.tsx` change.
- Update vitest snapshots and class assertions if any fail.
- **Manual:** check on a real phone against the deployed fork, especially iOS keyboard behaviour.

**Risks**
- Changing the base dialog affects every dialog, including desktop.
- Radix `Sheet` `modal` toggling by breakpoint needs a `matchMedia` hook (`WeeklyBarChartToggle.tsx` already uses that pattern).
- The audit spec needs seeded data (a job, a contact, a task), so reuse `e2e/fixtures.ts` and `api/test/cleanup`.

---

## 4. Item 3 — ranked shortlist of further MCP additions (not implemented here, except #1–#5 in Track A)

| # | Addition | Value | Effort | Notes |
|---|---|---|---|---|
| 1 | `get_job` (details + notes + linked contacts + interactions + todos + match summary) | High | S | Lets Claude chain after `search`; read-only |
| 2 | `set_job_status` (any owned job; applied/interview side effects) | High | S | Extract a core from `actions/job/status.ts` |
| 3 | `add_job_note` | High | S | `Note` model exists; any owned job |
| 4 | `complete_followup` (set `nextStepDoneAt`, optional new next step) | High | S | Closes the `list_followups` loop |
| 5 | `get_contact` (interactions, linked jobs, open todos) | Med-High | S | |
| 6 | `daily_agenda` (overdue/due todos + follow-ups + job due dates + stale "applied > N days" jobs) | High | M | Best "what should I do today" entry point; read-only |
| 7 | `link_contact_to_job` (JobContact + role) | Med | S | |
| 8 | `list_resumes` + `set_job_resume` (attach a resume version) | Med | S | Pairs with Track B |
| 9 | MCP **prompts** (`weekly_review`, `prep_interview(job)`, `follow_up_drafts`) | Med | S-M | `server.prompt` in the SDK; no new data |
| 10 | `pipeline_stats` (counts by status, response rate) | Low-Med | S | Reuse dashboard actions logic |
| 11 | MCP **resources** (`jobsync://job/{id}`) | Low-Med | M | Stateless server; client support varies |
| 12 | `log_activity` (time tracking) | Low | S | |

---

## 5. Migrations and scopes
- **DB migration:** one, in Track A: `add_task_links` (`Task.jobId`, `Task.contactId`, `Task.createdVia`, plus indexes). It's additive and nullable. Tracks B and C need **no** migration.
- **New MCP scope:** `tasks:write`, which gates `add_todo` / `list_todos` / `update_todo` / `complete_todo` and the `task` type in `search`. It follows the `networking:write` precedent: new tokens get it, and old tokens get "Insufficient scope. Required: tasks:write" until you create a new one. There's no backfill, consistent with existing practice.
- No other new scopes. `search`, `get_job`, `set_job_status` and `add_job_note` use `jobs:write`. `get_contact` and `complete_followup` use `networking:write`.

## 6. Open questions for you
1. **Base branch:** `main` lacks `feature/networking`. Should I branch the worktrees from `feature/networking` (proposed), or do you want `feature/networking` merged into `main` first?
2. **MCP default resume:** should `add_job` attach the default resume only when `applied: true` (proposed), always, or never?
3. **Todo UI scope:** are chips in the table and a list on job details enough, or do you also want job/contact pickers in the `TaskForm` dialog now?
4. **Search over descriptions:** should job-description keyword search be on by default, which costs more tokens, or opt-in (proposed)?
5. **Optional `route.ts` gate helper (A.1):** OK to refactor, or keep the verbose per-tool blocks?

## 7. Verification (end to end)
- In each worktree: `npx vitest run` (targeted specs, then full), `npx tsc --noEmit`, `npm run lint`.
- **A:** `npx prisma migrate dev` on the worktree DB. Create a new MCP token in Settings → MCP access and check that `tasks:write` is listed. Point Claude Code's `jobsync` MCP at the worktree server, then: `search "acme"` → `add_todo` linked by id → `list_todos` → `complete_todo`. Run `evals/mcp-tools` (promptfoo) for routing. Check a backup export/import round trip.
- **B:** call `review_resume` and `add_job` (with a full description) via MCP against a file-only default resume. Expect a directive, not the note. Open Add Job in the UI and check the Resume field is pre-filled.
- **C:** `npx playwright test --project=mobile-390 e2e/mobile-audit.spec.ts`, compare before/after screenshots in `screenshots/mobile/`, and run the full desktop e2e.
