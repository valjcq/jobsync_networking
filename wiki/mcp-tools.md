---
type: reference
title: MCP Tools
description: Every tool a connected AI agent gets over MCP — jobs, search, networking, todos, resume review — what each does and what it will not do without asking you.
feature: mcp
tags: [mcp, tools, search, add_job, set_job_status, add_todo, list_todos, get_job, get_contact, complete_followup, log_interaction, fuzzy match]
aliases: [mcp tool list, agent tools, what can the agent do]
status: stable
stale_after: 2027-10-07
---

# MCP Tools

## What do the job and resume tools do?

Twenty-three tools in all, every one acting on your own data. The networking and todo tools need a scope an older token may lack; see [Insufficient scope](./mcp.md#why-do-the-networking-or-todo-tools-say-insufficient-scope).

- **add_job** — adds a job, resolving or creating company, title, location, source and tags by name, and reporting back what it matched versus created.
- **add_jobs_batch** — the same thing for up to 10 jobs in one call, for a scheduled run.
- **find_job** — checks by URL whether a posting is already saved, before adding it again.
- **update_job** — corrects or enriches a job that was added through MCP. Only the fields supplied change.
- **add_question** — adds an entry to your Question Bank, with tags resolved the same way.
- **review_resume** / **save_resume_review** — hands the agent your default resume and reviewing instructions, then stores the review it writes.
- **save_match_result** / **save_match_results_batch** — stores a job-fit analysis the agent produced after adding a job.

## What do the search and job-reading tools do?

Four tools work on jobs of any origin, including ones you added in the app:

- **search** — finds jobs, contacts, companies, interactions and todos by name or keyword and returns their ids, so the agent can act on "the Acme job" without a link or an id. Case and accents are ignored and small typos are tolerated; a typo match is flagged as fuzzy and the agent is told to confirm it with you rather than act on it. Job descriptions are searched only when the agent asks for it. Kinds your token cannot read are skipped, and the reply says so.
- **get_job** — reads one job in full: status, dates, match score, tags, linked contacts, recent interactions, open todos and the latest notes.
- **set_job_status** — moves a job to a new status. Marking it **Applied** records today as the applied date, exactly as the status menu in the app does.
- **add_job_note** — adds a note to a job. It only adds; it never edits or deletes one.

## What do the networking tools do?

The networking tools work on your [Contacts](./contacts.md) and [Networking](./networking.md) data:

- **find_contact** — looks up saved contacts by name, email or title. The agent calls it first, to get the contact's id. If several people match, or only part of a name does, it shows you the candidates instead of choosing for you.
- **add_contact** — adds a person, resolving or creating company, location and role by name. It refuses a contact whose name, email or LinkedIn URL matches an existing one and returns the matches; the agent adds it anyway only after you confirm it is a different person.
- **log_interaction** — records a conversation with a saved contact, with an optional outcome and next step. The purpose is matched against your list and created if it is missing. Logging the same contact, date, purpose and outcome twice returns the existing entry instead of a duplicate, unless you confirm it is a separate one. **Last contacted** moves forward exactly as it does when you log the interaction yourself.
- **list_followups** — lists the next steps that are due today or earlier, oldest first. It only reads.
- **get_contact** — reads one contact in full: details, linked jobs, recent interactions and their next steps, and open todos.
- **complete_followup** — marks an interaction's next step done, or reopens it. It does not create the next one; the agent uses a todo for that.

## What do the todo tools do?

Four todo tools work on your [Tasks](./tasks.md):

- **add_todo** — creates a todo, optionally linked to a job and/or a contact and with a due date (today or later). The agent passes an id from a search; a name is accepted only when it matches exactly one job or contact, otherwise nothing is created and the candidates come back for you to choose. An open todo with the same title and link is returned instead of duplicated.
- **list_todos** — lists open todos by default, soonest due first, filterable by status, due date, job or contact.
- **update_todo** — changes a todo's title, description, due date, priority, status or links.
- **complete_todo** — marks a todo complete.

Todos the agent creates show the job and contact as small chips on the Tasks list, and a job's open todos are listed on its page.
