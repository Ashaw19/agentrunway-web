# Phone navigation cleanup

Andrew, 2026-10-20: the iOS app "still seems messy and maybe a bit more difficult to navigate than it should be." He asked for a proposal, then: "You decide based on what other award winning comparable apps do."

## What was wrong

- Three kinds of floating circle: the raised purple Search tab, the dashboard's "+", and a mic on Clients and Deals. They look alike and do different things.
- "More" held 19 rows in two flat lists under a second copy of the stats and the Runway Score. Daily screens (Checklist, Flight Crew, Expenses, Mileage) sat beside once-ever ones (Import from Contacts, Voice Quiz, Legal).
- "Scan Receipt" opened the whole Expenses page.
- Screens opened from the dashboard (Briefing, Checklist, Flight Control, Expenses) switched to the More tab, so Back went to More, not to where you were.
- A search result only switched tabs; it never opened the client or deal tapped.
- Adding things was spread across the dashboard "+", Search's quick actions, the mics, and More.

## What comparable apps do (research, 2026-10-20)

- Apple HIG, Tab bars: use a tab bar only to navigate, not to perform actions. iOS 26 sets Search apart as its own circle at the trailing end of the tab bar (Music, Photos, App Store).
- Primary actions: a floating "+" (Things 3, an Apple Design Award winner, "Magic Plus"; Material's FAB) or a "+" quick-action menu (Follow Up Boss, the leading realtor CRM: email, text, note from one "+").
- Account and settings: the avatar at the top of the main screen (App Store, Music), not a tab.

Sources: developer.apple.com/design/human-interface-guidelines/tab-bars; mjtsai.com/blog/2026/01/09/search-vs-primary-action-in-the-ios-26-tab-bar; macstories.net Things 3 review; help.followupboss.com quick actions; updates.followupboss.com (Jan 2025 "+" menu).

## Decisions

1. **The system tab bar** (`expo-router/unstable-native-tabs`, Liquid Glass on iOS 26): Today, Clients, Deals, Money, and Search as the separate search-role circle. It shrinks when scrolling down. Badges stay as they were.
2. **One "+"**, floating bottom right on Today, Clients, Deals and Money. Its sheet: Voice note, Log a call or text, Receipt, Trip, Client, Deal. It replaces the dashboard "+", Search's quick actions and the Clients/Deals mics. No To-do: the phone's Checklist can't add one yet. The sheet can't be closed while a voice note is being recorded or read.
3. **Money tab**: Expenses, Mileage and Forecast behind one segmented control. `/money?view=expenses|mileage|forecast`; `scan=1` opens the receipt camera.
4. **Search finds and asks.** A result opens the record. Typing offers "Ask Flight Crew" with the words typed; the empty screen offers it too.
5. **You**: settings only, opened from your initials at the top of Today. Your business (Goals and settings, Business identity, Voice quiz), App (Notifications, Appearance, Language), Account (Subscription, Legal and privacy, Sign out). No repeated stats.
6. **Everything else moves to where it's used**: Flight Crew, Briefing, Checklist and Flight Control from Today's "Go to" list (always there) as well as its cards and rows; AI activity from the Flight Crew screen; Import and Fill in from Contacts from a menu on Clients.
7. **Secondary screens push over the tabs** with Back returning to where you came from (`profile/*` become screens of the app's root stack, not a tab). From one of them, a tab is reached with `router.dismissTo`, never a push (a push stacks a second copy of the tabs).

Not changing: the web app; the screens' contents beyond what moves; brand names (Flight Crew, Flight Control).

## Built (2026-10-20)

- On the iOS 27 simulator the system Search item sits inside the tab bar's capsule rather than in its own circle: react-native-screens sets the system search item, not UIKit's newer search tab. It still reads as the system's own Search.
- Badges as before: Today (overdue to-dos), Clients (overdue follow-ups and uncontacted leads), Deals (pending deals and hot pipeline).
- Money keeps all three views mounted, so switching views never drops a receipt mid-review.
