/**
 * Agent Runway Platform Knowledge Base (COMPACT)
 *
 * Trimmed for token efficiency. Core facts, formulas, and tax data retained.
 * TAX DATA VERSION: 2025 CRA rates. Last updated: March 2025.
 */

const KB_MILEAGE_FIRST_5K = "$0.72/km";
const KB_MILEAGE_AFTER_5K = "$0.66/km";

export const KNOWLEDGE_BASE = `
## AGENT RUNWAY — KNOWLEDGE BASE (COMPACT)

Platform for Canadian real estate agents: income, expenses, pipeline, clients, taxes, AI outreach.

### PAGES

**DASHBOARD** — Runway Score (0-100, A+ to F), KPI cards, monthly income chart, P10-P90 bands, industry-cohort benchmark, tax estimate, smart alerts, AI insights, survival runway. Views: Essentials/Standard/Full. Scenarios: Conservative(-15%)/Base/Optimistic(+15%). Smart alerts use IQR anomaly detection on personal baselines.

**TRANSACTIONS** — Deals (closed: date, address, client, price, commission%, GCI, side, split), Pipeline (Lead 10%/Showing 25%/Offer 50%/Conditional 75%/Firm 90%, weighted GCI, convert-to-closed), History (annual summaries, CSV/PDF import with duplicate detection).

**CRM** — Clients (name, email, phone, city/province, birthday, lead source, tags, budget, timeframe, property interest, tone pref, notes, relationships, activity log, status Boarding/Scheduled/In-Flight/Cruising, tier Platinum/Gold/Silver/Bronze). CRM Dashboard (engagement analytics). Insights (stale leads, referrals). Flight Plans (automated follow-up sequences). Property Showings (buyer: address, date, rating 1-10). Listing Appointments (seller: address, date, outcome). Contact Tasks (title, due date, priority, completion). Tags (custom labels). Hangar (archived clients, restorable).

**EXPENSES** — Receipts (manual/OCR, by category), Mileage (CRA rates), Recurring (monthly/quarterly/annual auto-generated entries), Bank Imports (Plaid sync), CCA Assets (Class 8=20%, Class 10=30%, Class 12=100%, Class 50=55%, half-year rule). Tax IQ: amber-bordered contextual CRA education tips on the Expenses page, filtered by province/quarter/categories, dismissible (localStorage), purely educational.

**FORECAST** — Waterfall (GCI→split→fees→expenses→tax→take-home), tax card, P10-P90 bands, 5-year growth, goal gap analysis.

**REPORTS** — Overview (score, benchmark, waterfall, tables), Benchmark (industry cohort), Tax/T2125 (CRA lines, CCA, home office, mileage).

**OVERHEAD** — Tax estimates (federal+provincial+CPP), per-deal set-aside, income tax instalments (Mar15/Jun15/Sep15/Dec15), GST/HST (collected vs ITCs vs net; quarterly filing deadlines: Q1 Apr30, Q2 Jul31, Q3 Oct31, Q4 Mar31-next-year — separate from income tax instalment dates), deduction summary by T2125 line, CCA schedule, home office, paycheque allocation. Time Value card (effective hourly rate/hr, hours per deal, break-even deal count — requires Settings → Weekly Hours).

**ALTIMETER** — Personal records (best year/month/deal), YoY comparison, all insights ranked by $impact, performance bands (Launching/Climbing/Competitive/Advancing/Leading), deviation detection (>=20% from baseline), Runway Score breakdown (Pace 35%/Pipeline 30%/Expense 15%/Survival 15%/Benchmark 5%).

**SCENARIOS** — What-if modeling: adjust deals, price, commission, expenses, growth. Conservative/Base/Optimistic.

**REFERRALS** — Inbound/outbound tracking, partner details, default 25% fee, status Pending/Active/Closed, link to transactions.

**SOCIAL STUDIO** — Instagram month-in-review carousel builder with templates and Canva export.

**SETTINGS** — Province, business structure, split (70/30-100/0), brokerage fees (monthly+per-deal+cap+post-cap), cash reserve, experience years, GCI goal, vehicle %, home office method/sqft, GST/HST registration, filing frequency, brokerage withholds HST toggle, seasonality, bank connections, AI Voice Guide, estimated weekly hours + vacation weeks (unlocks Time Value card on Overhead).

**PROFILE** — Name, brokerage, avatar, 15 themes, dark mode, production stats.

**VOICE INPUT** — FAB on every page. Audio→Groq Whisper→Llama 3.3 intent→route to page with pre-filled fields (amber tint). Intents: new_client, new_expense, new_transaction, note, unknown.

**AI ASSISTANT** — Claude-powered, 3-tier routing (Haiku/Sonnet/Opus), 30 msg/hr, Pro/Team only.

**TEAMS** — $149/mo leader + $55/mo member. Invite flow with 30-day tokens. Tier 1 shared: YTD GCI, deal count, pipeline. Never shared: tax, expenses, splits, cash, client details. 5 leader reports. Team comparative engine.

**FLIGHT CONTROL** — AI outreach: daily scan, 11+ types (birthday/post-close/stale-lead/seasonal/anniversary/rate-relevance/listing-match/mortgage-renewal-due/mortgage-renewal-window/timeframe-approaching/listing-overdue), tone-matched drafts, 14-day suppression (birthday exempt), agent review required. Nurture: Post-Close (6 steps/12mo), Re-Engagement (3 steps/30d). Send optimization: Tue-Thu 9-10am default. Newsletter builder included.

**KEYBOARD SHORTCUTS** — N=New tx, D=Dashboard, T=Transactions, P=Pipeline, F=Forecast, E=Expenses, R=Reports.

---

### METRICS & FORMULAS

**GCI** = Sale Price x Commission %. Override takes precedence.
**Agent Net** = GCI x Agent Split %.
**Weighted GCI** = Pipeline GCI x stage probability (or override).
**Expense Ratio** = Expenses / GCI. <25% excellent, 25-30% healthy, 30-40% attention, >40% concerning.
**Survival Runway** = Cash Reserve / Net Monthly Burn. <2mo critical, 2-4 warning, 4-6 healthy, 6+ strong. Cap 24mo. $0 reserve + $0 burn = "Not Configured" (sentinel -1). $0 reserve + positive burn = 0mo (critical).
**Pace** = ((Actual YTD GCI - Expected) / Expected) x 100. Expected = Goal x Seasonal Fraction.
**Seasonal Fraction** = Accounts for uneven quarterly income (default Q1:15% Q2:30% Q3:30% Q4:25%). Custom weights in Settings. Day-level interpolation.
**Projected Year-End GCI** = (Closed YTD / Seasonal Fraction) + (Pipeline Weighted x 50%). Jan-Feb dampening blends toward goal.
**Runway Score** (v1.2) = Pace(35%) + Pipeline(30%) + Expense(15%) + Survival(15%) + Benchmark(5%). Grades: A+(92+) A(85-91) B(75-84) C(62-74) D(50-61) F(0-49). Missing data penalizes (35 not 50).
**Benchmark** = Industry cohort estimates: Rookie(0-2yr,$42K/4deals), Growth(3-5yr,$78K/7), Established(6-10yr,$96K/8), TopProducer(>10yr,$145K/12). National median $96K/8.
**Where You Stand** = Launching(0-10%ile)/Climbing(10-25)/Competitive(25-50)/Advancing(50-75)/Leading(75+). Momentum: gaining/holding/losing.
**P-Bands** = P10/25/50/75/90 via CV. CV clamped 5-50%.
**Client Tiers** = Platinum(top10%)/Gold(10-25%)/Silver(25-50%)/Bronze(50%+). Composite: LGV(40%)+Health(20%)+Impact(15%)+Velocity(15%)+Tax(10%).
**Speed to Lead** = Hours from client creation to first contact activity.
**Stale Lead** = Active client (Boarding/In-Flight), no contact 14+ days (dashboard) or 30+ days (CRM). Scheduled/Cruising exempt.
**Deviation Detection** = >=20% from 12-month baseline, requires 3+ months data.

---

### CLIENT STATUS (Flight Metaphor)

| Status | Meaning |
|--------|---------|
| Boarding | New/active lead, not under contract |
| Scheduled | Plans to act later, light touch |
| In-Flight | Under contract, high-touch |
| Cruising | Past client, seasonal check-ins |

"Landed" is a celebration moment, not a status. Taxiing/Approach removed.

---

### TAX REFERENCE — 2025 CRA

**Federal:** $0-57,375@14.5%, $57,375-114,750@20.5%, $114,750-177,882@26%, $177,882-253,414@29%, $253,414+@33%. BPA $16,129 credit @14.5% = $2,338.71.

**CPP (self-employed = both halves):** CPP1: 11.90% on $3,500-$71,300. Max $8,068.20. CPP2: 8.00% on $71,300-$81,200. Max $792. Deductions: 50% CPP1, 100% CPP2.

**QPP:** 12.80%. Quebec abatement: federal tax x 83.5%.
**Ontario surtax:** 20% over $5,710 + 36% over $7,307.

**GST/HST:** 5%(AB,BC,MB,SK,territories), 13%(ON), 14%(NS), 15%(NB,NL,PE). Mandatory >$30K/12mo.

**Corporate CCPC:** SBD 9% on first $500K. General 15%. Phase-out $5/$1 over $50K AAII. Non-eligible gross-up 15%, DTC 9.0301%.

**RRSP:** 18% prior year income, max $32,490. Dividend-only = $0 room.
**Mileage:** ${KB_MILEAGE_FIRST_5K} first 5K km, ${KB_MILEAGE_AFTER_5K} after.
**Home office:** Simplified $5/sqft max $1,500. Detailed: actual costs x (office sqft / total sqft) x business-use%.
**Instalments:** Annual tax / 4. Required if >$3K owing ($1.8K QC). Interest ~6%.
**Effective rate:** (Federal + provincial + CPP) / net self-employment income.

---

### T2125 EXPENSE MAPPING

Industry: 531210. Lines: 8210(advertising), 8211(vehicle lease), 8212(vehicle insurance/repairs), 8213(fuel), 8215(office/software/internet), 8216(meals 50% deductible), 8220(professional/licensing/phone/education), 8226(client gifts ~$25/person), 8228(other). Key: 8200=gross income, 9369=total expenses, 9936=CCA, 9945=home office, 8270=net business income.

---

### COMMISSION STRUCTURE

Split: agent keeps X% (70/30 to 100/0). Brokerage fees: monthly desk fee, per-deal % of GCI, annual cap, post-cap rate (often 0%). After cap reached, remaining deals use post-cap rate.

---

`;
