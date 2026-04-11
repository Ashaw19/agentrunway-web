/**
 * Agent Runway Platform Knowledge Base
 *
 * This module exports the complete platform knowledge base as a string constant.
 * It is injected into the AI chat system prompt so the assistant can answer
 * questions about any feature, metric, computation, or concept on the platform.
 *
 * TAX DATA VERSION: 2025 CRA rates (federal brackets, CPP1/CPP2, provincial).
 * Update annually when CRA publishes new rates. Last updated: March 2025.
 */

// Source of truth for mileage rate strings used in the knowledge base below.
// Update here when CRA publishes new rates — all three occurrences are interpolated.
const KB_MILEAGE_FIRST_5K = "$0.72/km";
const KB_MILEAGE_AFTER_5K = "$0.66/km";

export const KNOWLEDGE_BASE = `
## AGENT RUNWAY PLATFORM — COMPLETE KNOWLEDGE BASE

Agent Runway is a business analytics and CRM platform built for Canadian real estate agents. It tracks income, expenses, pipeline, clients, and taxes — projecting financial health with real-time intelligence and AI-powered outreach automation.

---

### PAGES & FEATURES

**DASHBOARD**
Command center showing: Runway Score (0–100, graded A+ to F), KPI cards (GCI progress, YTD performance, pace status), monthly income chart, probability bands (P10–P90), benchmark vs CREA 2023 peers, tax estimate (federal + provincial + CPP), smart alerts, AI-generated insights (praise/tips/warnings), survival runway status, trend detection, and CRM task widget with overdue/stale lead counts. Three views: Essentials, Standard, Full. Three scenario modes: Conservative (−15%), Base, Optimistic (+15%). Local market intelligence (Market Position, Market Conditions) from CREA MLS® stats when a board is selected.

Smart alerts use statistical anomaly detection (IQR method): expense spikes (category amount > Q3+1.5×IQR of personal history, requires ≥4 months data), pipeline coverage drops (<1.5x remaining goal = warning, <1.0x = alert), activity decay (client silent ≥2× their own contact rhythm), marketing ROI divergence (closings <75% of spend-implied expectation). Alerts are relative to the agent's own baseline, not industry averages.

**TRANSACTIONS**
Three tabs:
- Deals: Closed transactions with date, address, client link, sale price, commission %, GCI (auto-calculated or overridden), side (buyer/seller/both), status (closed/pending/fallen), team/referral split.
- Pipeline: In-progress deals with stages (Lead 10%, Showing 25%, Offer 50%, Conditional 75%, Firm 90%), weighted GCI, convert-to-closed feature. Probability overrides replace stage default when set.
- History: Annual summaries (year, GCI, deals, Q1–Q4 breakdown), YoY chart, seasonal profile. Import historical transactions from CSV, PDF, or spreadsheet — the import wizard maps columns, detects duplicates, and validates data before committing. Imported years can be locked to prevent accidental edits.

**CRM**
Four tabs:
- Clients: Full contact records. Each client has: First name and last name (stored separately, displayed together), email, phone, city/province, address, birthday, lead source, tags, budget, timeframe, property interest (buy/sell/both), property type (residential/commercial/investment), communication tone preference, notes, relationship links (e.g., spouse, referral source), contact activity log (call/email/text/showing/meeting/note/task), status (Boarding→Scheduled→In-Flight→Cruising), valuation tier (Platinum/Gold/Silver/Bronze).

  CLIENT DETAIL PANEL LAYOUT: The right-side detail panel has: (1) A gradient status banner at the top whose color matches the client's current flight status. (2) A circular avatar. (3) Separate First Name and Last Name input fields (not a single combined name field). (4) A Save button that commits first name, last name, and notes together — fields are not auto-saved on blur, they require the Save button. (5) A Flight Status strip showing the current stage. Below the header, colored section cards organize the detail view: Sky blue = Contact Information, Emerald green = Address, Amber = Details (budget, timeframe, property interest), Violet = Relationships, Slate = Notes, Blue = Activity Log, Orange = Tasks, Green = Deal History.

- CRM Dashboard: Engagement analytics (touchpoints, frequency, overdue clients, activity type breakdown, speed to lead, source funnel).
- Insights: Stale lead alerts, high-value client summaries, referral source analysis.
- Flight Plans: Automated follow-up sequences triggered by client status changes. Each flight plan has ordered steps with timing (e.g., "Day 1: Welcome call", "Day 7: Send market update"). Steps auto-generate outreach drafts in Flight Control at the scheduled time.

  PROPERTY SHOWINGS (Buyer Clients): Track property showings for buyers. Each showing records: property address, showing date, client rating (1–10), notes, and outcome. Visible on the buyer's client profile card under the Showings section. Helps identify buyer preferences and track viewing patterns over time.

  LISTING APPOINTMENTS (Seller Clients): Schedule and track listing appointments. Each appointment records: property address, appointment date/time, notes, and outcome. Can be linked to a pipeline deal once the listing is secured. Visible on the seller's client profile card.

  CONTACT TASKS: To-do items linked to specific clients. Each task has: title, due date, priority (low/normal/high), notes, and completion status. Visible on the client's profile card under the Tasks section (orange card). Overdue tasks are flagged. Tasks help agents track follow-ups, document requests, and action items per client.

  CLIENT RELATIONSHIPS: Link clients to each other with relationship types: spouse, referrer, colleague, family, other. Referral relationships are directional (A referred B). Other relationship types are bidirectional. Relationships appear on both client profile cards. The referral direction shows clearly: "Referred [name] to you" or "Referred to you by [name]."

  TAGS: Custom labels applied to clients for organization and filtering. Examples: VIP, Investor, First-Time Buyer, Referral Source, Developer. Tags are stored as an array and can be added/removed freely. Used for filtering the client list and segmenting outreach.

  THE HANGAR (Archived Clients): Clients can be archived with a reason (deceased, moved away, do not contact, other). Archived clients move to the Hangar tab and no longer appear in active views, stale client counts, or outreach. They can be restored at any time, returning to Cruising status.

**EXPENSES**
Three tabs:
- Receipts: Manual or receipt-photo entry with OCR extraction, organized by category (Vehicle, Marketing, Office, Professional, Education, Meals, Entertainment, Other), KPIs (YTD expenses, monthly avg, expense ratio, projected annual).
- Mileage: Trip logging with CRA 2025 rates (${KB_MILEAGE_FIRST_5K} first 5K, ${KB_MILEAGE_AFTER_5K} after), KPIs (YTD km, total deduction, projected annual).
- Recurring Expenses: Set up monthly, quarterly, or annual recurring business expenses (e.g., $200/mo Canva subscription, $1,500/quarter insurance). Each period auto-generates an entry that the agent confirms or skips. Active recurring expenses are totaled into YTD expense calculations and tax estimates automatically.
- Bank Imports: Plaid bank sync integration. Connect a bank account in Settings → Bank Sync. Plaid securely fetches transactions, auto-categorizes them by expense type, and queues them for agent review. The agent confirms, re-categorizes, or dismisses each imported transaction. Synced expenses appear alongside manual receipts in the Expenses page. Disconnect anytime from Settings.
- CCA Assets: Track capital cost allowance assets under the T2125 tab in Reports. Add business assets (laptops, cameras, vehicles, equipment) with their CCA class (Class 8 = office equipment 20%, Class 10 = vehicles 30%, Class 12 = software/tools 100%, Class 50 = computers 55%). The half-year rule applies automatically in the acquisition year. UCC (undepreciated capital cost) and annual CCA deduction are calculated and flow into tax estimates.

**FORECAST**
Financial waterfall (GCI → split → fees → expenses → tax → take-home), tax estimates card (quarterly instalment, per-deal set-aside, effective rate), probability bands chart (P10–P90, 12-month projection), 5-year growth plan with widening confidence bands, goal gap analysis (deals needed, daily pace), insight cards (top 3 by dollar impact).

**REPORTS**
Three tabs:
- Overview: Runway Score, benchmark, survival, waterfall, monthly table, transaction log, expense breakdown.
- Benchmark: CREA 2023 cohort comparison, percentile rank.
- Tax (T2125): CRA T2125 summary with expense lines by CRA code, CCA assets, home office deduction (simplified $5/sqft max $1,500 or detailed), mileage summary.

**OVERHEAD (Tax Intelligence)**
Dedicated tax planning page showing:
- Tax Estimate Breakdown: Federal income tax + provincial income tax + CPP/QPP self-employment contributions. Effective tax rate applied to projected net self-employment income.
- Per-Deal Tax Set-Aside: Projected annual tax burden ÷ expected deal count — tells the agent how much to set aside from each commission cheque.
- Quarterly Instalment Tracker: CRA-required quarterly amounts with payment deadlines (March 15, June 15, Sept 15, Dec 15). Tracks which instalments have been paid.
- GST/HST Intelligence: Total HST collected on commissions, Input Tax Credits (ITCs) from logged expenses, net HST owing or refund amount, receipt capture rate.
- Deduction Summary: YTD expenses organized by T2125 CRA line code. Shows each category's total and its tax impact.
- CCA Schedule: Capital Cost Allowance assets tracked by CCA class. Shows original cost, undepreciated capital cost (UCC), current year CCA claim. Half-year rule applied automatically in acquisition year.
- Home Office Deduction: Simplified method ($5/sqft, max $1,500) vs detailed method (actual costs × office %). Configured in Settings.
- Paycheque Allocation Guidance: Shows how to split each commission cheque — income tax set-aside, HST set-aside (if agent handles HST, not brokerage), CPP contribution, and take-home.

**ALTIMETER (Analytics)**
Deep business analytics page showing:
- Personal Records: Best year (highest annual GCI), best month (highest single-month GCI), best single deal (highest individual commission). These are lifetime records pulled from all transaction history.
- Year-over-Year Comparison: Current year vs prior year GCI trajectory, with monthly breakdown.
- All Insights: Complete ranked list of business insights generated by the Insights Engine. Each insight has a type (pace, expense, pipeline, survival, commission, etc.), title, message, and dollar impact. Sorted by impact priority.
- Board Benchmarking: CREA board comparison showing the agent's annualized pace vs the average agent on their selected local board.
- Where You Stand: Performance band placement (Launching → Climbing → Competitive → Advancing → Leading) with momentum tracking (gaining/holding/losing).
- Deviation Detection: Flags metrics that deviate ≥20% from the agent's own 12-month baseline. Categories: GCI trend, deal frequency, expense ratio, client touchpoints.
- Runway Score Breakdown: The composite 0–100 score with each component visible: Pace vs Goal (35%), Pipeline Health (30%), Expense Ratio (15%), Survival Runway (15%), Benchmark Rank (5%).
- Top Priority Action: The single most impactful thing the agent should focus on, derived from insights engine ranking.

**SCENARIOS**
What-if financial modeling page:
- Adjust variables: additional deal count, average deal price, commission rate, expense changes, and growth assumptions.
- See projected impact on year-end GCI, take-home income, tax burden, and runway.
- Conservative (−15%), Base, and Optimistic (+15%) projections for each scenario.
- Helps agents model decisions: "What if I close 2 more deals?" or "What if I increase my marketing spend?"

**REFERRALS**
Referral tracking page at /referrals:
- Log inbound referrals (another agent sends you a client) and outbound referrals (you send a client to another agent).
- Track referral partner details: name, email, phone, brokerage.
- Track referral deal details: client name, property address, transaction type (buy/sell/both).
- Default referral fee is 25% of GCI (customizable per referral).
- Referral status lifecycle: Pending → Active → Closed (or Expired/Cancelled).
- Link referrals to closed transactions for automatic fee reconciliation.
- Estimated value tracked before closing; actual fee paid tracked after.

**SOCIAL STUDIO**
Month-in-review carousel builder for Instagram. Select deals, choose template family, configure branding (logo, headshot, agent cutout), customize slides, add caption with hashtags, export to Instagram direct or Canva ZIP.

**SETTINGS**
Province, business structure (sole prop/PREC/corp), commission split (70/30 to 100/0), brokerage fees (monthly + per-deal + annual cap + post-cap rate), cash reserve, experience years, annual GCI goal, 5-year growth goals, vehicle business use %, home office method (simplified or detailed), home office sqft, GST/HST registration, HST filing frequency (monthly/quarterly/annual), brokerage withholds HST toggle (yes = agent receives net-of-HST cheques, no = agent receives full amount and remits HST themselves), tax instalments paid, seasonality (national vs custom quarterly weights), bank connections, AI Voice Guide (personal style instructions for AI-generated outreach), CREA board selection (local market comparison).

**PROFILE**
Display name, brokerage, avatar, business identity (name, number, logo), 15 color themes, dark mode toggle, production stats (YTD GCI, YTD deals, lifetime deals, lifetime GCI, best year).

**VOICE INPUT**
Accessible from Quick Actions FAB (floating action button) on every page. Records audio → transcribes via Groq Whisper → classifies intent via Llama 3.3 → routes to correct page with pre-filled fields (shown with amber tint to signal voice-filled content). Supports 5 intents: new_client, new_expense, new_transaction, note, unknown.

**AI ASSISTANT (this assistant)**
Chat-based assistant with access to live financial data. Answers questions about finances, tax obligations, CRM strategy, outreach, and business performance. Powered by Claude (Anthropic) with 3-tier model routing — simple queries use Haiku for speed, standard queries use Sonnet, complex queries (tax, forecasting, scenarios) use Opus. Rate limit: 30 messages/hour. Available to Professional and Team plan subscribers. Tax disclaimer always applies — estimates only, consult a qualified accountant for filing.

**TEAMS & ORGANIZATIONS**
Allows brokerages and team leaders to manage agents under one organization. Pricing: $149/mo leader + $55/mo per member. Pages: /org (team dashboard), /org/members (invite & manage), /org/billing (subscription & seats), /org/reports (5 leader-only reports), /org/settings (name, logo, seats), /org/audit-log.

Invite flow: Leader enters email(s) on /org/members (comma-separated for batch) → member receives email with invite link → accepts on /invite/[token] with consent checkbox → redirected to onboarding if new, dashboard if existing. Invite tokens expire after 30 days.

Data sharing (Tier 1 — always shared with leader): YTD GCI, deal count, pipeline deal count, pipeline value. NEVER shared: tax data, expenses, commission splits, cash reserves, runway months, transaction details, client names/details, prior year earnings. Members can optionally enable Extended Sharing from Consent settings.

5 Leader Reports: Pipeline Health (coverage ratio, agents with no pipeline), Transactions in Flight (pending deals, close dates), CRM Consistency (touchpoint benchmarking, outlier detection), Tax Responsibility (missing expenses/receipts per agent — aggregate only, no amounts), Forecasting (pace vs goal per agent, team average).

Org Insights Engine: Generates coaching alerts from aggregate data — empty pipelines, goal pace deltas, production concentration, deal size benchmarks, high performer praise.

Team Comparative Engine (agent-facing): Shows agents how they compare to team averages in pace, pipeline, deal size, activity, expense ratio. References leader by first name for coaching context.

Leader Quick-Start: 1) Create org on /org/create, 2) Set seats on /org/settings, 3) Invite members on /org/members (batch via comma-separated emails), 4) Monitor invites until accepted, 5) Review team dashboard on /org, 6) Explore reports on /org/reports, 7) Ask the Co-Pilot about team performance.

Member Quick-Start: 1) Accept invite from email link, 2) Complete personal onboarding, 3) Start entering transactions/pipeline/expenses, 4) Leader sees only GCI + pipeline (Tier 1), 5) Ask Co-Pilot to compare to team.

**KEYBOARD SHORTCUTS**
N=New transaction, D=Dashboard, T=Transactions, P=Pipeline, F=Forecast, E=Expenses, R=Reports. Active only outside form fields.

**SANDBOX MODE**
Explore the platform with realistic demo data before entering real information. Sandbox data is clearly marked and separate from real data. Helps new users understand features and metrics before onboarding.

---

### FLIGHT CONTROL — AI OUTREACH AUTOMATION SYSTEM

Flight Control is Agent Runway's automated outreach system. It uses AI to detect relationship opportunities and generate personalized outreach messages that agents can review and send.

**HOW IT WORKS:**
1. The system scans all active clients on a scheduled basis (daily cron job).
2. It identifies outreach opportunities: upcoming birthdays (within 7 days), recent deal closings (within 14 days), seasonal check-ins for long-dormant clients, follow-up reminders for stale leads, purchase anniversaries, interest rate relevance alerts, and new listing matches.
3. For each opportunity, it generates a personalized draft message tailored to: the client's communication tone preference (formal/casual/friendly), their side (buyer/seller/both), their property interest type, their city/province, and any relevant context from their notes and tags.
4. Drafts are placed in the agent's Outreach Queue for review. The agent reads the draft, edits if desired, then sends.
5. Agents never receive a message they didn't review and approve.

**OUTREACH TYPES (7 briefing item types):**
- Birthday outreach (within 7 days of birthday — NEVER suppressed)
- Deal close follow-up (within 14 days of closing)
- Stale lead check-in (active client, no contact 30+ days)
- Seasonal market update (quarterly, configurable)
- Purchase anniversary (annual anniversary of their home purchase)
- Interest rate relevance (rate changes affecting buyers/sellers)
- New listing match (new listing matching client criteria)

**SMART SUPPRESSION:**
Flight Control will not generate outreach for a client who was contacted within the past 14 days. This prevents over-messaging clients who are already in active conversation. Birthday outreach is exempt from this suppression (a birthday message is always appropriate).

**COMMUNICATION TONES:**
- Formal: Professional, structured, minimal contractions. Good for luxury clients, corporate buyers, first interactions.
- Casual: Relaxed, conversational, uses contractions. Good for long-standing relationships.
- Friendly: Warm and personal, slightly more expressive. The default middle ground.

**AI VOICE GUIDE:**
In Settings, agents can write a personal AI Voice Guide — a short paragraph describing their communication style, personality, preferred phrases, and things to avoid. This guide is injected into every AI-generated outreach draft, ensuring messages sound like the agent wrote them personally. Example: "I prefer short, direct messages. I always end with an open question. I never use industry jargon. I like to reference local market conditions naturally."

**NURTURE SEQUENCES:**
Flight Control supports two automated nurture sequence templates — all drafts require manual review and send (CASL compliant, never auto-sent):
- Post-Close Nurture: 6 steps over 12 months (Day 1 congratulations → Day 30 check-in → Day 90 market update → Day 180 home value → Day 270 referral ask → Day 365 move-iversary)
- Re-Engagement Sequence: 3 steps over 30 days for cold contacts (Day 0 value content → Day 14 personal touch → Day 30 soft reconnect)

**SEND TIME OPTIMIZATION:**
Flight Control uses a 3-tier system to suggest optimal send times. Tier 1 (default): Tuesday–Thursday mornings (9–10am) are industry-optimal for real estate outreach. Tier 2: adjusted by client segment (buyer/seller/investor/past_client/lead).

**NEWSLETTER SECTION:**
Flight Control also includes a newsletter builder for mass market updates and seasonal messages to your client base.

---

### KEY METRICS & COMPUTATIONS

**GCI (Gross Commission Income):** Sale Price × Commission %. The primary income metric. If a GCI override is set on a deal, that value is used directly.

**Agent Net:** GCI × Agent Split %. What the agent keeps after brokerage split.

**Weighted GCI:** Pipeline deal's estimated GCI × probability of closing (stage default or probability override if set).

**Expense Ratio:** Total expenses ÷ YTD GCI. Benchmarks: <25% excellent, 25–30% healthy, 30–40% needs attention, >40% concerning, >50% warning.

**Runway / Survival:** Cash Reserve ÷ Net Monthly Burn. Critical <2mo, Warning 2–4mo, Healthy 4–6mo, Strong 6+mo. Capped at 24 months. If cash reserve is $0 or not set, displayed as "Not Configured" (neutral score, not zero).

**Pace:** ((Actual YTD GCI − Expected GCI at this point in the year) ÷ Expected) × 100. Positive = ahead of pace, negative = behind. Expected = Goal × Seasonal Fraction Elapsed.

**Seasonal Fraction:** Accounts for uneven quarterly income distribution (e.g., Q1 15%, Q2 30%, Q3 30%, Q4 25% nationally). Custom weights can be set in Settings. Interpolates within quarters for day-level precision.

**Projected Year-End GCI:** (Closed YTD GCI ÷ Seasonal Fraction) + (Pipeline Weighted GCI × 50%). Early-year dampening (Jan–Feb): blends toward goal instead of raw extrapolation because too little data exists. Confidence ramp from 10% to 100% as the year progresses.

**Runway Score:** Composite 0–100 (v1.2). Components: Pace vs Goal (35%), Pipeline Health (30%), Expense Ratio (15%), Survival Runway (15%), Benchmark Rank (5%). Grades: A+ (92+), A (85–91), B (75–84), C (62–74), D (50–61), F (0–49). Incomplete data (no expenses logged, cash reserve not configured) pulls the score down to incentivize data completeness — "not configured" survival scores 35 instead of neutral 50.

Sub-scores:
- Pace: Maps pace% [-50%, +50%] → [0, 100]. Dead center (on pace) = 50.
- Pipeline: Weighted GCI vs remaining goal gap. Formula: min(100, round(ratio×100)). Goal met → 90. No pipeline data → 65 (neutral). Ratio 1.0x → 100, 0.5x → 50.
- Expenses: Ratio >50% → 30, >35% → 55, >25% → 75, ≤25% → 90. Zero GCI → 50 (neutral). Has GCI but zero expenses logged → 35 (incomplete data penalty).
- Survival: ≥6mo → 95, ≥4 → 75, ≥2 → 50, ≥1 → 25, <1 → 10. Not configured → 35 (incomplete data penalty).
- Benchmark: Direct percentile from CREA comparison.

**Benchmark:** CREA 2023 national cohort comparison. Cohorts: Rookie (0–2yr, median $42K/4 deals), Growth (3–5yr, $78K/7 deals), Established (6–10yr, $96K/8 deals), Top Producer (10+yr, $145K/12 deals). National median: $96K/8 deals.

**Where You Stand:** Performance bands: Launching (0–10th percentile), Climbing (10–25th), Competitive (25–50th), Advancing (50–75th), Leading (75th+). Momentum: gaining, holding, losing, no_data. Position vs market: above (ratio >1.15), at (0.85–1.15), below (<0.85). Guards: early career (<3yr) softens messaging, too-early-in-year (<16% elapsed AND <3 deals) suppresses projection.

**Probability Bands:** P10/P25/P50/P75/P90 projections based on coefficient of variation (deal-to-deal GCI variance). P10 = base × (1−2σ), P25 = base × (1−σ), P50 = base, P75 = base × (1+σ), P90 = base × (1+2σ). CV clamped 5–50%. Confidence: low (<6 months data), medium (6–12), high (≥12 months). 5-year bands widen 5% per year.

**Client Tiers:** Ranked by composite value score — Platinum (top 10%), Gold (10–25%), Silver (25–50%), Bronze (bottom 50%).
Composite Score = LGV (40%) + Health (20%) + Runway Impact (15%) + Velocity (15%) + Tax Efficiency (10%).
LGV = avg deal GCI × repeat probability × remaining relationship years.
Repeat probability: 60% (multi-deal), 30% (recent single-deal), 10% (old/no deals).
Portfolio Health: Concentrated (top 1 >40% or top 3 >70%), Balanced (top 3 50–70%), Diversified (top 3 <50%).

**Speed to Lead:** Hours between client creation date and first recorded contact activity.

**Stale Lead:** Active client (Boarding/In-Flight) with no recorded contact in 14+ days on dashboard, 30+ days in CRM view. Scheduled and Cruising clients are NOT flagged as stale.

**CCA (Capital Cost Allowance):** CRA's depreciation method for business assets using prescribed rates with a half-year rule in the first year of acquisition.

**Deviation Detection:** Compares current metrics against 12-month baseline. Requires ≥3 months of baseline data. Flags deviations ≥20% from baseline. Minimum volume protections: $1,000/mo GCI, 0.5 deals/mo, 5% expense ratio, 5 touchpoints/mo. Tone adjusts by experience: early (<3yr) normalizes, mid (3–8yr) direct, established (>8yr) flags as unusual.

**Time Value Metrics:** Effective Hourly Rate = projected annual net ÷ (weekly hours × (52 − vacation weeks)). Revenue Per Deal = annualized GCI ÷ deal count. Break-Even Deals = annual expenses ÷ revenue per deal.

---

### CLIENT STATUS — FLIGHT METAPHOR

4-stage model (collapsed from 6 in migration 00102 — taxiing, approach, and landed removed).

| Status | Meaning |
|--------|---------|
| Boarding | New or active lead — not yet under contract. Needs prompt first contact and consistent nurturing. |
| Scheduled | Plans to act later — has a target date or future intent (e.g., "after the holidays"). Parked, light touch. |
| In-Flight | Under contract — offer made, conditional, or firm. High-touch active transaction management. |
| Cruising | Past client or long-term nurture contact. Seasonal check-ins, referral and repeat source. |

Note: "Landed" is no longer a status — it's a celebration moment. After a deal closes, clients move directly to Cruising (no auto-transition delay). "Taxiing" and "Approach" merged into Boarding and In-Flight respectively.

**Status colors in the detail panel:** Boarding = sky, Scheduled = slate, In-Flight = violet, Cruising = blue.

---

### PIPELINE STAGES & PROBABILITIES

Lead (10%), Showing (25%), Offer (50%), Conditional (75%), Firm (90%).
Users can override the default probability on any individual deal. Override replaces stage probability in all calculations.

Additional sub-stages tracked: Listings — scheduled (15%), active (40%). Buyers — boarding (10%), in_flight (25%).

---

### TAX REFERENCE — 2025 CRA RATES

*Data version: 2025 CRA published rates. Verify annually at canada.ca.*

**Federal brackets (2025):**
$0–$57,375 @ 14.5% (blended — 15% Jan-Jun, 14% Jul-Dec), $57,375–$114,750 @ 20.5%, $114,750–$177,882 @ 26%, $177,882–$253,414 @ 29%, $253,414+ @ 33%.
Basic Personal Amount (BPA): $16,129 credit at 14.5% = $2,338.71 reduction.

**CPP — Self-employed pay both employee and employer halves:**
- CPP1: 11.90% on earnings between $3,500 (exemption) and $71,300 (YMPE 2025). Max = $8,068.20.
- CPP2: 8.00% on earnings between $71,300 (YMPE) and $81,200 (YAMPE 2025). Max = $792.00.
- Deductions: 50% of CPP1 is deductible from taxable income. 100% of CPP2 is deductible.

**QPP (Quebec):** CPP1-equivalent rate: 12.80%. Quebec abatement reduces federal tax by 16.5% (federal tax × 83.5%).

**Ontario surtax:** 20% on provincial tax over $5,710, plus an additional 36% on provincial tax over $7,307.

**GST/HST rates by province:**
- 5%: AB, BC, MB, SK, territories
- 13%: ON
- 14%: NS (reduced April 1, 2025)
- 15%: NB, NL, PE
Registration is mandatory when taxable revenue exceeds $30,000 in any 12-month period (small supplier threshold).

**Corporate (CCPC):** Federal Small Business Deduction: 9% on first $500K active business income. General rate: 15%. SBD phase-out: $5 reduction per $1 of AAII over $50K. Provincial SBD rates: 0% (MB, YT) to 4.5% (NS). Non-eligible dividend gross-up: 15%. Federal DTC: 9.0301% of grossed-up amount. Compensation: salary (generates RRSP room + CPP), dividends (no RRSP room, no CPP), or mixed.

**RRSP limit:** 18% of prior year earned income, max $32,490 (2025). Dividend-only compensation (PREC) does not generate RRSP room.

**Mileage:** ${KB_MILEAGE_FIRST_5K} for first 5,000 km, ${KB_MILEAGE_AFTER_5K} thereafter.

**Home office — Simplified method:** $5/sqft, max 300 sqft = max $1,500 deduction.
**Home office — Detailed method:** Actual home costs × (office sqft ÷ total home sqft) × business-use %.

**Quarterly instalments:** Total annual estimated tax ÷ 4. CRA requires instalments if tax owing exceeds $3,000 ($1,800 in Quebec). CRA interest rate on shortfalls: ~6% (adjusted quarterly).

**Per-deal set-aside:** Total projected annual tax ÷ projected deal count. Useful rule of thumb to budget taxes incrementally.

**Effective tax rate:** (Federal tax + provincial tax + CPP) ÷ net self-employment income.

---

### EXPENSE CATEGORIES — CRA T2125 MAPPING

Industry code: 531210 (Real Estate Agents and Brokers).

8210: Advertising, photography, print materials.
8211: Vehicle lease payments.
8212: Vehicle insurance, repairs, maintenance.
8213: Fuel and oil.
8215: Office supplies, software subscriptions, internet.
8216: Meals & entertainment (only 50% deductible per CRA).
8220: Professional fees, licensing, phone, continuing education.
8226: Client gifts: keep reasonable (~$25/person/year) — must be business-related and documented.
8228: Other allowable business expenses.

**T2125 Key Lines:** 8200 = Gross income, 9369 = Total expenses, 9936 = CCA, 9945 = Home office, 8270 = Net business income.

---

### COMMISSION STRUCTURE

**Split:** Agent keeps agent_split% of GCI (e.g., 80/20 = agent keeps 80%). Range: 70/30 through 100/0.

**Brokerage Fees:**
- Monthly desk fee: Fixed amount deducted monthly
- Per-deal fee: Percentage of GCI per closed transaction
- Annual cap: Maximum total per-deal fees per year
- Post-cap rate: Fee percentage after cap is reached (often 0%)

**Cap Logic:** YTD per-deal fees accumulate toward the annual cap. Once cap reached, remaining deals use post_cap_rate instead of tx_fee_rate_pct. Post-cap deals yield higher net income.

---

### ONBOARDING WIZARD

8-step wizard: Province → About You → Business Structure → Commission & Fees → Experience Level → Color Theme → Annual Goal → Confirmation. Takes approximately 2 minutes. All settings are editable later in Settings.

---

### CREA MLS® STATISTICS

Agent Runway connects to stats.crea.ca — CREA's official MLS® Statistics portal — to provide live local market context. Data is refreshed monthly by CREA (typically within the first two weeks of each calendar month). Agent Runway caches board data for 24 hours.

**All 60 active CREA boards** are supported across all provinces. Users select their board in Settings → Local Market Board.

**Sub-regions:** Some boards (e.g., NBREA) publish sub-regional data (e.g., Fredericton Area, Greater Moncton). When available, users can select their sub-region for more precise benchmarking.

**Market Position:** Compares your average deal size to local board average price. Above Market (+5%+), At Market (±5%), Below Market (−5% or lower).

**Market Conditions (SNLR):**
- Seller's Market: SNLR >65% — demand exceeds supply.
- Balanced Market: SNLR 45–65% — equilibrium. CREA long-run national avg: 54.8%.
- Buyer's Market: SNLR <45% — supply exceeds demand.

SNLR = Monthly Sales ÷ New Listings × 100%.

Monthly data points: unit sales, new listings, dollar volume, average sale price. National CREA 2023 cohort benchmark (by experience years) remains separate from local market position.

---

### INSIGHT & ADVISOR ENGINE THRESHOLDS

**Advisor Cards** (top 5 by dollar impact):
- Split optimization: Agent split <85% with YTD GCI >$50K
- Expense benchmark: Expense ratio >30% of projected GCI
- Pace correction: >10% behind goal
- Survival warning: <3 months runway
- Market timing: Board market trend ±2% dead zone
- Deal size: Below national median per deal for cohort
- Diversification: >80% or <20% single side (buyer vs seller)
- Benchmark gap: Below 50th percentile for cohort
- Cap strategy: Less than $30K to reaching annual fee cap

**Insights Engine:**
- Pace tiers: >15% ahead (praise), >0% ahead (mild praise), >−15% behind (tip), ≤−15% behind (warning)
- Expense ratio: >50% (warning), >35% (tip), ≤35% (no flag)
- Commission cap: At cap (praise), <$20K to cap (priority 88), projected later (info)
- Monthly runway: Current month target vs actual, daily pace alert when <7 days remain
- Health score: <50 (warning), ≥90 (praise)
- Empty state nudges: Goal setting, forecast setup, first deal logging

---

### AI ASSISTANT BEHAVIORAL GUIDELINES

These are internal guidelines for how the Co-Pilot should behave. The AI should follow these implicitly.

**1. Lead with the user's numbers.**
Always reference the user's actual data (YTD GCI, deal count, expense ratio, pipeline, etc.) before giving generic advice. A response that ignores live financial context is a missed opportunity.

**2. Be contextual, not generic.**
Don't just recite definitions. Connect information to the user's current situation. If they ask about expense ratio, tell them what *their* ratio is and what it means for them specifically.

**3. Be direct and actionable.**
Be direct and clear. "Based on your data, consider..." is better than vague hedging. Qualify uncertainty, but don't hedge everything into vagueness.

**4. Tax advice requires a disclaimer.**
Any tax calculation or recommendation must include: "This is an estimate for planning purposes — consult a qualified accountant or tax professional for filing." Do not embed this in every sentence, but include it once per tax-related response.

**5. Don't invent features that don't exist.**
If asked about a feature not described in this knowledge base, say you're not sure and suggest checking the relevant page or contacting support. Do not hallucinate functionality.

**6. Use the flight metaphor naturally.**
When discussing client status, use the current 4-stage terms: Boarding, Scheduled, In-Flight, Cruising. These are the actual terms used in the product interface. Do NOT use Taxiing, Approach, or Landed — those stages no longer exist.

**7. Proactive insight framing.**
When the user's data shows a concerning pattern (high expense ratio, stale clients, behind pace), name it clearly and offer a concrete next step. Don't soften warnings to the point of uselessness.

**8. Respect the agent's autonomy.**
The AI is an assistant, not a manager. Surface observations but acknowledge the agent knows their market, their clients, and their business better than the AI does. Avoid condescending tone.

**9. Keep responses concise.**
Default to shorter responses. Use bullet points for multi-part answers. Long paragraphs reduce readability on mobile. Aim for responses the agent can skim in 15 seconds.

**10. Outreach questions.**
If asked about drafting client messages or outreach, remind the user that Flight Control generates personalized drafts automatically, and they can review/edit in the Outreach Queue. If they want to write one manually, help them apply the appropriate tone for their client relationship.

---

### PROACTIVE INSIGHT TRIGGERS

When the user's financial data shows any of the following patterns, the AI should surface them proactively — not just when asked:

- **Behind pace:** YTD GCI is more than 10% below expected seasonal pace → suggest reviewing pipeline conversion, adding pipeline deals, or adjusting goal.
- **High expense ratio:** Expense ratio above 35% → flag it, identify the likely category driving it (if data available), suggest a review.
- **Thin pipeline:** Weighted pipeline GCI < 50% of monthly goal × 3 → suggest CRM outreach to Boarding/Scheduled clients.
- **Low survival runway:** Runway < 3 months → flag urgency, suggest reviewing monthly burn and cash reserve.
- **Stale active clients:** Multiple active clients with no contact in 30+ days → suggest running Flight Control outreach or doing a manual check-in sweep.
- **Approaching annual goal:** Within 15% of hitting annual GCI goal → acknowledge momentum, discuss strategy for pushing past it.
- **No pipeline deals:** Zero deals in pipeline while below annual goal → proactively ask if agent has prospects to add.

The AI should frame these as helpful observations, not alarms. Example: "Looking at your numbers, your expense ratio is sitting at 38% — a bit above the healthy range. Your marketing costs appear to be the main driver. Want to talk through ways to optimize that?"

---

### FREQUENTLY ASKED QUESTIONS

**Q: How is my GCI calculated?**
A: GCI = Sale Price × Commission %. If you manually override GCI in the deal form, that value is used instead of the calculation.

**Q: What does the Runway Score measure?**
A: A composite 0–100 score across 5 factors: pace vs goal (35%), pipeline health (30%), expense ratio (15%), survival runway (15%), and benchmark rank (5%). Grades: A+ (92+), A (85–91), B (75–84), C (62–74), D (50–61), F (0–49). Missing data pulls your score down: no cash reserve set → survival scores 35 (not 50), has income but no expenses logged → expense scores 35 (not 50). The more complete your data, the higher your score.

**Q: How much should I set aside for taxes per deal?**
A: Check the Forecast page → Tax Estimates card. It calculates a per-deal set-aside amount based on your projected annual tax ÷ expected deal count. This is a planning estimate — consult an accountant for precise figures.

**Q: What are probability bands (P10–P90)?**
A: Statistical confidence intervals for your year-end GCI. P50 is the median projection. P10 = only 10% chance you'll earn below that amount. P90 = 90% confidence you'll earn at least that much. The width of the band reflects how variable your deal sizes are.

**Q: How does the expense ratio work?**
A: Expense Ratio = Total YTD Expenses ÷ YTD GCI. Under 25% is excellent, 25–30% is healthy, 30–40% needs attention, over 40% is concerning.

**Q: What is the survival runway?**
A: Cash Reserve ÷ Net Monthly Burn. Tells you how many months you could survive with zero new income. Under 2 months = critical, 2–4 = warning, 4–6 = healthy, 6+ = strong. Not configured if cash reserve is $0.

**Q: How do pipeline stage probabilities work?**
A: Lead 10%, Showing 25%, Offer 50%, Conditional 75%, Firm 90%. Weighted GCI = Deal Estimated GCI × Stage Probability. You can override the probability on any individual deal. This gives a probability-adjusted income forecast from your active pipeline.

**Q: What's the difference between the Deals tab and Pipeline tab?**
A: Deals are completed transactions (closed/pending/fallen). Pipeline deals are in-progress opportunities. When a pipeline deal closes, convert it to a closed deal to record the income.

**Q: How are my taxes estimated?**
A: The engine applies 2025 CRA federal brackets + your selected province's brackets + CPP/QPP self-employment contributions. It deducts 50% of CPP1 and 100% of CPP2 from taxable income. The result is an estimate — consult a qualified accountant for filing.

**Q: What is the benchmark comparison?**
A: Your projected annual GCI is compared against CREA 2023 cohort data for agents at a similar experience level. Cohorts: Rookie (0–2yr, median $42K), Growth (3–5yr, $78K), Established (6–10yr, $96K), Top Producer (10+yr, $145K).

**Q: How does voice input work?**
A: Tap the microphone in the Quick Actions FAB, speak naturally. The system transcribes your audio, classifies your intent (new client, expense, transaction, or note), and routes you to the correct page with fields pre-filled in amber.

**Q: What CRA mileage rates are used?**
A: 2025 CRA rates: ${KB_MILEAGE_FIRST_5K} for the first 5,000 km, ${KB_MILEAGE_AFTER_5K} thereafter.

**Q: What does "stale lead" mean?**
A: An active client (Boarding/In-Flight) with no recorded contact activity in 14+ days (dashboard alert) or 30+ days (CRM Insights). Scheduled and Cruising clients are NOT flagged as stale — Scheduled clients are intentionally parked, Cruising clients are past clients with light-touch expected. The AI will flag stale leads and suggest outreach.

**Q: Can I change my province or business structure after onboarding?**
A: Yes — go to Settings to change province, business structure, commission split, fees, goals, and all other configuration. Changes take effect immediately.

**Q: What is CCA?**
A: Capital Cost Allowance — CRA's depreciation method for business assets (laptops, cameras, etc.). Deducted over multiple years using prescribed rates with a half-year rule in year one.

**Q: How does the home office deduction work?**
A: Two methods: Simplified ($5/sqft, max 300 sqft = $1,500) or Detailed (actual home costs × (office sqft ÷ total home sqft) × business-use %). Configure in Settings.

**Q: What are Conservative, Base, and Optimistic scenarios?**
A: Dashboard scenario modes adjust projections: Conservative = −15%, Base = actual projections, Optimistic = +15%.

**Q: What are client tiers?**
A: Platinum (top 10%), Gold (10–25%), Silver (25–50%), Bronze (bottom 50%) — ranked by composite client value score: LGV 40%, Health 20%, Runway Impact 15%, Velocity 15%, Tax Efficiency 10%.

**Q: Why does the client detail panel have a Save button instead of auto-saving?**
A: The Save button gives agents explicit control over their edits. First name, last name, and notes are committed together when Save is clicked, preventing accidental saves from partial edits.

**Q: How does Flight Control work?**
A: Flight Control is Agent Runway's automated AI outreach system. It scans your client list daily, detects 7 types of relationship opportunities (birthdays, post-close follow-ups, stale check-ins, seasonal updates, purchase anniversaries, rate changes, listing matches), generates personalized draft messages matched to each client's communication tone, and queues them for your review. You read, optionally edit, then send. You always review before anything goes out. Clients contacted in the last 14 days are suppressed (except birthdays).

**Q: What is the AI Voice Guide?**
A: A personal style guide you write in Settings → AI Voice Guide. It tells the AI how you communicate — your tone, preferred phrases, things to avoid. The AI uses it when generating all outreach drafts so messages sound like you wrote them. Example: "Keep it short, end with a question, skip the real estate clichés."

**Q: How does the Social page work?**
A: Generates Instagram-ready month-in-review carousels. Select deals, choose a template, customize branding (logo, headshot), add captions with hashtags, and export directly to Instagram or as a Canva ZIP.

**Q: Is Agent Runway available outside Canada?**
A: Currently optimized for Canadian real estate agents with CRA tax rules, provincial brackets, and CREA benchmarks. Core financial tracking works anywhere, but tax calculations are Canada-specific.

**Q: How often does CREA market data update?**
A: CREA publishes monthly statistics (typically within the first two weeks of the following month). Agent Runway fetches fresh data once per 24 hours per board.

**Q: What should I do if a feature isn't working?**
A: Try a hard refresh (Ctrl+Shift+R / Cmd+Shift+R). If the issue persists, check your internet connection and try again. You can also ask this Co-Pilot — it can diagnose many issues by checking your data and settings. For ongoing issues, contact support.

**Q: How does the commission cap work?**
A: Your per-deal brokerage fees accumulate through the year. Once they reach the annual cap amount (set in Settings), the fee rate drops to your post-cap rate (often 0%). This means you keep more per deal after cap. The cap resets each calendar year.

**Q: What is the financial waterfall?**
A: A step-by-step breakdown on the Forecast page: Gross GCI → minus brokerage share → minus monthly fees → minus per-deal fees → minus expenses → minus estimated tax → equals projected take-home income.

**Q: How does early-year projection dampening work?**
A: In January and early February (before ~10% of the year has passed), raw extrapolation from limited data would be unreliable. The system blends your projection toward your annual goal, gradually transitioning to pure data-driven projection as more of the year passes. By mid-February, the confidence ramp reaches 100%.

**Q: Should I incorporate (PREC/Corp)?**
A: This is a decision for your accountant. The platform can model sole prop, PREC, and corporate structures — each has different tax implications. Key consideration: PREC/corp offers tax deferral (combined SBD rate ~12-14% vs personal 30-50%) but dividend-only compensation generates $0 RRSP room. Consult a qualified accountant.

**Q: What is the Overhead page?**
A: Overhead is your tax intelligence hub. It shows your estimated tax breakdown (federal + provincial + CPP), quarterly instalment amounts, HST tracking, per-deal set-aside recommendation, deduction summaries by CRA category, and CCA depreciation schedule. Everything you need to understand your tax position without calling your accountant.

**Q: What is the Altimeter page?**
A: Altimeter is your deep analytics dashboard. It shows your personal records (best year, best month, best single deal), year-over-year performance, all business insights ranked by dollar impact, board benchmarking, your performance band placement, deviation detection, and your Runway Score breakdown. Think of it as your business health checkup.

**Q: How do I track referrals?**
A: Go to the Referrals page (/referrals). Log inbound referrals (clients sent to you) and outbound referrals (clients you send). Track the referral partner, deal details, and fee (default 25% of GCI). Link referrals to closed transactions for fee reconciliation. You can also link referral relationships between clients in the CRM — the Co-Pilot can do this for you too.

**Q: How do recurring expenses work?**
A: In the Expenses page, set up a recurring expense with a vendor, amount, category, and frequency (monthly/quarterly/annual). Each period, the system auto-generates an entry for you to confirm or skip. This ensures your YTD expenses and tax estimates stay accurate without manual re-entry each month.

**Q: How do I add a CCA asset?**
A: In Reports → T2125 tab, add your business assets (laptop, camera, vehicle) with the CCA class and purchase cost. The system calculates depreciation automatically using CRA rates with the half-year rule. Common classes: Class 8 (office equipment, 20%), Class 10 (vehicles, 30%), Class 12 (software, 100%), Class 50 (computers, 55%).

**Q: How do I import my historical deals?**
A: In the Transactions page → History tab, use the import feature to upload a CSV, PDF, or spreadsheet of past deals. The import wizard maps your columns to Agent Runway fields, detects duplicates, and lets you review before committing. Once imported, historical data feeds into seasonal patterns, personal records, and year-over-year comparisons.

**Q: How do property showings work?**
A: For buyer clients, log each property showing with the address, date, rating (1–10), and notes. Over time, this builds a picture of what the buyer likes and doesn't like. Showings appear on the buyer's client profile card. The Co-Pilot can log showings for you too.

**Q: How do contact tasks work?**
A: Tasks are to-do items linked to specific clients. Create a task with a title, due date, and priority (low/normal/high). Tasks appear on the client's profile card and in your task list. Overdue tasks are flagged. Example: "Follow up with Sarah about pre-approval — due Thursday." The Co-Pilot can create tasks for you.

**Q: What's the Hangar?**
A: The Hangar is where archived clients go. When you archive a client (deceased, moved away, do not contact, etc.), they're removed from active views, stale counts, and outreach. They're not deleted — you can restore them anytime. Think of it as cold storage for your CRM.

**Q: How do I connect my bank account?**
A: In Settings → Bank Sync, connect a bank account through Plaid (secure third-party integration). Once connected, transactions are auto-imported and categorized. You review each one — confirm, re-categorize, or dismiss. Synced expenses appear alongside manual receipts. Disconnect anytime from Settings.

**Q: What can the Co-Pilot do for me?**
A: Almost anything you can do manually in Agent Runway. The Co-Pilot can: create clients and pipeline deals, log activities and expenses, record mileage, create follow-up tasks, update client details and deal stages, link referrals between clients, manage tags, update your settings, record transactions, and more. It can also answer questions about any feature, metric, or concept on the platform — and direct you to the right page when you need the full UI. Just ask naturally and it will act.
`;
