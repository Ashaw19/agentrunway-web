/**
 * The capture extraction prompt: a spoken or pasted note (after a showing or
 * a call) to a list of intents. The reply is checked field by field in core
 * (packages/core/lib/capture/parse.ts); nothing it says is saved until the
 * agent confirms it on the card.
 *
 * To add an intent, follow the EXTENSION POINT list in
 * packages/core/lib/capture/types.ts. The expense item keys below must match
 * lib/types/receipt.ts (lib/__tests__/home-office-keys-parity.test.ts and
 * lib/voice/__tests__/capture-extract.test.ts read this file).
 *
 * English only for now. French notes would need French examples here and
 * the transcription language changed (app/api/voice-transcribe/route.ts).
 */

export interface ExtractPromptInput {
  transcript: string;
  /** Atlantic calendar day, YYYY-MM-DD. */
  today: string;
  /** e.g. "Sunday". */
  weekday: string;
  /** The client whose profile the note was recorded on, if any. */
  contextClientName?: string | null;
}

export function buildExtractPrompt({ transcript, today, weekday, contextClientName }: ExtractPromptInput): string {
  const context = contextClientName
    ? `\nThe agent recorded this from ${contextClientName}'s profile. When the note doesn't name anyone else, it is about ${contextClientName}: use that name for client_name.\n`
    : "";
  return `You read notes a Canadian real estate agent speaks or pastes after a showing, a call or a meeting, and list what should be saved. The agent reviews every item before anything is saved, so never guess a name, a number or a date that wasn't said.

Today is ${weekday} ${today} (Atlantic time).${context}

NOTE:
"""
${transcript}
"""

Return ONLY one JSON object, no markdown and no explanation:
{
  "transcript_cleaned": "<the note with filler words removed>",
  "intents": [ <zero or more items, in the order they come up> ]
}

One note often holds several items. "Showed 12 Elm to Sarah, she wants to write an offer, follow up Thursday, drove 18 km" is a log_activity, a create_task and a log_trip.

ITEM SHAPES (use null for anything not said; never an empty string):

log_activity: the agent reached or met an existing client (call, text, email, showing, meeting, offer).
{ "intent": "log_activity", "client_name": "<name as said, or null>", "deal": "<property or deal named, e.g. '12 Elm', or null>", "activity_type": "call" | "text" | "email" | "showing" | "meeting" | "offer", "summary": "<what happened, the agent's words, 1-3 sentences>", "date_spoken": "<the words for when, e.g. 'yesterday', 'Thursday', or null>", "date": "<YYYY-MM-DD for date_spoken, or null>" }

note: a fact or memo about a client with no contact ("Sarah prefers texts", "the Lees are pre-approved to 500").
{ "intent": "note", "client_name": "<name or null>", "deal": "<or null>", "summary": "<the note>" }

create_task: a follow-up or to-do ("follow up Thursday", "remind me to send the comps", "book the inspection").
{ "intent": "create_task", "title": "<short, starts with a verb, e.g. 'Follow up with Sarah about the offer'>", "client_name": "<name or null for a general to-do>", "due_spoken": "<the words for when, or null>", "due_date": "<YYYY-MM-DD or null>", "priority": "low" | "normal" | "high", "notes": "<extra detail or null>" }

update_deal: a pipeline deal moved stage or got a new expected close date.
{ "intent": "update_deal", "deal": "<address or deal named, or null>", "client_name": "<client on the deal, or null>", "stage": "lead" | "showing" | "offer" | "conditional" | "firm" | "closed" | "lost" | null, "close_date_spoken": "<words or null>", "close_date": "<YYYY-MM-DD or null>" }
Stages: lead (early), showing (viewing homes or listed), offer (offer written or received), conditional (accepted with conditions), firm (conditions removed), closed, lost.

log_trip: a business drive the agent mentions with a distance or a destination.
{ "intent": "log_trip", "km": <number or null>, "from": "<start or null>", "to": "<destination or null>", "purpose": "<e.g. 'Showing at 12 Elm St'>", "date_spoken": "<words or null>", "date": "<YYYY-MM-DD or null>" }
Only the km the agent says. Never estimate a distance.

new_expense: money the agent spent for the business (fuel, a client coffee, signs, parking).
{ "intent": "new_expense", "category_key": "<one key below, or null>", "amount": <total paid in dollars, or null>, "tax_amount": <GST/HST in dollars ONLY if the agent says it, else null>, "vendor": "<who was paid, or null>", "description": "<what it was, or null>", "date_spoken": "<words or null>", "date": "<YYYY-MM-DD or null>" }
Never work out GST/HST from a rate.
category_key values:
  vehicle_fuel, vehicle_service, vehicle_insurance, vehicle_payment,
  vehicle_parking, vehicle_business_insurance,
  marketing_ads, marketing_photography, marketing_print, marketing_gifts,
  office_supplies, office_software, office_phone, office_hardware,
  prof_board_mls, prof_licensing, prof_eo, prof_accounting,
  edu_courses, edu_conferences, edu_books,
  meals_client, meals_team,
  ent_client, ent_events,
  home_utilities, home_internet, home_insurance, home_maintenance,
  home_property_tax, home_mortgage_interest, home_rent, home_condo_fees
    (home_* are bills for the agent's own home: power, heat, water, internet,
    home insurance, repairs, property tax, mortgage interest, rent, condo fees),
  other_misc
A meal or coffee with a client is meals_client; parking is vehicle_parking; a car wash is vehicle_service; vehicle_business_insurance only for an extra premium the agent says is for business use.

new_client: a person the agent says is new ("met a new buyer, Dana Whitfield").
{ "intent": "new_client", "full_name": "<first and last name>", "email": "<or null>", "phone": "<as said, or null>", "city": "<where they live, or null>", "side": "buyer" | "seller" | null, "lead_source": "referral" | "sphere" | "open_house" | "online" | "sign_call" | "cold_call" | "door_knock" | "social_media" | "repeat" | "other" | null, "notes": "<other details or null>" }
Then anything else said about that person (a follow-up, the meeting itself) is its own item with client_name = their name.

new_transaction: a deal that closed and is NOT described as an existing pipeline deal moving to closed.
{ "intent": "new_transaction", "address": "<or null>", "client_name": "<or null>", "side": "buyer" | "seller" | "both" | null, "close_date_spoken": "<words or null>", "close_date": "<YYYY-MM-DD or null>", "sale_price": <dollars or null>, "commission_pct": <a percentage, 2.5 for 2.5%, or null>, "gci": <dollars only if the commission amount is stated, or null>, "notes": "<or null>" }

RULES:
- Names exactly as spoken ("Sarah", "the Johnsons"). Never add a surname nobody said.
- Dates: copy the words into *_spoken, and give your YYYY-MM-DD reading of them from today's date. Past events (activities, trips, expenses) look back: "Thursday" is the last Thursday. Follow-ups and close dates look ahead: "Thursday" is the next Thursday. Leave both null when no date was said.
- Numbers: "eighty five dollars" is 85; a sale price "five fifty" is 550000.
- Nothing worth saving: return "intents": [].`;
}
