# Checklist page — design

Status: approved by Andrew 2026-10-09 ("Create it!") after a mockup.

## Goal

One page where Andrew keeps his to-dos and can see what got done. Ticking off
"Contact <client>" records how he reached them on the client's profile, so the
checklist feeds the CRM instead of living beside it.

## Decisions

- **The checklist is the existing task list (`contact_tasks`).** No new table.
  The same items show on the Checklist page, the client profile's Tasks
  section, the dashboard tasks card and to Flight Crew, so nothing drifts.
- **Items get on the list two ways:** typed in on the page (optional client,
  due date defaulting to today), or one tap on "Add to checklist" from a Flight
  Control card or a client profile (creates "Contact <name>", due today).
  Flight Crew can add items too, with or without a client.
- **Page layout:** add box, then Overdue, Today, Coming up, then "Done this
  week" (Monday start, browser-local) with a count in the header.
- **Ticking a client item opens one pop-up** (same component everywhere a
  client task can be ticked):
  - *Save to their profile*: method Call/Text/Email/Meeting + optional note →
    logs a `contact_activities` row (counts as contact: moves last contact,
    holds them off Flight Control Scan 14 days, may auto-promote), then marks
    the item done with `completed_via` = the method.
  - *Couldn't reach them*: logs a `note` activity "Tried to reach them by
    <method>" (notes aren't contact, 00171) and moves the item to tomorrow.
  - *Just mark done*: `completed_via = 'done'`, nothing logged.
- **Ticking a general item** marks it done (`completed_via = 'done'`) with Undo.
- **Schema:** 00172 adds `contact_tasks.completed_via` (call/text/email/
  meeting/done, nullable for older rows) and a partial index for recently
  completed items.
- Works at phone width (Andrew uses agentrunway.ca in his phone's browser).

## Out of scope (follow-ups)

- Native mobile app parity (Expo home screen still lists tasks the old way).
- Client profile tabs (separate design, next).
- Recurring items, natural-language parsing of "Call Sam Friday".

## Order of writes and failure handling

Contact outcome: activity insert first, then the task update. If the activity
fails, nothing changes and the pop-up stays open with an error. If the task
update fails after the activity saved, the toast says the contact was logged
but the item is still open, so a retry can use "Just mark done" (no duplicate
activity).

## Testing

- Pure helpers (`lib/checklist/checklist.ts`): grouping, week start, tomorrow,
  outcome labels — unit tests.
- Date-only `due_date` parsed with the local-noon anchor (tripwire test).
- Browser check of the page, pop-up and entry points.
