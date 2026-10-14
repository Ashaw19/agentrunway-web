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

import { EXPENSE_RATIO_COPY, expenseRatioBandsList } from "@agent-runway/core/engines/expense-ratio-bands";
import { TAX_YEAR } from "@agent-runway/core/engines/canadian-tax-engine";
import { TAX_ENGINE_TABLES } from "@agent-runway/core/tax-copy";
import {
  SCORE_VERSION,
  SURVIVAL_SCORE_STEPS,
  stateLabel,
  survivalSubScore,
} from "@agent-runway/core/engines/runway-score-engine";
import {
  RISK_BAND_FLOOR_MONTHS,
  RISK_BAND_LADDER,
  RISK_BAND_LEVELS,
  RISK_BAND_RANGE,
  RISK_LEVEL_LABEL,
  riskBandPhrase,
  riskColorBand,
  type RiskColorBand,
} from "@agent-runway/core/engines/survival-engine";
import type { TroubleshootingTopic } from "./troubleshooting-classifier";

// The cash runway bands as Flight Crew's table, highest first, built from the
// survival engine so the table cannot state an edge, a word or a colour the
// screens do not use.
const RUNWAY_COLOUR_WORD: Record<RiskColorBand, string> = { red: "Red", amber: "Amber", emerald: "Green", slate: "Gray" };
const RUNWAY_BAND_ROWS = [...RISK_BAND_LEVELS]
  .reverse()
  .map((level) => {
    const range = RISK_BAND_RANGE[level];
    return `| ${range[0].toUpperCase()}${range.slice(1)} | ${RISK_LEVEL_LABEL[level]} | ${RUNWAY_COLOUR_WORD[riskColorBand(level)]} |`;
  })
  .join("\n");

// The Runway Score's Survival sub-score as Flight Crew's table, highest first,
// built from the score engine's ladder so it cannot state a step, a score or a
// band the engine does not use. The last column is the colour of the Survival
// bar and of the Cash Runway number beside it: the ladder keeps them the same.
const monthCount = (months: number) => (months === 1 ? "1 month" : `${months} months`);
const SURVIVAL_SCORE_ROWS = SURVIVAL_SCORE_STEPS.map((step, i) => {
  const next = SURVIVAL_SCORE_STEPS[i + 1];
  const range = !next
    ? `${step.fromMonths}+ months`
    : step.fromMonths === 0
      ? `Under ${monthCount(next.fromMonths)}`
      : `${step.fromMonths} to under ${monthCount(next.fromMonths)}`;
  return `| ${range} | ${RISK_LEVEL_LABEL[step.level]} | ${step.score} | ${stateLabel(step.score)} | ${RUNWAY_COLOUR_WORD[riskColorBand(step.level)]} |`;
})
  .reverse()
  .join("\n");

// "a Critical runway scores At Risk (red), a Warning runway scores Building (amber), ..."
const SURVIVAL_SCORE_BAND_BY_RUNWAY_BAND = RISK_BAND_LEVELS.map((level) => {
  const first = SURVIVAL_SCORE_STEPS.find((step) => step.level === level);
  const scoreBand = first ? stateLabel(first.score) : "";
  return `a ${RISK_LEVEL_LABEL[level]} runway scores ${scoreBand} (${RUNWAY_COLOUR_WORD[riskColorBand(level)].toLowerCase()})`;
}).join(", ");

const SURVIVAL_SCORE_NOT_SET = survivalSubScore(-1);

// What v1.4 moved, for both playbooks a question about the Survival bar can
// reach. A dated fact: its figures are what was true that day, typed here.
const SURVIVAL_SCORE_CHANGED_V14 = `Changed 2026-10-13 (v1.4): a cash runway from 2 to under 3 months scored 30 on Survival (At Risk, a red bar) beside a Cash Runway number in the ${RISK_LEVEL_LABEL.warning} range, in amber. It now scores 41 (Building, amber). No other step moved. Survival is 15% of the Runway Score, so an account with a runway in that range shows a Runway Score 1 or 2 points higher than the day before with nothing else changed, and its Survival bar went from red to amber.`;

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

**Survival Score** (15%), v${SCORE_VERSION}. The score follows the cash runway's band (survival-engine.ts; the bands are in the Survival playbook), a step per month inside a band, so the Survival bar is the colour of the Cash Runway number beside it: ${SURVIVAL_SCORE_BAND_BY_RUNWAY_BAND}. The ladder (runway-score-engine.ts, survivalSubScore):
| Cash runway | Runway band | Survival score | Score band | Colour of both |
|-------------|-------------|----------------|------------|----------------|
${SURVIVAL_SCORE_ROWS}
- Not configured (no cash reserve or costs entered) → ${SURVIVAL_SCORE_NOT_SET} (incomplete data penalty — previously 50 in v1.1). This one is not a band: the Cash Runway number reads "Not set" in gray while the Survival bar is red, because ${SURVIVAL_SCORE_NOT_SET} is an ${stateLabel(SURVIVAL_SCORE_NOT_SET)} score. Entering a cash reserve in Settings replaces the penalty with the runway's own score.

${SURVIVAL_SCORE_CHANGED_V14}

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

**Colours** (one table: RUNWAY_SCORE_BANDS in runway-score-engine.ts, read through bandColorHexForScore). The score and each of its five component sub-scores take the colour of the band the number is in: Strong is green, On Track is blue, Building is amber, At Risk is red. A component's bar is coloured by its own sub-score, not by the overall score, so a Strong score can sit above an amber or red component. It is the same on the dashboard, the Reports page, the business report PDF, the weekly digest email and the mobile app's Runway Score Breakdown sheet. Gold is only the overall score's gauge when the score is Strong. A component bar is never gold.

Changed 2026-10-13: until then four places coloured these numbers their own way. The mobile breakdown sheet cut at 75 / 50 / 30, so a component of 75–80 was green on the phone and blue on the web, 50–60 was blue on the phone and amber on the web, and 30–40 was amber on the phone and red on the web. The business report PDF cut at 80 / 60 / 40, so a component of exactly 80, 60 or 40 was one band higher in the PDF than on the dashboard. The weekly digest email coloured the overall score green from 80, amber from 60 and red below, with no blue: a score of 61–79 that was amber in the email is now blue, 41–59 that was red is now amber, and exactly 80 that was green is now blue. The Reports page drew a component of 81 or more in gold, and it is now green. No score moved, only its colour. A PDF exported or an email received before that date shows the old colours.

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
- Is expense ratio above Agent Runway's target of ${EXPENSE_RATIO_COPY.target}? (15%)
- Is cash reserve not set? (survival score defaults to ${SURVIVAL_SCORE_NOT_SET} → only ${SURVIVAL_SCORE_NOT_SET * 0.15} of 15 points)
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
- Goals are per calendar year (Settings → Annual Goal → pick the year). A year set to $0 is a deliberate "no goal / write-off" year: Pace stays neutral and you should NOT push them to set one. Their future-year goals are in the "Income goals by calendar year" context line; next year's goal takes over on January 1.

**"How do I set my goal for next year?"**
→ Settings → Annual Goal → choose the calendar year → enter the GCI target → Save. Or ask me ("set my 2027 goal to $80,000"). Setting a future year doesn't change this year's pace or projections; it takes over on January 1. Each year is separate: a year nobody set has no goal (nothing carries forward), so from October 1 the dashboard prompts for next year's goal. The dashboard's year switch (this year | next year) shows next year as a plan: goal, pipeline already expected to close that year, deals still needed, monthly targets, and estimated take-home at goal. The take-home deducts the business expenses expected that year: each Recurring Expenses entry by its charge dates in that year, plus 12 months of the "/mo" figures on expense items.
- Zero GCI: Expense score defaults to 50 (neutral)
- Cash reserve = $0 or not set: Survival score = ${SURVIVAL_SCORE_NOT_SET} (incomplete data penalty — not 50)
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // TAX
  // ═══════════════════════════════════════════════════════════════════════════
  tax: `## TROUBLESHOOTING: TAX ESTIMATES

IMPORTANT: Always include this disclaimer once in tax-related responses: "These are estimates for planning purposes — consult a qualified accountant or tax professional for filing."

### How Tax is Calculated (exact formula from canadian-tax-engine.ts)

**Input**: Net self-employment income (after expenses, before tax)
Net SE Income = Projected Annual GCI × Agent Split% − Annual Expenses
Annual Expenses = expenses year to date + what is still to come this year (expense-totals-engine.ts, remainingYearExpenses): the per-item "/mo" figures for the months after this one, plus the Recurring Expenses list's charges after today. Each recurring charge of the year is counted once, on its date: an annual fee is in the year in full whether its date has passed or not, and a monthly charge due later this month is in "still to come" until its day.
Annual Expenses for a GST/HST registrant are net of the GST/HST claimed as input tax credits (expense-totals-engine.ts; see the Expenses playbook). For a non-registrant they are the amounts paid, GST/HST included.

### T2125 pre-fill: what feeds the expense lines
Reports → T2125 computes lines 8521 to 9369 from expenses incurred to date (t2125-expenses-engine.ts, buildT2125Expenses, then computeT2125). Nothing is projected forward.
- Receipts by expense item, or the item's "/mo" figure x months elapsed where that is larger.
- Receipts saved with no category (line 9270).
- Every active entry in the Recurring Expenses list, for the occurrences so far this year. Added 2026-10-13: before that the list was left out of every T2125 line, so line 9369 was too low and net business income (line 8270) and the T2125 tab's tax figures were too high by that amount.
- Home Office bills are not expense lines: they are costs behind line 9945.
The Expenses page "Est. Tax Deductible YTD" card is the same calculation, so line 9369 equals that card less its Home Office part. The dashboard's and the Reports headline's YTD Expenses are the same lines before the limits (ytdExpenseTotals), so they equal the Expenses page's YTD Expenses.
The T2125 tab's tax figure is on year-to-date income and expenses. The dashboard and Forecast estimates are on projected annual figures, so the two are different numbers by design.

**Step 1: CPP/QPP** (self-employed pay both halves)
- CPP1: 11.90% on income between $3,500 (basic exemption) and $74,600 (YMPE ${TAX_YEAR})
  - Max CPP1 = ($74,600 − $3,500) × 11.90% = $8,460.90
- CPP2: 8.00% on income between $74,600 (YMPE) and $85,000 (YAMPE ${TAX_YEAR})
  - Max CPP2 = ($85,000 − $74,600) × 8.00% = $832.00
- QPP (Quebec): CPP1 equivalent = 12.80%, CPP2 = 8.00%
- Deductions: 50% of CPP1 is deductible from taxable income. 100% of CPP2 is deductible.

**Step 2: Taxable Income**
Taxable Income = Net SE Income − (CPP1 × 50%) − (CPP2 × 100%) − RRSP contributions

**Step 3: Federal Tax** (${TAX_YEAR})
Brackets: $0–$58,523 @ 14%, $58,523–$117,045 @ 20.5%, $117,045–$181,440 @ 26%, $181,440–$258,482 @ 29%, $258,482+ @ 33%
Basic Personal Amount (BPA): $16,452 credit at 14% = $2,303.28 reduction
Quebec abatement: Federal tax × 83.5% (16.5% reduction)

**Step 4: Provincial Tax**
Each province has its own brackets + surtaxes (e.g., Ontario surtax: 20% on tax >$5,710, 36% on tax >$7,307)

**Step 5: Total Tax**
Total = Federal Tax + Provincial Tax + CPP1 + CPP2
Effective Rate = Total Tax ÷ Net SE Income

**Step 6: Per-Deal Tax Portion**
Per Deal = Total Annual Tax Estimate ÷ Projected Deal Count

**Step 7: Quarterly Instalments**
Quarterly = Total Annual Tax ÷ 4
Required when annual tax owing >$3,000 (>$1,800 in Quebec)

### GST/HST
- Registration (CRA small supplier rule): required once revenue from worldwide taxable supplies, before expenses, is over $30,000 in a single calendar quarter or over the last four consecutive calendar quarters. That is commission revenue, not net income, and the periods are calendar quarters, not a calendar year or a rolling 12 months. At or under the limit a person is a small supplier and registration is optional. Source: canada.ca, "When to register for and start charging the GST/HST". Whether an agent is over the limit is their accountant's call; state the rule, do not apply it.
- Rates: 5% (AB, BC, MB, SK, territories), 13% (ON), 14% (NS), 15% (NB, NL, PE)
- Quebec: 5% GST + 9.975% QST = 14.975% combined
- Input Tax Credits (ITCs) offset GST paid on business expenses
- Net Payable = GST collected on GCI − ITCs claimed
- A registrant's expense totals everywhere in the app are net of those ITCs, so the same GST/HST is not counted as both an ITC and a business expense (CRA T4002 ch. 3: deductible expenses include the GST/HST incurred, less any input tax credit claimed). A non-registrant claims no ITCs, so their expenses include the GST/HST paid.

### Corporate Tax (CCPC — canadian PREC or corp)
- Federal SBD: 9% on first $500K active business income
- Federal General: 15% on income above $500K
- SBD phase-out: $5 reduction for every $1 of adjusted aggregate investment income (AAII) over $50K
- Provincial SBD rates: 0% (MB, YT) to 3.2% (ON, QC). NS is 1.5% (reduced from 2.5% Apr 1, 2025); NS provincial SBD limit raised to $700K. PE provincial SBD limit $600K. SK provincial SBD limit $600K.
- Non-eligible dividend gross-up: 15%
- Federal DTC (dividend tax credit): 9.0301% of grossed-up amount
- Compensation methods: Salary (generates RRSP room, CPP-deductible), Dividends (no RRSP room, no CPP), Mixed

### RRSP
- Limit: 18% of prior year earned income, max $33,810 (2026)
- Dividends do NOT generate RRSP room — only salary/self-employment income does
- PREC/corp owners paying only dividends: $0 RRSP room

### Common Problems & Diagnostics

**"My tax estimate seems too high/low"**
1. Check province setting — wrong province = wrong provincial brackets
2. Check if GST/HST is included — some users confuse income tax with GST obligations
3. Check business structure — sole prop vs PREC vs corp have different rates
4. Check if expenses are entered — expenses reduce net income → lower tax
5. Check RRSP contributions entered in settings
6. T2125 tab figures that went DOWN on 2026-10-13 with no new data (higher line 9369, lower net business income): the Recurring Expenses list started counting on the T2125 lines that day, along with receipts that had no category, a custom item, or a whole category instead of an item. They were already in the dashboard total and the dashboard estimate.
7. GST/HST registrant whose estimate went UP on or after 2026-10-13 with no new data: before that date expense totals still included the GST/HST that the GST34 also claims as ITCs, so expenses were overstated and the estimate was low. In a 15% HST province that was $15 of every $115 on taxed expenses. Totals are now net of ITCs. Explain the change; do not describe it as money owed.

**"How much should I set aside per deal?"**
→ Direct them to Forecast page → Tax Estimates card ("Per-deal tax portion"). Formula: Annual tax estimate ÷ projected deal count. State it as the engine's estimate of the tax each deal carries. Do not give a percentage of a commission and do not tell them what to do with the money.

**"How much of THIS commission is tax?" / "What is 'Income tax and CPP (estimate)' on the deal-close screen?"**
→ The tax portion of one commission = this year's tax estimate × that commission ÷ projected year-end GCI. The year's estimate is the dashboard Tax Readiness card's total (federal + provincial income tax + CPP on projected net business income). The deal-close screens (dashboard "Closing Day" prompt, Transactions → Pipeline → close) print it for the commission just closed, with the deal already counted as closed, and the note under the row gives the three figures used. It is the same definition as the Per-deal tax portion: that one divides the year's estimate evenly across projected deals, this one gives a commission its share by size, and the two are equal for a deal of the projected average size. Income tax is worked out on net income for the whole year, so this is a share of the year's estimate, not a tax charged on the deal. State the dollar estimate. Do not state a percentage of the commission or a marginal rate, and do not tell them what to do with the money.

**"The tax on my closed deal is lower than it used to be" / "It used to say Income tax reserve"**
→ Changed 2026-10-13. The row was "Income tax reserve" = the commission × a marginal rate (the rate on the next dollar, looked up at GCI instead of net income, CPP left out), so the top rate was applied to the whole commission. It is now the tax engine's estimate as defined above, CPP included. No tax rate, bracket or setting changed, and no other screen's figure moved. An incorporated agent's row uses the personal estimate on the Tax Readiness card, not the Corporate Tax Estimate card.

**"Should I incorporate?"**
→ This is a professional advice question. Explain the tax deferral advantage (combined SBD rate ~12-14% vs personal 30-50%) but emphasize it depends on their total income, retention needs, and accountant guidance. NEVER recommend incorporating — only explain the math.

**"What's my effective tax rate?"**
→ (Federal + Provincial + CPP) ÷ Net self-employment income. Give the user's own figure from the tax estimate ("Effective Rate"). Do not quote a typical range: the rate depends on province and net income.

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

### Terminal Stages (closed / lost)

Two stages are terminal: **closed** and **lost** (TERMINAL_PIPELINE_STAGES in database.ts). Terminal rows are NOT deleted — a converted deal keeps its row at stage='closed', and a prospect marked lost keeps its row at stage='lost' — but every active-pipeline aggregate excludes them via the canonical activePipelineDeals() filter: weighted GCI totals, deal counts, and by-stage breakdowns all count active deals only. A probability_override on a terminal row does not resurrect it; the filter runs on stage alone.

### Pipeline Impact on Other Metrics

1. **Runway Score**: Pipeline Score = 30% weight. Weighted GCI vs remaining goal gap.
2. **Projected Year-End GCI**: Closed YTD ÷ seasonal fraction + (pipeline weighted GCI × 50%)
3. **Goal Gap Analysis**: Remaining deals needed = (Goal − YTD GCI − Pipeline Weighted) ÷ avg deal size
4. **Forecast Page**: Pipeline feeds probability bands and waterfall chart

### Converting Pipeline Deals

When a deal closes: Pipeline deal → Closed transaction
- Two places record it, and both do exactly the same thing (record-pipeline-deal-close.ts): Transactions → Pipeline → the green check ("Mark as Closed") → Close Deal ✓, or the dashboard's "Closing Day" prompt → Yes, it's closed → Register & Close
- This creates a new closed transaction with the pipeline data pre-filled, linked to the pipeline row (pipeline_deal_id)
- The pipeline row is kept at stage='closed' (terminal) — it disappears from the Pipeline tab and from all active-pipeline totals, but the row itself is not deleted (Forecast accuracy compares its original estimate with the sale price)
- ALL downstream metrics recalculate: GCI, pace, tax, score, etc.
- A celebration opens with a "Commission breakdown" (GST/HST collected, "Income tax and CPP (estimate)", Fun money, Rest of this commission). See the Transactions playbook for how each row is worked out.
- Moving a deal to the Closed stage some other way (the Flight Crew's stage change, the mobile Deals screen) does NOT record a transaction. The Closing Day prompt then asks about it on its expected close date.

### Closing Day Prompt (dashboard)
A pop-up on the dashboard for each pipeline deal that is due and not yet recorded (dealsAwaitingCloseConfirmation in database.ts):
- Listed: stage Firm or Closed, expected close date today or earlier, and no transaction linked to the row
- Never listed: a deal already recorded from either close screen (it has a linked transaction), a deal with no expected close date, a deal due after today, or a deal at an earlier stage
- "Yes, it's closed" → confirm the final numbers → Register & Close: the same write as Transactions → Pipeline → Close Deal ✓ (above). The deal does not come back.
- "It's been delayed — update date" → sets a new expected close date; the prompt asks again on that date
- "Check back tomorrow morning" → hides that deal for the rest of today, on this browser only
Changed 2026-10-14: a deal closed from Transactions → Pipeline came back to this prompt every day, and Register & Close recorded it a second time (a new unlinked transaction) and deleted the pipeline row. No agent's data had been affected.

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
5. Closed/lost rows are excluded from all pipeline totals and counts (2026-07 fix) — if a total or deal count dropped without any deal edits, terminal rows that previously inflated it are the likely cause; the current number is correct

**"I converted a deal but my GCI didn't change"**
1. Check if the converted deal has the correct sale price and commission
2. Check if the deal date is in the current year
3. Check if status is "closed" (not "pending" or "fallen")
4. GCI updates should be instant — try hard refresh

**"Pipeline is empty but I have deals"**
→ Check if all deals are in the "Deals" tab (closed) vs "Pipeline" tab (in-progress). Pipeline only shows active deals, not closed ones.

**"The Closing Day prompt keeps asking about a deal I already closed"**
1. A deal recorded from Transactions → Pipeline or from the prompt itself is linked to its pipeline row and is not asked about again (since 2026-10-14).
2. If they added the closed deal by hand (Transactions → Deals → add) instead, nothing links it to the pipeline row, so the prompt still asks. Pressing Register & Close would record the deal a second time. Instead, remove the pipeline deal: Transactions → Pipeline → delete, or ask the Flight Crew to remove it.
3. If they think a deal was recorded twice, have them compare Transactions → Deals for two rows with the same address and close date, and delete the extra one there.

**"How many deals do I need?"**
→ (Annual Goal − YTD GCI − Pipeline Weighted GCI) ÷ Average Deal GCI. Show them the Goal Gap analysis on the Forecast page.

**Edge Cases:**
- Pipeline deal with $0 estimated price: Contributes $0 to weighted GCI
- Fallen deal: Status "fallen" — excluded from all active calculations
- Lost pipeline deal: stage "lost" (terminal) — row survives but is excluded from every pipeline aggregate, even with a probability_override set
- Both-sides deal in pipeline: Ensure commission% reflects total (e.g., 5% for both sides, not 2.5%)
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════
  expenses: `## TROUBLESHOOTING: EXPENSES

### Expense Ratio Calculation
Expense Ratio = Total YTD Expenses ÷ YTD GCI

**Bands** (one table: EXPENSE_RATIO_BANDS in packages/core/engines/expense-ratio-bands.ts. The Runway Score, the insight and advisor cards, the dashboard, Expenses, Reports and the report PDFs all read it, so a ratio is in the same band and the same colour everywhere):
${expenseRatioBandsList()}

${EXPENSE_RATIO_COPY.targetSentence} ${EXPENSE_RATIO_COPY.provenance} Never present it as an industry figure: there is no published figure behind it.

Colours: well within target is green, within target is blue, above target is amber, well above target is red. No GCI yet, or no expenses recorded, has no band and shows grey.

What starts above target: the dashboard's "Expense ratio is above target" alert, the "Expense Check" insight (a tip), and the "Trim Expenses to Target" advisor card. The advisor card uses the year's projected ratio (expenses to date plus still to come, over projected GCI), and its saving is the amount above the target. Well above target the insight becomes a "High Expense Ratio" warning.

Changed 2026-10-13: until then the screens disagreed. Reports and its PDF showed a 25–30% target and turned amber past 30%; the Expenses page showed the same target but stayed green to 35%; the insight cards and Flight Crew quoted a 25–35% "industry average". So a ratio between 30% and 35% that was amber on Reports is now within target (blue) everywhere, and a ratio between 25% and 35% that was green on Expenses is now blue. The Runway Score's cut-offs did not change, so no score moved. The advisor card used to appear above 30% and measure its saving to 25%; it now appears above the target and measures to the target, so it appears less often and with a smaller figure.

### GST/HST in expense totals (registrant vs not registered)
Source of truth: packages/core/engines/expense-totals-engine.ts (expenseNetOfItc, aggregateReceiptTotals, recurringExpensesNetOfItc). Every surface that totals expenses calls it: Expenses page KPIs and category rows, Est. Tax Deductible YTD, Reports and the T2125 lines, dashboard, overhead, forecast, altimeter, scenarios, cash position, weekly digest, Flight Crew context and tools, mobile.

CRA rule (T4002 ch. 3, and canada.ca "Business expenses"): deductible expenses include the GST/HST incurred on them, less any input tax credit claimed.
- **Registered** (user_settings.gst_hst_registered = true; toggle on Reports → T2125 → "GST/HST Registered?"): expense totals are NET of the ITCs the GST34 summary claims.
- **Not registered**: no ITCs, so expense totals are the full amounts paid, GST/HST included.

What comes off one expense (always the same ITC the GST34 summary claims, via itcForExpense):
| Expense | GST/HST that comes off | What stays |
|---|---|---|
| Ordinary (ads, software, dues, fees) | All of it | Amount before GST/HST |
| Meals & entertainment | Half (CRA's 50% ITC limit) | Amount before GST/HST plus the other half; the 50% deduction limit then applies to that |
| Vehicle, business use over 10% | All of it: the business share is the ITC, the personal share is a personal cost | Amount before GST/HST; the business-use % then applies to that |
| Vehicle, business use 10% or less | None (no ITC) | Full amount paid |
| Home Office bill, home office % over 10% | All of it: the home office share is the ITC, the rest is a household cost | The home office share of the amount before GST/HST. Nothing else: the household share of the bill is not a business expense |
| Home Office bill, home office % 10% or less | None (no ITC) | The home office share of the full amount paid |
| No GST/HST amount entered (tax blank or 0) | None | Full amount paid |

Worked example, 15% HST, $115 paid with $15 HST:
- Office supplies: counts as $100.
- Client meal: counts as $107.50; $53.75 is deductible (50%).
- Fuel at 80% business use: counts as $100; $80 is deductible. The ITC is $12; the other $3 of HST is personal use.
- Power bill (Home Office) at a 15% home office share: counts as $15.00 and all $15.00 is the line 9945 amount. The ITC is $2.25. Not registered: counts as $17.25.

Home Office bills are the one case where the total is NOT the whole expense. Vehicle costs stay whole in the totals and take their business-use % only in the deductible figures; a home bill counts at the home office share everywhere, because most of it is a household cost.

Recurring expenses work the same way: amount is what is charged, hst_amount is the GST/HST inside it, and the vehicle toggle applies the vehicle rule.

Still shown as paid (GST/HST included): each receipt, the receipt log and its CSV/PDF, and the Recurring Expenses list with the two "as charged" figures under it ("Monthly avg" and the year total, for example "2026 total").

### YTD Expenses, Est. Tax Deductible YTD and the T2125 lines (one calculation)
Source of truth: packages/core/engines/t2125-expenses-engine.ts (ytdExpenseTotals, which builds its lines with buildT2125Expenses). Every surface that shows or uses year-to-date expenses calls it, so "YTD Expenses" is one figure everywhere: the Expenses page, the dashboard, the Reports headline and its "Expenses by Category" table, Forecast, Overhead, Altimeter, Scenarios, Flight Crew's context and the [EXPENSE DIAGNOSTIC], the weekly digest and the Claude Connector. The same lines give the "Est. Tax Deductible YTD" card, the Deductible column and the T2125 expense lines. Line 9369 on the T2125 tab = the card's total less its Home Office part (Home Office is line 9945).

YTD Expenses = the sum of the three sources below. Monthly Recurring = the "/mo" figures on expense items plus the monthly equivalent of each active Recurring Expenses entry that has not ended, from the same call. An entry with an end date leaves Monthly Recurring the day after that date and keeps its year to date (see the Recurring Expenses playbook).

The "Business expenses" row of next year's plan (the dashboard's year switch) is not Monthly Recurring x 12: it is next year's own figure from the same call (expensesNextYear), the "/mo" figures on expense items for 12 months plus each Recurring Expenses entry by the charge dates that fall in that year, so an entry with an end date counts up to it and one that starts during that year counts from its start date. Receipts are not carried into next year. Changed 2026-10-13: before that the row was Monthly Recurring x 12, which counted an entry known to stop for the whole of next year.

What it counts, to date only (no future month or charge):
| Source | Amount |
|---|---|
| Receipts under an expense item | The receipts, or the item's "/mo" figure x months elapsed (current month included) where that is larger. The larger counts, not the sum: the "/mo" figure is the estimate and the receipts are the actuals for the same spending |
| Receipts with no category | Counted once, 100%, line 9270. Shown as "Not in a category above" under the Categories table |
| Recurring Expenses list (active entries) | Each charge that has happened so far this year, on or after the entry's start date (and up to its end date, when it has one). Monthly: on its charge day each month, so this month's charge is not in until that day. Quarterly and annual: only charges whose date has passed. These are the same charges the GST34 summary counts for input tax credits |

Limits applied (the app's estimate of CRA's rules, for review with an accountant):
- Meals & entertainment: 50%.
- Vehicle costs: x vehicle business-use %. A recurring expense with "Apply vehicle business-use % to this expense" ticked takes the vehicle % whatever its category and shows on line 9281. A Vehicle category takes it whether or not the box is ticked. The GST34 summary applies the same rule to its GST/HST.
- Home Office bills: already at the home office share; 100% of that.
- Everything else: 100%.

Expenses not filed under one of the standard items are not dropped (they were until 2026-10-13):
- No category, a custom item, or an item of a category the page doesn't show (corporate admin, payroll): line 9270 Other Expenses at 100%. Filing the expense under a specific item moves it to that item's line. The T2125 tab notes how much of line 9270 is this.
- Still filed under a whole category (see "Expense items" below; existing ones were moved to items on 2026-10-13): counted as that category's first-choice item, with that item's line and limit.
- On the Expenses page these show inside their category as "No item chosen" or under the item's name, or in the "Not in a category above" row.

Changed 2026-10-13: the Recurring Expenses list now counts in Est. Tax Deductible and on the T2125 lines (it was in YTD Expenses only), and recurring rows in the Categories table show a real Deductible amount (50% or the vehicle %) instead of repeating the YTD amount. Also 2026-10-13: a monthly recurring entry counts each charge from its charge day. Before, the current month counted from the 1st (or from the day of the month the entry started on), so on the 13th an entry charged on the 20th showed one more charge here than in the GST34 summary.

Also changed 2026-10-13: one YTD Expenses figure on every screen. Before that date the Expenses page and the T2125 lines compared receipts with the "/mo" figure item by item (as in the table above), while the dashboard, Reports headline, Forecast, Overhead, Altimeter, Scenarios, Flight Crew, the weekly digest and the Connector compared the receipt TOTAL with the "/mo" TOTAL and kept the larger, which left the smaller side out whole. An account with "/mo" figures on some items and receipts on others read lower on those screens than on its Expenses page. They now all use the item-by-item figure. For such an account YTD Expenses on those screens went UP that day with no data change, and everything built on it moved with it: expense ratio and the Runway Score expense sub-score, net income, the tax estimate, cash position and cash runway. An account with no "/mo" figures saw no change.

Reports → "Expenses by Category" (table, donut and the business report PDF), same date: each category row is that category's receipts, "/mo" figures and Recurring Expenses entries, with a last row "Not in a category" for receipts saved with no category or filed under a category that isn't listed. The YTD column adds up to YTD Expenses and the Monthly column to Monthly Recurring. Before that date the rows listed receipts only, under a Total that also held the "/mo" figures and the Recurring Expenses list, so the rows came short of the Total. The Expenses page's Categories table groups the same lines the same way.

### Expense Categories — CRA T2125 Mapping

Source of truth: packages/core/engines/t2125-engine.ts (t2125LineForExpenseKey, which reads the expense key map). Mirrors the CRA T2125 form / T4002 publication.

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
| 9270 | Other Expenses | Business gifts, courses & coaching, conferences, books & materials, misc catch-all. Also any expense under a custom item or with no category |
| 9281 → CCA Class 10/10.1 | Vehicle CCA | Tracked separately on the CCA schedule, not in 9281 above |
| 9936 | Total CCA | Sum of all CCA classes |
| 9945 | Business-Use-of-Home | Actual-cost method only (Canada has no IRS-style $5/sqft). Fed by the Home Office expense category (home_utilities, home_internet, home_insurance, home_maintenance, home_property_tax, home_mortgage_interest, home_rent, home_condo_fees) and/or the home office estimates, × home office %. Never part of 9369 |
| 8200 | Gross Commission Income | Reported revenue line |
| 9369 | Total Expenses | Sum of expense lines (engine variable: line9369_totalExpenses) |
| 8270 | Net Business Income | 8200 − 9369 − 9936 − 9945 |

Common "wrong line number" question: legacy notes/screenshots may cite 8210/8211/8212/8213/8215/8216/8220/8226/8228 — those are NOT used by the engine or the CRA T2125 today. If a user references one, point them to the canonical line above.

### Expense items: what a receipt or recurring expense is filed under
Every receipt and recurring expense is filed under an expense ITEM (receipt_expenses.category_key / recurring_expenses.category_key), not a whole category. One list, shared by the receipt form, the recurring expense form, voice capture and Flight Crew (apps/web/lib/types/receipt.ts, RECEIPT_CATEGORY_GROUPS):
- Vehicle: Fuel / Gas, Service & Repairs, Insurance, Vehicle Payment
- Marketing: Ads, Photography & Video, Print, Client Gifts
- Office & Tech: Office Supplies, Software Subscriptions, Phone & Internet, Hardware & Equipment
- Professional Fees: Board / MLS Dues, Licensing & Renewals, E&O Insurance, Accounting & Bookkeeping (legal fees go here)
- Education: Courses & Coaching, Conferences, Books & Materials
- Meals: Client Meals, Team Meals
- Entertainment: Client Entertainment, Events & Tickets
- Home Office: Electricity, Heat & Water; Home Internet; Home Insurance; Repairs & Maintenance; Property Tax; Mortgage Interest; Rent; Condo Fees (bills for the agent's own home, logged in full)
- Other: Miscellaneous

The item decides three things: the row the expense shows under on the Expenses page, its T2125 line (table above), and which CRA limit applies (vehicle items: business-use %; Meals and Entertainment items: 50%; Home Office items: the home office share, on line 9945; everything else: 100%).

**Flight Crew logging (logExpense, updateExpense, createRecurringExpense):**
- Flight Crew picks the item from that same list. The approval card for a new expense or recurring expense names the item, and any GST/HST, before it is saved.
- GST/HST is recorded only when the agent states it or reads it off the receipt or bill. Flight Crew never works it out from a rate or the province. With no GST/HST recorded, the expense counts in full and no input tax credit is counted on it. Flight Crew says so to a GST/HST registrant when it saves one without GST/HST.
- A recurring expense takes the GST/HST inside each charge ("$115 a month, $15 of that is HST"): createRecurringExpense hstAmount, stored as hst_included on with that hst_amount. Added 2026-10-13. Before that date Flight Crew could not record GST/HST on a recurring expense, so every recurring expense it set up until then has none.
- The recurring expense form on the Expenses page is the one place an amount is worked out: ticking "This amount includes HST" there fills the GST/HST in from the province rate unless an amount is typed in the Override box. Flight Crew never does this.
- GST/HST can be added later. A receipt: tell Flight Crew the amount (updateExpense), or open the receipt on the Expenses page and fill in the tax field. A recurring expense: edit the entry in the Recurring Expenses list on the Expenses page, tick "This amount includes HST" and type the amount from the bill in the Override box. No Flight Crew member can edit an existing recurring expense yet.
- There is no travel item. Flights and hotels go under Other: Miscellaneous unless the agent names another item.

### Mileage Calculation (CRA 2025 rates)
- First 5,000 km: $0.72/km
- After 5,000 km: $0.66/km
- Deduction = (min(totalKm, 5000) × $0.72) + (max(totalKm − 5000, 0) × $0.66)
- Must be business-use km only (personal excluded)

### Receipt OCR
Camera capture → image uploaded to Supabase Storage → /api/receipts/process for OCR extraction → fields pre-filled (vendor, amount, date, category suggestion) → user reviews and saves.

### Expense Impact on Other Metrics
1. **Tax Estimate**: Expenses reduce net SE income → lower tax. For a registrant the expenses are net of ITCs, so GST/HST that is claimed back does not also reduce income.
2. **Expense Ratio**: Feeds into Runway Score (15% weight)
3. **Survival Runway**: Monthly recurring expenses increase burn rate → shorter runway
4. **Advisor Cards**: "Trim Expenses to Target" appears when the year's projected expense ratio is above Agent Runway's target (${EXPENSE_RATIO_COPY.target})
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

**"The report PDF shows a different percentage beside my expense ratio" / "It says 66% next to 33%"**
→ Fixed 2026-10-13. The expense ratio bar in the business report PDF (Expenses page) is drawn on a 0 to 50% scale, the same as the bar on the Reports page. A PDF downloaded before that date printed how full the bar was at the right of the label, which is twice the ratio: "66%" beside "Expense Ratio · 33.0% of GCI". The ratio in the label was the correct figure and nothing was calculated differently. The bar now prints the ratio itself ("33.0%"), as the Reports page does. The "Annual GCI Goal Progress" bar had the same fault once GCI passed the goal: it printed "100%" beside, say, "$250,000 of $200,000", and now prints the real share (125%). Downloading the PDF again gives the corrected figures.

**"My expense total is lower than my receipts add up to" / "My expenses dropped on October 13" / "Expenses don't match my bank statement"**
1. Check gst_hst_registered. If true, this is expected: totals are net of the GST/HST claimed as input tax credits. The receipts still show what was paid.
2. The gap is the ITCs on the GST34 summary, plus the personal-use share of vehicle GST/HST.
3. The [EXPENSE DIAGNOSTIC] "The same expenses with GST/HST included" figure is the total with that GST/HST left in (what someone not registered would see), to compare. Home Office bills count at the home office share in both figures, so neither equals the receipts added up when there are home bills.
4. Before 2026-10-13 totals included that GST/HST, so a registrant's totals went down that day with no data change.

**"I'm registered but my expense total still includes the HST"**
1. Check the GST/HST amount on the receipts. Quick-add expenses, expenses logged through Flight Crew without a stated GST/HST amount, and receipts saved with a blank tax field have no GST/HST recorded, so they count in full and no ITC is claimed for them. Editing the receipt to add the tax amount updates both the GST34 summary and the totals.
2. Check recurring expenses: GST/HST comes off an entry only when "This amount includes HST" is on with an HST amount. An entry set up through Flight Crew has GST/HST only if the agent stated the amount, and none if it was set up before 2026-10-13. Editing the entry in the Recurring Expenses list adds it.
3. Some costs carry no GST/HST (insurance premiums, most government fees), so nothing comes off those.
4. Confirm the registered toggle (Reports → T2125 → "GST/HST Registered?").

**"An expense I logged through Flight Crew isn't on the Expenses page" / "My Expenses page total was lower than my dashboard" / "A receipt moved to a different row on October 13"**
1. Before 2026-10-13 Flight Crew filed expenses under a whole category (for example "Vehicle") instead of an expense item. Those expenses were in the dashboard total but under no row on the Expenses page, so that page's YTD Expenses, expense ratio and Est. Tax Deductible left them out, and they reached no T2125 line.
2. Fixed 2026-10-13. Flight Crew now files under an item, and existing expenses filed under a category were moved to that category's first-choice item: Vehicle → Fuel / Gas, Marketing → Ads, Office & Tech → Office Supplies, Professional Fees → Accounting & Bookkeeping, Education → Courses & Coaching, Meals → Client Meals, Entertainment → Client Entertainment, Other → Miscellaneous.
3. Within a category every item has the same deductible share and the same input tax credit rule, so the move changed neither. On the Expenses page those expenses now count where they were missing before.
4. If one belongs under a different item (a repair filed as fuel, board dues filed as accounting), open the receipt on the Expenses page and change its category, or ask Flight Crew to update it.

**"Flight Crew logged my expense but there's no ITC on it"**
→ Flight Crew records GST/HST only when the amount is stated. With none recorded, no input tax credit is counted and the expense counts in full. Giving Flight Crew the GST/HST from the receipt, or adding it to the receipt on the Expenses page, updates the GST34 summary and the totals.

**"My totals match QuickBooks now" / "QuickBooks shows a lower expense total than my receipts"**
→ Accounting software reports a registrant's expenses net of recoverable sales tax. Agent Runway does the same for registrants.

**"I'm not registered. Why do my expenses include HST?"**
→ Without registration there are no input tax credits, so the GST/HST paid is part of the cost (CRA T4002 ch. 3). Whether and when to register is a question for their accountant.

**"My recurring expenses aren't in my T2125" / "My lease isn't in Est. Tax Deductible" / "Est. Tax Deductible is lower than my expenses"**
1. Since 2026-10-13 active entries in the Recurring Expenses list count on both. Before that date they did not, which was a bug.
2. Check the entry is active and its start date has passed.
3. Quarterly and annual entries count only once their charge date has passed this year.
4. A vehicle entry counts at the vehicle business-use %, and a meal at 50%, so its Deductible amount is lower than its YTD amount. That is the limit, not a missing expense.
5. Home Office bills count at the home office share and sit on line 9945, not in line 9369.

**"My Est. Tax Deductible / T2125 expenses went up on October 13" / "My T2125 net income dropped"**
→ No data changed. The Recurring Expenses list started counting in Est. Tax Deductible and on the T2125 lines that day. It was already part of YTD Expenses.

**"Why is the Deductible amount on my lease less than the YTD amount?"**
→ Vehicle costs count at the vehicle business-use % (Expenses → Est. Tax Deductible → "Vehicle biz use"). The row shows the % beside the amount.

**"Why is this expense on line 9270 Other?" / "What is 'No item chosen' / 'Not in a category above'?"**
→ The expense has no category, or is under a custom item, so there is no T2125 line of its own for it. It counts in full on line 9270. Editing the receipt or recurring expense and choosing a specific item moves it to that item's line. "No item chosen" is an expense filed under the whole category; it counts as that category's first-choice item.

**"My dashboard / Reports expenses went up on October 13" / "My Runway Score, net income or tax estimate changed on October 13 with no new data" / "The Expenses page total used to be higher than the dashboard's"**
1. Check for "/mo" figures on expense items alongside receipts on other items. Before 2026-10-13 the dashboard, Reports, Forecast, Overhead and Flight Crew left the smaller of those two groups out; the Expenses page and the T2125 lines counted both. See "one YTD Expenses figure on every screen" above.
2. Since that date every screen shows the Expenses page's figure. No data changed. The Expenses page and the T2125 lines did not move.
3. With no "/mo" figures on any item, this change did not affect the account: look at the GST/HST and Recurring Expenses changes of the same date instead.

**"The Expenses page total doesn't match the dashboard's"**
1. They are one calculation, so with the same data they are equal. The dashboard shows the figure as of when the page loaded; the Expenses page updates as entries, the vehicle business-use % or the home office % are edited. Reloading the dashboard brings it up to date.
2. If they still differ after a reload of both, that is a bug: report it with both figures.

**"The same bill seems to be counted twice" / "My expenses look too high"**
1. Check for the same bill entered two ways: a "/mo" figure on an expense item and an entry in the Recurring Expenses list for the same cost. They are two entries, so both count, on every screen. Clearing the "/mo" box leaves the Recurring Expenses entry as the one record of it.
2. Receipts for a bill and a "/mo" figure on the SAME item are not counted twice: the larger of the two counts for that item.
3. Receipts for a bill that is also in the Recurring Expenses list do both count: the list entry counts by its schedule, whether or not a receipt was saved.

**"The category rows on Reports don't add up to the total"**
→ Since 2026-10-13 they do: each row includes that category's receipts, "/mo" figures and Recurring Expenses entries, and a "Not in a category" row carries the rest. Rows at $0 are hidden. Before that date the rows were receipts only. If they don't add up after a reload, that is a bug: report it.

**"The tax card says I'm not tracking marketing / licensing / meals, but I have receipts" / "Commonly Missed Deductions lists a category I log"**
1. Since 2026-10-13 the "Commonly Missed Deductions" card (the tax cards on the Dashboard, Forecast and Overhead pages, and in the T2125 PDF) treats a category as tracked when any of these is filed under it this year: a receipt, a "/mo" figure on one of its items, or an active entry in the Recurring Expenses list (counted before its first charge of the year too). Before that date receipts and Recurring Expenses entries were not counted on the three pages, which was a bug: only a "/mo" figure was.
2. The five things it looks for: Education (professional development), Professional Fees (licensing, MLS and board fees), Marketing, the Client Gifts item, and Meals or Entertainment (one T2125 line, 8523).
3. A receipt saved with no category counts for none of them. Editing the receipt and choosing an item files it.
4. Source: deductionTrackingFlags in tax-optimization-engine.ts, from the same lines as the Expenses page (t2125-expenses-engine.ts). The card lists categories with nothing recorded; it does not say an expense exists to record.

**"Receipt scan didn't capture correctly"**
→ OCR works best with clear photos, good lighting, and flat receipts. Crumpled/faded receipts may need manual entry.

**"My mileage deduction seems low"**
1. Check total km entered — is it business-only or total?
2. Check vehicle business-use % in Settings
3. The rate drops from $0.72 to $0.66 after 5,000 km

**"What's the difference between YTD and monthly recurring?"**
→ YTD = actual amounts entered/imported this year. Monthly recurring = fixed amounts that repeat (auto-annualized in projections).

**"Meals & Entertainment — why only 50%?"**
→ CRA rule: Only 50% of meals & entertainment costs are deductible. The system tracks the full amount but only claims 50% on T2125 line 8523. For a GST/HST registrant the amount the 50% applies to is the meal less the ITC claimed on it (half its GST/HST).

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
  − Annual expenses (YTD + what is still to come this year: "/mo" figures for the months after this one, and the recurring charges after today)
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

### Client Detail Panel Layout (tabs since 2026-10-09)
Top (always shown): gradient status banner, avatar, stage menu, First/Last Name fields with Save (not auto-save), badges and last contact, quick actions (Call and Text when a phone is on file, Log activity, Add to checklist / On checklist), Flight Status strip. Under it, a tab bar that stays pinned while scrolling:
1. Overview (opens by default): lifetime GCI / deals / last contact strip, Contact information, Address, Details (buyer profile, tags), Mortgage estimate, Relationships
2. Activity (count = open checklist items): Checklist, Activity log (Log activity), Notes, Message history
3. Deals (count = deals): Pipeline deals, Deal History, Showings, Listing appointments, Household activity
4. Flight Crew: What Agent Runway remembers, AI Actions (Ask for Referral, Check In, Request Review, Anniversary Note), Flight Plan templates
Opening a client from the Checklist, or by voice to log a call, lands on Activity. Log activity in the header switches to Activity with the form open.

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

**"The briefing shows an anniversary, a mortgage renewal or 'past client' for a deal that fell through"** / **"Why is a renewal or anniversary reminder missing?"**
→ The briefing ("Today's briefing" on the CRM tab, "Daily Briefing" on the dashboard, "Today's Focus" in the mobile app) reads closings from each client's Deal History. A deal set to Collapsed never closed, so it gives no closing anniversary, home anniversary or mortgage renewal reminder. A Cruising client whose only deal collapsed shows as a long-term contact, not a past client. If the client also has an older deal that did close, that one still counts: renewal reminders follow the most recent deal that closed, and a newer collapsed deal doesn't hide it. If a reminder is missing for a deal that did close, open the client's Deal History and check the deal has a close date and its condition status (next to the condition date) isn't Collapsed. The Lead sources table on the Insights tab also leaves collapsed deals out (Closed and GCI).

**"My Lifetime GCI, Total Deals or repeat rate went down"** / **"Why doesn't a deal count toward a client's GCI, badges or gift budget?"**
→ The Clients page totals count every deal in a client's Deal History except deals set to Collapsed. A collapsed deal never closed, so it adds no GCI and isn't counted as a deal. It's also left out of avg / deal, repeat rate, the client's own Lifetime GCI and Deals, top clients, concentration %, badges (High Yield, Frequent Flyer, Silver Wings, Tailwind Club, First Class), client tiers, the Lead sources table and the closing-gift budget. It stays in Deal History. If it was marked Collapsed by mistake, change its condition status back and the totals return. A deal with no close date still counts, because history imports don't always include one. It's left off only what needs a date: the last deal date, the GCI trend line on hover, and anniversaries. The dashboard's GCI comes from Transactions, not Deal History, so it isn't affected.

**"Save button isn't working"**
→ The Save button commits first name, last name, and notes. Other fields (email, phone, etc.) may save differently. Ensure required fields aren't empty.

**"Client tiers don't seem accurate"**
→ Tiers recalculate based on all clients with transaction history. New clients with no deals start as Bronze. Tiers shift as deal data changes. Collapsed deals don't count toward a client's tier.

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
Flight Control also includes a newsletter builder for mass updates (market reports, seasonal messages). Agent Runway doesn't pick the recipients: the agent pastes their own list into their email tool. The Recipients note on each newsletter lists past clients (including co-buyers on a couple's deal) whose last deal closed more than 2 years ago, because CASL implied consent from a purchase no longer covers them.

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
→ Check suppression: a client contacted in the last 14 days (logged activity, "Log contact", or a draft marked sent) is held back. Dismissing a card stops that reminder from coming back or being drafted. A later reminder (next month's check-in, next year's anniversary) can still appear.

**"I dismissed someone and they came back"**
→ Dismiss is saved (since 2026-10-06) and survives refreshes and other devices. It covers that one reminder: an idle check-in is dismissed until next month's, an anniversary until next year's. Use "Log contact" if you've actually reached them. The toast after dismissing has an Undo button.

**"How do I write a good AI Voice Guide?"**
→ Include: preferred length, opening style, closing style, phrases to use, phrases to avoid, formality level, whether to reference market data. More detail = better drafts.

**"Outreach queue is empty"**
1. No trigger events detected (no birthdays, no stale leads, no recent closes)
2. All active clients were contacted recently (suppression active)
3. Cron may not have run yet today — check timing

**"Scan only shows a few opportunities" / "Why won't other contacts pop up?"**
1. Scan Now shows up to 5 cards, one per client. Dated signals and active leads/clients going quiet (Boarding or In-Flight, 14+ days since contact) come first. Idle past clients (no deal in 18+ months) and repeat-client milestones fill the remaining slots, then up to 2 sphere check-ins (Cruising contacts with no deal, 90+ days since contact). Quiet-lead and sphere cards are call cards: no email draft. Dismissing a quiet lead hides it for the week; dismissing a sphere contact hides it for the quarter.
2. A contact with no closed deal, no birthdate and no first-contact date gives Flight Control nothing to work from. Adding birthdates or linking their deals brings them in.
3. Anyone contacted in the last 14 days (a logged CRM activity, a "Log contact" from a Flight Control card, or a draft marked sent) is held back, so working through the list rotates new people in. Birthday and condition-date cards show regardless.

**"Where did Deal History / the activity log / AI Actions go on the client profile?"**
→ Since 2026-10-09 the client profile has tabs under the header: Overview (contact info, address, details, relationships), Activity (checklist, activity log, notes, messages), Deals (pipeline, Deal History, showings, listing appointments) and Flight Crew (what Agent Runway remembers, AI Actions, Flight Plan templates). Call, Text, Log activity and Add to checklist stay at the top on every tab.

**"Where's my checklist?" / "How do I tick something off and log it?"**
→ Checklist is in the sidebar under CRM (/checklist). Tick the box next to an item. If the item has a client, a pop-up asks how it went: Save to their profile logs the call, text, email or meeting on their profile and ticks it off; Couldn't reach them notes the attempt on their profile and moves it to tomorrow; Just mark done ticks it off without logging anything. The same list shows on the client's profile (Checklist section) and the dashboard Checklist card.

**"I ticked off a checklist item but the client still shows on Flight Control"**
→ Only Save to their profile counts as contact. Just mark done and Couldn't reach them don't log contact, so Flight Control can still suggest them. Birthday and condition-date cards show regardless of recent contact.

**"I logged a note but they still show as not contacted"**
→ Since 2026-10-07 a Note is an internal memo and doesn't count as contact: it doesn't change "last contacted" or "first contacted", so Flight Control, the going-quiet list and "days since contact" ignore it. Log a call, text, email, meeting or showing if you actually reached them. (The mobile quick-capture defaults to Note — pick the real type.)

**"I already called/texted them — how do I get them off Flight Control?"**
→ Click "Log contact" on their card, pick Call / Text / Email / Meeting, add an optional note, Save. It logs the activity in the CRM, removes the card, brings in the next person, and holds that client back from Scan for 14 days. If the client was Cruising or Scheduled, logging a real touchpoint moves them to Boarding.

**"Log Activity says Failed to log activity"**
→ From 2026-04-12 to 2026-10-06 every activity save failed because of a database bug, fixed 2026-10-06. If it still fails, the browser console shows the cause, logged under "[crm] contact_activities insert failed".
4. Memory-powered cards need a current memory profile: CRM, open the client, Flight Crew tab, "What Agent Runway remembers", Build profile / Refresh. Editing the client marks the profile outdated until it is refreshed. So does changing a deal's status in Deal History (to Collapsed, for example).

**"How do I get leads from my website into Agent Runway?"**
→ Settings → Website leads → Connect my website. Copy the key (it's shown once) and add it to your website's settings as AGENT_RUNWAY_INBOUND_KEY. From then on each sign-up, message and unsubscribe arrives as it happens: new people as clients tagged Website, what they did as a note on their Activity tab, and the ones worth a call on your Checklist. The card shows when the last event arrived. Making a new key replaces the old one, so the website stops sending until the new key is pasted in.

**"A website sign-up didn't show up in my CRM"**
→ Check Settings → Website leads: it should say Connected with a recent "last event". If it says Not connected or the last event is old, the website's key is missing or was replaced; make a new key and paste it into the website's settings. Someone already in your CRM with the same email isn't duplicated: look on their Activity tab for a "Website:" note.

**"Why does a card say Call, don't email. They unsubscribed?"**
→ They unsubscribed from all your website's emails, so Agent Runway won't draft an email to them anywhere (Flight Control, Flight Crew, Flight Plan templates). A note on their Activity tab shows when. If they sign up on your website again, that lifts it.

**"Why does a card say Call instead of Draft Message?"**
→ The client's last deal closed more than 2 years before the message would go out. Under CASL, implied consent to email from a purchase lasts 2 years, so Flight Control suggests a call and never drafts an email for that client. Agent Runway does not record express email consent, so these cards stay call-only. This is general information about the rule, not legal advice.

**"It said 'Call instead of email'" / "Flight Crew won't draft an email for this client" / "A Flight Plan template won't draft"**
→ Same rule as the Call cards in Scan, applied to every AI email drafter: the CRM briefing's Draft button, the client panel's AI Actions (Ask for Referral, Check In, Request Review, Anniversary Note), Flight Crew chat, and Flight Plan templates. The client's most recent closed deal (collapsed deals don't count) is 2+ years old by the time the message would go out, so no email is drafted and nothing is saved. A newer closed deal on their record restarts the 2 years. A co-buyer named on a couple's deal is treated the same as the spouse who holds the deal record: they bought the home too. Clients with no closed deal on record, their own or co-bought, aren't affected. Agent Runway doesn't record express email consent. A call is the way to reconnect, and Flight Crew can help with talking points. Do not write the email for the user in chat instead. This is general information about the rule, not legal advice.

**"Who do I send the newsletter to?" / "Why are some past clients listed under Recipients?"**
→ Agent Runway doesn't build or send to a recipient list. The agent pastes their own list into their email tool's To or BCC field. The Recipients note lists past clients whose last deal closed more than 2 years ago: under CASL, implied consent from a purchase lasts 2 years, so it no longer covers them. Agent Runway doesn't record express consent, so it can't tell who else has given it. This is general information about the rule, not legal advice.

**"What Agent Runway remembers says my client bought (or sold) a home, but that deal fell through"**
→ The memory profile counts every deal in the client's Deal History as closed unless its status is Collapsed. Client profile, Deals tab, Deal History: set that deal's status to Collapsed. The profile is marked outdated; Flight Crew tab, "What Agent Runway remembers", Refresh rebuilds it. A Collapsed deal is remembered as one that fell through (useful context for the next conversation), never as a purchase or sale, and its GCI is left out. Before 2026-10-13 the profile listed collapsed deals as closed.

**"Ask for Referral / Request Review says 'No closed deal on record for this client'"**
→ Both are written around the client's most recent closed deal. A collapsed deal doesn't count, and neither does one whose close date hasn't arrived yet. Add the closed deal to the client's record (or link the existing deal to them), then click again. For a client who hasn't bought or sold with the agent, Check In is the better fit. If Flight Control already drafted one for that deal (it drafts review requests about 3 weeks after closing and referral asks about 6 weeks after), clicking doesn't make a second copy: the existing draft is waiting in Flight Control.

**"A deal collapsed. Why did its anniversary / follow-ups / review request stop?"** / **"Why isn't this client showing as a past client?"**
→ A collapsed deal never closed, so Flight Control doesn't treat it as one. No closing anniversary, post-close follow-up, review request, referral ask or idle-past-client card comes from it, in Scan, the nightly drafts, or the client panel buttons, and the Flight Plan anniversary template isn't offered. A client whose only deal collapsed isn't a past client. If they have an older deal that did close, that one still counts: a newer collapsed deal doesn't hide it. If the deal was marked collapsed by mistake, change its condition status on the deal and Flight Control picks it up again. A draft already in the Outreach Queue from before the deal was marked collapsed isn't removed straight away; skip it.

**"Why is there no Draft button on a 'going quiet' row?"**
→ "Going quiet" means a client who's usually in regular contact has gone silent longer than their own rhythm. It shows up for leads and active buyers or sellers too, not just past clients, and every check-in draft is written to a past client. So there's no one-click draft on those rows. Reach out directly and log it, or open the client and use Check In (Flight Crew tab) if they're a past client.

**"I clicked Draft Message and it said Flight Control can't draft this one"**
→ Some cards (condition dates, scheduled-date reminders) have no automated email template, and a card can change between scanning and clicking. Reach out directly and log it in the CRM.
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

### Deal-Close Celebration: "Commission breakdown"
Where: closing a pipeline deal, from the dashboard's "Closing Day" prompt (Yes, it's closed → Register & Close) or from Transactions → Pipeline → close. Both screens record the deal the same way (one closed transaction linked to the pipeline row, the row kept at stage Closed; see the Pipeline playbook) and show the same rows, figures and words, with the short tax disclaimer under them:
1. **GST/HST collected (estimate)** (labelled HST, GST or GST + QST by province): provincial rate × the commission for a GST/HST registrant. $0 with a note when Settings say the agent is not registered, or that the brokerage holds back and remits the tax.
2. **Income tax and CPP (estimate)**: the tax portion of this commission = this year's tax estimate × this commission ÷ projected year-end GCI, worked out with the deal already counted as closed (its GCI in the year to date, its row out of the pipeline). The note under the row prints the estimate and the projected GCI used. The year's estimate is the dashboard Tax Readiness card's total. No percentage is shown beside this row.
3. **Fun money (10%)**: 10% of the commission.
4. **Rest of this commission**: the commission less rows 2 and 3. It is before the brokerage's split and fees and business expenses, so it is not take-home pay. GST/HST is on top of the commission and is not taken off here.

Row 2 and the "Per-deal tax portion" (dashboard, Forecast, Reports, Overhead) are one definition: the same yearly estimate, divided evenly across projected deals there and by this commission's size here. They are equal for a deal of the projected average size, and the portions of every deal in the projected year add up to the year's estimate.

Changed 2026-10-13: the heading was "How to allocate your commission", row 2 was "Income tax reserve" (the commission × a marginal rate, shown with that percentage, CPP left out) and row 4 was "Keep / invest". Row 2 is usually lower now; nothing else in the app changed.

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
| Compensation Plan | Which commission model runs: simple_split or real | simple_split |
| Commission Split | Agent net income, tax, waterfall (simple_split plan only) | Required |
| Annual GCI Goal | Pace, runway score, goal gap | $0 (not set) |
| Cash Reserve | Survival runway | $0 |
| Experience Years | Benchmark cohort, deviation tone | 0 |
| Business Structure | Tax calculation method (sole prop/PREC/corp) | Sole prop |
| Seasonal Weights | Projection accuracy, pace calculation | National default |
| Estimated Weekly Hours | Time Value card on Overhead page | Not set (card hidden) |
| Vacation Weeks/Year | Reduces annual hours for Time Value calc | 0 |

### Compensation Plan (comp_plan)
Two models. Settings → Commission & Brokerage picks one.

- **simple_split** (default): one static split preset + brokerage fees. Everything below under "Commission Split Options" and "Brokerage Fee Structure" applies.
- **real**: REAL Brokerage per-deal waterfall. The split preset is IGNORED — the agent's share flips at the cap, so a single percentage cannot describe it. See "REAL Brokerage Plan" below.

If a user on comp_plan = 'real' asks "what's my split?", do not quote split_preset. Their effective share depends on where they are against the cap.

### Commission Split Options (simple_split plan)
Presets: 70/30, 75/25, 80/20, 85/15, 90/10, 95/5, 100/0
Custom: Any percentage via custom input
Format: p{agent}_{brokerage} (e.g., "p80_20")

### Brokerage Fee Structure
- **Monthly fee**: Fixed amount per month — applies under BOTH plans
- **Per-deal fee rate** (tx_fee_rate_pct): Percentage of GCI per transaction — simple_split only
- **Annual cap** (tx_fee_annual_cap): Maximum total per-deal fees per year — simple_split only
- **Post-cap rate**: Fee rate after cap is reached (often 0%) — simple_split only

Example (simple_split): $500/month + 3% per deal, capped at $20,000/year. After cap → 0% per deal.

Under comp_plan = 'real', tx_fee_rate_pct and tx_fee_annual_cap are read only on the simple_split branch of computePlanGross — they are ignored, and the Settings UI hides them. REAL's per-deal drag comes entirely from the CBR / post-cap / sign-up fees below. Monthly Fee and the "brokerage withholds HST" toggle DO still apply on REAL: both are applied after plan math on every surface.

### REAL Brokerage Plan (comp_plan = 'real')

Canonical engine: packages/core/engines/real-compensation-engine.ts. Never quote a number for a REAL user that did not come from this engine.

**The waterfall, in order:**
1. **Pre-cap**: REAL takes a fixed 15% of GCI (company-dollar rate — an engine constant, not user-editable). Agent keeps real_pre_cap_agent_pct; any remainder is a team-leader override.
2. **The cap counts REAL's 15% take — NOT GCI crossed.** This is the single most common misunderstanding. A $15,000 cap is reached after ~$100,000 of GCI, not $15,000.
3. **Straddle deals**: one deal can span the cap. The GCI portion whose 15% still fits in the remaining cap room pays pre-cap terms; the rest pays post-cap.
4. **Post-cap**: agent keeps real_post_cap_agent_pct (100% solo) and REAL charges a flat per-deal fee instead of a percentage.
5. **Elite**: once cumulative post-cap fees reach the elite threshold, the per-deal fee drops to the elite fee.
6. **Fees**: CBR on every deal; BEOP amortized over the first 3 deals of each anniversary year; sign-up fee on the first deal of anniversary year 1 only.

**The cap year is the ANNIVERSARY year, not the calendar year** — anchored on real_join_date. No join date → falls back to the calendar year and no deal is excluded as pre-join.

| Setting | Meaning | Default |
|---------|---------|---------|
| real_join_date | Anchors the anniversary year; deals before it stay on the legacy split | Not set |
| real_cap_tier | solo_full / team_member / mega_team | solo_full |
| real_cap_amount | Company dollar to REAL before the cap flips | $15,000 solo_full ($7,500 team_member, $5,000 mega_team) |
| real_pre_cap_agent_pct | Agent share pre-cap | 0.85 solo (0.70 typical team member) |
| real_post_cap_agent_pct | Agent share post-cap | 1.0 solo (0.80 typical team member) |
| real_post_cap_fee | Flat per-deal fee after cap | $375 |
| real_elite_fee | Reduced post-cap fee after elite threshold | $175 |
| real_elite_threshold | Cumulative post-cap fees that trigger elite | $9,000 |
| real_cbr_fee | Compliance & Broker Review, per deal | $40 |
| real_beop_annual | Annual brokerage/E&O, amortized over first 3 deals | $1,200 |
| real_signup_fee | One-time Year-1 fee | $249 |
| real_cap_paid_seed | Company dollar already paid this anniversary year outside the app | 0 |
| real_post_cap_fees_paid_seed | Post-cap fees already paid this anniversary year outside the app | 0 |

All figures are a snapshot of the REAL income deck and are user-editable — if REAL revises them, the user updates Settings.

**Documented assumptions (flagged in the spec, unverified with REAL):**
- A straddle deal with any post-cap portion pays the FULL post-cap fee, not prorated. Conservative — slightly understates net.
- The deal that crosses the elite threshold pays the full fee; the discount starts on the NEXT deal.
- CBR is treated as per-transaction. If REAL confirms it is one-time, set real_cbr_fee to 0.
- BEOP amortizes over the first 3 deals of the anniversary year; years with fewer than 3 deals are charged only the amortized portions.

**REAL-specific problems & diagnostics:**

**"I hit my cap but Agent Runway says I haven't"**
→ The cap counts REAL's 15% company dollar, not GCI. Confirm which number they are tracking. Then check real_cap_paid_seed — a mid-year switcher whose earlier REAL deals were never entered starts from zero unless the seed is set.

**"My cap reset at the wrong time"**
→ The cap year runs on the anniversary of real_join_date, not Jan 1. If real_join_date is blank the engine falls back to the calendar year, which is the usual cause.

**"My net on this deal looks too low"**
→ Walk the fee stack: post-cap fee (or elite fee) + CBR + BEOP amortization + sign-up. A first deal of the anniversary year carries BEOP and possibly sign-up, so it nets visibly less than later deals.

**"My split percentage is wrong in Settings"**
→ On comp_plan = 'real' the split preset is not used. Point them at cap tier and the pre/post-cap percentages instead.

**"Transaction Fee Rate / Annual Fee Cap disappeared from Settings"**
→ Expected on comp_plan = 'real'. Those two fields are ignored by the REAL waterfall, so the UI hides them rather than let users edit dead values. Monthly Fee and the HST-withholding toggle remain because both still apply.

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
- Real bills instead of estimates (since 2026-10-13): the Expenses page has a **Home Office** category (Electricity, Heat & Water; Home Internet; Home Insurance; Repairs & Maintenance; Property Tax; Mortgage Interest; Rent; Condo Fees). Each bill is logged for its FULL amount like any receipt. For each kind of cost, bills logged this year REPLACE the estimate above (never added to it); the T2125 tab says so under that field ("Using $X from the bills you logged under Home Office"). Mortgage interest and rent share the "rent or mortgage interest" cost; home internet counts with utilities.
- The business-use % can be set in either place: the Home Office category on the Expenses page ("Home office share") or the T2125 tab. Same setting (home_office_business_use_pct).
- In every expense total a Home Office bill counts at that share only (expense-totals-engine.ts), so logging a $300 power bill at 15% adds $45 to YTD Expenses, not $300. The receipt log still shows $300.
- Home Office rows have no "/mo" box on the Expenses page: home bills vary, so each one is logged. A home cost that really is the same every month can go in the Recurring Expenses list under a Home Office item; it counts at the share too.
- CRA (T4002, business-use-of-home expenses): mortgage interest counts, principal does not; these expenses cannot create or increase a business loss and the unused part carries forward to the next year. Agent Runway does not track the carry-forward.

**"I logged my power bill and my expenses barely moved" / "Home Office shows $0"**
1. Expected: only the home office share of a home bill counts. Check home_office_business_use_pct.
2. If it is 0, home bills count for $0 and the Home Office category shows "Set your home office %". Point them to Expenses → Home Office → "Home office share".
3. The row shows the share, with "of $X in bills" under it for the full bills.

**"Why is the HST on my power bill not all in my ITCs?"**
→ Only the home office share of the GST/HST on a home bill is an eligible credit (10% or less = none, 90% or more = all), so only that share reaches line 106 of the return. The note under line 106 says "the personal share of home bill HST (home office N%)". Rent, mortgage interest, property tax, home insurance and condo fees normally have no GST/HST to claim.

### GST/HST Registration
- Toggle: registered or not
- If registered: GST/HST collected on GCI, ITCs claimed on expenses. Expense totals across the app are net of those ITCs.
- If not: the app counts no GST/HST on commissions and no ITCs. Expense totals include the GST/HST paid. The toggle is the agent's own answer: being unregistered in Settings does not show the agent is under CRA's $30,000 small supplier limit.
- Changing the toggle changes every expense total, the T2125 lines and the tax estimate (see the Expenses playbook, "GST/HST in expense totals").

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
- monthlyRecurring: sum of all active recurring expense amounts (monthly + prorated quarterly/annual), net of ITCs for a GST/HST registrant
- NOTE: This does NOT use YTD expenses ÷ months elapsed — it uses the configured recurring amounts only

**Income Offset** = Pipeline Weighted GCI ÷ months left in the year (minimum 1)
- This is the pipeline monthly estimate used to offset burn
- NOT YTD Agent Net ÷ months elapsed — it is forward-looking (pipeline-based)
- Pipeline Weighted GCI is the active pipeline only: closed and lost deals are not in it, and neither are listing appointments
- Months left = 12 − the whole twelfths of the year elapsed, counted from the seasonal fraction of the year elapsed (the agent's seasonal weights), so it can differ from the calendar months left. Late-year pipeline is spread across fewer months, so the monthly offset is larger
- In troubleshooting mode the [SURVIVAL DIAGNOSTIC] block prints the estimate, the weighted GCI and the months left it was divided by, and the net burn. Quote those figures; do not work the divisor out from the calendar month. They are the dashboard's inputs, so the months, band, Survival sub-score and Runway Score in the diagnostic data are the ones on the user's screens (until 2026-10-13 the diagnostic blocks left the Income Offset out and could show fewer months than the dashboard)

**Net Burn** = Monthly Burn − Income Offset

**Effective Cash** (from cash-position-engine.ts):
- If agent has closed deals this year: max(0, Implied Cash + Manual Cash Reserve)
  - Implied Cash = YTD Agent Net − YTD Expenses − YTD Estimated Tax − YTD HST Owing
  - YTD Expenses are net of ITCs for a registrant, so the ITCs are already counted there
  - HST Owing = $0 if brokerage withholds HST; otherwise HST collected on commissions (no second ITC offset: that would count the same GST/HST twice)
  - This is what should be in the account if the agent has been disciplined
- If no closed deals yet: Manual Cash Reserve only (from Settings)

**Risk Levels** (survival-engine.ts; every screen, the report PDFs and the public page agentrunway.ca/metrics/financial-runway read these):
| Months | Level | Color |
|--------|-------|-------|
${RUNWAY_BAND_ROWS}
| Not configured | ${RISK_LEVEL_LABEL.notConfigured} | ${RUNWAY_COLOUR_WORD[riskColorBand("notConfigured")]} |

In one sentence, as the screens print it: "${RISK_BAND_LADDER}" Each band runs from its lower figure up to, not including, the next one (exactly ${RISK_BAND_FLOOR_MONTHS.healthy}.0 months is ${RISK_LEVEL_LABEL.healthy}, exactly ${RISK_BAND_FLOOR_MONTHS.strong}.0 is ${RISK_LEVEL_LABEL.strong}). ${RISK_LEVEL_LABEL.healthy} and ${RISK_LEVEL_LABEL.warning} share amber on every screen and in the business report PDF (survival-engine.ts, riskColorBand): only ${RISK_LEVEL_LABEL.strong} is green. The word on the badge tells them apart.

**Which runways are flagged** (one rule: survival-engine.ts, isFlaggedRiskLevel). A runway is flagged when it is ${RISK_LEVEL_LABEL.critical} or ${RISK_LEVEL_LABEL.warning} (under ${RISK_BAND_FLOOR_MONTHS.healthy} months). ${RISK_LEVEL_LABEL.healthy} and ${RISK_LEVEL_LABEL.strong} runways are not flagged, and nothing is flagged before a reserve or costs are entered. The same rule drives:
- **Dashboard alert** (above the Daily Briefing): red for ${RISK_LEVEL_LABEL.critical}, amber for ${RISK_LEVEL_LABEL.warning}. Its title is "Cash runway is ${riskBandPhrase("warning")}" or "Cash runway is ${riskBandPhrase("critical")}". Its body gives the months the cash covers, adds "after the income estimated from your pipeline" when pipeline income is netted, then lists the four bands.
- **Daily Briefing "Runway" row**: red for ${RISK_LEVEL_LABEL.critical}, amber for ${RISK_LEVEL_LABEL.warning} and ${RISK_LEVEL_LABEL.healthy}, plain for ${RISK_LEVEL_LABEL.strong}.
- **Business Health card** (dashboard): a ${RISK_LEVEL_LABEL.critical} runway makes the card's status Critical and a ${RISK_LEVEL_LABEL.warning} runway makes it At Risk (the Runway Score grade and pace can set those too). Its sentences state the months, the band and its range, and what the band above takes in cash at the current burn.
- **Advisor card "Low Cash Runway"** (Reports, category "Cash Runway"): lists the current runway, its band's range and where the next band starts.
- **Scenarios page**: the note under the current column says which range the runway is in.
- **Reports page, Cash Runway card**: the badge carries the band's word. Under the cash reserve and monthly burn it shows "Pipeline income (estimate)" and "Net monthly burn" rows when pipeline income is netted, then the four bands in one sentence. It gives no instruction.

Changed 2026-10-13: until then these screens used cut-offs of their own, so they could disagree with the badge. The dashboard alert was red ("Cash runway is critically low") under 3 months and amber ("Runway is getting thin") from 3 to under 5; the Daily Briefing row used the same 3 and 5; the Business Health card was Critical under 1 month and At Risk under 3; the advisor card (then in a category called "Survival Warning", with "Recommended minimum: 3–6 months of fixed costs") and the Scenarios note appeared under 3 months; the Reports card showed "Consider building your reserve to at least 4 months of operating costs" in a red box under 4 months; the public page listed Critical under 1 month, Warning 1–3, Healthy 3–6 and Strong 6+. So on that date, with no change in the user's data: a runway of 2 to under 3 months went from a red alert to an amber one; a runway of 4 to under 5 months lost its amber alert; a runway of 3 to under 4 months gained the advisor card and the Scenarios note; a runway of 1 to under 2 months turned the Business Health card Critical. The months and the band on the badge were calculated the same way before and after: only which screens flag a runway, and their wording, changed.

**What the business report PDF says about cash runway** (changed 2026-10-13). The Cash Runway box on its Expenses page is headed with the months and the band ("3.0 months of cash runway · Warning"; "24+ months of cash runway · Strong" at the cap; "Not Set" when no reserve or costs are entered). Under that it gives the cash reserve and monthly burn ("Based on your cash reserve of $7,500 and a monthly burn rate of $2,500."; when pipeline income is netted the sentence continues ", less an estimated $1,000 a month of pipeline income."), then the four bands in one sentence: "${RISK_BAND_LADDER}" The Assessment paragraph on the last page says which range the runway is in ("Your cash runway of 3.0 months is ${riskBandPhrase("warning")}."). The PDF states where the runway sits and gives no instruction. A PDF downloaded before that date said "Immediate action required", "Consider increasing your reserve to 4+ months" or "You are within the recommended 4–6+ month safety buffer" (also printed for a Strong runway), and showed "-1.0 Months" when nothing was set. The months and the band were calculated the same way then; only the wording changed.

**Cap**: Runway is capped at 24 months maximum (to avoid infinity when burn ≤ 0).

**Special Cases**:
- Net burn < 0 (income offset exceeds burn): runway = 24 months (strong), short-circuits before dividing.
- Net burn = 0 AND cash > 0: runway = 24 months.
- Net burn = 0 AND cash = 0: runway = 0.
- No burn configured AND no cash reserve: Returns -1 (sentinel) → "Not Configured".
- Cash reserve $0 with positive net burn: Runway = 0 (critical).

### Survival Impact on Other Metrics
1. **Runway Score**: Survival is 15% of composite score. The Survival sub-score follows these bands, so the Survival bar in the score breakdown is the colour of the Cash Runway number: ${SURVIVAL_SCORE_BAND_BY_RUNWAY_BAND}. The score for each month is in the Runway Score playbook. With no cash reserve or costs entered the score is ${SURVIVAL_SCORE_NOT_SET}, a missing-data penalty: a red bar beside a gray "Not set". ${SURVIVAL_SCORE_CHANGED_V14}
2. **Advisor Cards**: "Low Cash Runway" appears for a flagged runway (${RISK_LEVEL_LABEL.critical} or ${RISK_LEVEL_LABEL.warning})
3. **Dashboard**: the Cash Runway number beside the Runway Score, the alert, the Daily Briefing row and the Business Health card (see "Which runways are flagged")

### Common Problems & Diagnostics

**"Survival shows 'Not Configured'"**
→ Cash reserve is $0 or not set. Go to Settings → Cash Reserve and enter current business savings.

**"Survival shows 24 months — is that right?"**
→ The runway reads 24+ months when the cash covers 24 months or more of net burn, or when the Income Offset is at or above the monthly burn (net burn $0; the diagnostic says so when that is the case). The Income Offset is an estimate from deals that have not closed, weighted by stage: it is not money received, so 24+ months on this basis does not mean the account holds that much cash.

**"Survival seems too low"**
1. Check cash reserve amount in Settings — is it current?
2. Monthly burn = monthly_brokerage_fee + monthly recurring expenses (NOT one-time receipts). One-time expenses do NOT affect survival burn.
3. Check if pipeline is thin — the income offset is pipeline weighted GCI ÷ remaining months. Empty pipeline = $0 income offset.
4. Large pipeline deals increase the income offset and reduce net burn, improving survival.

**"How do I improve survival?"**
1. Increase cash reserve (Settings)
2. Reduce expenses
3. A deal that closes raises Effective Cash (through YTD Agent Net) and leaves the pipeline, so the Income Offset no longer counts it
4. Nothing in the runway is an average of past months: the burn is the current monthly figure and the income is the pipeline estimate

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

### Multi-Year Workbooks (sheet-by-sheet)
An Excel workbook with one sheet per year is imported one sheet at a time.
Tracker-shaped sheets parse in the browser; every other sheet is sent to the
server for extraction, where a very large sheet can time out.
- If SOME sheets fail, the years that did extract still reach the preview and a
  warning names the sheets that could not be read.
- If EVERY sheet fails, an error is shown (not an empty preview). On a timeout
  the guidance is to split the workbook and import one year at a time.
- A failed sheet never silently disappears. If a user reports "only 3 of my 5
  years imported," ask whether they saw a warning naming the missing sheets —
  the missing years failed extraction, they were not merged or deduped away.
Why it matters: a silently missing year skews year-over-year comparison and the
seasonal profile (which needs 2+ years of history).

### Number Parsing (from normalize-money.ts)
Two parsers share one numeric interpretation:
- **Loose** (CSV / spreadsheet / tracker columns) — salvages a number out of
  annotated cells.
- **Strict** (AI extraction from PDFs and images) — must be a clean number or it
  is rejected to low/"missing" confidence in the review UI.

Formats handled by both: \`$1,234.56\`, \`CAD 1,234\`, \`ca$1,234\`,
\`(1,234)\` → -1234 (accounting negative), \`325 000\` → 325000 (space thousands),
\`9 750,50 $\` → 9750.50 (fr-CA space thousands + comma decimal), \`9,50\` → 9.50
(fr-CA comma decimal), \`1.234,56\` → 1234.56 (European dot thousands).
Loose only: \`1,234 approx\` and \`approx 1,234\` → 1234 (annotation stripped).
Strict rejects: \`1.5M\`, \`300k\`, \`1,500 est\` → treated as missing, never as
1.5 / 300 / 1500.

**Comma disambiguation:** a single comma followed by exactly 3 digits is
thousands grouping (\`1,234\` → 1234); 1, 2, or 4+ trailing digits is a decimal
(\`9,50\` → 9.50). If the cell also uses space grouping, the comma is the decimal
(\`1 234,567\` → 1234.567). When both a comma and a dot appear, the LAST one is
the decimal.

**Ambiguous cells are rejected, not guessed.** A cell holding two or more
numeric groups separated by a letter, currency symbol, dash, "@", or "#" cannot
be resolved and comes through as missing: \`Unit 5 - $325,000\`,
\`Lot 12 $500,000\`, \`MLS 40312345 $325,000\`, \`2 @ $450,000\`,
\`$300,000-$350,000\` (a range). This is deliberate — guessing would pull the
wrong digits (a unit number, an MLS number) into sale price.

### Common Problems & Diagnostics

**"Import failed"**
1. Check file format — must be CSV, XLSX, or PDF
2. Check for special characters in headers
3. Check for empty rows or malformed data
4. Check file size — very large files may timeout
5. Check if date formats are consistent (YYYY-MM-DD preferred)

**"Some rows were skipped"**
→ Rows skip when required fields are missing (typically date and sale price or GCI). Check the error summary for specific row numbers.
→ A field also counts as missing when its value could not be parsed. The most
common cause is a price or GCI cell that holds more than just the amount
("Unit 5 - $325,000", "$300,000-$350,000", "2 @ $450,000") — see Number Parsing
above. Fix: put only the amount in that cell and re-import, or fill the value in
manually at the mapping/preview step.

**"A price or GCI came through blank"**
1. Check the source cell — if it contains a unit/lot/MLS number or a price range
   alongside the amount, it is rejected on purpose rather than guessed.
2. For PDF or image extraction, check for shorthand: "1.5M", "300k", and
   "1,500 est" are rejected by the strict parser and surface as low confidence.
3. Correct the value in the review UI before confirming — nothing is written
   until confirmation.

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
4. **Tax Responsibility** — Which agents are missing expense logs, receipts, or categories (aggregate, no amounts). "Hasn't logged expenses this quarter" means none of: a receipt dated in the quarter, an active Recurring Expenses entry, a "/mo" figure on an expense item. "Hasn't uploaded receipts" means no receipt dated in the quarter. Quarters follow the Atlantic calendar.
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
   - Federal tax (multi-bracket: ${TAX_ENGINE_TABLES.federal.rates.join(" / ")}, the ${TAX_YEAR} tax year)
   - Provincial tax (varies by province — uses rates from Settings)
   - CPP self-employed contributions (both employer + employee portions)
   - Total estimated tax liability for the year

2. **Effective Tax Rate**
   - Your actual overall tax rate = Total Tax ÷ Net Self-Employment Income
   - This is different from your marginal rate (the rate on your next dollar)

   **Marginal rate** (a row on the Tax Readiness card)
   - The combined federal + provincial income tax rate on the next dollar of projected net income for tax: projected GCI after the split, plan fees and brokerage fees, less the year's expenses. CPP is not in it
   - The same figure as the dashboard's and Forecast's "Marginal rate". Projected GCI counts listing appointments (scheduled or active) the way the dashboard's does, so the whole card matches the dashboard's tax card
   - Changed 2026-10-14: Overhead looked the rate up at projected GCI, before the split, fees and expenses, so it could show a higher bracket than the dashboard. It also left listing appointments out of projected GCI, so an agent with listing appointments saw a lower tax estimate on Overhead than on the dashboard

3. **Quarterly Instalment Amounts**
   - CRA requires quarterly payments if you owe > $3,000 in tax
   - Deadlines: March 15, June 15, September 15, December 15
   - Calculated as: Estimated Annual Tax ÷ 4
   - The T2125 tab's "CRA Tax Instalment Tracker" and the T2125 PDF list those four dates beside an "Estimated" amount (the annual estimate ÷ 4) and what the agent entered as paid. Changed 2026-10-13: before that date the tracker printed the GST/HST filing dates (Apr 30, Jul 31, Oct 31, Jan 31) and headed the column "Recommended". A PDF exported earlier shows the old dates.
   - "The bottom of my T2125 PDF is unreadable" / "the text overlaps": fixed 2026-10-13. Before that date the three footer lines (the document line with the agent's name and tax year, the "ESTIMATES ONLY" disclaimer, and the corporation line) were printed over each other on every page, the last one running past the page edge, and a long agent name printed over the "Agent Name" label on page 1. The footer now has the disclaimer on its own row with the other two lines under it. No figure in the PDF changed; downloading it again gives the clean layout.

4. **HST/GST Tracking**
   - HST collected on commissions (13% in ON, 14% in NS, 15% in NB/NL/PE, etc.)
   - Input Tax Credits (ITCs) from business expenses
   - Net HST owing = Collected − ITCs
   - Small supplier limit (CRA): $30,000 of revenue from taxable supplies, measured in a single calendar quarter and over the last four consecutive calendar quarters. At or under it, registration is optional
   - Reports → Tax Snapshot and the business report PDF (Expenses page) print one GST/HST note, chosen by Settings. Not registered: no amount, and CRA's small supplier rule. Registered: the estimate (GST/HST rate × YTD GCI) and the GCI it is on. Registered with "brokerage withholds HST" on: none counted in the agent's hands, because the brokerage remits it. Registered or not is the Settings toggle only, never the business number. Changed 2026-10-13: the PDF used to print one sentence for everyone, which gave the $30,000 limit as a yearly income figure (not CRA's rule) and told the reader to keep a separate account (a directive)

5. **Deduction Summaries by T2125 Category**
   - Advertising, meals, vehicle, office, professional fees, etc.
   - Each category shows YTD total from recorded expenses

6. **CCA Depreciation Schedule**
   - Capital Cost Allowance for business assets
   - Organized by CCA class (Class 8, 10, 10.1, 12, 50, etc.)
   - Shows: original cost, UCC (undepreciated capital cost), CCA claimed
   - Half-year rule: first-year CCA is 50% of the normal rate

7. **Savings Impact bar** (top of the Tax Deduction Estimates card)
   - "Already Capturing" = the year's expenses (year to date + still to come) × the marginal rate above: an estimate of the income tax those expenses reduce. $0 when projected net income for tax is $0
   - "Untapped Potential" = the total of the cards' estimates, each a deduction × the same rate (tax-optimization-engine, deductionTaxRate)
   - Hovering "Already Capturing" shows the expenses and the rate it used
   - Changed 2026-10-14: "Already Capturing" used the rate looked up at projected GCI, so it came out larger than the cards' method gives. It is an estimate, not a refund or an amount CRA has confirmed

8. **Per-Deal Tax Estimate** (shown as "Per-deal tax portion")
   - Total annual tax estimate ÷ projected deal count
   - An estimate of the tax each closed deal carries, not an amount to set aside
   - The deal-close screens show the same estimate for one commission by its size ("Income tax and CPP (estimate)" = annual estimate × that commission ÷ projected year-end GCI). Equal to this figure for a deal of the projected average size

### GST/HST Return, line by line (from gst34-engine.ts)

Where: Expenses page → pick a period under "Filing period" (Q1 to Q4 for a quarterly filer). The card "HST Return: Q2 2026" shows the return the way CRA's Form GST34 asks for it, and "Download worksheet (PDF)" gives the same lines plus every expense behind line 106. It is on the Expenses page, not Overhead.

Each line is marked "You enter" (typed into CRA's return) or "CRA calculates" (CRA's online return works it out). Amounts are in dollars and cents.

| Line | CRA's label | Where Agent Runway's figure comes from | On the return |
|------|-------------|-----------------------------------------|---------------|
| 101 | Sales and other revenue | GCI from closed deals in the period, before GST/HST | You enter |
| 103 | GST/HST collected or collectible | Line 101 × provincial rate (5%/13%/14%/14.975%/15%) | You enter |
| 104 | Adjustments to be added to the net tax | Not tracked: $0 | You enter |
| 105 | Total GST/HST and adjustments | Line 103 + line 104 | CRA calculates |
| 106 | Input tax credits (ITCs) | The ELIGIBLE credit: GST/HST paid on the period's receipts and recurring expenses, less what can't be claimed (half of meals and entertainment; the personal share of vehicle costs; the personal share of Home Office bills) | You enter |
| 107 | Adjustments to be deducted when determining the net tax | Not tracked: $0 | You enter |
| 108 | Total ITCs and adjustments | Line 106 + line 107 | CRA calculates |
| 109 | Net tax | Line 105 − line 108 (negative = refund position) | CRA calculates |
| 110 | Instalments and other annual filer payments | Instalments paid; $0 for a monthly or quarterly filer | You enter |
| 111 | Rebates | Not tracked: $0 | You enter |
| 205 | GST/HST due on purchases of real property | Not tracked: $0 | You enter |
| 405 | Other GST/HST to be self-assessed | Not tracked: $0 | You enter |
| 114 / 115 | Refund claimed / Amount owing | From the lines above | CRA calculates |

Lines 112 and 113A to 113C exist on the paper return only; the PDF worksheet lists them.

**Line 106 is the eligible amount, and line 107 is NOT where the meal and vehicle limits go.** On CRA's return line 107 is for things like GST/HST in a bad debt, and it is ADDED to line 106. Until 2026-10-13 this card showed the GST/HST paid as line 106 and the part that can't be claimed as a negative "line 107 ITC adjustments". The total (line 108) was right, but copying those two figures into CRA's form would have over-claimed. Now the card shows what was paid and what came off in the note under line 106.

Vehicle share follows the business-use % in Expenses: 10% or less = none claimable, 90% or more = all, otherwise that share. Home Office bills follow the home office % the same way. Meals and entertainment: 50%, applied every period, so there is no yearly add-back on line 104.

**The lines Agent Runway has nothing for** (104, 107, 111, 205, 405) show $0 behind "Show N more lines left at $0". Each says when it applies. Line 405 covers GST/HST someone has to work out and report themselves, for example on services bought from outside Canada that are used less than 90% in the business. Agent Runway does not calculate it. Whether it applies is a question for their accountant.

**The PDF worksheet** also reports: receipts in the period with no GST/HST recorded (nothing is claimed on them); how many claimed receipts have no receipt image stored; and a warning if the expense list does not add up to line 106.

**"What do I type into CRA?" / "How do I file my HST?"**
1. Expenses → Filing period → the quarter.
2. Read the lines marked "You enter": 101, 103 and 106 are the ones Agent Runway fills; the rest are $0 unless they apply.
3. Download the worksheet and compare the expense list on page 2 with their own receipts.
4. They file with CRA themselves (My Business Account or GST/HST NETFILE). Agent Runway does not file anything.
A return is expected for every reporting period, including one with no sales. Give the figures and CRA's rules only; do not tell them what to claim.

**Quick Method**: Available if taxable revenue ≤ $400K. Instead of tracking every ITC, remit a flat rate (typically 8.8% of HST-included revenue for service providers). May result in lower remittance but Agent Runway uses the detailed method — consult an accountant before switching.

### GST/HST Filing Period Deadlines (from filing-period-engine.ts)

**IMPORTANT**: These are DIFFERENT from income tax instalment dates.

| Filing Frequency | Due Dates |
|-----------------|-----------|
| Quarterly | Q1 (Jan–Mar): April 30 / Q2 (Apr–Jun): July 31 / Q3 (Jul–Sep): October 31 / Q4 (Oct–Dec): January 31 (next year) |
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
- **"HST numbers wrong"**: Check "GST/HST Registered?" (Reports → T2125) and "Does your brokerage withhold HST from your commission cheques?" (Settings → Brokerage Fees; also asked in onboarding). The app counts GST/HST on commissions only when registration is on. With the brokerage question answered Yes, the dashboard, Forecast, Reports → Tax Snapshot, the deal-close screen and Flight Crew count none in the agent's hands; answered No, they show the estimate (GST/HST rate × GCI) as collected by the agent. The HST return on the Expenses page (line 103) and the T2125's GST/HST section do not read the brokerage answer: for a registrant both show GST/HST on commissions either way, so an agent who answered Yes still sees an amount there. The line under the question says so. Changed 2026-10-13: it used to mention set-aside recommendations and reminders, and onboarding said the answer changed take-home pay (it does not). Whether registration is required is CRA's small supplier rule ($30,000 of revenue from taxable supplies in a single calendar quarter or over four consecutive calendar quarters); whether it applies to this agent is a question for their accountant.
- **"My marginal rate on Overhead changed" / "Overhead and the dashboard show different marginal rates"**: Since 2026-10-14 both are the rate on projected net income for tax, from the same projection (listing appointments included). Before that date Overhead looked it up at projected GCI. If they still differ, the two pages were loaded at different times (a deal, expense or listing appointment added in between); reload both.
- **"Already Capturing went down"**: Since 2026-10-14 it is the year's expenses × the marginal rate on projected net income for tax, the method the cards use. Before that date it used the rate at projected GCI, which is the same or higher.
- **"Instalment amounts changed"**: They update as your estimated tax changes throughout the year based on new transactions and expenses.
- **"What is line 109 on my GST34?"**: Net tax = GST collected on commissions minus ITCs from expenses. Positive means you owe CRA; negative means CRA refunds you.
- **"My ITCs seem low"**: Insurance premiums are GST/HST exempt — no ITC can be claimed. Meals & entertainment ITCs are 50% disallowed.
- **"When is my GST/HST quarterly filing due?"**: Q1 Apr 30, Q2 Jul 31, Q3 Oct 31, Q4 Jan 31 (next year). These are different from income tax instalment dates (Mar 15, Jun 15, Sep 15, Dec 15).
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
   - Examples: "Your average deal size increased 12% vs last year" or "Your expense ratio is now within target"
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
An entry in the Recurring Expenses list (Expenses page) is an expense that repeats on a schedule: monthly, quarterly or annually. It counts by that schedule. There is nothing to confirm each period.

**Setup:**
- Vendor name (e.g., "Mailchimp", "CREA Dues")
- Amount
- Expense category (T2125 category)
- Frequency: monthly, quarterly, or annual
- Start date
- End date (optional): the last day the expense applies. Empty while it is still being paid. The form rejects an end date before the start date
- Optional notes
- "This amount includes HST" with the HST amount, for a GST/HST registrant. On this form, ticking the box fills the amount in from the province rate unless one is typed in the Override box
- "Apply vehicle business-use % to this expense", for a vehicle cost

**How an entry is counted:**
There is no confirm or skip step. An active entry counts by its charge dates: every charge that has happened so far this year is in YTD Expenses, Est. Tax Deductible and the T2125 lines (packages/core/engines/recurring-expense-engine.ts, recurringYTD). Nothing appears in the receipt log for it.
- Monthly: once a month, on its charge day (day of month, 1 to 28). This month's charge counts from that day, not from the 1st: on the 13th, an entry charged on the 20th has not counted for this month yet.
- Quarterly: every third month from its starting month, on its charge day.
- Annual: once, on its charge date.
- A charge counts only on or after the entry's start date. An entry that starts on the 15th with charge day 10 first counts on the 10th of the next month. An entry Flight Crew sets up starts the day it is created.
- An entry with an end date stops there: charges up to and including that date stay in the year, later ones never count. The entry stays in the Recurring Expenses list, marked "Ended <date>" once the date has passed, or "Ends <date>" while it is still ahead. It is still an active entry: that is what keeps its earlier charges counting.
- The monthly figure is separate from the charge dates. Monthly Recurring, the "/mo" cells and survival burn use the monthly equivalent of each entry that has not ended (recurringMonthlyRunRate). An entry counts in it through its end date and leaves it the day after. Its year to date does not change when it does. An entry whose start date is still ahead already counts in the monthly figure (a cost that is scheduled is part of what lies ahead), while its year to date is $0 until its first charge date.
- Next year's plan (the dashboard's year switch, the "Business expenses" row under estimated take-home at goal) counts each entry by the charge dates that fall in that year (totalRecurringInYear, through ytdExpenseTotals expensesNextYear), not the monthly figure x 12. An entry with no end date counts every charge of that year. An entry that ends on December 31 this year adds nothing to next year's plan, even while it is still in Monthly Recurring today. An entry that ends during next year counts up to its end date, and one that starts during next year counts from its start date. An annual fee counts once, in full, when its charge date falls between the entry's start and end dates. The "/mo" figures on expense items have no dates, so they count for 12 months. Receipts are not carried into next year. Amounts are net of ITCs for a GST/HST registrant, as in every other total.
- The GST34 summary's input tax credits count the same charges, so an entry's expense and its GST/HST are always the same number of charges.
- The year's projected expenses (tax estimate, Forecast, Scenarios, Overhead, weekly digest) are the charges so far plus the charges still to come this year (totalRecurringRemaining), each counted once. A charge due later this month is in "still to come" until its day, then moves to year to date. The projected total for the year does not change when it does.
Changed 2026-10-13: before this a monthly entry counted the current month from the 1st (or from the day of the month it started on), so year-to-date expenses could run one charge ahead of the GST34 summary until the charge day, and an end date was not read.
Also changed 2026-10-13: next year's plan used to deduct the monthly figure x 12 (the row read "current recurring x 12"), so an entry known to stop was counted for all of next year until its end date passed, and an entry starting part-way through next year was counted for the whole of it.
Also changed 2026-10-13: the form has an End date field, removing an entry asks whether it ended or was never a real expense, and Flight Crew can set an end date. Before that nothing in the app could set one, so the only way to stop an entry was to remove it, which took its whole year to date out. The monthly figure also had no date until then.
The Recurring Expenses list shows the amounts as charged. Totals are net of ITCs for a GST/HST registrant.

**The two figures under the list:**
Both come from the entries as entered (GST/HST included; a GST/HST registrant sees them labelled "as charged").
- "Monthly avg" is the monthly equivalent of each entry that has not ended, the same rule as Monthly Recurring.
- The year total, labelled with the year (for example "2026 total"), is every charge dated in this calendar year: each entry by its charge dates from January 1 to December 31, between its start date and its end date (recurringListFooter in apps/web/lib/expenses/recurring-list-footer.ts, which adds up recurringChargesInYear). It is the list's charges so far this year plus the charges still to come, so it stays the same through the year unless an entry is changed.
- It is not Monthly avg x 12. An entry that ended this year keeps its charges up to its end date and adds nothing to Monthly avg. An entry with an end date still ahead stops at that date. An entry that started part-way through the year counts from its start date. An entry whose start date is in a later year is already in Monthly avg and adds nothing to this year. An annual fee counts once, in full, when its charge date falls between the entry's start and end dates. With no end dates and every entry started before this year, the year total is 12 times Monthly avg.
- The year total can be higher than the Recurring Expenses part of the year's projected expenses. Those are net of ITCs for a GST/HST registrant and count a Home Office bill at the home office share. The footer shows what is charged.
Changed 2026-10-13: the second figure used to read "Annual total" and was Monthly avg x 12, so an entry due to end on December 31 was counted for twelve more months until the day after its end date, an entry that started in July read as a full year, and an entry that ended earlier in the year read as nothing.

### Common Issues
- **"Recurring expense not counting"**: Check the start date (nothing counts before it), the charge day, and that the entry is active. A monthly entry counts on its charge day, so one set up today with a charge day earlier in the month first counts next month. A quarterly or annual entry counts only after its charge date this year.
- **"My YTD expenses went down" / "this month's subscription isn't in my expenses yet"**: Since 2026-10-13 a monthly entry counts on its charge day instead of from the 1st of the month. An entry whose charge day is still ahead this month is one charge lower in YTD Expenses, Est. Tax Deductible and the T2125 lines until that day. Nothing was lost: the charge is in the year's projected expenses the whole time, and year to date now agrees with the GST34 summary.
- **"I changed the amount and my year-to-date changed"**: The year-to-date figure is the current amount x occurrences so far, so a new amount applies to the whole year to date. Known limitation: an entry has one amount for the year.
- **"How do I cancel a recurring expense?" / "I cancelled a subscription part-way through the year"**: An end date is what stops an entry and keeps the months it ran. Three ways to set one: open the entry in the Recurring Expenses list (Expenses page) and fill in End date; use the entry's remove button and choose "It ended"; or tell Flight Crew ("I cancelled Canva on June 30", Navigator, updateRecurringExpense with endDate). The charges up to the end date stay in YTD Expenses, Est. Tax Deductible, the T2125 lines and the GST34 input tax credits. None count after it, and the entry leaves Monthly Recurring the day after.
- **"What is the difference between ending and deleting?"**: Ending (an end date) keeps the entry and every charge up to that date. Deleting (the remove button's "It was never a real expense" choice, or Flight Crew's deleteRecurringExpense) takes the entry out of every total, including the months already past this year. Deleting fits an entry made by mistake. Pausing through Flight Crew (updateRecurringExpense, isActive false) acts like deleting while it lasts: a paused entry counts in no total until it is resumed.
- **"My cancelled expense is still in the list" / "it says Ended but it is still there"**: Expected. An ended entry stays in the Recurring Expenses list so its earlier charges keep counting. It shows "Ended <date>" and adds nothing to Monthly Recurring or to the "Monthly avg" under the list. The year total beside it keeps the entry's charges up to its end date when that date is in this year. In the Categories table its row keeps its year-to-date amount and shows a dash in the monthly column. An entry that ended before this year has no row in the Categories table (nothing of it is in this year's figures) and can be deleted from the Recurring Expenses list.
- **"The year total under my recurring list is not 12 times the monthly avg" / "Where did Annual total go" / "What is the 2026 total under Recurring Expenses"**: Expected since 2026-10-13. The figure that read "Annual total" is now the year total, labelled with the year: every charge dated in this calendar year, as entered. It differs from Monthly avg x 12 when an entry has an end date in this year, started part-way through it, or is an annual fee whose charge date falls outside the entry's dates. The list shows which: an entry marked "Ended <date>" or "Ends <date>", or one whose start date (open the entry to see it) is in this year.
- **"Monthly Recurring went down but I didn't change anything"**: An entry's end date has passed. It left the monthly figure the day after that date. YTD Expenses did not change.
- **"My lease ends this year but it is still in next year's plan" / "the business expenses in next year's plan look too high"**: Next year's plan counts an entry by its charge dates in that year, and an entry with no end date counts for all of it. Once the entry has its end date (the End date field on the Expenses page, or Flight Crew: "my lease ends December 31"), the charges after that date are out of next year's plan the next time the dashboard loads. Monthly Recurring keeps the entry until the day after the end date. The "/mo" figure on an expense item has no end date and counts for 12 months.
- **"Next year's plan is not 12 times my Monthly Recurring"**: Expected since 2026-10-13. Monthly Recurring is what the list costs each month as of today. Next year's plan is that year's charge dates: it leaves out an entry that ends before or during next year from its end date on, counts an entry that starts during next year from its start date, and counts an annual fee on its date. With no end dates and no start dates ahead the two agree.
- **"I removed a recurring expense before and lost its months"**: Before 2026-10-13 removing an entry on the Expenses page deactivated it, so none of its charges count. The row still exists. Flight Crew can bring the months back in one step: searchRecurringExpenses lists it as Paused, and updateRecurringExpense with isActive true and endDate (the day it stopped) reactivates it with that end date. An entry Flight Crew deleted is gone: adding it again on the Expenses page with its start date and end date restores the charges between them.
- **"The form won't accept my end date"**: The end date is before the start date. No charge could fall between them, so the form rejects it. Flight Crew rejects it the same way, and also a date that is not on the calendar.
- **"Recurring expense not in my tax deductions" / "not on my T2125"**: Since 2026-10-13 active entries count in Est. Tax Deductible and on the T2125 lines (see the Expenses playbook, "Est. Tax Deductible YTD and the T2125 lines"). A vehicle entry counts at the vehicle business-use % and a meal at 50%.
- **"I logged the receipt too and it counted twice"**: A receipt and a recurring entry for the same bill both count. One record per bill keeps the total right.
- **"My recurring expense has no input tax credit" / "Flight Crew set up my subscription but its HST isn't in my GST34"**: The GST34 summary and the totals read the entry's HST amount. An entry has one only when "This amount includes HST" is on (Expenses page), or when the agent stated the GST/HST as Flight Crew set it up. Entries Flight Crew set up before 2026-10-13 have none: it could not record GST/HST on a recurring expense until then. Editing the entry in the Recurring Expenses list adds it. Some charges carry no GST/HST (insurance premiums, most government fees), so nothing comes off those.

### Impact on Financial Tracking
- Charges to date count toward YTD expense totals and the expense ratio
- Charges still to come this year count in the year's projected expenses (tax estimate, Forecast)
- They count in Est. Tax Deductible and on the T2125 lines, by the entry's category
- The monthly equivalent of each entry that has not ended is part of Monthly Recurring and survival burn
- Next year's plan counts the charges dated in that year, so an end date or a start date inside that year changes it
- An ended entry keeps its charges to date in every figure above and adds nothing to the monthly figure or to what is still to come
- Their HST is in the GST34 summary's input tax credits for the period

### Flight Crew Integration
- "I pay $150/month for Mailchimp" → sets up a monthly recurring expense (createRecurringExpense). The approval card names the expense item, and any GST/HST, before it is saved.
- "I pay $115 a month for Canva, $15 of that is HST" → the $15 is recorded as the GST/HST inside each charge (hst_included on, hst_amount 15). It is in the GST34 summary's input tax credits for the period and comes off the totals for a registrant.
- GST/HST is recorded only when the agent states the amount. Flight Crew never works it out from a rate or the province. With none stated, the entry counts in full and Flight Crew tells a GST/HST registrant that no input tax credit is counted on it.
- Flight Crew sets up monthly entries. Navigator can look entries up (searchRecurringExpenses) and change one (updateRecurringExpense: name, amount, GST/HST, expense item, end date, pause or resume, notes), each change behind the approval card. Frequency, charge day, start date and the vehicle box are changed in the Recurring Expenses list on the Expenses page. Added 2026-10-13: before that Navigator could create and delete a recurring expense but had no tool to look one up or change it.
- "I cancelled Canva at the end of June" → Navigator finds the entry and sets its end date (updateRecurringExpense, endDate). The approval card shows the date. The entry stays active, so its charges up to that date keep counting. With no date given, Flight Crew asks for one.
- "My lease ends December 31" → the same tool with a date still ahead. The entry counts as usual until then, and next year's plan leaves out its charges after that date.
- "What are the business expenses in my plan for next year?" → the "Next-year plan" context line gives the figure and the year it is for. It is the dashboard's row.
- "Delete my Canva subscription" → deleteRecurringExpense, for an entry made by mistake. The approval card and the reply both say the months already past this year come out of the totals. For an expense that was real, Flight Crew sets an end date instead.
- "Pause my MLS fees" → updateRecurringExpense, isActive false. A paused entry counts in no total, past months included, until it is resumed.
- "What are my recurring expenses?" → Navigator lists them (searchRecurringExpenses), each with its own frequency and marked Active, "Ended <date>" or Paused. "How many recurring expenses do I have?" counts the ones still running and says how many have ended.
- The Claude Connector's get_expenses lists an end_date on a recurring expense that has one, and its monthly_recurring is 0 once the date has passed. Its next_year_expenses (year, total, recurring) is the figure next year's plan deducts.
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
  count on a monthly / quarterly / annual schedule.
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
