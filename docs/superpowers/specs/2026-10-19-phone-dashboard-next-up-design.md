# Phone dashboard: "Next up" (design)

Date: 2026-10-19 · Owner: Andrew Shaw (the only user) · Surface: iPhone app (`apps/mobile`), plus a shared server route

Mockup (Andrew picked this one): `docs/superpowers/specs/assets/2026-10-19-phone-dashboard-mockup.html`. Open it in a browser. All names, times and numbers in it are made up.

## Why

Andrew opens the app between appointments. Today the dashboard leads with a large Runway Score ring, and the score isn't something he can act on. Below it sit a "3 ready" chip, a "176 follow-ups" chip and one Today's Focus card. In his words, he wants "a welcome and something that makes it easy to navigate to any section that could be updated", and a dashboard that shows "what should be worked on at that time".

## What he decided

These are Andrew's decisions. Don't change them without asking.

1. **The welcome comes first.** It reads "Good morning/afternoon/evening, Andrew", with one line of context under it.
2. **The Runway Score shrinks to a small badge in the top-right corner.**
   - The badge is a mini ring showing the number.
   - It carries a small trend tag (for example "▼ 3", meaning down 3 since last week).
   - It glows red while the score is falling and green while it's rising.
   - Tapping it opens a bottom sheet with the score and grade, the state label, and the five part bars (Pace, Pipeline, Expenses, Bench, Survival) with their values. The sheet names the lowest part and links to the existing full breakdown.
   - The big ring leaves the dashboard.
3. **A "Next up" stack holds the most urgent item.**
   - It's a swipeable stack of cards showing "1 of N" and page dots.
   - Each card has a colour and buttons that suit its job. A new lead gets Call, Text and Later; overdue tasks get "Open checklist" and "Mark one done".
   - An item on the card never also appears in the list below.
4. **An "Also waiting" list sits below the stack.** It has one row per section that has something waiting, with a count, and tapping a row opens that section. Rows can be swiped to mark the item done where "done" has a clear meaning. A section with nothing waiting doesn't appear.
5. **Ranking depends on the time of day as well as urgency.**
   - **Always on top:** a new lead under 48 hours old and not yet contacted, an overdue task, or a deal deadline within 7 days.
   - **Morning:** today's plan, meaning the briefing, today's showings and appointments, and tasks due today.
   - **Between appointments (midday):** calls and texts, meaning today's handful of follow-ups and messages ready to send.
   - **Evening:** wrapping up the day, meaning the voice note prompt, receipts with no date, and trips.
6. **Today's handful replaces "176 follow-ups".**
   - The phone suggests 5 clients a day.
   - **Whose 5:** Flight Control's own pick (`apps/web/lib/crm/top-opportunity-selection.ts`). It ranks by the reason to call (birthday, home anniversary, gone quiet, new lead and so on), with lifetime GCI breaking ties, and it keeps its existing caps. The phone, the web Scan, Flight Crew and the MCP server always show the same people. (Andrew, after the design check.)
   - **Untouched clients stay on the list until handled.** A client he does nothing with is still there tomorrow; he handles them by contacting, skipping, snoozing or stopping suggestions. A client he handles is replaced by the next one in Flight Control's order. Being passed over is not a Skip, and it writes nothing. (Andrew.)
   - When one is dismissed, the next client in Flight Control's order fills the empty spot.
7. **The buttons do the job.**
   - **Text** opens a text that Flight Crew has already drafted and that has passed the CASL check. Andrew presses Send in Messages himself.
   - **Call** dials. When the call ends, the app asks for a 10-second voice note through the existing voice capture, which saves nothing until he confirms.
8. **"Later" offers a choice:** in an hour, tonight or tomorrow. The item comes back at that time.
9. **Progress shows quietly:** "2 of 5 done today" under the welcome. When everything is clear, the card says so and shows what's next, such as the next showing or the next due task, instead of an empty space.
10. **The dashboard opens instantly.** The last saved figures render immediately and refresh in the background. There's no spinner between showings.
11. **Dismissing a suggested client offers four choices.** Nothing is deleted.
    - **"Already talked to them."** One tap logs the contact (call, text or in person) through the usual writers. Their last-contact date resets.
    - **"Later."** In an hour, tonight or tomorrow.
    - **"Skip this time."** It covers this one occasion only, as Flight Control's Dismiss already does (`flight_control_dismissals`, migration 00168: one row per client, opportunity type and trigger date). The client comes back at their next natural reason: the next check-in cycle, an anniversary or a birthday.
    - **"Stop suggesting."** For 3 months, 6 months, or "move to the Hangar". The Hangar is the existing archive (`clients.archived_at` / `archive_reason`, which includes do-not-contact).
12. **What happens to the rest of today's dashboard** (Andrew, after the design check):
    - **The activity streak stays.**
      - *My call on placement:* one small line in the welcome area beside the progress, for example "2 of 5 done today · 6-day streak".
      - No guilt copy when it breaks. It simply shows the new count.
    - **Moves into the score sheet as "Your numbers":** the Key Metrics tiles (YTD GCI, deals, pipeline value) and Goal Progress.
    - **Removed:**
      - The shortcut row (Briefing, Flight Control, Forecast, Receipt). "Also waiting" and the More tab cover it, and the Briefing becomes a morning card.
      - The big score ring, the "176 follow-ups" chip, the Next Task card (it becomes Next up cards) and the Pipeline Preview (deals needing an update appear in "Also waiting").
    - The voice capture button stays where it is.
13. **Phone and web share one set of rules.** Who counts as due a follow-up comes from Flight Control's rules, and dismissals are stored in one place. A skip on the phone is a skip on the web and in the nightly drafts, and the reverse. The phone's current "no contact in 14 days" count (`apps/mobile/app/(app)/index.tsx`, `followUpsDue`) goes away.

## Constraints and facts (verified 2026-10-19)

- **Showings and listing appointments store a date only.** `property_showings.showing_date` and `listing_appointments.appointment_date` are `date` columns with no time. The context line can say "2 showings today", but not "before your 6:00 showing". *My call:* adding times is out of scope for this build.
- **Score history already exists.**
  - `runway_score_history` (migration 00152) is live, with columns `captured_on` (date), `score`, `components` and `cash_runway_months`, and it already holds rows for Andrew.
  - It's written, together with `user_settings.runway_score_snapshot`, when the web dashboard computes the score (`dashboard-content.tsx`, about lines 895–955). The phone only reads it.
  - *My call:*
    - The badge shows the last saved score.
    - Its trend tag compares that score with the latest history row at least 7 days older. With no such row, the tag is hidden.
    - If the last save is more than 3 days old, the sheet says "as of <date>".
    - No server-side recompute and no new history table.
- **The Flight Control ranking lives on the web.** `getTopOpportunities` is in `apps/web/app/api/ai/detect-opportunities/route.ts` (a very large file), and dismissals are read through `apps/web/lib/crm/dismissed-opportunities.ts`.
  - The phone can't import web code (repo rule: `apps/web` never imports `apps/mobile`, shared code goes in `packages/core`).
  - *My call:* the phone gets its ranked list from a server route that both apps can call (auth via `getRequestUser`), and caches the result for instant open and offline use. The rules aren't copied onto the phone.
  - Moving pure pieces into core is fine where it's cheap.
- **CASL.**
  - A send or draft is allowed only per `consentStatus()` (`packages/core/engines/casl-consent-engine.ts`).
  - Drafted texts are `outreach_queue` rows with `channel='sms'` (`draft-text.ts`).
  - A past client 24+ months after their last deal, or a call-only client, gets **Call only, never a Text button**.
  - Nothing is sent automatically.
- **Writes.** Every write (logged contact, skip, snooze, stop suggesting, task done) goes through the shared writers in `packages/core/lib/record-writers.ts` (the phone's are in core `lib/write-rows.ts`). AI-made writes go on the AI ledger (`ai_run_writes`).
- **New tables, RPCs and sequences need explicit Data API grants in the migration.** Guard test: `new-table-grants.test.ts`. Apply migrations as soon as they're created.
- **Time.** Day boundaries and the time-of-day bands use Atlantic time with the existing calendar-day helpers (`atlanticISODate`, `localDaysSince`). Never add a timeZone to a calendar-day Date.
- **Mobile scope policy.** The phone is for capturing, glancing and responding, which this fits. Configuration stays on the web.
- **AI-first principle.** Flight Crew gets a read tool for today's Next up list and its reasons, plus the skip, snooze and stop-suggesting actions as write tools behind the approval card. All of these are mirrored in the MCP server, which then needs a redeploy.
- **Copy.**
  - Plain words and no em dashes.
  - Every new phone string goes in all 10 mobile locales, following the files' existing practice.
  - The score sheet names a part and its number. It never says "good", "strong" or "should".
- **Archived (Hangar) clients and do-not-contact clients are never suggested** (`isArchivedClient` in core).

## Calls made while writing this (not Andrew's decisions; he can overrule them)

- **When the "already drafted" text is written.**
  - The day's handful is chosen on the server.
  - Clients on the handful who can be texted under `consentStatus()` get a text drafted then, through the existing text drafter (`draft-text.ts`). The draft carries Flight Control's reason for the suggestion (birthday, anniversary, gone quiet, new lead) as the drafter's note.
  - That's at most 5 fast-model calls a day.
  - These drafts don't count in "Messages ready" while their client is in the handful, so nothing shows twice.
  - Tapping Text on a client with no draft yet drafts it on the spot, with a short wait indicator.
- **How far "Stop suggesting" reaches.**
  - It hides the client from check-in suggestions everywhere: the phone's handful, Flight Control Scan and the nightly email drafts.
  - It does not hide a consent-lapsing warning. That warning is a one-time notice before a CASL deadline, and missing it leaves call as the only option for that client.
  - "Move to the Hangar" hides everything, as archiving already does.
- **Swiping an "Also waiting" row.** It marks the item done only when the row holds exactly one item. With more than one, tapping opens the section; there is no bulk "mark all".

## Goals

- Opening the app shows the welcome and the top card from cache within about a second.
- Each section with something waiting is one tap from the dashboard.
- Follow-up suggestions are at most 5 a day, ranked by client value.
- Dismissing works exactly as in decision 11, and agrees between phone, web and nightly drafts.

## Non-goals

- A home-screen or lock-screen widget. The free Apple ID install may not allow the needed capability.
- Showing times.
- Push notifications.
- Any change to how the Runway Score is computed.
- Redesigning the web dashboard. The web changes only where the shared rules, dismissals and the new route require it.

## Anti-goals (a failure even if it works)

- Nagging. That means guilt copy or red everywhere; red is for overdue items only. The streak stays (decision 12), but it never scolds.
- Big counts like "176".
- Anything sent or contacted without Andrew pressing the button.
- Suggesting an archived, do-not-contact or call-only client for a text.
- The same item on the card and in the list.
- A first paint slower than today's.
- A skip on the phone that the web ignores, or the reverse.

## Left to the builder

- Visual details within the mockup's style.
- The data model for snoozes, "stop suggesting" and score history. Extend `flight_control_dismissals` or add tables, with grants and RLS.
- The shape of the server route.
- The exact ranking weights and band hours. Write tests for them.
- Which sections appear in "Also waiting", from data that exists today.
  - Expected: Checklist, new leads, messages ready, deals with a passed close date, receipts with no date, today's remaining handful, statement lines to review, and consent lapsing.
  - Leave out any section without a reliable signal.
- Animations and haptics.
