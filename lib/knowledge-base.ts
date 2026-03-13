/**
 * Agent Runway Platform Knowledge Base
 *
 * This module exports the complete platform knowledge base as a string constant.
 * It is injected into the AI chat system prompt so the advisor can answer
 * questions about any feature, metric, computation, or concept on the platform.
 *
 * Source of truth: /Users/b/Desktop/Agent Runway Knowledge Base/AGENT_RUNWAY_KNOWLEDGE_BASE.md
 * Keep this file in sync with the master document when features change.
 */

export const KNOWLEDGE_BASE = `
## AGENT RUNWAY PLATFORM KNOWLEDGE BASE

Agent Runway is a business analytics platform for Canadian real estate agents. It tracks income, expenses, clients, and taxes — projecting business health with real-time intelligence.

### PAGES & FEATURES

DASHBOARD: Command center showing Runway Score (0–100, graded A+ to F), KPI cards (GCI progress, YTD performance, pace status), monthly chart, probability bands (P10–P90), benchmark vs CREA 2023 peers, tax estimate (federal + provincial + CPP), smart alerts, insights (praise/tips/warnings), survival runway status, trend detection, and CRM task widget with overdue/stale lead counts. Three views: Essentials, Standard, Full. Three scenario modes: Conservative (−15%), Base, Optimistic (+15%).

TRANSACTIONS: Three tabs. Deals tab: closed transactions with date, address, client, sale price, commission %, GCI (auto-calculated or overridden), side (buyer/seller/both), status (closed/pending/fallen), team/referral split. Pipeline tab: in-progress deals with stages (Lead 10%, Showing 20%, Offer 40%, Conditional 60%, Firm 90%), weighted GCI, convert-to-closed feature. History tab: annual summaries (year, GCI, deals, Q1–Q4 breakdown), YoY chart, seasonal profile, import from PDF/spreadsheet.

CRM: Four tabs. Clients: full contact records with name, email, phone, address, lead source, tags, status (Boarding→Taxiing→In-Flight→Landed→Cruising), valuation tiers (Platinum top 10%, Gold 10–25%, Silver 25–50%, Bronze 50%+), relationship linking, contact activity log (call/email/text/showing/meeting/note), tasks with due dates and priorities. CRM Dashboard: engagement analytics (touchpoints, frequency distribution, overdue clients 30+ days, activity type breakdown, speed to lead, source funnel). Insights: stale lead alerts, high-value summaries, referral analysis. Flight Plans: automated follow-up sequences triggered by client status changes.

EXPENSES: Three tabs. Receipts: manual or receipt-photo entry with OCR extraction, organized by category (Vehicle, Marketing, Office, Professional, Education, Meals, Entertainment, Other), KPIs (YTD expenses, monthly avg, expense ratio, projected annual). Mileage: trip logging with CRA 2025 rates ($0.72/km first 5K, $0.66/km after), KPIs (YTD km, total deduction, projected annual). Bank Imports: Plaid integration for automatic bank transaction import with auto-categorization.

FORECAST: Financial waterfall (GCI → split → fees → expenses → tax → take-home), tax planning card (quarterly instalment, per-deal set-aside, effective rate), probability bands chart (P10–P90 12-month projection), 5-year growth plan with widening confidence bands, goal gap analysis (deals needed, daily pace), advisor cards (top 3 by dollar impact).

REPORTS: Three tabs. Overview: Runway Score, benchmark, survival, waterfall, monthly table, transaction log, expense breakdown. Benchmark: CREA 2023 cohort comparison, percentile rank. Tax (T2125): CRA T2125 summary with expense lines by CRA code, CCA assets, home office deduction (simplified $5/sqft max $1500 or detailed), mileage summary.

SOCIAL: Month-in-review carousel builder for Instagram. Select deals, choose template family, configure branding (logo, headshot, agent cutout), customize slides, add caption with hashtags, export to Instagram direct or Canva ZIP.

SETTINGS: Province, business structure (sole prop/PREC/corp), commission split (70/30 to 100/0), brokerage fees (monthly + per-deal + annual cap), post-cap commission structure, cash reserve, experience years, annual GCI goal, 5-year growth goals, vehicle business use %, home office method, GST/HST registration, tax instalments paid, seasonality (national vs custom), bank connections.

PROFILE: Display name, brokerage, avatar, business identity (name, number, logo), 15 color themes, dark mode toggle, production stats.

VOICE INPUT: Accessible from Quick Actions FAB on every page. Records audio → transcribes via Groq Whisper → classifies intent via Llama 3.3 → routes to correct page with pre-filled fields (amber tinted). Supports 5 intents: new_client, new_expense, new_transaction, note, unknown.

AI ADVISOR: Chat-based assistant with access to live financial data. Answers questions about finances, tax obligations, business strategy. Uses Groq Llama 3.3. Rate limit: 30 messages/hour. Tax disclaimer always applies.

KEYBOARD SHORTCUTS: N=New transaction, D=Dashboard, T=Transactions, P=Pipeline, F=Forecast, E=Expenses, R=Reports. Active only outside form fields.

### KEY METRICS & TERMS

GCI (Gross Commission Income): Sale Price × Commission %. The primary income metric.
Agent Net: GCI × Agent Split %. What the agent keeps after brokerage split.
Weighted GCI: Pipeline deal's estimated GCI × probability of closing.
Expense Ratio: Total expenses ÷ YTD GCI. Benchmark: 25–30% healthy, >40% concerning, >50% warning.
Runway/Survival: Cash Reserve ÷ Net Monthly Burn. Critical <2mo, Warning 2–4, Healthy 4–6, Strong 6+.
Pace: ((Actual GCI − Expected at this point) ÷ Expected) × 100. Positive=ahead, negative=behind.
Seasonal Fraction: Accounts for uneven quarterly income distribution (e.g., 5% Q1, 45% Q4).
Projected Year-End GCI: (Closed GCI ÷ Seasonal Fraction) + (Pipeline Weighted GCI × 50%).
Runway Score: Composite 0–100. Components: Pace 30%, Pipeline 20%, Expenses 15%, Setup 10%, Benchmark 10%, Survival 15%. Grades: A+ (92+), A (85–91), B (75–84), C (62–74), D (50–61), F (0–49).
Benchmark: CREA 2023 cohort comparison. Cohorts: Rookie (0–2yr), Growth (3–5yr), Established (6–10yr), Top Producer (10+yr).
Probability Bands: P10/P25/P50/P75/P90 based on coefficient of variation (deal-to-deal variance).
Client Tiers: Platinum (top 10%), Gold (10–25%), Silver (25–50%), Bronze (50%+) by composite score.
LGV (Lifetime GCI Value): Historical GCI + estimated future value (avg deal × repeat probability × remaining years).
Speed to Lead: Hours between client creation and first recorded activity.
Stale Lead: Active client with no contact in 14+ days (dashboard) or 30+ days (CRM).
CCA: Capital Cost Allowance — CRA depreciation method for business assets with half-year rule.

### TAX REFERENCE (2025 CRA)

Federal brackets: $0–57,375 @14.5%, 57,375–114,750 @20.5%, 114,750–177,882 @26%, 177,882–253,414 @29%, 253,414+ @33%. BPA: $16,129.
CPP: Self-employed pay both halves. CPP1: 11.90% on $3,500–$71,300 (YMPE). CPP2: 8.00% on $71,300–$81,200 (YAMPE). CPP2 is 100% deductible.
QPP (Quebec): 12.80% CPP1 rate. Quebec abatement: federal tax × 83.5%.
Ontario surtax: 20% on provincial tax over $5,710 + 36% on provincial tax over $7,307.
GST/HST: 5% (AB,BC,MB,territories) to 15% (NB,NL,PE). Registration mandatory if revenue >$30K.
Corporate (CCPC): Federal SBD 9% on first $500K, general 15%. Provincial varies (0–15% SBD, 8–15% general).
RRSP limit: 18% of prior year income, max $32,490. No RRSP room from dividend-only compensation.
Mileage: $0.72/km first 5,000, $0.66/km after. Home office simplified: $5/sqft, max 300sqft ($1,500).
Quarterly instalments: Total annual tax ÷ 4. Per-deal set-aside: Total annual tax ÷ projected deal count.
Effective tax rate: Total tax burden (income tax + CPP) ÷ net self-employment income.

### CLIENT STATUS (FLIGHT METAPHOR)
Boarding: New lead just entered pipeline.
Taxiing: Warming up, actively engaging.
In-Flight: Active client, showing/negotiating.
Landed: Deal closed, transaction completed.
Cruising: Past client, long-term relationship.

### PIPELINE STAGES
Lead (10%), Showing (20%), Offer (40%), Conditional (60%), Firm (90%).

### ONBOARDING
8-step wizard: Province → About You → Business Structure → Commission & Fees → Experience Level → Color Theme → Annual Goal → Confirmation. Takes ~2 minutes.

### EXPENSE CATEGORIES (T2125 MAPPING)
8210: Advertising/photography/print. 8211: Vehicle lease. 8212: Vehicle insurance/repairs. 8213: Fuel. 8215: Office supplies/software. 8216: Meals & entertainment (50% deductible). 8220: Professional fees/phone/licensing. 8226: Client gifts ($25 CRA limit). 8228: Other.

### FREQUENTLY ASKED QUESTIONS

Q: How is my GCI calculated?
A: GCI = Sale Price × Commission %. If you override GCI in the deal form, that value is used instead.

Q: What does the Runway Score measure?
A: A composite 0–100 score across 6 factors: pace vs goal (30%), pipeline health (20%), expense ratio (15%), survival runway (15%), benchmark rank (10%), and setup completeness (10%). Grades range from A+ (92+) to F (0–49).

Q: How much should I set aside for taxes per deal?
A: Check the Forecast page's Tax Planning card — it shows a per-deal set-aside amount based on your projected annual tax divided by expected deal count.

Q: What are probability bands (P10–P90)?
A: Statistical confidence intervals for your year-end GCI. P50 is the median projection. P10 means there's only a 10% chance you'll earn below that amount. P90 means 90% confidence you'll earn at least that much.

Q: How does the expense ratio work?
A: Expense Ratio = Total YTD Expenses ÷ YTD GCI. Under 25% is excellent, 25–30% is healthy, 30–40% needs attention, over 40% is concerning.

Q: What is the survival runway?
A: Cash Reserve ÷ Net Monthly Burn. It tells you how many months you could survive with zero new income. Under 2 months is critical, 2–4 is a warning, 4–6 is healthy, 6+ is strong.

Q: How do pipeline deal probabilities work?
A: Each stage has a default probability: Lead 10%, Showing 20%, Offer 40%, Conditional 60%, Firm 90%. Weighted GCI = Deal GCI × probability.

Q: What's the difference between the Deals tab and Pipeline tab?
A: Deals are completed (closed/pending/fallen). Pipeline deals are in-progress opportunities at various stages. Convert a pipeline deal to a closed deal when it closes.

Q: How are my taxes estimated?
A: The engine applies 2025 CRA federal brackets + your province's brackets + CPP/QPP self-employment contributions. It's an estimate — consult a qualified accountant for filing.

Q: What is the benchmark comparison?
A: Your GCI is compared against CREA 2023 cohort data for agents with similar experience. Cohorts: Rookie (0–2yr), Growth (3–5yr), Established (6–10yr), Top Producer (10+yr).

Q: How does voice input work?
A: Tap the microphone in the Quick Actions menu, speak naturally. The system transcribes your audio, classifies your intent (new client, expense, transaction, or note), and routes you to the correct page with fields pre-filled.

Q: What CRA mileage rates are used?
A: 2025 CRA rates: $0.72/km for the first 5,000 km, $0.66/km thereafter.

Q: What does "stale lead" mean?
A: An active client (Boarding/Taxiing/In-Flight status) with no recorded contact activity in 14+ days.

Q: Can I change my province or business structure after onboarding?
A: Yes — go to Settings to change province, business structure, commission split, fees, goals, and all other configuration.

Q: What is CCA (Capital Cost Allowance)?
A: CRA's depreciation method for business assets. Items like laptops or cameras are deducted over multiple years using prescribed rates with a half-year rule in the first year.

Q: How does the home office deduction work?
A: Two methods: Simplified ($5/sqft, max 300 sqft = $1,500) or Detailed (actual costs × business-use percentage). Choose in Settings.

Q: What's the difference between Conservative, Base, and Optimistic scenarios?
A: Dashboard scenario modes adjust projections: Conservative applies −15% to projected figures, Base uses actual projections, Optimistic applies +15%.

Q: What are client tiers (Platinum, Gold, Silver, Bronze)?
A: Ranked by composite value score: Platinum (top 10%), Gold (10–25%), Silver (25–50%), Bronze (bottom 50%).

Q: How does the Social page work?
A: Generates Instagram-ready month-in-review carousels. Select deals, choose a template, customize branding (logo, headshot), add captions with hashtags, and export directly or as a Canva ZIP.

Q: Is Agent Runway available outside Canada?
A: Currently optimized for Canadian real estate agents with CRA tax rules, provincial brackets, and CREA benchmarks. The core financial tracking works anywhere, but tax calculations are Canada-specific.
`;
