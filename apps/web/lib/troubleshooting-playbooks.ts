/**
 * Troubleshooting Playbooks
 *
 * Topic-specific knowledge injected into the AI system prompt when the
 * classifier detects a relevant topic. Each playbook contains:
 *
 * 1. Exact formulas (extracted from engine source code)
 * 2. Common user problems and their causes
 * 3. Step-by-step diagnostic logic the AI should follow
 * 4. Thresholds, edge cases, and gotchas
 *
 * These are NOT shown to the user — they're injected into the system prompt
 * so the AI can reason about the user's specific situation.
 */

import type { TroubleshootingTopic } from "./troubleshooting-classifier";

export function getPlaybook(topic: TroubleshootingTopic): string {
  return PLAYBOOKS[topic] ?? "";
}

export function getPlaybooks(topics: TroubleshootingTopic[]): string {
  return topics
    .map((t) => PLAYBOOKS[t])
    .filter(Boolean)
    .join("\n\n---\n\n");
}

const PLAYBOOKS: Record<TroubleshootingTopic, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // RUNWAY SCORE
  // ═══════════════════════════════════════════════════════════════════════════
  "runway-score": `## TROUBLESHOOTING: RUNWAY SCORE

### How Runway Score is Calculated (exact formula from runway-score-engine.ts)

The Runway Score is a weighted composite of 5 sub-scores, each 0–100:

| Component | Weight | Source |
|-----------|--------|--------|
| Goal Pace | 35% | Pace vs annual goal (from projection-engine) |
| Pipeline Health | 30% | Pipeline weighted GCI vs remaining goal gap |
| Expense Ratio | 15% | YTD expenses ÷ YTD GCI |
| Survival Runway | 15% | Cash reserve ÷ net monthly burn |
| Benchmark Rank | 5% | Industry-cohort percentile position |

**Final Score** = (paceScore × 0.35) + (pipelineScore × 0.30) + (expenseScore × 0.15) + (survivalScore × 0.15) + (benchmarkScore × 0.05)

*Note: v1.2 increased Pipeline weight from 25% to 30% and reduced Benchmark from 10% to 5% — pipeline is more actionable than national cohort comparison.*

### Sub-Score Calculations

**Pace Score** (35%):
- Maps pace% from [-50%, +50%] to [0, 100]
- +50% ahead → 100, On pace → 50, -50% behind → 0
- Formula: clamp(((pacePercent + 50) / 100) × 100, 0, 100)

**Pipeline Score** (30%):
- Ratio = pipeline weighted GCI ÷ remaining goal gap
- Formula: min(100, round(ratio × 100)) — linear with a 100 ceiling
- If goal already met (ytdGCI ≥ goal): 90
- If ratio ≥ 1.0: 100 (pipeline covers the full remaining gap)
- If ratio = 0.5: 50 (pipeline covers half the remaining gap)
- If no pipeline data or no goal set: 65 (neutral default)

**Expense Score** (15%):
- Ratio = YTD expenses ÷ YTD GCI
- >50% → 30, >35% → 55, >25% → 75, ≤25% → 90
- If no GCI yet: 50 (neutral — agent hasn't started)
- If has GCI but zero expenses logged: 35 (incomplete data penalty — no real estate agent has zero expenses, so this signals missing data)

**Survival Score** (15%):
- ≥6 months → 95
- ≥4 months → 75
- ≥2 months → 50
- ≥1 month → 25
- <1 month → 10
- Not configured (no cash reserve set) → 35 (incomplete data penalty — previously 50 in v1.1)

**Benchmark Score** (5%):
- Direct percentile from industry-cohort comparison
- 50th percentile → 50, 90th → 90, etc.

### Runway Score Labels

**Prose label (use in ALL chat responses — the only user-facing text for Runway Score):**
| Score | State Label |
|-------|-------------|
| ≥81   | Strong      |
| ≥61   | On Track    |
| ≥41   | Building    |
| <41   | At Risk     |

Always say "Your score is in the **Strong** range" or "Your score is **On Track**" — never use the letter grade in chat prose.

**Letter grade (visual badge only — dashboard, PDF, email badge, mobile chip — never in prose):**
A+ ≥92, A ≥85, B ≥75, C ≥62, D ≥50, F <50

If a user says "my grade is B" they mean a score of 75–84. Translate to the state label internally but confirm their score band in prose (e.g., "Your score is in the **On Track** range").

### Common Problems & Diagnostics

**"My score dropped suddenly"**
1. Check if a deal fell through (pipeline removal reduces Pipeline Score by up to 25%)
2. Check if expenses were added (expense ratio spike reduces Expense Score by up to 15%)
3. Check if it's early January (seasonal fraction reset causes pace to swing wildly)
4. Check if goal was increased (raises the bar for Pace Score)

**"My score seems too low"**
Walk through each component:
- Is their pace negative? (35% of total — biggest contributor)
- Is pipeline empty or thin? (30% — second biggest)
- Is expense ratio above 35%? (15%)
- Is cash reserve not set? (survival score defaults to 35 → only 5.25 of 15 points)
- Has GCI but no expenses logged? (expense score defaults to 35 → only 5.25 of 15 points)
- Are they a newer agent with low benchmark percentile? (5%)

**"How do I improve my score?"**
Identify the weakest component and prioritize:
1. Pace (35%) — close deals, add pipeline deals that convert
2. Pipeline (30%) — add more pipeline deals with higher estimated prices
3. Expenses (15%) — reduce spending or increase GCI
4. Survival (15%) — increase cash reserve setting in Settings
5. Benchmark (5%) — close more/larger deals to improve percentile

**Edge Cases:**
- January 1–15: Seasonal fraction is tiny → pace calculation swings wildly → tell user to wait 2–3 weeks
- No goal set: Pace score defaults to 50 (neutral) — recommend setting a goal
- Zero GCI: Expense score defaults to 50 (neutral)
- Cash reserve = $0 or not set: Survival score = 35 (incomplete data penalty — not 50)
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX
  // ═══════════════════════════════════════════════════════════════════════════
  tax: `## TROUBLESHOOTING: TAX ESTIMATES

IMPORTANT: Always include this disclaimer once in tax-related responses: "These are estimates for planning purposes — consult a qualified accountant or tax professional for filing."

### How Tax is Calculated (exact formula from canadian-tax-engine.ts)

**Input**: Net self-employment income (after expenses, before tax)
Net SE Income = Projected Annual GCI × Agent Split% − Annual Expenses

**Step 1: CPP/QPP** (self-employed pay both halves)
- CPP1: 11.90% on income between $3,500 (basic exemption) and $71,300 (YMPE 2025)
  - Max CPP1 = ($71,300 − $3,500) × 11.90% = $8,068.20
- CPP2: 8.00% on income between $71,300 (YMPE) and $81,200 (YAMPE 2025)
  - Max CPP2 = ($81,200 − $71,300) × 8.00% = $792.00
- QPP (Quebec): CPP1 equivalent = 12.80%, CPP2 = 8.00%
- Deductions: 50% of CPP1 is deductible from taxable income. 100% of CPP2 is deductible.

**Step 2: Taxable Income**
Taxable Income = Net SE Income − (CPP1 × 50%) − (CPP2 × 100%) − RRSP contributions

**Step 3: Federal Tax**
Brackets: $0–$57,375 @ 14.5%, $57,375–$114,750 @ 20.5%, $114,750–$177,882 @ 26%, $177,882–$253,414 @ 29%, $253,414+ @ 33%
Basic Personal Amount (BPA): $16,129 credit at 14.5% = $2,338.71 reduction
Quebec abatement: Federal tax × 83.5% (16.5% reduction)

**Step 4: Provincial Tax**
Each province has its own brackets + surtaxes (e.g., Ontario surtax: 20% on tax >$5,710, 36% on tax >$7,307)

**Step 5: Total Tax**
Total = Federal Tax + Provincial Tax + CPP1 + CPP2
Effective Rate = Total Tax ÷ Net SE Income

**Step 6: Per-Deal Set-Aside**
Per Deal = Total Annual Tax Estimate ÷ Projected Deal Count

**Step 7: Quarterly Instalments**
Quarterly = Total Annual Tax ÷ 4
Required when annual tax owing >$3,000 (>$1,800 in Quebec)

### GST/HST
- Registration mandatory when taxable revenue >$30,000 in any rolling 12-month period
- Rates: 5% (AB, BC, MB, SK, territories), 13% (ON), 14% (NS), 15% (NB, NL, PE)
- Quebec: 5% GST + 9.975% QST = 14.975% combined
- Input Tax Credits (ITCs) offset GST paid on business expenses
- Net Payable = GST collected on GCI − ITCs claimed

### Corporate Tax (CCPC — canadian PREC or corp)
- Federal SBD: 9% on first $500K active business income
- Federal General: 15% on income above $500K
- SBD phase-out: $5 reduction for every $1 of adjusted aggregate investment income (AAII) over $50K
- Provincial SBD rates: 0% (MB, YT) to 3.2% (ON, QC). NS is 1.5% (reduced from 2.5% Apr 1, 2025); NS provincial SBD limit raised to $700K. PE provincial SBD limit $600K. SK provincial SBD limit $600K.
- Non-eligible dividend gross-up: 15%
- Federal DTC (dividend tax credit): 9.0301% of grossed-up amount
- Compensation methods: Salary (generates RRSP room, CPP-deductible), Dividends (no RRSP room, no CPP), Mixed

### RRSP
- Limit: 18% of prior year earned income, max $32,490 (2025)
- Dividends do NOT generate RRSP room — only salary/self-employment income does
- PREC/corp owners paying only dividends: $0 RRSP room

### Common Problems & Diagnostics

**"My tax estimate seems too high/low"**
1. Check province setting — wrong province = wrong provincial brackets
2. Check if GST/HST is included — some users confuse income tax with GST obligations
3. Check business structure — sole prop vs PREC vs corp have different rates
4. Check if expenses are entered — expenses reduce net income → lower tax
5. Check RRSP contributions entered in settings

**"How much should I set aside per deal?"**
→ Direct them to Forecast page → Tax Estimates card. Formula: Annual tax estimate ÷ projected deal count.

**"Should I incorporate?"**
→ This is a professional advice question. Explain the tax deferral advantage (combined SBD rate ~12-14% vs personal 30-50%) but emphasize it depends on their total income, retention needs, and accountant guidance. NEVER recommend incorporating — only explain the math.

**"What's my effective tax rate?"**
→ (Federal + Provincial + CPP) ÷ Net self-employment income. Typically 25-45% for most agents depending on province and income level.

**Edge Cases:**
- Quebec agents: 16.5% federal abatement, QPP instead of CPP (12.80%), QST instead of provincial HST
- Ontario surtax: Adds 20-36% on top of provincial tax for higher earners
- Cap reached mid-year: Post-cap commission rate changes net income → tax estimate shifts
- New agents with zero income: Tax estimate = $0 (no income to tax)
- Province changed mid-year: System uses current province setting for full-year estimate
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════
  pipeline: `## TROUBLESHOOTING: PIPELINE

### Pipeline Stages & Probabilities (from pipeline-forecast-engine.ts)

| Stage | Probability | Meaning |
|-------|------------|---------|
| Lead | 10% | Initial contact, very early |
| Showing | 25% | Actively showing properties |
| Offer | 50% | Offer submitted |
| Conditional | 75% | Accepted offer with conditions |
| Firm | 90% | Conditions waived, closing expected |

**Weighted GCI** = Estimated Price × Commission% × Stage Probability
Example: $500K home × 2.5% commission × 75% (Conditional) = $9,375 weighted GCI

**Probability Override**: Users can override the default probability on any deal. If set, the override replaces the stage probability in all calculations.

### Pipeline Impact on Other Metrics

1. **Runway Score**: Pipeline Score = 30% weight. Weighted GCI vs remaining goal gap.
2. **Projected Year-End GCI**: Closed YTD ÷ seasonal fraction + (pipeline weighted GCI × 50%)
3. **Goal Gap Analysis**: Remaining deals needed = (Goal − YTD GCI − Pipeline Weighted) ÷ avg deal size
4. **Forecast Page**: Pipeline feeds probability bands and waterfall chart

### Converting Pipeline Deals

When a deal closes: Pipeline deal → Closed transaction
- User clicks "Convert to Closed" on a pipeline deal
- This creates a new closed transaction with the pipeline data pre-filled
- The pipeline deal is removed
- ALL downstream metrics recalculate: GCI, pace, tax, score, etc.

### Listing & Buyer Sub-Stages (pipeline-forecast-engine.ts)

Listings: scheduled (15%), active (40%)
Buyers: boarding (10%), scheduled (5%), in_flight (25%)
These are unified into the 5 main pipeline stages for the Transactions page.

Buyer "scheduled" is the deferred-intent state from the 4-stage CRM redesign — a buyer client who has flagged a future date for action. Conversion probability is intentionally lower than Boarding because the lead is parked, not actively shopping.

### Forecast Accuracy Tracking (pipeline-forecast-engine.ts)
The pipeline tracks how accurate past price estimates were once deals close:
- **Listing accuracy**: Estimated list price vs actual sale price for sold listings
- **Deal accuracy**: Original estimated price vs actual transaction price for converted deals
- **Overall score**: 0–100 (100 = perfect). Formula: 100 × (1 − weighted_avg_error_pct). Weighted by sample count.
- Requires at least 1 completed matched pair (listing sold with both prices, or deal converted) to display
- If agent always overestimates: overEstimateCount > underEstimateCount → suggests pricing high
- If agent always underestimates: underEstimateCount > overEstimateCount → suggests pricing conservative

### Pipeline Coverage Alert (anomaly-engine.ts)
The system flags when your pipeline is too thin to cover your remaining annual goal:
- **Coverage ratio** = Pipeline Weighted GCI ÷ Remaining Goal
- **Warning**: Coverage < 1.5x remaining goal
- **Alert**: Coverage < 1.0x remaining goal (pipeline can't cover target even at 100%)
- No alert if remaining goal ≤ 0 (goal already met, or no goal set)

### Stale Deal Flags (pipeline-forecast-engine.ts)
The engine flags pipeline deals that may be inflating the headline Total Weighted GCI:
- **staleDealCount**: deals with no expectedCloseDate, OR with an expectedCloseDate >180 days in the past
- **staleWeightedGCI**: the weighted-GCI contribution of those flagged deals
- The Pipeline page renders a caveat banner above the Summary Strip when staleDealCount > 0, showing the count plus the dollar contribution
- These deals are NOT removed from the total — they are surfaced so the agent can decide to update the close date or move them to fallen/closed

### Manual Probability Override Pill
When a deal's probability_override is set, the unified pipeline item carries manualOverride = true. The Pipeline table renders a "MANUAL" pill next to the % column with a tooltip noting that the override bypasses the stage default. A 0% or 100% override no longer silently zeros or maxes a row in the weighted total without a visual signal.

Note: Activity decay alerts also exist — clients whose days-since-last-contact exceed 2–3× their personal average contact rhythm get flagged as going cold (separate from the fixed 14/30-day stale thresholds).

### Conversion Funnel (pipeline-forecast-engine.ts)
Shows stage-by-stage conversion rates for each pipeline source:
- **Deal funnel**: lead → showing → offer → conditional → firm → closed
- **Listing funnel**: scheduled → active → sold
- **Buyer funnel**: scheduled → boarding → in_flight (Scheduled = deferred-intent, surfaced in the funnel as of the 2026-04-30 engine update; previously dropped)
Conversion rate = count at stage N ÷ count at stage N−1. Null for the first stage (no prior stage to compare).

### Common Problems & Diagnostics

**"My pipeline weighted GCI seems wrong"**
1. Check if probability overrides are set (they replace stage defaults)
2. Check estimated prices — if $0, weighted = $0
3. Check commission % — may be blank or incorrect
4. Multiple deals at same stage → adds up (sometimes surprises users)

**"I converted a deal but my GCI didn't change"**
1. Check if the converted deal has the correct sale price and commission
2. Check if the deal date is in the current year
3. Check if status is "closed" (not "pending" or "fallen")
4. GCI updates should be instant — try hard refresh

**"Pipeline is empty but I have deals"**
→ Check if all deals are in the "Deals" tab (closed) vs "Pipeline" tab (in-progress). Pipeline only shows active deals, not closed ones.

**"How many deals do I need?"**
→ (Annual Goal − YTD GCI − Pipeline Weighted GCI) ÷ Average Deal GCI. Show them the Goal Gap analysis on the Forecast page.

**Edge Cases:**
- Pipeline deal with $0 estimated price: Contributes $0 to weighted GCI
- Fallen deal: Status "fallen" — excluded from all active calculations
- Both-sides deal in pipeline: Ensure commission% reflects total (e.g., 5% for both sides, not 2.5%)
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════
  expenses: `## TROUBLESHOOTING: EXPENSES

### Expense Ratio Calculation
Expense Ratio = Total YTD Expenses ÷ YTD GCI

**Benchmarks** (canonical from health-report.ts; insights-engine.ts uses the same boundaries):
- <25%: Excellent (Runway sub-score 90)
- 25–35%: Healthy (Runway sub-score 75; insights-engine "industry average is 25-35%")
- 35–50%: Needs attention (Runway sub-score 55; insights-engine flags as a tip at >35%)
- >50%: Concerning (Runway sub-score 30; insights-engine flags as a warning at >50%)

Secondary signal: advisor-engine.ts shows a "Trim Expenses to Benchmark" action card when the projected ratio exceeds 30%, with a 25-30% reference benchmark. The Runway Score sub-score is the canonical band.

### Expense Categories — CRA T2125 Mapping

Source of truth: packages/core/engines/t2125-engine.ts (CATEGORY_MAPPINGS). Mirrors the CRA T2125 form / T4002 publication.

| CRA Line | Category | Notes |
|----------|----------|-------|
| 8521 | Advertising | Photography, video, print, signage, online ads |
| 9281 | Motor Vehicle Expenses | Fuel, insurance, lease/payments, repairs/maintenance — combined and multiplied by vehicle business-use % |
| 8811 | Office Supplies & Stationery | Supplies, software subscriptions, hardware/equipment |
| 9220 | Utilities (Phone & Internet) | Business phone and internet line |
| 8523 | Meals & Entertainment | 50% deductible per CRA — engine tracks gross and 50%-deductible amounts |
| 8760 | Licences, Memberships & Dues | Board / MLS dues, licensing & renewals |
| 8690 | Insurance | E&O insurance, business liability premiums |
| 8860 | Professional Fees | Accounting, legal, advisory |
| 9270 | Other Expenses | Business gifts, courses & coaching, conferences, books & materials, misc catch-all |
| 9281 → CCA Class 10/10.1 | Vehicle CCA | Tracked separately on the CCA schedule, not in 9281 above |
| 9936 | Total CCA | Sum of all CCA classes |
| 9945 | Business-Use-of-Home | Actual-cost method only (Canada has no IRS-style $5/sqft) |
| 8200 | Gross Commission Income | Reported revenue line |
| 9369 | Total Expenses | Sum of expense lines (engine variable: line9369_totalExpenses) |
| 8270 | Net Business Income | 8200 − 9369 − 9936 − 9945 |

Common "wrong line number" question: legacy notes/screenshots may cite 8210/8211/8212/8213/8215/8216/8220/8226/8228 — those are NOT used by the engine or the CRA T2125 today. If a user references one, point them to the canonical line above.

### Mileage Calculation (CRA 2025 rates)
- First 5,000 km: $0.72/km
- After 5,000 km: $0.66/km
- Deduction = (min(totalKm, 5000) × $0.72) + (max(totalKm − 5000, 0) × $0.66)
- Must be business-use km only (personal excluded)

### Receipt OCR
Camera capture → image uploaded to Supabase Storage → /api/receipts/process for OCR extraction → fields pre-filled (vendor, amount, date, category suggestion) → user reviews and saves.

### Expense Impact on Other Metrics
1. **Tax Estimate**: Expenses reduce net SE income → lower tax
2. **Expense Ratio**: Feeds into Runway Score (15% weight)
3. **Survival Runway**: Monthly recurring expenses increase burn rate → shorter runway
4. **Advisor Cards**: Flags if expense ratio >30% of projected GCI
5. **T2125 Report**: Expenses map to CRA lines for tax filing

### Smart Alerts — Expense Anomaly Detection (anomaly-engine.ts)
The Dashboard smart alerts section uses statistical anomaly detection to flag unusual spending:
- **Method**: IQR (Interquartile Range) — compares each month's category spend against your own history
- **Requires**: ≥4 months of data per expense category before thresholds are computed
- **Warning**: Amount > Q3 + 1.5×IQR (above your typical high end)
- **Alert**: Amount > Q3 + 3×IQR (extreme outlier)
- Triggered per CRA category (e.g., Marketing spike, Vehicle spike)

This means alerts are relative to the agent's own spending history — not industry averages.
If a user has <4 months of data in a category, no alert will fire for that category.

### Tax IQ Tips (tax-iq-engine.ts)
The Expenses page shows an amber-bordered "Tax IQ" card — CRA-referenced education tips selected based on the agent's context:
- **Trigger logic**: Tips are filtered by expense categories used, transaction count, current quarter, province, and filing frequency
- **Storage**: Dismissed tips are stored in localStorage (key: "ar_dismissed_tax_tips") — they never reappear once dismissed
- **Source verification**: Every tip includes a CRA publication link (T4002, RC4022, IC78-10R5, etc.)
- **Categories**: Deductions, GST/HST, Record Keeping, Filing, Tax Planning
- **Max shown**: 5 tips at once, contextual triggers sorted first

Active tips the agent might ask about:
- Meals & entertainment: Only 50% deductible (also affects ITCs)
- Vehicle logbook: Required for CRA audit compliance; base-year method available
- Home office: Must be principal place of business or exclusive regular use
- Insurance: GST/HST-exempt — no ITC can be claimed on premiums
- ITC 4-year limit: Missed ITCs can still be claimed within 4 years
- Quick method: Available if taxable revenue ≤ $400K
- Receipt retention: 6 years minimum (digital copies accepted)
- Quarterly instalments: Required if tax owing >$3,000 in current year AND either of 2 prior years
- RRSP deadline: March 1 deadline applies to prior tax year

If a user asks "what are these tips?" or "why is Agent Runway showing me this?" — explain it's the Tax IQ feature: contextual CRA-sourced tax education based on their specific expense profile and filing situation.

### Common Problems & Diagnostics

**"My expense ratio seems wrong"**
1. Ratio = expenses ÷ GCI. If GCI is low (early year), ratio will be high even with normal spending
2. Check for large one-time expenses inflating the number
3. Monthly recurring expenses are annualized in some views

**"Receipt scan didn't capture correctly"**
→ OCR works best with clear photos, good lighting, and flat receipts. Crumpled/faded receipts may need manual entry.

**"My mileage deduction seems low"**
1. Check total km entered — is it business-only or total?
2. Check vehicle business-use % in Settings
3. The rate drops from $0.72 to $0.66 after 5,000 km

**"What's the difference between YTD and monthly recurring?"**
→ YTD = actual amounts entered/imported this year. Monthly recurring = fixed amounts that repeat (auto-annualized in projections).

**"Meals & Entertainment — why only 50%?"**
→ CRA rule: Only 50% of meals & entertainment costs are deductible. The system tracks the full amount but only claims 50% on T2125 line 8523.

**"Why does Agent Runway show me tax tips?"** / **"What is Tax IQ?"**
→ Tax IQ is a contextual education feature on the Expenses page. It selects relevant CRA-referenced tips based on the agent's expense categories, filing situation, province, and current quarter. Tips can be dismissed and are stored in browser localStorage. They do not affect calculations — they are educational only.

**Edge Cases:**
- Zero GCI: Expense ratio is undefined (shown as N/A or 0%)
- Recurring vs one-time: Recurring expenses project forward; one-time don't
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // FORECAST
  // ═══════════════════════════════════════════════════════════════════════════
  forecast: `## TROUBLESHOOTING: FORECAST & PROJECTIONS

### Year-End GCI Projection (from projection-engine.ts)

**Base Formula**: Projected GCI = (YTD Closed GCI ÷ Seasonal Fraction) + (Pipeline Weighted GCI × 50%)

**Seasonal Fraction**: Accounts for uneven income distribution across the year.
- Default: uniform Q1=25%, Q2=25%, Q3=25%, Q4=25% (DB column settings.national_quarter_pcts stored as [25,25,25,25], normalized to fractions in normalizeSeasonalWeights)
- Cascade: agent-derived from history_items.quarter_gci (needs 2+ years) → settings.national_quarter_pcts → uniform
- Custom: Users set their own quarterly weights in Settings
- Day-of-year precision: Interpolates within quarters for smooth progression (UTC-anchored)

**Early-Year Dampening** (fraction < 10% of year, roughly Jan 1–Feb 7):
- Raw extrapolation is unreliable with little data
- System blends between goal and raw projection
- Confidence ramp: 10% → 100% as more of year passes
- Pipeline adjustment still applies (+50% of weighted GCI)

**Three Scenario Modes**:
- Conservative: Base projection × 0.85 (−15%)
- Base: Raw projection (default)
- Optimistic: Base projection × 1.15 (+15%)

### Financial Waterfall (Forecast page)
Shows the flow: Gross GCI → Split → Brokerage Fees → Expenses → Tax → Net Take-Home

Waterfall = GCI
  − Brokerage share (GCI × (1 − agent_split%))
  − Monthly brokerage fees × 12
  − Per-deal fees × projected deals (capped if annual cap set)
  − Annual expenses (YTD + projected recurring)
  − Tax estimate (federal + provincial + CPP)
  = Projected take-home

### Probability Bands (from probabilistic-forecast-engine.ts)
Statistical projections using coefficient of variation (CV) of deal-to-deal GCI:

P10 = base × (1 − 2σ)    — 10% chance of earning below this
P25 = base × (1 − 1σ)    — Conservative estimate
P50 = base               — Median projection
P75 = base × (1 + 1σ)    — Optimistic estimate
P90 = base × (1 + 2σ)    — 90% chance of earning at least this

CV is clamped between 5% and 50%.
Confidence levels: low (<6 months data), medium (6–12), high (≥12 months).

### 5-Year Growth Plan
Uses user's 5-year goals (set in Settings). Widens confidence bands by 5% per additional year.
Year 1 = this year's probability bands
Year 2-5 = user goals + widening uncertainty

### Goal Gap Analysis
Remaining = Goal − YTD GCI − Pipeline Weighted GCI
Deals Needed = Remaining ÷ Average Deal GCI
Daily Pace = Remaining ÷ Business Days Left in Year

### Commission Cap Impact on Forecast
- Brokerage fees are capped at annual_cap per year
- Once YTD fees reach cap, per-deal fee rate drops to post_cap_rate
- This means MORE net income per deal after cap → projection should account for this
- Post-cap split is configured in Settings

### Common Problems & Diagnostics

**"My projection seems way too high/low"**
1. Early year (Jan–Feb): Seasonal dampening is active — projections stabilize by March
2. Check seasonal weights — national defaults may not match their market
3. A single large deal can skew projections (one $30K GCI deal in January → $360K projection)
4. Pipeline deals inflating it: 50% of weighted GCI is added
5. Check if custom seasonal weights are set and realistic

**"Probability bands are too wide/narrow"**
1. Wide bands = high deal-to-deal variance in GCI (mix of small and large deals)
2. Narrow bands = consistent deal sizes
3. <6 months of data = low confidence (bands may be wider)
4. CV is clamped at 5-50%, so bands can't collapse to zero or explode

**"Waterfall numbers don't match my expectations"**
1. Walk through each step: GCI → split → fees → expenses → tax → net
2. Check commission split setting
3. Check if monthly brokerage fees are set
4. Check if per-deal fees and annual cap are configured
5. Tax estimate depends on province — verify province setting

**"My forecast shows $0"**
→ Need at least one closed deal or pipeline deal for projections to work. With zero data, the system has nothing to extrapolate from.

**Edge Cases:**
- Leap year: 366 days used in calculations (not 365)
- Future-dated transactions: Included in YTD if in current calendar year
- January with no deals: Projection falls back toward goal (dampening)
- All deals in Q1 with Q1 weight of 15%: Projection amplifies aggressively
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM
  // ═══════════════════════════════════════════════════════════════════════════
  crm: `## TROUBLESHOOTING: CRM & CLIENTS

### Client Flight Statuses (4-stage model, migration 00102)

| Status | Meaning | Typical Duration | AI Focus |
|--------|---------|-----------------|----------|
| Boarding | New or active lead, not yet under contract | Days to months | Prompt first contact, consistent nurturing |
| Scheduled | Future-intent client, target date captured | Variable (parked) | Light touch until their date approaches |
| In-Flight | Under contract — offer, conditional, or firm | Weeks | Active deal management, high-touch |
| Cruising | Past client or long-term nurture | Indefinite | Seasonal check-ins, referrals, anniversaries |

**No auto-transition**: The old Landed→Cruising 30-day auto-transition has been removed. After a deal closes, clients move directly to Cruising. "Landed" is no longer a status — it is a celebration moment in the UI only.
Previous stages taxiing and approach have been merged into Boarding and In-Flight respectively.

### Client Tiers (from client-valuation-engine.ts)

Clients are ranked by a composite value score:
- **Platinum** (top 10%): Highest-value clients
- **Gold** (10–25%): Strong contributors
- **Silver** (25–50%): Moderate value
- **Bronze** (bottom 50%): Lower engagement/value

**Composite Score** = LGV (40%) + Health (20%) + Runway Impact (15%) + Velocity (15%) + Tax Efficiency (10%)

**LGV (Lifetime GCI Value)**:
- Repeat probability: 60% (multi-deal), 30% (recent 1-deal), 10% (old/no deals)
- Remaining years = max(3, 10 − years_as_client)
- Forward value = avg_deal_GCI × repeat_probability × remaining_years

**Portfolio Health**:
- Concentrated: Top 1 client >40% of GCI OR top 3 >70%
- Balanced: Top 3 clients 50–70%
- Diversified: Top 3 <50%

### Stale Lead Detection

- **Dashboard alert**: Active client with no contact in 14+ days
- **CRM Insights**: Active client with no contact in 30+ days
- Active = Boarding or In-Flight status only
- Scheduled clients are NOT flagged (intentionally parked with a future date)
- Cruising clients are NOT flagged (past clients, light-touch expected)

### Speed to Lead
Hours between client creation date and first recorded contact activity.
No benchmark threshold — just tracks the metric for self-improvement.

### Contact Activity Types
call, email, text, showing, meeting, note, task

### Client Detail Panel Layout
1. Gradient status banner (color matches flight status)
2. Circular avatar
3. Separate First Name and Last Name fields
4. Save button (commits first name, last name, notes together — NOT auto-save)
5. Flight Status strip
6. Colored section cards: Sky blue (Contact), Emerald (Address), Amber (Details), Violet (Relationships), Slate (Notes), Blue (Activity Log), Orange (Tasks), Green (Deal History)

### CRM Dashboard Tab
- Total clients by status (donut chart)
- Touchpoint frequency (contacts per month)
- Overdue clients (need attention)
- Activity type breakdown (calls vs emails vs texts etc.)
- Source funnel (where leads come from)
- Speed to lead distribution

### Engagement Score (engagement-engine.ts)

Each contact has a decayed engagement score based on recent activity history.

| Tier | Score | Meaning |
|------|-------|---------|
| Hot | >80 | Highly active, frequent recent contact |
| Ascending | 50–80 | Engaged and trending well |
| Cruising | 20–50 | Moderate activity, stable |
| Cooling | 5–20 | Activity dropping, needs attention |
| Dormant | <5 | No meaningful recent contact |

**Activity weights** (higher = bigger score contribution):
- Appointment/Showing: 25 pts | Call: 20 pts | Reply: 15 pts | Link click: 8 pts
- Email sent/Text/Note: 2–5 pts | Email open: 3 pts

**Time decay**: Scores use a half-life per activity type (14–30 days). A call from 60 days ago contributes much less than one from last week.

**Trend**: Compares current score to score computed 14 days ago — rising/stable/declining.

### Common Problems & Diagnostics

**"I can't find my client"**
1. Check search — searches first name, last name, email, phone
2. Check if client is archived (archived clients hidden by default)
3. Check status filter — may be filtering to a specific status

**"Client status didn't change"**
→ All status changes are manual — the agent moves clients through stages. There is no auto-advancement (the old Landed→Cruising auto-transition has been removed). Exception: a Cruising or Scheduled client who receives a real touchpoint activity (call/text/email/meeting/showing) is automatically promoted to Boarding.

**"My stale lead count seems wrong"**
1. Dashboard uses 14-day threshold; CRM Insights uses 30-day
2. Only Boarding and In-Flight statuses count as active (not Scheduled or Cruising)
3. Scheduled clients are intentionally parked and NOT flagged as stale
4. Cruising clients are NOT stale — they're past clients with light-touch expected
5. A logged activity (call, email, text, etc.) resets the timer

**"Save button isn't working"**
→ The Save button commits first name, last name, and notes. Other fields (email, phone, etc.) may save differently. Ensure required fields aren't empty.

**"Client tiers don't seem accurate"**
→ Tiers recalculate based on all clients with transaction history. New clients with no deals start as Bronze. Tiers shift as deal data changes.

**"How do relationships work?"**
→ Link clients together (spouse, referral source, etc.). Relationships are bidirectional. Useful for tracking referral chains.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  "flight-control": `## TROUBLESHOOTING: FLIGHT CONTROL

### How Flight Control Works

1. Daily cron job scans all active clients
2. Detects relationship opportunities based on rules
3. Generates personalized draft messages via AI (Groq Llama 3.3)
4. Places drafts in Outreach Queue for agent review
5. Agent reads, optionally edits, then sends or dismisses

### Outreach Opportunity Types (11+ briefing item types)

| Type | Trigger | Priority |
|------|---------|----------|
| Birthday | Birthday within 7 days | High |
| Deal Close Follow-Up | Transaction closed within 14 days | High |
| Stale Lead Check-In | Active client, no contact 30+ days | Medium |
| Mortgage Renewal Due | 4.5–5.5 years post-close — mortgage renewal imminent | High |
| Mortgage Renewal Window | 3.0–4.5 years post-close — plant the seed before renewal | Medium |
| Timeframe Approaching | Active buyer/seller reaching their stated deadline | Medium |
| Seasonal Market Update | Quarterly (configurable) | Medium |
| Purchase Anniversary | Anniversary of their home purchase | Low |
| Listing Appointment Overdue | Listing appointment past expected date with no outcome | Medium |
| Listing Stale | Active listing on market for extended period | Medium |
| Interest Rate Relevance | Rate changes affecting buyers | Low |
| New Listing Match | New listing matching client criteria | Low |

**Mortgage Renewal Alerts** — Two types based on years since a client's last closed purchase:
- **mortgage_renewal_due** (4.5–5.5 yrs): Renewal is imminent. Draft is high-touch — agent should contact before the bank does. Common trigger for clients who bought 5 years ago.
- **mortgage_renewal_window** (3.0–4.5 yrs): Renewal planning horizon. Lower urgency — goal is to plant a seed and re-establish the relationship before the renewal window opens. Not a sales pitch.

If a user asks "why is Agent Runway reminding me about mortgage renewals?" — explain that a 5-year fixed mortgage (the most common Canadian term) means clients bought ~5 years ago are likely renewing, and this is a high-conversion touch-point for referrals and repeat business.

### Smart Suppression
- Clients contacted within past 14 days are suppressed (no new outreach generated)
- **Exception**: Birthday outreach is NEVER suppressed (always appropriate)
- This prevents over-messaging actively engaged clients

### AI Voice Guide
User writes a personal style guide in Settings → AI Voice Guide. Examples:
- "Keep messages under 3 sentences. Always end with a question."
- "I'm casual with existing clients but formal with new leads."
- "Never use 'Just checking in' — I hate that phrase."

This guide is injected into every AI draft generation prompt, ensuring messages match the agent's personal communication style.

### Communication Tones (per client)
- **Formal**: Professional, structured, minimal contractions
- **Casual**: Relaxed, conversational, contractions OK
- **Friendly**: Warm and personal (default)

Each client has a tone preference set in their CRM profile. Drafts match the client's tone.

### Nurture Sequences (nurture-engine.ts)
Flight Control supports two automated nurture sequence templates. All steps generate drafts for manual review — **never sent automatically** (CASL compliant). User must click Send for each step.

**Post-Close Nurture** (6 steps over 12 months, triggered by deal close):
| Step | Day | Type |
|------|-----|------|
| 0 | Day 1 | Congratulations — settlement checklist, warm message |
| 1 | Day 30 | Settling In Check-In — seasonal home tip |
| 2 | Day 90 | Market Update — comparable sales in their neighbourhood |
| 3 | Day 180 | Home Value Estimate — half-anniversary check-in |
| 4 | Day 270 | Referral Ask — soft, non-salesy |
| 5 | Day 365 | Move-iversary — 1-year celebration + value update |

**Re-Engagement Sequence** (3 steps, 30 days, triggered for cold contacts):
| Step | Day | Type |
|------|-----|------|
| 0 | Day 0 | Value Check-In — pure value, no ask |
| 1 | Day 14 | Personal Touch — specific to client context |
| 2 | Day 30 | Soft Reconnect — available if they need anything |

### Send Time Optimization (send-time-engine.ts)
Flight Control uses a 3-tier system to suggest when to send outreach:
- **Tier 1 (default)**: RE industry optimal windows — Tuesday/Wednesday/Thursday mornings (9–10am) score highest (90–95/100)
- **Tier 2 (with segment data)**: Adjusted by client type (buyer, seller, investor, past_client, lead)
- **Tier 3 (future)**: Per-contact individual history (not yet deployed)

If a user asks "when should I send?" → Tuesday–Thursday mornings are industry-optimal for real estate outreach.

### Newsletter Section
Flight Control also includes a newsletter builder for mass updates (market reports, seasonal messages).

### Common Problems & Diagnostics

**"Flight Control isn't generating drafts"**
1. Check if the agent has active clients (Boarding through In-Flight)
2. Check if clients have been contacted recently (14-day suppression)
3. Check if client data is complete (name, tone preference)
4. Check if there are any trigger events (birthdays, stale leads, etc.)
5. The cron runs daily — drafts appear the next day

**"Draft tone doesn't match my style"**
→ Check AI Voice Guide in Settings. If empty, the AI uses generic tone. Write a detailed guide for better results.

**"Client keeps getting messages"**
→ Check suppression: If an outreach is dismissed (not sent), it may regenerate next cycle. Sending or permanently dismissing prevents regeneration.

**"How do I write a good AI Voice Guide?"**
→ Include: preferred length, opening style, closing style, phrases to use, phrases to avoid, formality level, whether to reference market data. More detail = better drafts.

**"Outreach queue is empty"**
1. No trigger events detected (no birthdays, no stale leads, no recent closes)
2. All active clients were contacted recently (suppression active)
3. Cron may not have run yet today — check timing
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  transactions: `## TROUBLESHOOTING: TRANSACTIONS & DEALS

### GCI Calculation
**Standard**: GCI = Sale Price × Commission%
**Override**: If gci_override is set, that value is used directly (ignoring sale price × commission)

### Deal Fields
- Date, Address, Sale Price, Commission %, GCI (auto or override)
- Side: buyer, seller, or both (double-end)
- Status: closed, pending, fallen
- Client link (optional — links to CRM record)
- Team/referral split percentage
- Notes

### Commission Split Flow
Gross GCI → Agent Split% → Agent Net (before fees and expenses)
Example: $500K × 2.5% = $12,500 GCI → 80/20 split → $10,000 Agent Net

### Team/Referral Split
If a deal has a team or referral split, the effective GCI is reduced:
Agent's GCI = Gross GCI × Team Split%
Example: $12,500 GCI × 50% team split = $6,250 to this agent

### Per-Deal Brokerage Fees & Cap
- Per-deal fee = GCI × tx_fee_rate_pct
- YTD fees accumulate toward annual cap (tx_fee_annual_cap)
- Once cap is reached, per-deal fee drops to post_cap_rate (or 0%)
- Post-cap deals have higher net income

### Transaction Impact on Metrics (12+ downstream effects)
Adding/changing a closed deal triggers recalculation of:
1. YTD GCI (total and average)
2. Pace vs goal
3. Projected year-end GCI
4. Tax estimate (federal, provincial, CPP)
5. Expense ratio (denominator changes)
6. Runway Score (pace + expense components)
7. Benchmark percentile
8. Probability bands (CV recalculates)
9. Survival runway (if income affects burn rate)
10. Per-deal tax portion
11. Waterfall projection
12. Client tier recalculation

### History Tab
Annual summaries by year. Import via CSV/PDF for prior years. Shows:
- Year, total GCI, deal count, Q1–Q4 breakdown
- Year-over-year chart
- Seasonal profile derived from historical quarters

### Common Problems & Diagnostics

**"My GCI total seems wrong"**
1. Check for GCI overrides — may differ from sale_price × commission%
2. Check deal dates — only current-year deals count for YTD
3. Check deal status — only "closed" deals count (not pending or fallen)
4. Check team/referral splits — reduces effective GCI
5. Check for "both sides" deals — commission% should be total (e.g., 5%), not per-side

**"Deal shows wrong commission"**
→ Check if GCI override is set. Override takes precedence over sale_price × commission%.

**"I added a deal but nothing changed"**
1. Verify status is "closed" (not pending)
2. Verify date is in current year
3. Check if sale price and commission% are filled in
4. Try hard refresh (Ctrl+Shift+R)

**"What's the difference between Deals and Pipeline?"**
→ Deals = completed (closed/pending/fallen). Pipeline = in-progress opportunities at various stages. Convert pipeline deals to closed when they close.

**"Fallen deal is still showing in my totals"**
→ Fallen deals should be excluded from all active calculations. If still showing, check the status field. It should be "fallen" exactly.

**Edge Cases:**
- Both-sides deal: Commission% should be total percentage (5% for both, not 2.5% per side)
- GCI override of $0: Legal, but will contribute $0 to all calculations
- Future-dated deals: Included if date is in current calendar year
- Deal with no client link: Works fine for calculations, just no CRM association
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  settings: `## TROUBLESHOOTING: SETTINGS & CONFIGURATION

### Critical Settings That Affect Everything

| Setting | Affects | Default |
|---------|---------|---------|
| Province | Tax brackets, GST/HST rate, provincial rates | Required (set in onboarding) |
| Commission Split | Agent net income, tax, waterfall | Required |
| Annual GCI Goal | Pace, runway score, goal gap | $0 (not set) |
| Cash Reserve | Survival runway | $0 |
| Experience Years | Benchmark cohort, deviation tone | 0 |
| Business Structure | Tax calculation method (sole prop/PREC/corp) | Sole prop |
| Seasonal Weights | Projection accuracy, pace calculation | National default |
| Estimated Weekly Hours | Time Value card on Overhead page | Not set (card hidden) |
| Vacation Weeks/Year | Reduces annual hours for Time Value calc | 0 |

### Commission Split Options
Presets: 70/30, 75/25, 80/20, 85/15, 90/10, 95/5, 100/0
Custom: Any percentage via custom input
Format: p{agent}_{brokerage} (e.g., "p80_20")

### Brokerage Fee Structure
- **Monthly fee**: Fixed amount per month
- **Per-deal fee rate**: Percentage of GCI per transaction
- **Annual cap**: Maximum total per-deal fees per year
- **Post-cap rate**: Fee rate after cap is reached (often 0%)

Example: $500/month + 3% per deal, capped at $20,000/year. After cap → 0% per deal.

### Seasonal Weights
- Default: uniform Q1=25%, Q2=25%, Q3=25%, Q4=25% (engine normalizes via normalizeSeasonalWeights)
- Cascade: agent-derived (history_items.quarter_gci, 2+ years) → settings.national_quarter_pcts → uniform
- Custom: User sets their own (must total 100%)
- Affects: Pace calculation, projected GCI, seasonal fraction
- Winter markets (e.g., ski resorts) might be Q4-heavy
- Resort/cottage markets might be Q2-heavy

### Home Office Settings
- CRA actual-cost method only — Canada has no IRS-style simplified $5/sqft method. The home_office_method column in user_settings is unused by the t2125-engine; deduction is always computed from actual costs.
- Inputs (T2125 line 9945): monthly rent or mortgage interest, monthly utilities, annual property tax, monthly insurance, annual maintenance, monthly condo fees
- Business-use % = office area ÷ total home area
- Deduction = (sum of annualized actual costs) × business-use %
- Eligibility: principal place of business OR used exclusively and regularly to meet clients

### GST/HST Registration
- Toggle: registered or not
- If registered: GST/HST collected on GCI, ITCs claimed on expenses
- If not: No GST obligations (under $30,000 threshold)

### Vehicle Business Use
- Percentage of total km that are business-related
- Applied to mileage deduction calculation
- Also applied to vehicle expense deductions (insurance, repairs, fuel)

### 5-Year Growth Goals
- Set target GCI for each of the next 5 years
- Feeds into 5-year growth plan on Forecast page
- Used for long-term probability band projections

### AI Voice Guide
- Free-text field describing personal communication style
- Injected into all AI-generated outreach drafts
- More detail = better draft quality

### Common Problems & Diagnostics

**"My numbers changed after updating settings"**
→ Expected! Settings are inputs to all engines. Changing province, split, goal, or expenses cascades through every calculation.

**"Province is wrong"**
→ Settings → Province. Changes provincial tax brackets, GST/HST rate, and all tax estimates. Change takes effect immediately.

**"I changed my split but my agent net didn't update"**
→ The new split applies to all future calculations. Historical closed deals keep their original split unless individually edited.

**"Cap isn't working"**
1. Check if annual_cap is set (>$0)
2. Check if YTD per-deal fees have actually reached the cap
3. Check post-cap rate — if same as regular rate, there's no visible change

**"Seasonal weights seem wrong"**
→ Custom weights must total 100%. If they don't, the system may normalize or fall back to national defaults.

**"How do I reset to defaults?"**
→ Most settings can be changed back individually. There's no "reset all" button. Onboarding values can be overwritten in Settings.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SURVIVAL
  // ═══════════════════════════════════════════════════════════════════════════
  survival: `## TROUBLESHOOTING: SURVIVAL RUNWAY

### Survival Calculation (from survival-engine.ts + cash-position-engine.ts)

**Formula**: Runway Months = Effective Cash ÷ Net Monthly Burn

**Monthly Burn** = monthly_brokerage_fee (Settings) + monthly recurring expenses
- monthly_brokerage_fee: the fixed desk fee entered in Settings
- monthlyRecurring: sum of all active recurring expense amounts (monthly + prorated quarterly/annual)
- NOTE: This does NOT use YTD expenses ÷ months elapsed — it uses the configured recurring amounts only

**Income Offset** = Pipeline Weighted GCI ÷ max(1, 12 − months elapsed)
- This is the pipeline monthly estimate used to offset burn
- NOT YTD Agent Net ÷ months elapsed — it is forward-looking (pipeline-based)
- Divisor is remaining months of the year (minimum 1): late-year pipeline is spread across fewer months, so the monthly offset is larger

**Net Burn** = Monthly Burn − Income Offset

**Effective Cash** (from cash-position-engine.ts):
- If agent has closed deals this year: max(0, Implied Cash + Manual Cash Reserve)
  - Implied Cash = YTD Agent Net − YTD Expenses − YTD Tax Set-Aside − YTD HST Owing
  - HST Owing = $0 if brokerage withholds HST; otherwise HST collected − ITCs on expenses
  - This is what should be in the account if the agent has been disciplined
- If no closed deals yet: Manual Cash Reserve only (from Settings)

**Risk Levels**:
| Months | Level | Color |
|--------|-------|-------|
| ≥6 | Strong | Green |
| 4–6 | Healthy | Blue |
| 2–4 | Warning | Yellow |
| <2 | Critical | Red |
| Not configured | Neutral | Gray |

**Cap**: Runway is capped at 24 months maximum (to avoid infinity when burn ≤ 0).

**Special Cases**:
- Net burn < 0 (income offset exceeds burn): runway = 24 months (strong), short-circuits before dividing.
- Net burn = 0 AND cash > 0: runway = 24 months.
- Net burn = 0 AND cash = 0: runway = 0.
- No burn configured AND no cash reserve: Returns -1 (sentinel) → "Not Configured".
- Cash reserve $0 with positive net burn: Runway = 0 (critical).

### Survival Impact on Other Metrics
1. **Runway Score**: Survival is 15% of composite score
2. **Advisor Cards**: Flags when <3 months
3. **Insights Engine**: "Survival warning" insight
4. **Dashboard**: Survival status indicator card

### Common Problems & Diagnostics

**"Survival shows 'Not Configured'"**
→ Cash reserve is $0 or not set. Go to Settings → Cash Reserve and enter current business savings.

**"Survival shows 24 months — is that right?"**
→ Yes, if monthly income exceeds monthly expenses (net burn ≤ 0), runway caps at 24 months. This means you're cash-flow positive.

**"Survival seems too low"**
1. Check cash reserve amount in Settings — is it current?
2. Monthly burn = monthly_brokerage_fee + monthly recurring expenses (NOT one-time receipts). One-time expenses do NOT affect survival burn.
3. Check if pipeline is thin — the income offset is pipeline weighted GCI ÷ remaining months. Empty pipeline = $0 income offset.
4. Large pipeline deals increase the income offset and reduce net burn, improving survival.

**"How do I improve survival?"**
1. Increase cash reserve (Settings)
2. Reduce expenses
3. Close more deals (increases monthly income average)
4. Both income and expenses are averaged — more months of data = smoother calculation

**Edge Cases:**
- January 1: Only 1 month of data — burn rate is based on that single month
- Large expense in January: Inflates monthly burn for the whole year until more months pass
- No deals closed yet: Monthly income = $0, so burn = full expenses → very low runway
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // BENCHMARK
  // ═══════════════════════════════════════════════════════════════════════════
  benchmark: `## TROUBLESHOOTING: BENCHMARK & MARKET COMPARISON

### Industry Benchmark Data (from benchmark-engine.ts)

Uses industry-cohort estimates aggregated from public industry sources. Cohorts based on experience years:

| Cohort | Years | Median GCI | Median Deals | Avg Price |
|--------|-------|-----------|-------------|-----------|
| Rookie | 0–2 | $42,000 | 4 | $380,000 |
| Growth | 3–5 | $78,000 | 7 | $400,000 |
| Established | 6–10 | $96,000 | 8 | $420,000 |
| Top Producer | >10 | $145,000 | 12 | $460,000 |

**National Median** (all agents): $96,000 GCI, 8 deals

### Percentile Calculation
Linear interpolation between breakpoints: p25, median (p50), p75, p90
- Below p25: Interpolate between 0 and p25
- p25 to p50: Linear interpolation
- p50 to p75: Linear interpolation
- p75 to p90: Linear interpolation
- Above p90: Capped at ~99th percentile

### Where You Stand (from where-you-stand-engine.ts)

**Performance Bands**:
- Launching: 0–10th percentile
- Climbing: 10–25th percentile
- Competitive: 25–50th percentile
- Advancing: 50–75th percentile
- Leading: 75th+ percentile

**Momentum**: gaining (improving vs last year), holding (flat), losing (declining), no_data

**Position vs Market**:
- Above: ratio > 1.15 (annualized deals vs board average)
- At: 0.85–1.15
- Below: < 0.85

**Guards**:
- Early career (<3 years): Softens "below market" messaging
- Too early in year (fraction < 0.16 AND <3 deals): Suppresses projection entirely

### Common Problems & Diagnostics

**"My benchmark seems wrong"**
1. Check experience years in Settings — determines which cohort you're compared to
2. Benchmark uses projected annual GCI (not just YTD)
3. Cohort estimates are based on aggregated industry data — they may not reflect the most recent market shifts

**"Why am I compared to rookies?"**
→ Experience years is set to 0–2 in Settings. Update to actual years of experience.

**"I'm above median but score is low"**
→ Benchmark is only 5% of Runway Score. Other components (pace 35%, pipeline 30%) have much more impact.

**Edge Cases:**
- No history data: Benchmark uses only current year
- Experience = 0: Rookie cohort (lowest benchmarks)
- Early year (<16% elapsed, <3 deals): "Too early" guard suppresses market positioning
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL
  // ═══════════════════════════════════════════════════════════════════════════
  social: `## TROUBLESHOOTING: SOCIAL STUDIO

### How Social Studio Works
1. Select deals from the current month/quarter
2. Choose a template family (carousel style)
3. Configure branding: logo, headshot, agent cutout, colors
4. Customize individual slides (text, images, layout)
5. Add caption with hashtags
6. Export: Direct to Instagram OR Canva ZIP

### Features
- Month-in-review carousels for Instagram
- Multiple template families/styles
- Branding customization (logo, headshot, business identity from Profile)
- Caption builder with hashtag suggestions
- Multi-slide carousel format
- Export options: Instagram direct, Canva-compatible ZIP

### Common Problems & Diagnostics

**"No deals showing to select"**
→ Deals must be closed and dated within the selected time period. Check if deals are in the correct month/quarter.

**"My branding looks wrong"**
→ Check Profile page: logo, headshot, and business identity settings. These feed into Social Studio templates.

**"Export to Instagram failed"**
→ Instagram integration requires proper authentication. Try Canva ZIP as an alternative export method.

**"How do I customize slides?"**
→ After selecting deals and template, each slide can be individually customized. Click on a slide to edit text, layout, and images.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT
  // ═══════════════════════════════════════════════════════════════════════════
  import: `## TROUBLESHOOTING: IMPORT

### Supported Import Methods
1. **CSV**: Upload a CSV file with transaction/history data
2. **Spreadsheet**: Excel/Google Sheets format
3. **PDF**: Brokerage reports (e.g., Lone Wolf Back Office exports)

### Column Detection (from column-classifier.ts)
System uses heuristic column classification:
- Attempts to match column headers to expected fields
- Supports: date, address, sale price, commission%, GCI, client name, side, status
- Shows a mapping preview for user confirmation before import

### Import Flow
1. Upload file (CSV, XLSX, PDF)
2. System detects columns/fields
3. User reviews and confirms column mapping
4. Preview of data to be imported
5. Import executes (row by row)
6. Summary: imported count, skipped count, errors

### History Import (Annual Summaries)
Imports into the History tab with: Year, Annual GCI, Deal Count, Q1–Q4 breakdown
Used for: Year-over-year comparison, seasonal profile, trend detection

### Common Problems & Diagnostics

**"Import failed"**
1. Check file format — must be CSV, XLSX, or PDF
2. Check for special characters in headers
3. Check for empty rows or malformed data
4. Check file size — very large files may timeout
5. Check if date formats are consistent (YYYY-MM-DD preferred)

**"Some rows were skipped"**
→ Rows skip when required fields are missing (typically date and sale price or GCI). Check the error summary for specific row numbers.

**"Columns weren't detected correctly"**
→ The mapping preview step lets you manually reassign columns. If headers are non-standard, manual mapping may be needed.

**"PDF import didn't work"**
→ PDF import works best with structured tabular data. Some PDF formats (image-based, non-standard layouts) may not parse correctly. Try exporting as CSV from the source system instead.

**"Duplicate transactions after import"**
→ The system uses a scored reconciliation engine to detect duplicates. Each imported deal is scored against existing transactions:
- Address similarity: up to 40 points (Dice coefficient string match)
- Date proximity: 40 pts (exact), 25 pts (±7 days), 10 pts (±30 days), 0 pts (>30 days)
- GCI proximity: 20 pts (within 5%), 10 pts (within 15%), 0 pts (>15% off)
- Score ≥70 → "Match" (auto-skip, likely duplicate)
- Score 40–69 → "Possible" (needs manual review)
- Score <40 → "New" (added as a new transaction)

If duplicates slip through, the match was below 70. Manually delete extras from the Deals tab.

**CRITICAL**: Import reliability is essential. Users who hit problems during onboarding import may not come back. If import fails, help them troubleshoot step by step.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE
  // ═══════════════════════════════════════════════════════════════════════════
  voice: `## TROUBLESHOOTING: VOICE INPUT

### How Voice Input Works
1. User taps microphone in Quick Actions FAB (floating action button, bottom-right)
2. Browser requests microphone permission
3. Audio recorded → sent to Groq Whisper for transcription
4. Transcript → Groq Llama 3.3 70B for intent classification
5. Classified into one of 5 intents:
   - new_client: Add a new contact
   - new_expense: Log an expense
   - new_transaction: Record a deal
   - note: Log a contact activity
   - unknown: Could not determine intent
6. Route to correct page with fields pre-filled (amber-tinted to indicate voice-filled)
7. User reviews, corrects if needed, and saves

### Intent Classification Details
- Confidence levels: high, medium, low
- If low confidence, system asks for clarification
- Amounts parsed from natural language ("twelve hundred" → $1,200)
- Addresses parsed from spoken format
- Client names extracted for matching against CRM

### Common Problems & Diagnostics

**"Microphone not working"**
1. Browser permission: Check if microphone access is granted (browser settings)
2. HTTPS required: Voice input only works on HTTPS (not HTTP)
3. Device selection: Check if correct microphone is selected in browser
4. Ad blockers: Some extensions block microphone access

**"Transcription was wrong"**
→ Whisper works best with clear speech, minimal background noise. Try speaking more slowly and clearly. Proper nouns (addresses, names) may need manual correction.

**"Wrong intent detected"**
→ If "add a client named John" is classified as a note, try rephrasing: "new client John Smith, phone 555-1234". Using explicit keywords helps: "new client", "expense", "sold", "deal closed".

**"Voice-filled fields are incorrect"**
→ Fields are pre-filled as best-effort extraction. The amber tint indicates AI-filled content that should be reviewed. Users ALWAYS review and correct before saving.

**"FAB button isn't showing"**
→ Quick Actions FAB appears on every app page. If not visible:
1. Check if scrolled down (may be behind content on small screens)
2. Check if a modal is blocking it
3. Try refreshing the page
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING
  // ═══════════════════════════════════════════════════════════════════════════
  onboarding: `## TROUBLESHOOTING: ONBOARDING & GETTING STARTED

### Onboarding Wizard (8 steps, ~2 minutes)

1. **Province**: Select your Canadian province/territory (determines tax rates)
2. **About You**: Display name, brokerage affiliation
3. **Business Structure**: Sole proprietor, PREC, or Corporation
4. **Commission & Fees**: Split percentage, brokerage monthly fee, per-deal fee, annual cap
5. **Experience Level**: Years in real estate (determines benchmark cohort)
6. **Color Theme**: Choose from 15 themes + dark mode
7. **Annual Goal**: Set GCI goal for the current year
8. **Confirmation**: Review and finish

All settings are editable later in Settings.

### After Onboarding — Priority Actions
1. **Add first deal**: Transactions → New → Enter a closed deal
2. **Add pipeline deals**: Transactions → Pipeline → Add active opportunities
3. **Import history**: Transactions → History → Import prior years (CSV/PDF)
4. **Add clients**: CRM → Add your key contacts
5. **Set cash reserve**: Settings → Cash Reserve
6. **Write AI Voice Guide**: Settings → AI Voice Guide (for Flight Control)

### Welcome Tour
After onboarding, a welcome tour highlights key features:
- Dashboard overview
- Flight Crew access
- Quick Actions FAB
- Navigation structure

### Common Problems & Diagnostics

**"I skipped onboarding — how do I set up?"**
→ All onboarding settings are in Settings page. Walk through: province, structure, split, fees, experience, goal.

**"My numbers look weird after onboarding"**
→ With zero data, projections rely on the goal and seasonal fractions. Add deals and pipeline to see meaningful numbers.

**"What should I do first?"**
→ Priority: (1) Add 2-3 recent closed deals, (2) Add pipeline deals, (3) Set cash reserve, (4) Import history if available. This gives the AI enough data to generate useful insights.

**"I set the wrong province"**
→ Settings → Province. Change it — all tax calculations update immediately.

**"I don't know my commission split"**
→ Check with your brokerage. Common ranges: 70/30 (newer agents) to 95/5 or 100/0 (experienced). If unsure, start with 80/20 and adjust later.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL (catch-all)
  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMS & ORGANIZATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  teams: `## TROUBLESHOOTING: TEAMS & ORGANIZATIONS

### Overview
Agent Runway Teams allows brokerages and team leaders to manage agents under one organization.
Pricing: $149/mo team leader + $55/mo per member seat. The Ellis Realty beta has the team price locked for the duration of their active subscription.

### Architecture
- **Organization** = top-level container (name, logo, type, seat limit)
- **Members** = agents linked to an org (roles: owner, team_leader, agent)
- **Invite Flow**: Leader sends invite email → member accepts → consent page → onboarding (if new)
- **Data Sharing**: Tiered consent model — agents choose what their leader can see

### What Leaders Can See (Tier 1 — always shared)
- YTD GCI and deal count per agent
- Pipeline deal count and estimated value
- Agent activity level (touch counts, not content)

### What Leaders Can NEVER See
- Tax data, filings, CRA information
- Expense amounts and categories
- Commission splits and brokerage fees
- Cash reserves and runway months
- Individual transaction details
- Previous years' earnings
- Client names, contact details, or notes

### Team Reports (Leader Only)
5 pre-built reports available from /org/reports:
1. **Pipeline Health** — Team pipeline value, agents with no pipeline despite deals, coverage ratio
2. **Transactions in Flight** — Pending deals, total value, nearest close dates
3. **CRM Consistency** — Average touchpoints per agent, outlier detection (low/high activity)
4. **Tax Responsibility** — Which agents are missing expense logs, receipts, or categories (aggregate, no amounts)
5. **Forecasting** — Pace vs goal per agent, who's ahead/behind, team average pace

### Team Insights Engine (Org Dashboard)
Generates coaching insights from aggregate data:
- Empty pipeline warnings
- Goal pace deltas
- Production concentration (Pareto check)
- Deal size benchmarks
- Praise for high performers

### Common Issues

**"Member not showing up"**
1. Check /org/members for pending invitations — they may not have accepted yet
2. Invite tokens expire after 30 days — re-invite if expired
3. The invited person must create an Agent Runway account first (or log in) before accepting

**"Invite link not working"**
- Token may have expired (30-day limit)
- Member may need to log in first — the invite page redirects to /login with a return URL
- Re-send the invite from /org/members

**"Can the leader see my expenses / taxes?"**
- NO. Tax data, expenses, commission splits, cash reserves, and transaction details are NEVER shared.
- Only YTD GCI, deal count, and pipeline summary are visible to leaders (Tier 1 consent).
- Members can optionally enable Extended Sharing (monthly breakdown) from their Consent settings.

**"How do I read team reports?"**
- Navigate to /org/reports — only visible to owners and team_leaders
- Each report tab shows a different aspect of team performance
- Data is aggregated and privacy-safe — no individual financial details exposed

**"Team comparison in my dashboard?"**
- The comparative insights engine shows agents how they compare to team averages
- This appears in the Flight Crew chat and on the dashboard when team data is available
- Comparisons reference the team leader by first name for coaching context

**"How do I add more seats?"**
- Go to /org/billing → adjust seat count in subscription
- Seat limit is enforced — inviting over max_seats is blocked
- Contact support@agentrunway.ca for bulk seat changes

**"How do I leave a team?"**
- Members can leave from their Consent settings at any time
- Leaving removes data sharing — all previously shared data is no longer visible to the leader
- The member keeps their individual account and all personal data

### Batch Invite
The invite form on /org/members supports comma-separated emails.
Enter multiple emails in one go: "agent1@email.com, agent2@email.com, agent3@email.com"

### Leader Onboarding Checklist
When a new team leader asks "What should I do first?", guide them through:
1. Create organization → /org/create (name, type, logo)
2. Set seat limit → /org/settings
3. Invite members → /org/members (enter emails, comma-separated for batch)
4. Wait for acceptance → monitor pending invites on /org/members
5. Review team dashboard → /org once members start entering data
6. Explore reports → /org/reports for pipeline health, CRM consistency, forecasting
7. Ask the Flight Crew about team performance any time — it has team context built in

### Member Onboarding Checklist
When a new member asks "I just joined a team, what do I do?":
1. Accept invite → click link in email, review consent, accept
2. Complete personal onboarding → province, split, goal, experience
3. Start entering data → transactions, pipeline, expenses
4. Your leader can see your GCI and pipeline (Tier 1) — nothing else
5. Ask the Flight Crew — it knows your team context and can compare your pace
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERRALS
  // ═══════════════════════════════════════════════════════════════════════════
  referrals: `## TROUBLESHOOTING: REFERRALS

### How Referrals Work
Agent Runway tracks referral partnerships — both inbound (another agent sends you a client) and outbound (you send a client to another agent).

**Key Fields:**
- **Direction**: inbound (you receive) or outbound (you send)
- **Partner Name / Brokerage**: who you're working with
- **Client Name**: the referred client
- **Referral Fee %**: default 25%, customizable per referral
- **Estimated Value**: projected deal value for fee calculation
- **Actual Fee Paid**: recorded when the deal closes
- **Status**: pending → active → closed (or cancelled)

### Referral Fee Calculation
- Referral fee = Sale Price × Commission % × Referral Fee %
- Example: $400K sale × 2.5% commission × 25% referral = $2,500
- For inbound: this is money you pay to the referring agent
- For outbound: this is money you receive from the receiving agent

### Common Issues
- **"My referral fee seems wrong"**: Check the referral fee %, sale price, and commission rate. The fee is calculated on your gross commission, not the sale price.
- **"How do I link a referral to a closed deal?"**: Record the referral first, then when you record the transaction, the referral fee can be tracked alongside it.
- **"Inbound vs outbound — which do I pick?"**: Inbound = someone referred a client TO you. Outbound = you referred a client to SOMEONE ELSE.
- **"Default 25% — can I change it?"**: Yes, each referral can have a custom percentage. Edit it when creating or updating the referral.

### Where to Find It
- **Referrals page** (/referrals) — full list, partner management, fee tracking
- **Flight Crew**: "Log a referral" or "Cara Coes referred Travis Radtke to me"
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERHEAD
  // ═══════════════════════════════════════════════════════════════════════════
  overhead: `## TROUBLESHOOTING: OVERHEAD (TAX & DEDUCTIONS)

### What the Overhead Page Shows
The Overhead page is your complete tax visibility dashboard:

1. **Tax Estimate Breakdown**
   - Federal tax (multi-bracket: 14.5% / 20.5% / 26% / 29% / 33%) — 14.5% is the 2025 blended rate (15% Jan–Jun, 14% Jul–Dec)
   - Provincial tax (varies by province — uses rates from Settings)
   - CPP self-employed contributions (both employer + employee portions)
   - Total estimated tax liability for the year

2. **Effective Tax Rate**
   - Your actual overall tax rate = Total Tax ÷ Net Self-Employment Income
   - This is different from your marginal rate (the rate on your next dollar)

3. **Quarterly Instalment Amounts**
   - CRA requires quarterly payments if you owe > $3,000 in tax
   - Deadlines: March 15, June 15, September 15, December 15
   - Calculated as: Estimated Annual Tax ÷ 4

4. **HST/GST Tracking**
   - HST collected on commissions (13% in ON, 14% in NS, 15% in NB/NL/PE, etc.)
   - Input Tax Credits (ITCs) from business expenses
   - Net HST owing = Collected − ITCs
   - Small supplier threshold: < $30,000 annual revenue = optional registration

5. **Deduction Summaries by T2125 Category**
   - Advertising, meals, vehicle, office, professional fees, etc.
   - Each category shows YTD total from recorded expenses

6. **CCA Depreciation Schedule**
   - Capital Cost Allowance for business assets
   - Organized by CCA class (Class 8, 10, 10.1, 12, 50, etc.)
   - Shows: original cost, UCC (undepreciated capital cost), CCA claimed
   - Half-year rule: first-year CCA is 50% of the normal rate

7. **Per-Deal Tax Set-Aside**
   - Recommended amount to set aside from each commission cheque
   - Based on your effective tax rate applied to average deal GCI

### GST34 Return Pre-Fill (from gst34-engine.ts)

The Overhead page can pre-fill your GST34 return for any filing period:

| Line | Label | Formula |
|------|-------|---------|
| 101 | Total sales & revenue | Sum of GCI from closed deals in the period |
| 103 | GST/HST collected | Line 101 × provincial rate (5%/13%/14%/14.975%/15%) |
| 105 | Total HST + adjustments | Line 103 + Line 104 (adjustments usually $0) |
| 106 | Input Tax Credits (ITCs) | GST/HST paid on eligible business expenses |
| 107 | ITC adjustments | −50% of ITCs on meals & entertainment (CRA rule) |
| 108 | Total ITCs | Line 106 + Line 107 |
| 109 | Net tax | Line 105 − Line 108 (positive = owing, negative = refund) |
| 110 | Instalments paid | Payments already remitted for this period |
| 113 | Balance / refund | Line 109 − Line 110 |

**Quick Method**: Available if taxable revenue ≤ $400K. Instead of tracking every ITC, remit a flat rate (typically 8.8% of HST-included revenue for service providers). May result in lower remittance but Agent Runway uses the detailed method — consult an accountant before switching.

### GST/HST Filing Period Deadlines (from filing-period-engine.ts)

**IMPORTANT**: These are DIFFERENT from income tax instalment dates.

| Filing Frequency | Due Dates |
|-----------------|-----------|
| Quarterly | Q1 (Jan–Mar): April 30 / Q2 (Apr–Jun): July 31 / Q3 (Jul–Sep): October 31 / Q4 (Oct–Dec): March 31 (next year) |
| Monthly | One month after period end (e.g., January → February 28) |
| Annual | June 15 following year (sole prop) or March 31 (corp) |

**Income Tax Instalment Dates** (separate from GST): March 15, June 15, September 15, December 15.
If a user asks "when is my GST filing due?" → use the GST/HST quarterly deadlines above, NOT the income tax instalment dates.

### Time Value Calculator (from time-value-engine.ts)

The Overhead page includes a **Time Value** card that appears when the agent has set their weekly hours in Settings.

**Required Setting**: Settings → "Estimated Weekly Hours" (and optionally "Vacation Weeks/Year")

**Metrics Shown**:
- **Effective Hourly Rate (net)**: Projected annual net income ÷ annual working hours
- **Gross Hourly Rate**: Projected annual GCI ÷ annual working hours
- **Hours Per Deal**: Annual hours ÷ projected deal count (annualized)
- **Net Per Deal**: Net income per closed deal
- **Net Per Deal-Hour**: Net per deal ÷ hours per deal (what each hour on a deal earns)
- **Break-Even Deal Count**: Number of deals needed just to cover annual expenses
- **Cost Per Hour**: Annual expenses ÷ annual working hours

**Formula**: Annual hours = (52 − vacation weeks) × weekly hours

**Early-Year Dampening** (yearFractionElapsed < 10%, roughly Jan 1–Feb 7):
- Annualized deal count blends toward the actual YTD deal count to prevent a single early-year deal from implying ~77 deals/year
- Below 10% elapsed: annualizedDealCount = dealCount × (1 − ramp) + rawAnnualized × ramp, where ramp = yearFractionElapsed / 0.10
- This dampening cascades into revenuePerDeal, hoursPerDeal, breakEvenDealCount, and netPerDeal
- Mirrors the same confidence ramp in projection-engine.projectedYearEndTransactions, so dashboard projections and Time Value figures stay consistent in early January

If the card doesn't show: the agent hasn't set 'estimated_weekly_hours' in Settings.

### Common Issues
- **"Tax estimate seems too high/low"**: Check Settings → province, business structure (sole prop vs incorporated), and whether expenses are fully entered.
- **"CCA not showing"**: You need to add CCA assets first — use the Flight Crew ("I bought a $2,400 laptop for work") or add manually on the Overhead page.
- **"HST numbers wrong"**: Verify your GST/HST registration status in Settings. If you're below $30K revenue, you may not need to collect HST.
- **"Instalment amounts changed"**: They update as your estimated tax changes throughout the year based on new transactions and expenses.
- **"What is line 109 on my GST34?"**: Net tax = GST collected on commissions minus ITCs from expenses. Positive means you owe CRA; negative means CRA refunds you.
- **"My ITCs seem low"**: Insurance premiums are GST/HST exempt — no ITC can be claimed. Meals & entertainment ITCs are 50% disallowed.
- **"When is my GST/HST quarterly filing due?"**: Q1 Apr 30, Q2 Jul 31, Q3 Oct 31, Q4 Mar 31 (next year). These are different from income tax instalment dates (Mar 15, Jun 15, Sep 15, Dec 15).
- **"Time Value card not showing"**: Set your estimated weekly hours in Settings. The card only appears when weekly hours are configured.
- **"What does effective hourly rate mean?"**: It's your projected annual net income divided by your annual working hours. Lower than expected? Check if your deal count or expenses are pulling it down.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // ALTIMETER
  // ═══════════════════════════════════════════════════════════════════════════
  altimeter: `## TROUBLESHOOTING: ALTIMETER (ANALYTICS & INSIGHTS)

### What the Altimeter Page Shows
The Altimeter is your deep analytics dashboard — performance tracking, insights, and benchmarking.

**Sections:**

1. **Personal Records**
   - Best Year (highest GCI in a single year)
   - Best Month (highest GCI in a single month)
   - Best Single Deal (highest GCI from one transaction)
   - These update automatically as you close transactions

2. **Year-over-Year Performance**
   - Compares current year to previous years
   - Shows growth trends in GCI, deal count, average deal size

3. **All Insights Engine**
   - AI-generated insights ranked by dollar impact
   - Examples: "Your average deal size increased 12% vs last year" or "Your expense ratio dropped below 30%"
   - Insights pull from transactions, pipeline, expenses, and CRM data

4. **Industry Benchmarking**
   - Compares your performance to industry-cohort estimates aggregated from public industry sources
   - Shows your percentile rank among agents
   - Cohort comparison (rookie, growth, established, top producer)

5. **Where You Stand**
   - Positioning on a Launching → Climbing → Competitive → Advancing → Leading scale (5 bands)
   - Based on deal volume, GCI, and year-over-year trajectory

6. **Deviation Detection**
   - Flags anomalies compared to your 12-month baseline
   - Examples: unusually high expense month, sudden GCI spike, pipeline drop-off

7. **Runway Score Breakdown**
   - Component weights: Pace 35%, Pipeline 30%, Expense Ratio 15%, Survival 15%, Benchmark 5%
   - Each sub-score shown individually so you can see what's pulling your score up or down
   - State label (prose): Strong (≥81), On Track (≥61), Building (≥41), At Risk (<41)
   - Letter grade (visual badges only — do not use in prose): A+ (≥92), A (≥85), B (≥75), C (≥62), D (≥50), F (<50)

### Common Issues
- **"Personal records are wrong"**: Records only count closed transactions with confirmed GCI. Pending pipeline deals don't count.
- **"Year-over-year is empty"**: You need at least 2 years of transaction data. Import historical transactions at /history.
- **"Industry benchmark says I'm low but I'm doing well"**: Benchmarks use national-cohort estimates. Local markets vary significantly.
- **"Runway Score dropped suddenly"**: Check which component changed — usually it's pipeline health (deals fell through) or pace (slow month).
- **"No insights showing"**: The insights engine needs at least a few months of data to generate meaningful observations.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════
  scenarios: `## TROUBLESHOOTING: SCENARIOS (WHAT-IF MODELING)

### What the Scenarios Page Does
Financial what-if modeling that lets you test different business assumptions without affecting real data.

**Adjustable Variables:**
- Deal count (how many deals you'll close)
- Average sale price
- Commission rate
- Expense levels (increase/decrease by percentage)
- Brokerage fees / caps

**How It Works:**
1. Start from your current year actuals as the baseline
2. Adjust one or more variables
3. See projected year-end GCI, take-home, tax impact
4. Compare multiple scenarios side by side

**Use Cases:**
- "What if I close 2 more deals this year?"
- "What if my average sale price goes up by $50K?"
- "What happens to my take-home if I cut marketing expenses by 30%?"
- "Should I aim for more deals or higher-value deals?"

### Common Issues
- **"Scenario shows wrong baseline"**: The baseline uses your current year's actual data. If transactions or expenses are missing, the baseline will be off.
- **"Results seem unrealistic"**: Scenarios use your current commission structure and tax brackets. If Settings are wrong, scenarios will be wrong.
- **"Can I save scenarios?"**: Scenarios are for real-time exploration. Adjust variables and compare — they reset when you leave the page.

### How Scenarios Feed Into Decisions
- Compare against your current pace from the Forecast page
- Use to set realistic annual goals in Settings
- Test the impact before making business decisions (hiring assistant, increasing marketing spend, etc.)
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // MILEAGE
  // ═══════════════════════════════════════════════════════════════════════════
  mileage: `## TROUBLESHOOTING: MILEAGE TRACKING

### How Mileage Tracking Works
Agent Runway logs business driving for CRA mileage deductions under the T2125.

**Key Fields per Trip:**
- Trip date
- Kilometres driven
- From / To locations
- Purpose (showing, listing, client meeting, open house, etc.)
- Deduction (auto-calculated using CRA rates)

### CRA Mileage Rates (2025)
- First 5,000 km: $0.72/km
- After 5,000 km: $0.66/km
- These rates are applied automatically based on YTD cumulative km

### Deduction Calculation
The deduction uses the tiered CRA rate:
- If YTD km ≤ 5,000: deduction = km × $0.72
- If YTD km > 5,000: first 5,000 km at $0.72, remainder at $0.66
- Business use percentage from Settings is applied on top

### Common Issues
- **"My deduction seems low"**: Check your vehicle business-use percentage in Settings. If it's set to 50%, only half your km count.
- **"Mileage not showing in deductions"**: Mileage deductions appear on the Overhead page under vehicle expenses. Make sure trips are logged.
- **"I forgot to log trips"**: You can backdate mileage entries. Use the Flight Crew: "I drove 45km to a showing last Tuesday."
- **"Rate changed mid-year"**: CRA rates are set annually. The platform uses the current year's rates for all entries in that year.

### Best Practices
- Log trips the same day — easier to remember details
- Include the property address and purpose for CRA compliance
- Keep a separate log book as backup (CRA may request it)
- The Flight Crew can log mileage: "I drove 32km to a showing at 88 King Street"

### Where to Find It
- **Expenses page** (/expenses) → Mileage tab
- **Overhead page** (/overhead) → Vehicle deductions section
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════
  "recurring-expenses": `## TROUBLESHOOTING: RECURRING EXPENSES

### How Recurring Expenses Work
Set up templates for expenses that repeat on a schedule (monthly, quarterly, or annually). Agent Runway auto-generates entries each period.

**Setup:**
- Vendor name (e.g., "Mailchimp", "CREA Dues")
- Amount
- Expense category (T2125 category)
- Frequency: monthly, quarterly, or annual
- Start date
- Optional notes

**Auto-Generation Flow:**
1. Each period (month/quarter/year), the system creates a pending expense entry
2. You review and confirm or skip each entry
3. Confirmed entries become regular expenses and count toward YTD totals
4. Skipped entries are marked but don't affect calculations

### Common Issues
- **"Recurring expense not generating"**: Check the start date — entries only generate for periods after the start date. Also verify the recurring expense is still active (not paused or cancelled).
- **"Amount changed but old entries show old amount"**: Previously confirmed entries keep their original amount. Edit the recurring template to change future entries.
- **"How do I cancel a recurring expense?"**: Deactivate it on the Expenses page → Recurring tab. Past confirmed entries remain; future entries stop generating.
- **"Recurring expense not in my tax deductions"**: Only confirmed entries count. Check the Recurring tab for pending confirmations.

### Impact on Financial Tracking
- Confirmed recurring expenses count toward YTD expense totals
- They feed into the expense ratio calculation
- They appear in T2125 category breakdowns on the Overhead page
- Tax estimates update when recurring entries are confirmed

### Flight Crew Integration
- "I pay $150/month for Mailchimp" → creates a recurring expense template
- "What are my recurring expenses?" → lists active recurring items from context
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // BANK SYNC — Planned future capability, not currently offered
  // ═══════════════════════════════════════════════════════════════════════════
  "bank-sync": `## TROUBLESHOOTING: BANK-ACCOUNT CONNECTIVITY

### Status
Bank-account connectivity is a **planned future capability** of Agent
Runway and is **not currently offered**. There is no active bank-sync
flow in the app today.

### What to tell the user
- They cannot connect a bank account at this time.
- All expense entry today is via Receipts (manual or OCR photo entry) or
  Mileage on the Expenses page. Recurring expenses can also be set up to
  auto-generate monthly / quarterly / annual entries.
- If and when bank-account connectivity becomes available, it will be
  an optional feature, the Service will continue to work without it,
  and an in-app notice plus updated Privacy Policy will land first.

### What NOT to do
- Do not suggest a workaround that imports bank data through any other
  third-party service.
- Do not promise a launch date.
- Do not refer the user to an external bank-sync product.
- **Do not bundle bank with email.** Bank connectivity is "planned future
  capability" framing. Email connectivity is **not** — it has its own
  playbook below. Never write "bank and email connectivity are planned
  future capabilities" or any sentence that groups them.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL INTEGRATION — Not offered, not framed as planned, not coming soon
  // ═══════════════════════════════════════════════════════════════════════════
  "email-integration": `## TROUBLESHOOTING: EMAIL / GMAIL / OUTLOOK / OUTREACH SENDING

### Status
Agent Runway does **not** integrate with Gmail, Google Calendar, Google
Drive, Outlook, Microsoft 365, or any custom SMTP email provider. The
platform does not send emails on the user's behalf. There is no current
connect flow and no in-product surface for connecting an email account.

### What to tell the user
- They cannot connect Gmail, Outlook, or any email account to Agent
  Runway today.
- Outreach in the product is **draft-only**: Flight Control drafts the
  message in the user's voice, the user reviews it, and the user
  copies it into their own email client (Gmail, Outlook, Apple Mail,
  whatever they normally use) to send.
- After sending, log the activity in the CRM so the timeline stays
  accurate. Flight Plans (post-close, re-engagement) work the same way:
  draft in-product, send from the user's own email client, log.

### What NOT to do — STRICT
- **Do not say "planned future capability."** Email integration is not
  publicly framed as planned, scheduled, or coming soon. Use neutral
  present-tense: "Agent Runway does not integrate with email accounts."
- **Do not say "coming soon," "in the works," "we're working on,"
  "future feature," "later this year," or any forward-looking phrase**
  about Gmail, email connectivity, calendar sync, or Drive analysis.
  No timeline. No commitment. No teaser.
- Do not suggest the user wait for it. Direct them to the
  draft-then-copy workflow today.
- Do not refer the user to a third-party automation (Zapier, Make,
  IFTTT) or to set up email forwarding into a connector.
- Do not bundle email with bank-sync (bank uses different framing —
  see playbook above).
- Do not mention CASL, CASA, regulatory blockers, or the historical
  reasons email is unavailable. The framing is product-state, not
  legal. "Not offered" is the answer.
`,

  general: `## GENERAL TROUBLESHOOTING

### When No Specific Topic Matches

If the user's question doesn't clearly match a specific feature area, follow this general diagnostic approach:

1. **Identify what they're looking at**: Ask or infer from currentPage context
2. **Check if data exists**: Many "broken" reports are actually empty-state issues
3. **Suggest the relevant page**: Point them to the correct feature
4. **Common quick fixes**: Hard refresh (Ctrl+Shift+R), check Settings, verify data entry

### Universal Quick Fixes
- **Page not loading**: Hard refresh, check internet connection
- **Numbers seem wrong**: Check Settings (province, split, goal, fees)
- **Feature not available**: May require Professional subscription
- **Data not updating**: Changes should be instant — try hard refresh
- **Missing feature**: Check if it's on a different page/tab

### Subscription Tiers
- **Free**: Limited features, basic dashboard
- **Professional**: Full access to all features including Flight Crew, Flight Control, Forecast, Reports, Social Studio
- **Team**: Professional features + team management and org insights

### Keyboard Shortcuts
N=New transaction, D=Dashboard, T=Transactions, P=Pipeline, F=Forecast, E=Expenses, R=Reports

### Getting Help
If the AI can't resolve the issue:
- Describe the problem with steps to reproduce
- Note the page/tab where the issue occurs
- Note what you expected vs what happened
- Contact support with these details

### Sandbox Mode
Users can explore the platform with sample data using Sandbox Mode. This fills the dashboard and features with realistic demo data to understand the platform before entering real information. Sandbox data is clearly marked and doesn't affect real calculations.
`,
};
