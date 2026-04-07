/**
 * lib/flight-plan-defaults.ts
 *
 * 20 pre-loaded drip campaign templates for Agent Runway Flight Plans.
 * Based on research across Follow Up Boss, kvCORE, LionDesk, Real Geeks,
 * BoomTown, Sierra Interactive, Wise Agent, CINC, and Chime CRM.
 *
 * Each campaign is fully seeded for every user via POST /api/flight-plans/seed-defaults.
 * Users can pause, delete, or edit any campaign — seeding is idempotent via system_key.
 *
 * trigger_status: fires when client's Flight Status changes to this value
 * trigger_tag:    if set, also requires client to have this tag (narrows trigger)
 * null trigger:   manual-start campaign (agent enrolls clients individually)
 */

import type { ClientStatus } from "@agent-runway/core/types/database";

export interface FlightPlanDefault {
  system_key:     string;
  name:           string;
  description:    string;
  trigger_status: ClientStatus | null;
  trigger_tag:    string | null;
  steps: {
    step_order:  number;
    delay_days:  number;
    action_type: "task" | "email" | "text";
    template:    string;
  }[];
}

export const FLIGHT_PLAN_DEFAULTS: FlightPlanDefault[] = [

  // ── 1. New Buyer Lead — Speed Blitz ────────────────────────────────────────
  {
    system_key:     "new_buyer_speed_blitz",
    name:           "New Buyer Lead — Speed Blitz",
    description:    "High-urgency follow-up sequence for fresh buyer leads. First 5 minutes are critical — response rates drop 80% after that.",
    trigger_status: "boarding",
    trigger_tag:    "Buyer",
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "task",  template: "📞 Call [Name] NOW — introduce yourself, ask what they're looking for and their timeline. Speed-to-lead within 5 minutes is critical." },
      { step_order: 2,  delay_days: 1,   action_type: "email", template: "Welcome email — send 3–5 curated active listings matching their criteria + link to your search portal. Subject: '[Name], here are the homes I think you'll love'" },
      { step_order: 3,  delay_days: 3,   action_type: "text",  template: "Hey [Name], did you get a chance to check out those listings I sent? Any catch your eye? Happy to book a showing 🏡" },
      { step_order: 4,  delay_days: 7,   action_type: "task",  template: "📞 One-week follow-up call — check search feedback, refine criteria, push toward booking a showing this week." },
      { step_order: 5,  delay_days: 14,  action_type: "email", template: "Pre-approval email — explain why being pre-approved gives them a competitive edge in today's market. Introduce your preferred mortgage broker. Subject: 'Before you fall in love with a home, read this'" },
      { step_order: 6,  delay_days: 21,  action_type: "text",  template: "Quick check-in — 'Still actively searching, [Name]? Market just got some new listings I think you'd love. Want me to send them over?'" },
      { step_order: 7,  delay_days: 30,  action_type: "email", template: "Month 1 market update — share a neighbourhood snapshot for their target area: new listings, price trends, recent solds. Subject: 'What the [Neighbourhood] market looks like right now'" },
      { step_order: 8,  delay_days: 60,  action_type: "task",  template: "📞 60-day check-in call — reassess their timeline and budget. Has anything changed? Keep the relationship warm and personal." },
      { step_order: 9,  delay_days: 90,  action_type: "email", template: "90-day buyer update — price trends, inventory levels, buyer competition in their target area. Frame it as intelligence, not a sales pitch." },
    ],
  },

  // ── 2. Long-Term Buyer Nurture (6–18 months) ───────────────────────────────
  {
    system_key:     "long_term_buyer_nurture",
    name:           "Long-Term Buyer Nurture",
    description:    "For buyers who are 6–18 months away from purchasing. Delivers consistent value without pressure to keep you top-of-mind.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 7,   action_type: "email", template: "No-rush email — 'Totally understand you're not in a rush. Here's what the market is doing so you can track it over time.' Include a simple market snapshot." },
      { step_order: 2,  delay_days: 30,  action_type: "email", template: "Month 1 update — relevant new listings and price trends in their target area. Keep it short: 3 key stats + 2 listings." },
      { step_order: 3,  delay_days: 60,  action_type: "task",  template: "📞 2-month check-in — 'Has your timeline or budget changed at all? Just want to make sure I'm watching the right areas for you.'" },
      { step_order: 4,  delay_days: 90,  action_type: "email", template: "Pre-approval timing guide — 'When to start the mortgage conversation.' Most experts say 3–6 months before buying. Introduce your preferred broker now." },
      { step_order: 5,  delay_days: 120, action_type: "email", template: "Neighbourhood spotlight — pick one neighbourhood that matches their profile. Share lifestyle details, school ratings, commute times, average sold prices." },
      { step_order: 6,  delay_days: 180, action_type: "task",  template: "📞 6-month milestone call — reassess their situation. Are they closer to ready? Any major life changes? Keep this call personal, not transactional." },
      { step_order: 7,  delay_days: 270, action_type: "email", template: "9-month market update — how conditions have shifted since you first connected. Is it getting better or harder for buyers? Help them understand timing." },
      { step_order: 8,  delay_days: 365, action_type: "task",  template: "📞 1-year anniversary call — mark the year since your first conversation. Ask: 'What would need to change for you to feel ready to start seriously looking?'" },
    ],
  },

  // ── 3. New Seller Lead — Home Valuation Request ────────────────────────────
  {
    system_key:     "new_seller_valuation_lead",
    name:           "New Seller Lead — Valuation Request",
    description:    "Converts a home valuation inquiry into a listing appointment. The 60-minute call window after a valuation request is your best shot.",
    trigger_status: "boarding",
    trigger_tag:    "Seller",
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "task",  template: "📞 URGENT — Call [Name] within 60 minutes of their valuation request. Introduce yourself, confirm they received the CMA, offer to walk through it and book a listing consultation." },
      { step_order: 2,  delay_days: 1,   action_type: "email", template: "What affects your home's value in [City] — neighbourhood trends, recent sold data, current inventory levels, and the factors buyers weigh most. Subject: 'Here's what's driving prices in [Neighbourhood] right now'" },
      { step_order: 3,  delay_days: 2,   action_type: "text",  template: "Hey [Name], just wanted to make sure you got the valuation info I sent. Happy to walk you through any of it — totally no pressure 😊" },
      { step_order: 4,  delay_days: 4,   action_type: "email", template: "Sold comps deep dive — pull 3–5 recent sales near their property. Show price per sqft trends and list-to-sale ratios. Real data builds trust." },
      { step_order: 5,  delay_days: 7,   action_type: "task",  template: "📞 Week-one follow-up call — did they review the CMA? Are they leaning toward listing? This is the moment to book the listing presentation." },
      { step_order: 6,  delay_days: 14,  action_type: "email", template: "Seller timing email — 'Thinking of listing this year? Here's the optimal prep timeline and what top-dollar sellers do differently.' Include a 90-day prep checklist." },
      { step_order: 7,  delay_days: 30,  action_type: "task",  template: "📞 30-day check-in — where are they in their decision? Are they speaking with other agents? Reinforce your market expertise and unique value." },
      { step_order: 8,  delay_days: 60,  action_type: "email", template: "Market update for sellers — days on market, list-to-sale ratios, active inventory in their area. Frame every metric as it relates to their specific listing." },
      { step_order: 9,  delay_days: 90,  action_type: "task",  template: "📞 Quarterly check-in — keep the relationship warm. Share any recent neighbourhood solds. Ask: 'Is now the time, or are you still thinking through the timing?'" },
    ],
  },

  // ── 4. Post-Closing — New Homeowner Nurture ────────────────────────────────
  {
    system_key:     "post_closing_new_homeowner",
    name:           "Post-Closing — New Homeowner",
    description:    "Cements the relationship after closing and sets up long-term referral generation. The best agents stay present well after the keys are handed over.",
    trigger_status: "cruising",
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 1,   action_type: "text",  template: "Congrats again [Name]! 🎉 Keys are officially yours. So excited for you — reach out for ANYTHING this week, I'm here." },
      { step_order: 2,  delay_days: 3,   action_type: "task",  template: "📞 Day 3 call — check that closing went smoothly, ask how the first few days feel, answer any questions about the property or next steps." },
      { step_order: 3,  delay_days: 7,   action_type: "email", template: "Moving week support — local service provider recommendations (movers, cleaners, locksmiths, plumbers), utility setup checklist, welcome to the neighbourhood tips. Subject: 'Your moving week starter kit'" },
      { step_order: 4,  delay_days: 14,  action_type: "task",  template: "📞 Two-week check-in — 'How's the new place? Any surprises? Need any tradespeople or local recommendations?'" },
      { step_order: 5,  delay_days: 30,  action_type: "email", template: "Month 1 homeowner tips — seasonal maintenance checklist, home insurance review reminder, city/municipality services to register for. Branded and genuinely helpful." },
      { step_order: 6,  delay_days: 90,  action_type: "email", template: "3-month home equity update — 'Here's what similar homes are selling for in your neighbourhood right now.' First home value check-in. Keep the CTA soft." },
      { step_order: 7,  delay_days: 180, action_type: "task",  template: "📞 6-month personal call — check in genuinely, ask how they're loving the home, and softly ask: 'Know anyone who might be thinking of buying or selling? I'd love to help someone you trust.'" },
      { step_order: 8,  delay_days: 365, action_type: "email", template: "🎂 Happy 1-year homeiversary, [Name]! A year ago today you got the keys to [Address]. Here's what your home is worth today — and a sincere thank-you for trusting me with such a big decision." },
    ],
  },

  // ── 5. Past Client / SOI — Stay-in-Touch ──────────────────────────────────
  {
    system_key:     "past_client_soi_nurture",
    name:           "Past Client / SOI — Stay-in-Touch",
    description:    "Evergreen nurture for past clients and your warm network. Referrals and repeat business come from consistent, genuine touchpoints — not sporadic outreach.",
    trigger_status: "cruising",
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Annual market update — 'Here's what's happening in your neighbourhood and what your home is worth today.' Personal, data-rich, no hard ask." },
      { step_order: 2,  delay_days: 30,  action_type: "task",  template: "📞 Warm check-in call — no agenda. Just genuinely staying in touch. Ask how everything is going, show real interest in their life." },
      { step_order: 3,  delay_days: 90,  action_type: "email", template: "Seasonal tips + local news — home maintenance tips for the season, local community highlights, market conditions overview. Branded and neighbourly." },
      { step_order: 4,  delay_days: 180, action_type: "task",  template: "📞 6-month relationship call — 'Know anyone thinking of buying or selling? I'd love to help someone you trust.' This is your referral ask moment — keep it natural." },
      { step_order: 5,  delay_days: 270, action_type: "email", template: "Fall/Winter market preview — how the spring market is shaping up, what local homeowners should know about their equity position heading into the new year." },
      { step_order: 6,  delay_days: 365, action_type: "email", template: "🎂 Home anniversary — mark the year with a personalized note and current estimated value. This one gets opened and remembered more than any other email you'll send." },
    ],
  },

  // ── 6. Open House Follow-Up ────────────────────────────────────────────────
  {
    system_key:     "open_house_follow_up",
    name:           "Open House Follow-Up",
    description:    "Captures the warm in-person connection from open house sign-ins. Most agents lose 90% of open house leads within 48 hours — this sequence prevents that.",
    trigger_status: "boarding",
    trigger_tag:    "Open House",
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "text",  template: "Great meeting you today at [Address]! Here are a few similar homes I think you'd love. Happy to book a private showing anytime 🏡 — [Name, Agent]" },
      { step_order: 2,  delay_days: 0,   action_type: "task",  template: "📞 Same-day call — brief follow-up to all open house attendees. Gauge interest level, ask if they're working with another agent, offer to book a showing." },
      { step_order: 3,  delay_days: 1,   action_type: "email", template: "Similar listings email — 3–5 homes matching what they saw today, brief neighbourhood overview, current asking prices. Subject: 'A few homes you might love just as much (or more)'" },
      { step_order: 4,  delay_days: 3,   action_type: "text",  template: "Hey [Name], did any of those listings catch your eye? Happy to book a private showing for you this week 🗓️" },
      { step_order: 5,  delay_days: 5,   action_type: "email", template: "Neighbourhood market stats — what homes are currently selling for nearby, average days on market, list-to-sale ratios. Context helps buyers decide." },
      { step_order: 6,  delay_days: 7,   action_type: "task",  template: "📞 One-week follow-up call — are they actively searching? Have they seen other homes? What's their timeline and pre-approval status?" },
      { step_order: 7,  delay_days: 14,  action_type: "text",  template: "Still here if you need anything, [Name]! Market has some new listings I think you'd like — want me to send them your way? 😊" },
      { step_order: 8,  delay_days: 30,  action_type: "email", template: "30-day follow-up — 'How's your search going? I'd love to catch up and see if there's anything I can help with.' Gentle check-in with a curated listing update." },
    ],
  },

  // ── 7. Under Contract — Transaction Management ─────────────────────────────
  {
    system_key:     "under_contract_transaction_plan",
    name:           "Under Contract — Transaction Plan",
    description:    "Guides buyers or sellers through every step from accepted offer to closing. Reduces anxiety, prevents missed deadlines, and builds lifelong client loyalty.",
    trigger_status: "in_flight",
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Offer accepted — next steps overview. Key dates, what to expect this week, who does what. Keep it clear and reassuring. Subject: 'You did it — here's exactly what happens next'" },
      { step_order: 2,  delay_days: 1,   action_type: "email", template: "Home inspection guide — what to look for, what to ask your inspector, the difference between cosmetic issues vs. structural red flags, and what's worth renegotiating." },
      { step_order: 3,  delay_days: 3,   action_type: "task",  template: "✅ Confirm home inspector is booked. Provide access instructions and any condo/strata documents the inspector will need." },
      { step_order: 4,  delay_days: 7,   action_type: "email", template: "Financing update — what your mortgage specialist needs right now to hit the commitment deadline. OSFI stress test reminder and what 'condition waived' means in Canada." },
      { step_order: 5,  delay_days: 10,  action_type: "task",  template: "✅ Confirm mortgage commitment letter received and financing condition is officially waived. Follow up with lender if needed." },
      { step_order: 6,  delay_days: 14,  action_type: "email", template: "Pre-closing checklist — title insurance setup, utility transfer contacts, home insurance confirmation, movers booked, final walkthrough timing. Subject: 'Your 2-week-out closing checklist'" },
      { step_order: 7,  delay_days: 18,  action_type: "task",  template: "✅ Book final walkthrough with client. Confirm movers, insurance policy is active, and all utilities are being transferred on the right date." },
      { step_order: 8,  delay_days: 21,  action_type: "text",  template: "Getting so close! 🎉 Any questions before closing day? I'm here for anything — call, text, whatever you need, [Name]." },
      { step_order: 9,  delay_days: 25,  action_type: "task",  template: "📞 Pre-closing call — confirm all conditions are clear, review any outstanding items, walk through closing day logistics (time, location, what to bring, key exchange)." },
    ],
  },

  // ── 8. First-Time Buyer Education Series ──────────────────────────────────
  {
    system_key:     "first_time_buyer_education",
    name:           "First-Time Buyer Education Series",
    description:    "A 10-step educational sequence for first-time buyers. Demystifies the process, builds enormous trust, and converts hesitant buyers into committed clients.",
    trigger_status: "boarding",
    trigger_tag:    "First-Time Buyer",
    steps: [
      { step_order: 1,  delay_days: 1,   action_type: "email", template: "The First-Time Buyer Roadmap — a clear step-by-step from pre-approval to keys. Set expectations and show them you'll guide them every step of the way." },
      { step_order: 2,  delay_days: 3,   action_type: "email", template: "Down payment deep dive — exactly how much they need in [City] today. Cover FHSA, RRSP Home Buyers' Plan, gifted down payments, and minimum down by purchase price tier." },
      { step_order: 3,  delay_days: 5,   action_type: "text",  template: "Hey [Name], any questions from those first two emails? Totally normal to feel overwhelmed — that's exactly why I'm here. Ask me anything 😊" },
      { step_order: 4,  delay_days: 7,   action_type: "email", template: "Getting pre-approved — what lenders look at, how to prepare your documents, why a mortgage broker often beats going direct to your bank." },
      { step_order: 5,  delay_days: 10,  action_type: "task",  template: "📞 Check-in call — see where they're at mentally, address any fears, and gently nudge toward booking a mortgage pre-approval conversation." },
      { step_order: 6,  delay_days: 14,  action_type: "email", template: "The offer process in Canada — conditional vs. firm offers, irrevocable periods, deposits, what happens if conditions aren't waived. Province-specific details matter here." },
      { step_order: 7,  delay_days: 21,  action_type: "email", template: "What to look for during a home inspection — the big-ticket items (foundation, roof, HVAC, electrical) vs. cosmetic issues that shouldn't drive your decision." },
      { step_order: 8,  delay_days: 30,  action_type: "email", template: "First-time buyer programs in Canada — FHSA, RRSP HBP, land transfer tax rebates (Ontario/BC specific), and the First Home Savings Account explained simply." },
      { step_order: 9,  delay_days: 45,  action_type: "task",  template: "📞 Month follow-up — are they pre-approved yet? Have they started searching? What's their biggest blocker right now? Address it directly." },
      { step_order: 10, delay_days: 60,  action_type: "email", template: "Hidden costs first-time buyers miss — property tax, condo fees, land transfer tax, closing costs (legal, title insurance, moving), and the 1% annual maintenance rule." },
    ],
  },

  // ── 9. Renter-to-Buyer Conversion ─────────────────────────────────────────
  {
    system_key:     "renter_to_buyer_conversion",
    name:           "Renter-to-Buyer Conversion",
    description:    "Converts renters into buyers over 6–24 months through education and trust-building. Canada-specific: FHSA, RRSP HBP, provincial rebates.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 7,   action_type: "email", template: "Renting vs. buying in [City] — the real numbers. Monthly rent vs. a comparable mortgage payment, equity built over 5 years, true total cost of each option." },
      { step_order: 2,  delay_days: 14,  action_type: "email", template: "The down payment path — how to save faster using the FHSA ($8,000/yr contribution room), RRSP contribution strategy, and what a realistic savings timeline looks like." },
      { step_order: 3,  delay_days: 21,  action_type: "text",  template: "Just checking in — any questions about the rent vs. buy stuff I've been sending? Happy to run the numbers for your specific situation 🏡" },
      { step_order: 4,  delay_days: 30,  action_type: "email", template: "Credit score and mortgage readiness — the steps to take 6–12 months before buying to qualify for a better rate and a higher approval amount." },
      { step_order: 5,  delay_days: 45,  action_type: "task",  template: "💬 Introduce your preferred mortgage broker — connect them with someone who specializes in first-time/renter-to-buyer transitions. This builds enormous goodwill." },
      { step_order: 6,  delay_days: 60,  action_type: "task",  template: "📞 Check-in call — assess their savings progress and readiness timeline. Any major financial changes? Job change? New relationship? Adjust your strategy." },
      { step_order: 7,  delay_days: 90,  action_type: "email", template: "What entry-level homes look like in [City] right now — 3 real examples in their likely budget range with current prices, neighbourhoods, and what they'd need to qualify." },
      { step_order: 8,  delay_days: 180, action_type: "task",  template: "📞 6-month milestone call — has their timeline shifted? Are they saving consistently? Nudge them toward getting pre-approved even if they're 6+ months from buying." },
      { step_order: 9,  delay_days: 270, action_type: "email", template: "9-month update — how home prices and rental rates have moved since you first connected. Is buying becoming more or less achievable? Give them an honest read." },
      { step_order: 10, delay_days: 365, action_type: "task",  template: "📞 1-year check-in — are they ready to make a move this year? Walk them through current FHSA balance, pre-approval timeline, and what the first step looks like today." },
    ],
  },

  // ── 10. Re-Engagement — Ghosted Lead Revival ──────────────────────────────
  {
    system_key:     "re_engagement_ghosted",
    name:           "Re-Engagement — Ghosted Lead",
    description:    "Recovers leads who went cold without burning bridges. 20–30% of 'dead' leads convert within 12 months with the right low-pressure sequence.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "text",  template: "Hey [Name]! It's been a while — are you still thinking about buying or selling in [Area]? No pressure either way, just wanted to check in 😊" },
      { step_order: 2,  delay_days: 2,   action_type: "email", template: "Subject: Should I keep you posted? — honest re-engagement. Ask directly if they still want to hear from you. People respect the honesty and often re-engage out of it." },
      { step_order: 3,  delay_days: 5,   action_type: "task",  template: "📞 Re-engagement call — keep it short, warm, and genuine. No pitch. Just: 'I know life gets busy — just want to see where things are at for you.'" },
      { step_order: 4,  delay_days: 7,   action_type: "text",  template: "Still here whenever you're ready, [Name] — no rush at all. Feel free to reach out anytime! 👋" },
      { step_order: 5,  delay_days: 14,  action_type: "email", template: "Market hook email — 'Prices in [Area] just shifted — thought this might be relevant to you.' Give them one compelling data point as a re-entry hook." },
      { step_order: 6,  delay_days: 21,  action_type: "text",  template: "Final note — 'I'll keep the door open, [Name]. Just reply anytime you want to reconnect — happy to help whenever the timing is right 😊'" },
    ],
  },

  // ── 11. Expired Listing Prospecting ───────────────────────────────────────
  {
    system_key:     "expired_listing_prospecting",
    name:           "Expired Listing Prospecting",
    description:    "Converts frustrated sellers with expired listings into new clients. Most expireds convert within 60–90 days — persistent, value-first outreach wins here.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "task",  template: "📞 CALL WITHIN THE HOUR — 'I noticed your home at [Address] came off the market. I have a different approach that gets results in this neighbourhood — do you have 5 minutes?'" },
      { step_order: 2,  delay_days: 0,   action_type: "text",  template: "Hi [Name], saw your home at [Address] recently came off the market. I've had success where other agents haven't in [Neighbourhood] — I'd love to share what I do differently. 5 minutes?" },
      { step_order: 3,  delay_days: 1,   action_type: "email", template: "Why listings expire — the 3 most common reasons: overpricing, poor marketing, wrong agent fit. Be direct and educational. Include your recent area sold data. Subject: 'What actually went wrong — and what I'd do differently'" },
      { step_order: 4,  delay_days: 2,   action_type: "task",  template: "📞 Second attempt — most agents stop after 1 call. Don't. Persistence signals you actually want their business. Keep it brief and confident." },
      { step_order: 5,  delay_days: 4,   action_type: "email", template: "Comparable sold data — 3 recent sales near their property. Show what buyers are actually paying right now and how their home compares. Let data do the persuading." },
      { step_order: 6,  delay_days: 7,   action_type: "task",  template: "📞 Follow-up call — lead with value: 'I put together an updated CMA for your home that shows what's changed in the market this week.' Offer to send or meet." },
      { step_order: 7,  delay_days: 14,  action_type: "email", template: "Re-listing timing email — is now actually a better time than when they first listed? Include market seasonality data for their area. Subject: 'The market has shifted since your listing expired'" },
      { step_order: 8,  delay_days: 21,  action_type: "task",  template: "📞 3-week check-in — are they interviewing other agents? Where are they in their decision? What would need to be true for them to relist?" },
      { step_order: 9,  delay_days: 30,  action_type: "email", template: "1-month follow-up — fresh sold data, subtle urgency (seasonal window), and a clear CTA to book a 30-minute conversation." },
      { step_order: 10, delay_days: 60,  action_type: "task",  template: "📞 60-day persistence call — most expireds convert within this window. Stay top of mind. Ask if they've had any movement or new perspective on relisting." },
    ],
  },

  // ── 12. FSBO Nurture ───────────────────────────────────────────────────────
  {
    system_key:     "fsbo_nurture",
    name:           "FSBO Nurture",
    description:    "Builds trust with for-sale-by-owner sellers over 60 days. Position yourself as an advisor, not a competitor. Most FSBOs list with an agent within 60 days.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "task",  template: "📞 Introduction call — no pitch. Offer free resources: neighbourhood sold data, pricing tips, legal checklist. Ask: 'How's it going so far?' Listen more than you talk." },
      { step_order: 2,  delay_days: 0,   action_type: "text",  template: "Hi [Name], noticed your home is listed privately on [Platform]. I help FSBOs avoid the most common and costly mistakes — happy to share some free info. No strings attached 😊" },
      { step_order: 3,  delay_days: 2,   action_type: "email", template: "FSBO challenge guide — the top 5 issues private sellers face: overpricing, legal exposure, showing coordination, negotiating blind, and financing fallout. Helpful, not fear-mongering." },
      { step_order: 4,  delay_days: 5,   action_type: "task",  template: "📞 Check-in call — ask how showings are going. Empathize. If they're struggling, offer a free showing strategy review. If going well, stay warm and helpful." },
      { step_order: 5,  delay_days: 7,   action_type: "email", template: "Agent-assisted vs. FSBO data — Canadian stats on final sale price, days on market, and legal exposure. Presented as information, not a sales pitch." },
      { step_order: 6,  delay_days: 14,  action_type: "task",  template: "📞 Two-week follow-up — 'How are you finding it?' By now they've likely had challenges. Empathy first. Offer a free CMA showing current buyer demand for their home." },
      { step_order: 7,  delay_days: 21,  action_type: "email", template: "Recent area sales — 3 comparables showing what buyers paid in agent-negotiated deals vs. private sales in the same neighbourhood. Let the data speak." },
      { step_order: 8,  delay_days: 30,  action_type: "task",  template: "📞 Month check-in — 'Still going strong, or is it getting exhausting?' Plant the seed: 'If you ever wanted to explore what it would look like to list with an agent, I'd make it easy.'" },
      { step_order: 9,  delay_days: 45,  action_type: "email", template: "Buyer demand email — 'I have buyers actively looking in your neighbourhood right now. Would you consider letting me bring them through?' Low-risk offer." },
      { step_order: 10, delay_days: 60,  action_type: "task",  template: "📞 60-day persistence call — most FSBOs who will list with an agent do so by now. Ask directly: 'What would need to change for you to feel comfortable listing with representation?'" },
    ],
  },

  // ── 13. Investor Lead Nurture ──────────────────────────────────────────────
  {
    system_key:     "investor_lead_nurture",
    name:           "Investor Lead Nurture",
    description:    "Serves real estate investors with ROI-focused content. Investors transact repeatedly and refer heavily — worth 5x the effort of a typical buyer lead.",
    trigger_status: "boarding",
    trigger_tag:    "Investor",
    steps: [
      { step_order: 1,  delay_days: 1,   action_type: "email", template: "Investment property in [City] — current cap rates, gross rental yields, cash flow expectations by property type, and what experienced investors are targeting right now." },
      { step_order: 2,  delay_days: 3,   action_type: "text",  template: "Hey [Name], happy to set up a custom investment search for you — detached rentals, multi-family, condos? What's your target ROI and preferred property type?" },
      { step_order: 3,  delay_days: 5,   action_type: "email", template: "Investment property checklist — what to evaluate: cap rate vs. cash-on-cash return, vacancy risk, gross rent multiplier, neighbourhood rental demand signals." },
      { step_order: 4,  delay_days: 7,   action_type: "task",  template: "📞 Investor discovery call — understand their goals: cash flow vs. appreciation, financing structure (HELOC, conventional, private), desired portfolio size, timeline." },
      { step_order: 5,  delay_days: 14,  action_type: "email", template: "Rental market stats in [City] — average rents by bedroom count, vacancy rates, rent increase limits (province-specific), and where renter demand is strongest." },
      { step_order: 6,  delay_days: 21,  action_type: "task",  template: "📞 Property shortlist review — walk through 2–3 specific investment opportunities you've identified. Run the numbers together: purchase price, estimated rent, expenses, net cash flow." },
      { step_order: 7,  delay_days: 30,  action_type: "email", template: "Financing for investors — rental property mortgage rules in Canada (20% minimum down), stress test impact on investment financing, HELOC strategy for portfolio growth." },
      { step_order: 8,  delay_days: 60,  action_type: "task",  template: "📞 2-month investment check-in — any offers made or accepted elsewhere? Are they still actively searching or has their timeline shifted?" },
      { step_order: 9,  delay_days: 90,  action_type: "email", template: "Quarterly investment market update — Q-over-Q rental yields, what investors are paying, new opportunities in their target class, cap rate compression trends." },
    ],
  },

  // ── 14. Relocation Buyer Nurture ───────────────────────────────────────────
  {
    system_key:     "relocation_buyer_nurture",
    name:           "Relocation Buyer Nurture",
    description:    "Serves buyers relocating from another city, province, or country. Builds trust through local expertise when they can't easily visit in person.",
    trigger_status: "boarding",
    trigger_tag:    "Relocation",
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Welcome to [City]! Your relocation guide — neighbourhood profiles, cost of living breakdown, commute zones, school district overview, and what to expect in the local market." },
      { step_order: 2,  delay_days: 1,   action_type: "text",  template: "So excited to help you find your place in [City], [Name]! Quick question — what matters most in a neighbourhood to you? Commute? Schools? Urban vs. suburban?" },
      { step_order: 3,  delay_days: 3,   action_type: "email", template: "Your top 3 neighbourhoods — personalized based on what you've shared: lifestyle fit, price range, commute analysis, and what each area is like to live in day-to-day." },
      { step_order: 4,  delay_days: 5,   action_type: "task",  template: "📞 Virtual discovery call — this matters more than for local buyers. They're making a major decision without being able to easily visit. Be their eyes and ears." },
      { step_order: 5,  delay_days: 7,   action_type: "email", template: "Deep dive on their top neighbourhood — school ratings, safety, walkability, nearest services, transit options, what long-time residents say about living there." },
      { step_order: 6,  delay_days: 14,  action_type: "email", template: "Virtual tour invitation — offer to schedule a live video walkthrough of 2–3 shortlisted properties. FaceTime or Zoom works — narrate like they're standing next to you." },
      { step_order: 7,  delay_days: 21,  action_type: "task",  template: "📞 'Power trip' planning call — if they're visiting [City], help them plan a condensed showing tour (4–6 homes in one trip). Most relocation buyers decide on a power trip." },
      { step_order: 8,  delay_days: 30,  action_type: "email", template: "Financing for out-of-province/newcomer buyers — any mortgage or down payment rules specific to their situation, broker recommendations, timeline for pre-approval." },
      { step_order: 9,  delay_days: 60,  action_type: "task",  template: "📞 Month 2 check-in — how's the relocation planning going? Has their move date been confirmed? Any changes to their timeline, budget, or location preference?" },
      { step_order: 10, delay_days: 90,  action_type: "email", template: "Market urgency update — is inventory increasing or decreasing in their target area? Any signals they should move faster or can afford to be selective?" },
    ],
  },

  // ── 15. Listing Appointment — Pre-Listing Nurture ─────────────────────────
  {
    system_key:     "listing_appointment_nurture",
    name:           "Listing Appointment — Pre-Listing",
    description:    "Wins the listing from appointment to signed agreement. Sends social proof before the meeting, then closes with timely follow-up after.",
    trigger_status: "boarding",
    trigger_tag:    "Seller",
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Appointment confirmation — 'Looking forward to meeting at [Address]. Here's what we'll cover and how to prepare your home for the walkthrough.' Set expectations." },
      { step_order: 2,  delay_days: 0,   action_type: "text",  template: "Confirmed for [Date/Time]! Really looking forward to it, [Name]. Text me anytime if anything comes up before then 😊" },
      { step_order: 3,  delay_days: 1,   action_type: "email", template: "Your agent bio + testimonials — send social proof the day before: Google review link, 3 recent neighbourhood solds, a client testimonial. Let past results sell you." },
      { step_order: 4,  delay_days: 1,   action_type: "task",  template: "📋 Prep your listing presentation — CMA, net sheet for seller, marketing plan, recent area solds, comparable active listings." },
      { step_order: 5,  delay_days: 2,   action_type: "email", template: "Pre-listing prep checklist for sellers — declutter, small touch-ups, curb appeal basics, what professional photography captures best. Helps them feel invested." },
      { step_order: 6,  delay_days: 3,   action_type: "task",  template: "📞 Day-before reminder call — confirm they're still on for the appointment, answer any pre-meeting questions, confirm address and time." },
      { step_order: 7,  delay_days: 7,   action_type: "task",  template: "📞 Post-appointment follow-up call — 'Thanks for having me. Any questions from the presentation? Do you have a sense of when you'd like to move forward?'" },
      { step_order: 8,  delay_days: 8,   action_type: "email", template: "Post-presentation summary — recap your proposed list price, marketing strategy, and next steps. Include the net sheet again. Make it easy to say yes." },
      { step_order: 9,  delay_days: 10,  action_type: "task",  template: "📞 Decision nudge call — 'I have a couple of buyers I'm working with in [Neighbourhood] — getting ahead of them could make a real difference.' Create natural urgency." },
      { step_order: 10, delay_days: 14,  action_type: "email", template: "Market timing update — 'Here's why the next 30 days could be the right window to list.' Specific data: active inventory levels, absorption rate, buyer demand signals." },
    ],
  },

  // ── 16. Geographic Farm — Neighbourhood Prospecting ───────────────────────
  {
    system_key:     "geographic_farm_neighbourhood",
    name:           "Geographic Farm — Neighbourhood",
    description:    "Establishes you as the neighbourhood expert through consistent, hyperlocal value delivery. Designed to generate listing leads from homeowners not yet thinking of selling.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Neighbourhood introduction — introduce yourself as the local market expert. Include a just-sold report for their street or immediate area. First impressions matter." },
      { step_order: 2,  delay_days: 30,  action_type: "email", template: "Monthly neighbourhood market stats — sold prices this month, days on market, active listings vs. last month. Consistent data builds authority over time." },
      { step_order: 3,  delay_days: 60,  action_type: "email", template: "Seasonal home maintenance tips — relevant for the current season + a subtle 'free home valuation' CTA at the bottom. Practical value every time." },
      { step_order: 4,  delay_days: 90,  action_type: "email", template: "Q1/Q2 neighbourhood sold report — summarize the quarter's activity with key data: # of sales, avg sale price, # of days on market, price appreciation vs. prior period." },
      { step_order: 5,  delay_days: 120, action_type: "email", template: "Free home valuation invite — 'Curious what your home is worth in today's market? I pull these for free, no obligation.' Make it easy and low-pressure." },
      { step_order: 6,  delay_days: 150, action_type: "email", template: "Community spotlight — local event, new business opening, park upgrade, school news in [Neighbourhood]. Show you're invested in the community, not just sales." },
      { step_order: 7,  delay_days: 180, action_type: "task",  template: "📞 Top homeowner outreach — identify the 10 most likely future sellers in your farm (long tenure, kids grown, empty nesters) and call each with a personal market update." },
      { step_order: 8,  delay_days: 270, action_type: "email", template: "Fall market preview — how [Neighbourhood] historically performs in fall vs. spring, what sellers tend to achieve, and whether fall or spring makes more sense for their situation." },
      { step_order: 9,  delay_days: 365, action_type: "email", template: "Annual neighbourhood year-in-review — a summary of every sale in [Neighbourhood] this year: total volume, avg price, price change vs. prior year. Position this as your signature report." },
    ],
  },

  // ── 17. Referral Partner Network ──────────────────────────────────────────
  {
    system_key:     "referral_partner_network",
    name:           "Referral Partner Network",
    description:    "Systematizes relationships with mortgage brokers, lawyers, inspectors, and financial advisors. Most agents manage this ad hoc — a sequence ensures consistent, professional touches.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 7,   action_type: "email", template: "Monthly market update for partners — a brief snapshot useful for their clients: rate environment, buyer activity, inventory levels, price trends. Position yourself as the local data source." },
      { step_order: 2,  delay_days: 14,  action_type: "task",  template: "☕ Coffee meeting — schedule a 30-minute catch-up with your top 3 referral partners this month. In-person or video. Keep it relationship-first, business second." },
      { step_order: 3,  delay_days: 30,  action_type: "email", template: "Co-marketing opportunity — invite your referral partner to collaborate: a joint buyer webinar, co-branded first-time buyer guide, or a client appreciation event." },
      { step_order: 4,  delay_days: 60,  action_type: "task",  template: "📞 Referral ask — 'Who do you know right now who might be thinking about buying or selling? I'd love to help someone you trust.' Direct, professional, not awkward." },
      { step_order: 5,  delay_days: 90,  action_type: "email", template: "Q3 results update — share your recent closed transactions, current active listings, and what types of clients you're looking to serve. Help them refer the right people to you." },
      { step_order: 6,  delay_days: 120, action_type: "task",  template: "🎁 Thank-you gift — send a small token of appreciation to your top referring partners: coffee gift card, restaurant voucher, or a handwritten note." },
      { step_order: 7,  delay_days: 180, action_type: "task",  template: "📞 Semi-annual strategy call — discuss any changes in their client base, share mutual referral opportunities, explore new ways to collaborate in the next 6 months." },
      { step_order: 8,  delay_days: 365, action_type: "task",  template: "🎄 Year-end appreciation — personal holiday card or gift. A handwritten note goes further than almost anything else in this relationship category." },
    ],
  },

  // ── 18. SOI Seasonal — Holiday & Annual Touches ────────────────────────────
  {
    system_key:     "soi_seasonal_holiday",
    name:           "SOI Seasonal — Annual Touch Cadence",
    description:    "Keeps your entire warm database engaged through the year with market intelligence and seasonal content. Run this for your full SOI list, not individual clients.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "New Year market outlook — 'Here's what the [City] real estate market is expected to look like this year.' Predictions, opportunities, and what it means for buyers and sellers." },
      { step_order: 2,  delay_days: 60,  action_type: "email", template: "Spring market is heating up — 'What this means if you're thinking of buying or selling in the next 6 months.' Include inventory trends and buyer demand signals." },
      { step_order: 3,  delay_days: 120, action_type: "task",  template: "☀️ Canada Day / Summer check-in — casual mid-year email or personal text to your whole warm database. Keep it genuinely human, not promotional." },
      { step_order: 4,  delay_days: 180, action_type: "email", template: "Fall market preview — 'September is one of the busiest real estate months — here's what buyers and sellers in [City] should know right now.'" },
      { step_order: 5,  delay_days: 240, action_type: "email", template: "Pre-winter home checklist — furnace service reminder, eavestrough cleaning, weatherproofing tips, pipe insulation. Branded and genuinely useful content." },
      { step_order: 6,  delay_days: 285, action_type: "task",  template: "🎃 Thanksgiving message (Canadian) — personal email or card for Canadian Thanksgiving (October). Keep it warm and gratitude-focused, not sales-oriented." },
      { step_order: 7,  delay_days: 330, action_type: "email", template: "Holiday market update — 'December is quieter but serious buyers and sellers are still very active — here's what to know if you're thinking about a move in the new year.'" },
      { step_order: 8,  delay_days: 360, action_type: "task",  template: "🎄 Holiday card — send a personal holiday card (digital or printed) to every person in your warm database. This is your highest-ROI annual marketing touchpoint." },
    ],
  },

  // ── 19. Price Reduction Alert ──────────────────────────────────────────────
  {
    system_key:     "price_reduction_alert",
    name:           "Price Reduction Alert",
    description:    "Creates urgency with warm buyers who were previously priced out. A price drop is one of the highest-intent buying signal moments — respond within the hour.",
    trigger_status: null,
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "text",  template: "Heads up [Name] — that home at [Address] you were interested in just dropped to [New Price]. Worth a second look? Happy to book a showing ASAP 🏡" },
      { step_order: 2,  delay_days: 0,   action_type: "email", template: "Price drop alert — personal note pointing to the specific property, the new price vs. original, and a direct showing invitation. Subject: '[Address] just dropped — want to take another look?'" },
      { step_order: 3,  delay_days: 1,   action_type: "task",  template: "📞 Warm call — 'Did you see the price reduction on [Address]? It's now within your range. Want to get in this week before others catch on?'" },
      { step_order: 4,  delay_days: 3,   action_type: "email", template: "3 more affordable options — other homes in their search area that have recently reduced or represent strong value at their budget level." },
      { step_order: 5,  delay_days: 7,   action_type: "text",  template: "The market in [Area] is creating real opportunities right now. Want me to send you a full list of recent price reductions in your target range?" },
      { step_order: 6,  delay_days: 14,  action_type: "email", template: "Buyer opportunity update — broader market context: how far prices have moved in their target area, inventory levels, and why now could be a strategic entry point." },
    ],
  },

  // ── 20. New Client Welcome ─────────────────────────────────────────────────
  {
    system_key:     "new_client_welcome",
    name:           "New Client Welcome",
    description:    "Sets expectations and builds immediate rapport with every new client. First impressions define the relationship — this sequence makes yours exceptional.",
    trigger_status: "boarding",
    trigger_tag:    null,
    steps: [
      { step_order: 1,  delay_days: 0,   action_type: "email", template: "Welcome to working together! — what to expect, how you'll communicate, your search portal login (if applicable), and the first 3 steps. Subject: 'Welcome, [Name] — here's how this works'" },
      { step_order: 2,  delay_days: 1,   action_type: "text",  template: "Hey [Name], so excited to work with you! If you have ANY questions at all — big or small — just text me here anytime. I'm very responsive 😊" },
      { step_order: 3,  delay_days: 3,   action_type: "task",  template: "📞 Introduction call — get to know [Name] beyond just their property needs. What's their story? What does success look like for them? What matters most in a home?" },
      { step_order: 4,  delay_days: 7,   action_type: "email", template: "How I work for you — your agent's process explained: how showings work, how offers are structured, what makes a strong offer in today's market, and how communication will flow." },
      { step_order: 5,  delay_days: 14,  action_type: "task",  template: "📞 Two-week check-in — any feedback on properties so far? Are the listings you're sending matching what they're really looking for? Adjust criteria if needed." },
    ],
  },

];
