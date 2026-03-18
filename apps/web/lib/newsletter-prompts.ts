/**
 * lib/newsletter-prompts.ts
 *
 * Groq prompt builders for AI-drafted client newsletters.
 *
 * Newsletters differ from individual outreach:
 *   - Broadcast (sent to many clients, not one person)
 *   - Longer (300–450 words vs 150–200 for outreach)
 *   - No client name — written as a personal broadcast from the agent
 *   - Same SUBJECT convention: last line = "SUBJECT: ..."
 *   - Genuine value-first: news, analysis, insight — not just a soft pitch
 *
 * Used by:
 *   - /api/ai/draft-newsletter  (on-demand, agent-triggered)
 */

import { type Tone, TONE_INSTRUCTIONS } from "@/lib/outreach-prompts";
export type { Tone };

// ── Market stats shape (mirrors market_data_points columns) ──────────────────

export interface MarketStats {
  benchmark_price:     number | null;
  avg_price:           number | null;
  sales:               number | null;
  new_listings:        number | null;
  months_of_inventory: number | null;
  yoy_price_pct:       number | null;
  yoy_sales_pct:       number | null;
}

// ── BoC Rate Change Newsletter ────────────────────────────────────────────────

export function buildBocRateChangeNewsletterPrompt(
  agentFirst:    string,
  oldRate:       number,
  newRate:       number,
  effectiveDate: string,    // e.g. "March 12, 2025"
  notes:         string | null,
  tone:          Tone = "friendly",
): string {
  const direction = newRate > oldRate ? "increased" : newRate < oldRate ? "decreased" : "held";
  const change    = Math.abs(newRate - oldRate);
  const bps       = Math.round(change * 100);
  const movement  =
    direction === "held"
      ? "held its overnight rate steady"
      : `${direction} its overnight rate by ${bps} basis point${bps !== 1 ? "s" : ""} (${change.toFixed(2)}%)`;

  const newRateFormatted = newRate.toFixed(2);
  const oldRateFormatted = oldRate.toFixed(2);

  const agentNotes = notes
    ? `\nThe agent wants to include this additional context or commentary:\n"${notes}"\n`
    : "";

  return `You are ghostwriting a client newsletter from a Canadian real estate agent named ${agentFirst}.
This email goes to their entire client list — past buyers, sellers, and active clients.

Context:
- The Bank of Canada has ${movement} (effective ${effectiveDate})
- Previous rate: ${oldRateFormatted}%
- New rate: ${newRateFormatted}%
- Standard Canadian mortgages use prime rate (approximately BoC rate + 2.20%)${agentNotes}

${TONE_INSTRUCTIONS[tone]}

Write a 3–4 paragraph newsletter-style email (300–380 words) that:
- Opens with a direct, clear statement of the rate change — NOT "I hope you're doing well" or anything generic
- DO NOT open with "The Bank of Canada just…" — find a more human angle
- DO NOT start with "Subject:" — write the body first
- Explains what the change means in plain language for:
  (a) Homeowners with a variable-rate mortgage or approaching renewal
  (b) Buyers currently in the market — how does this affect qualifying?
  (c) Sellers — what does it signal about demand?
- Includes one genuinely useful insight (e.g. rough monthly payment impact on a $500K mortgage, or the market context for this decision)
- Ends with a soft, genuine CTA: the agent is happy to talk through what this means for their specific situation
- Does NOT feel like a mass email — feels like the agent actually sat down and wrote it
- Sign off with just "${agentFirst}" — no "Best regards," no "Sincerely"
- Vary sentence length. Numbers and specifics make it credible.

On the very last line of your response, write exactly:
SUBJECT: [concise, informative subject — references the rate change specifically, not generic "Market Update"]`;
}

// ── Market Update Newsletter ───────────────────────────────────────────────────

export function buildMarketUpdateNewsletterPrompt(
  agentFirst: string,
  boardName:  string,
  monthYear:  string,         // e.g. "March 2025"
  stats:      MarketStats,
  tone:       Tone = "friendly",
): string {
  // Format the stats into a readable block for the prompt
  const statsLines: string[] = [];

  if (stats.benchmark_price)
    statsLines.push(`Benchmark price: $${stats.benchmark_price.toLocaleString("en-CA")}`);
  if (stats.avg_price)
    statsLines.push(`Average price: $${stats.avg_price.toLocaleString("en-CA")}`);
  if (stats.sales)
    statsLines.push(`Homes sold: ${stats.sales.toLocaleString("en-CA")}`);
  if (stats.new_listings)
    statsLines.push(`New listings: ${stats.new_listings.toLocaleString("en-CA")}`);
  if (stats.months_of_inventory != null)
    statsLines.push(`Months of inventory: ${stats.months_of_inventory.toFixed(1)}`);
  if (stats.yoy_price_pct != null)
    statsLines.push(`Year-over-year price change: ${stats.yoy_price_pct >= 0 ? "+" : ""}${stats.yoy_price_pct.toFixed(1)}%`);
  if (stats.yoy_sales_pct != null)
    statsLines.push(`Year-over-year sales change: ${stats.yoy_sales_pct >= 0 ? "+" : ""}${stats.yoy_sales_pct.toFixed(1)}%`);

  const marketCondition =
    stats.months_of_inventory == null ? "market conditions unknown"
    : stats.months_of_inventory < 2   ? "a strong seller's market (under 2 months inventory)"
    : stats.months_of_inventory < 4   ? "a balanced-to-seller's market"
    : stats.months_of_inventory < 6   ? "a balanced market"
    : "a buyer's market (over 6 months inventory)";

  const statsBlock = statsLines.length > 0
    ? `\nLatest CREA MLS® data for ${boardName} — ${monthYear}:\n${statsLines.map(l => `  • ${l}`).join("\n")}\n`
    : `\nMarket: ${boardName}, ${monthYear} (specific stats not available — use general commentary)\n`;

  return `You are ghostwriting a monthly market update newsletter from a Canadian real estate agent named ${agentFirst}.
This email goes to their entire client list — past buyers, sellers, active clients, and investors.
${statsBlock}
Market condition signal: ${marketCondition}

${TONE_INSTRUCTIONS[tone]}

Write a 3–4 paragraph market update email (300–400 words) that:
- Opens with a compelling observation about the current market — NOT "Here's your monthly market update!"
- DO NOT start with "Subject:" — write the body first
- Uses the actual stats to tell a coherent story about the market — don't just list numbers, interpret them
- Covers what the data means for:
  (a) Homeowners — what is their equity doing? Is now a good time to list?
  (b) Buyers — is inventory improving? What's the competition like?
- Includes at least one concrete, actionable takeaway the reader can act on
- Ends with a genuine offer: the agent can run a free, no-obligation home value estimate or answer questions
- Reads like a trusted local expert wrote it — not like a Mailchimp template
- Sign off with just "${agentFirst}"
- Vary sentence length. Specific numbers are more credible than vague claims.

On the very last line of your response, write exactly:
SUBJECT: [concise subject that references the market or month — not just "Market Update"]`;
}

// ── Custom Newsletter ─────────────────────────────────────────────────────────

export function buildCustomNewsletterPrompt(
  agentFirst: string,
  topic:      string,
  notes:      string | null,
  tone:       Tone = "friendly",
): string {
  const agentNotes = notes
    ? `\nThe agent wants to include these specific points or angles:\n"${notes}"\n`
    : "";

  return `You are ghostwriting a client newsletter from a Canadian real estate agent named ${agentFirst}.
This email goes to their entire client list in Canada.

Newsletter topic: "${topic}"${agentNotes}

${TONE_INSTRUCTIONS[tone]}

Write a 3–4 paragraph newsletter email (280–380 words) that:
- Hooks the reader immediately on the topic — no generic opener, no "I hope you're doing well"
- DO NOT start with "Subject:" — write the body first
- Covers the topic with genuine insight that's actually useful to a Canadian homeowner or real estate client
- Connects the topic to real estate in a natural way — not forced
- Ends with a soft, relevant CTA that flows from the topic
- Feels like the agent thought of their clients first, wrote something worth reading, and hit send
- Sign off with just "${agentFirst}"
- Vary sentence length. Short punchy sentences are powerful. Mix them in.

On the very last line of your response, write exactly:
SUBJECT: [clear, engaging subject that reflects the specific topic — not clickbaity, not generic]`;
}
