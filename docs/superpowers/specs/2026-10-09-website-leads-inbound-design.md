# Website leads → Agent Runway (inbound) — design

Status: approved by Andrew 2026-10-09 ("yes, start on #1 and fix the footer box").

## Goal

Every sign-up, message and unsubscribe on the agent's own website
(andrew.agentrunway.ca) lands in the CRM as it happens, replacing the manual
CSV export. Unsubscribes must arrive too, so a live hand-off can never make
Agent Runway email someone who opted out.

## Shape

- **Auth:** one key per account. It's made in Settings → Website leads, shown
  once, and stored only as a sha256. Making a new key revokes the old one.
- **Endpoint:** `POST /api/inbound/website` with `Bearer <key>`. Server-to-server,
  excluded from the middleware, rate-limited to 120 per 10 minutes per account.
- **Event body:** `type` lead | unsubscribe, `event_id` (idempotency), `source`,
  `contact`, optional message / address / detail / open_house / consent. The
  schema is in `lib/inbound/website-event.ts`.
- **Rules:** see the header of `lib/inbound/website-event.ts`. They're pure and
  unit-tested.
  - Statuses and tags match the site's CSV export, so retiring the CSV changes
    nothing.
  - Each event leaves a note, which doesn't count as contact.
  - Warm events get a Checklist item.
  - A global unsubscribe sets `clients.email_opt_out_at`.
- **Opt-out gate:** `email_opt_out_at` makes every email drafter call-only:
  - Scan cards and the nightly drafter (detect-opportunities)
  - `draftOutreachForClient`
  - `draftWorkflowMessage`

  The newsletter Recipients note lists those clients. `fn_merge_clients`
  carries the opt-out through a merge.
- **Schema:** 00173 adds `inbound_keys`, `inbound_events` (unique
  `(user_id, event_id)`) and `client_email_consents`, plus the two opt-out
  columns on `clients`.

## Not in this change

- Express consent unlocking email for CASL-lapsed past clients (item #2 of the
  proposal). The consents are stored now, for that later.
- Activity signals from the site (client-page marks and views) and Ask Andrew
  hand-off (#3, #4).
- Backfill of contacts the site captured before the connection. The CSV
  export stays for that.

## Website side (andrew-shaw-realtor repo)

- `lib/agent-runway.ts` posts after the site's own write succeeds, using
  `after()` with one retry. With no key set it does nothing.
- Footer box: it now joins the market letter with the same unticked consent
  box, wording and unsubscribe link as the main sign-up.
