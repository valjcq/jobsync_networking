---
type: reference
title: MCP Contact and Profile Tools
description: The MCP tools that correct, merge, delete, list, bulk-add and link contacts and interactions, set an outreach status, and read or edit your own profile.
feature: mcp
tags: [mcp, tools, update_contact, merge_contacts, delete_contact, list_contacts, list_interactions, add_contacts_batch, log_interactions_batch, link_contact_to_job, get_profile, update_profile, outreach status]
aliases: [edit contacts with ai, merge duplicate contacts, outreach status, agent profile]
status: stable
stale_after: 2027-11-17
---

# MCP Contact and Profile Tools

These thirteen tools extend the networking tools on [MCP Tools](./mcp-tools.md). The contact and interaction tools need the **networking:write** scope; the two profile tools need **resume:write**. See [Insufficient scope](./mcp.md#why-do-the-networking-or-todo-tools-say-insufficient-scope).

## How does the agent correct, merge or delete contacts and interactions?

- **update_contact** — edits any field of a contact: name, title, email, phone, LinkedIn URL, company, location, role, relationship, notes, last-contacted date and outreach status. Only the fields the agent supplies change, and `null` clears one. A new name, email or LinkedIn URL that another contact already has is refused and the matches are returned.
- **add_contact_note** — appends a dated line to a contact's notes without touching what is already there. Use it instead of rewriting the notes.
- **update_interaction** — corrects a logged interaction: contact, purpose, date, outcome, next step, next-step date or linked job. An edit that would duplicate another interaction is refused. **Last contacted** is recalculated.
- **delete_interaction** — removes one logged interaction.
- **delete_contact** — deletes a contact with its interactions and job links. It is two-step: the first call only says what would be removed, and nothing is deleted until the agent calls again with `confirm` after you agree. Todos linked to the contact are kept.
- **merge_contacts** — folds a duplicate into the contact you keep: interactions, job links and todos move over, empty fields are filled from the duplicate, and the duplicate is deleted. Also two-step. Where both have a value, the kept contact's wins, and the agent is told what was dropped.
- **link_contact_to_job** — attaches a contact to a job with a role for that job (Recruiter, Referrer…). The role defaults to the contact's own role. Linking the same contact, job and role twice changes nothing.

## What is the outreach status?

Contacts can carry a status for running outreach in waves: **drafted**, **sent**, **replied**, **meeting_scheduled** or **no_reply**. The agent sets it with `add_contact`, `add_contacts_batch` or `update_contact` and filters on it with `list_contacts`. The status is shown by `get_contact`; the Contacts page in the app does not show or edit it yet, and editing a contact there leaves it unchanged.

## How does the agent list and filter contacts and interactions?

- **list_contacts** — lists contacts, filterable by company, role, status, last-contacted date (before, after, or never) and whether a next step is due. Good for "who haven't I contacted since September?" or "who is still marked sent?".
- **list_interactions** — lists logged interactions, newest first, filterable by contact, purpose and date range, optionally only those with an open next step. Good for "what happened this week?".

## How does the agent add many contacts or interactions at once?

- **add_contacts_batch** — up to 10 contacts in one call, each handled exactly like `add_contact` (including the duplicate refusal and status). A refused duplicate does not stop the rest.
- **log_interactions_batch** — up to 10 interactions in one call, each handled exactly like `log_interaction`.

Each item in a batch counts against the [rate limit](./mcp.md#why-is-my-agent-not-connecting-or-not-seeing-the-tools) separately.

## How does the agent read and edit my profile?

- **get_profile** — reads your name, headline, summary, target roles, target locations and links.
- **update_profile** — edits them. Name, headline, summary and links are the ones on your **default resume** (so the app shows the change too, and the resume needs contact info); target roles and locations are stored on your profile. Lists and links replace the whole value. These two tools need the **resume:write** scope.
