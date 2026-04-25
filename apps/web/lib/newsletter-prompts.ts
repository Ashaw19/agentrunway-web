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

import { type Tone, TONE_INSTRUCTIONS, AGENT_RUNWAY_VOICE } from "@/lib/outreach-prompts";
export type { Tone };

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
SUBJECT: [concise, informative subject — references the rate change specifically, not generic "Market Update"]

${AGENT_RUNWAY_VOICE}`;
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
SUBJECT: [clear, engaging subject that reflects the specific topic — not clickbaity, not generic]

${AGENT_RUNWAY_VOICE}`;
}
