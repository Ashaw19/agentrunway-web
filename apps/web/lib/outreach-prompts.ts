/**
 * lib/outreach-prompts.ts
 *
 * Shared Groq prompt builders for AI Flight Control outreach drafting.
 *
 * Used by:
 *   - /api/ai/detect-opportunities  (batch daily scan)
 *   - /api/ai/draft-outreach        (single-item, agent-triggered)
 *
 * Each builder returns a complete prompt string. The SUBJECT line is appended
 * by the model on its very last output line as "SUBJECT: ..." so the caller
 * can split it out cleanly.
 *
 * Prompt quality guidelines (applied to all builders):
 *   - Ghostwrite as the agent, never as the CRM
 *   - Ban clichéd openers ("I hope this email finds you well")
 *   - SUBJECT line on final line — parseable with a single regex
 *   - Sign-off: agent first name only, no formal closing
 *   - Vary sentence length — short punchy sentences mixed in
 *   - Under 200 words — agents send these, not read them
 */

// ── Tone system ───────────────────────────────────────────────────────────────

export type Tone = "casual" | "friendly" | "professional" | "formal";

export const TONE_INSTRUCTIONS: Record<Tone, string> = {
  casual: `TONE: Very casual, like texting a close friend. Use contractions freely, short sentences, maybe even humour. First names only. Think "buddy sending a quick note" — not an agent running a campaign. No formal greetings.`,
  friendly: `TONE: Warm and conversational — like a friendly neighbour who also happens to be their agent. Use contractions, keep it light, but still polished. No stiff corporate language. Write like you'd talk over coffee.`,
  professional: `TONE: Polished and respectful. Warm but business-appropriate. Use full sentences and proper structure, though contractions are fine. Reads like a trusted advisor — capable and personable.`,
  formal: `TONE: Respectful, precise, and measured. Minimal contractions. Appropriate for a high-net-worth investor or executive. Every sentence should convey competence and discretion. No slang, no emojis, no exclamation marks.`,
};

// ── Transaction side helper ───────────────────────────────────────────────────

/** Returns true only when the agent's role was purely seller-side. */
function wasSeller(side?: "buyer" | "seller" | "both" | null): boolean {
  return side === "seller";
}

// ── Phase A: Core opportunity types ──────────────────────────────────────────

export function buildAnniversaryPrompt(
  agentFirst: string,
  clientName: string,
  years: number,
  address: string | null,
  province: string | null,
  tone: Tone = "friendly",
  side?: "buyer" | "seller" | "both" | null,
): string {
  const location = [address, province].filter(Boolean).join(", ");

  if (wasSeller(side)) {
    const prop = location || "their former property";
    return `You are ghostwriting a personal email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- Milestone: ${years}-year anniversary since ${clientName} SOLD their property
- Property sold: ${prop}
- CRITICAL: ${clientName} was the SELLER — they no longer own this property. Do NOT ask "how's life at the house" or imply they still live there.
- This is about acknowledging a meaningful moment and staying in touch

${TONE_INSTRUCTIONS[tone]}

Write a ${years}-year sale anniversary email (3–4 short paragraphs, under 180 words total).
- DO NOT open with "I hope this email finds you well" or any clichéd opener.
- DO NOT start with "Subject:" — just write the email body.
- Acknowledge the milestone naturally — ${years} year${years !== 1 ? "s" : ""} since the sale.
- Reflect briefly on the experience together — keep it warm, not transactional.
- Soft CTA: if they're ever thinking about their next real estate move, you're always available.
- Sign off with just "${agentFirst}" — no formal closing.
- Vary sentence length. Short sentences are powerful. Mix them in.

On the very last line of your response, write exactly:
SUBJECT: [your subject line — keep it short, personal, not clickbaity]`;
  }

  return `You are ghostwriting a personal email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- Milestone: ${years}-year anniversary of the client's home purchase
- Property: ${location || "their home"}

${TONE_INSTRUCTIONS[tone]}

Write a ${years}-year closing anniversary email (3–4 short paragraphs, under 180 words total).
- DO NOT open with "I hope this email finds you well" or any clichéd opener.
- DO NOT start with "Subject:" — just write the email body.
- Reference the property or neighbourhood naturally — make it feel like YOU remember.
- Include a soft CTA: offer a free home-value update or simply invite them to catch up.
- Sign off with just "${agentFirst}" — no "Best regards," no "Sincerely," no formal closing line.
- This should read like a real person wrote it in 2 minutes, not like ChatGPT generated it.
- Vary sentence length. Short sentences are powerful. Mix them in.

On the very last line of your response, write exactly:
SUBJECT: [your subject line — keep it short, personal, not clickbaity]`;
}

export function buildIdlePrompt(
  agentFirst: string,
  clientName: string,
  lastDeal: string | null,
  city: string | null,
  province: string | null,
  tone: Tone = "friendly",
): string {
  const location = [city, province].filter(Boolean).join(", ");
  const month    = new Date().getMonth();
  const season   =
    month >= 2  && month <= 4  ? "spring market season"  :
    month >= 5  && month <= 7  ? "summer"                :
    month >= 8  && month <= 10 ? "fall market"           : "new year";
  void lastDeal;

  return `You are ghostwriting a genuine check-in email from a Canadian real estate agent named ${agentFirst} to a past client named ${clientName} they haven't been in touch with for a while.

Context:
- Last property: ${location || "a property in Canada"}
- It's the ${season} in Canada

${TONE_INSTRUCTIONS[tone]}

Write a natural 2–3 paragraph check-in email (under 150 words) that:
- Feels like it comes from someone who actually remembers this person — not a CRM drip
- DO NOT open with "I hope this email finds you well" or similar clichés
- DO NOT start with "Subject:" — just write the email body
- Reference something real: the ${season}, their neighbourhood, life in general
- Include a relaxed CTA: coffee, a quick call, or a free home-value check
- Does NOT apologise for not reaching out sooner — just pick up naturally
- Sign off with just "${agentFirst}" — no formal closing line
- Vary sentence length. Keep it human. One-word sentences are fine.

On the very last line, write exactly:
SUBJECT: [short, casual subject — not "Checking In!" or anything generic]`;
}

export function buildBirthdayPrompt(
  agentFirst: string,
  clientName: string,
  tone: Tone = "friendly",
): string {
  return `You are ghostwriting a short, warm birthday email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph birthday message (under 80 words) that:
- Feels genuinely personal — like a friend remembered, not an automated system
- DO NOT mention real estate, home values, or ask for anything
- DO NOT start with "Subject:" — just write the message
- The goal: make the client smile and feel remembered
- Sign off with just "${agentFirst}" — no formal closing
- Keep it real. A birthday message that sounds like AI is worse than no message at all.

On the very last line, write exactly:
SUBJECT: [short personal birthday subject — not "Happy Birthday!" which screams auto-generated]`;
}

// ── Batch 1: Post-Close Nurture ───────────────────────────────────────────────

export function buildPostClose3Prompt(
  agentFirst: string,
  clientName: string,
  address:    string | null,
  tone:       Tone = "friendly",
  side?:      "buyer" | "seller" | "both" | null,
): string {
  const prop = address ?? (wasSeller(side) ? "the property" : "their new home");

  if (wasSeller(side)) {
    return `You are ghostwriting a short, genuine email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, sent 3 days after ${clientName}'s property sale just closed.

Context:
- Property SOLD: ${prop}
- CRITICAL: ${clientName} was the SELLER. They sold this property. Do NOT say anything about moving in, settling in, or life at the new house — there is no new house in this context.
- This is a post-sale check-in, not a move-in note.

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph note (under 100 words) that:
- Acknowledges that closing day is a big deal — relief, a little bittersweet, a lot of emotions
- Checks in simply: how are they feeling now that it's done?
- Offers to help with whatever comes next — whether that's finding their next place, a rental, or just having a resource
- Sign off with just "${agentFirst}"
- Vary sentence length. Keep it warm and real.

On the very last line, write exactly:
SUBJECT: [short, personal subject — not "Congratulations!" which screams automated]`;
  }

  return `You are ghostwriting a short, genuine email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, sent 3 days after the client's deal just closed.

Context:
- Property: ${prop}

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph move-in congratulations (under 100 words) that:
- Feels like a warm text from a friend, not a corporate follow-up
- DO NOT open with "I hope this email finds you well" or similar clichés
- DO NOT start with "Subject:"
- Acknowledge the excitement of the first few days in a new home
- Offer to help with anything — local recommendations, tradespeople, questions
- Sign off with just "${agentFirst}"
- Vary sentence length. Keep it warm and real.

On the very last line, write exactly:
SUBJECT: [short, personal subject — not "Congratulations!" which screams automated]`;
}

export function buildPostClose14Prompt(
  agentFirst: string,
  clientName: string,
  address:    string | null,
  tone:       Tone = "friendly",
  side?:      "buyer" | "seller" | "both" | null,
): string {
  const prop = address ?? (wasSeller(side) ? "the property" : "the new place");

  if (wasSeller(side)) {
    return `You are ghostwriting a casual check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, two weeks after their property sale closed.

Context:
- Property SOLD: ${prop}
- CRITICAL: ${clientName} was the SELLER. Do NOT reference settling in, moving in, or the new place — they sold this home.
- Two weeks out from a sale — the paperwork is done, the adrenaline has faded, emotions can be mixed.

${TONE_INSTRUCTIONS[tone]}

Write a 2-paragraph check-in (under 100 words) that:
- Acknowledges it's been two weeks since the sale — life has probably shifted a bit
- Asks a genuine open question: how are they doing, how has the transition been?
- Keeps it light — no agenda, no ask
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual, personal subject — a reference to the sale or simply checking in on them]`;
  }

  return `You are ghostwriting a casual check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, two weeks after closing.

Context:
- Property: ${prop}

${TONE_INSTRUCTIONS[tone]}

Write a 2-paragraph check-in (under 100 words) that:
- Feels like a genuine "how's it going?" — not a scripted follow-up
- DO NOT open with clichés like "I hope you're settling in well"
- DO NOT start with "Subject:"
- Reference that it's been about two weeks — the chaos of moving should be clearing up
- Ask a simple open question: how are they finding the neighbourhood, the commute, anything
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual, personal subject — could be as simple as their street name or a reference to the move]`;
}

export function buildPostClose90Prompt(
  agentFirst: string,
  clientName: string,
  address:    string | null,
  province:   string | null,
  tone:       Tone = "friendly",
  side?:      "buyer" | "seller" | "both" | null,
): string {
  const location = [address, province].filter(Boolean).join(", ") || (wasSeller(side) ? "the property" : "the home");

  if (wasSeller(side)) {
    return `You are ghostwriting a 3-month check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}.

Context:
- Property SOLD: ${location}
- It's been 90 days since ${clientName} sold — three months since closing
- CRITICAL: ${clientName} was the SELLER. Do NOT reference "their home" as something they still own. They sold it.

${TONE_INSTRUCTIONS[tone]}

Write a warm 2–3 paragraph check-in (under 150 words) that:
- Acknowledges the 3-month mark since the sale — naturally, not formally
- DO NOT open with clichés
- DO NOT start with "Subject:"
- Asks how life has been going since the sale — keep it personal and open
- Soft CTA: if they're thinking about their next real estate move (or just want to catch up), you're here
- Sign off with just "${agentFirst}"
- Vary sentence length. One or two short punchy sentences work well.

On the very last line, write exactly:
SUBJECT: [personal, not sales-y — reference the timeline naturally without implying they still own the home]`;
  }

  return `You are ghostwriting a 3-month check-in email from a Canadian real estate agent named ${agentFirst} to their client ${clientName}.

Context:
- Property: ${location}
- It's been 90 days since closing — three months in their new home

${TONE_INSTRUCTIONS[tone]}

Write a warm 2–3 paragraph check-in (under 150 words) that:
- Celebrates the 3-month mark naturally — not in a corporate way
- DO NOT open with clichés like "It's hard to believe it's already been 3 months!"
- DO NOT start with "Subject:"
- Mentions that property values shift in the first year — offer a no-obligation current value snapshot
- Keep the CTA soft: "happy to pull a quick update if you're curious"
- Sign off with just "${agentFirst}"
- Vary sentence length. One or two short punchy sentences work well.

On the very last line, write exactly:
SUBJECT: [personal, not sales-y — reference the home or the timeline naturally]`;
}

export function buildReviewRequestPrompt(
  agentFirst: string,
  clientName: string,
  address:    string | null,
  tone:       Tone = "friendly",
  side?:      "buyer" | "seller" | "both" | null,
): string {
  const prop = address ?? (wasSeller(side) ? "your recent sale" : "your recent purchase");
  const transactionLabel = wasSeller(side) ? "sale" : "purchase";
  return `You are ghostwriting an honest, non-pushy review request from a Canadian real estate agent named ${agentFirst} to their recent client ${clientName}.

Context:
- Property: ${prop}
- Transaction type: ${transactionLabel}
- It's been about 3 weeks since closing — experience is still fresh

${TONE_INSTRUCTIONS[tone]}

Write a short 2-paragraph review request (under 120 words) that:
- Opens by genuinely hoping the move went smoothly — but NOT with "I hope this email finds you well"
- DO NOT start with "Subject:"
- Asks honestly if they'd be willing to share their experience on Google or Realtor.ca
- Makes it clear it's completely optional, no pressure — just one sentence asking
- Does NOT grovel or over-explain why reviews matter
- Sign off with just "${agentFirst}"
- The tone should feel like asking a favour from a friend, not a business transaction

On the very last line, write exactly:
SUBJECT: [short, genuine subject — not "Quick Favour!" or "Review Request"]`;
}

export function buildReferralAskPrompt(
  agentFirst: string,
  clientName: string,
  address:    string | null,
  tone:       Tone = "friendly",
  side?:      "buyer" | "seller" | "both" | null,
): string {
  const prop = address ?? (wasSeller(side) ? "since the sale" : "your new home");
  const settledLine = wasSeller(side)
    ? "Client sold their property 6 weeks ago — the dust has settled"
    : "Client has had time to settle in — the chaos is over";
  return `You are ghostwriting a natural referral ask from a Canadian real estate agent named ${agentFirst} to their client ${clientName}, about 6 weeks after closing.

Context:
- Property: ${prop}
- ${settledLine}

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph referral ask (under 120 words) that:
- Opens by connecting with how they're doing — NOT a cliché opener
- DO NOT start with "Subject:"
- Mentions that most of the agent's best clients come from people like ${clientName}
- Makes a genuine, low-pressure ask: if anyone they know is thinking about buying or selling, ${agentFirst} would love the introduction
- Does NOT use corporate phrases like "I'd appreciate any referrals you can send my way"
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual, warm subject — not "Referral Request" which nobody opens]`;
}

// ── Batch 2: Relationship Milestones ─────────────────────────────────────────

export function buildNewClientWelcomePrompt(
  agentFirst: string,
  clientName: string,
  tone:       Tone = "friendly",
): string {
  return `You are ghostwriting a brief welcome email from a Canadian real estate agent named ${agentFirst} to their new client ${clientName}, sent about a week after they first connected.

${TONE_INSTRUCTIONS[tone]}

Write a warm 2-paragraph welcome (under 100 words) that:
- Feels like a genuine personal note, not an onboarding template
- DO NOT open with "Welcome aboard!" or "I'm excited to work with you!"
- DO NOT start with "Subject:"
- Reminds them that ${agentFirst} is available for any questions — big or small
- One line about what to expect from working together
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [personal, low-key subject — could just reference their first conversation or their goal]`;
}

export function buildContactAnniversaryPrompt(
  agentFirst: string,
  clientName: string,
  years:      number,
  tone:       Tone = "friendly",
): string {
  const ordinal = years === 1 ? "first" : years === 2 ? "second" : years === 3 ? "third" : `${years}th`;
  return `You are ghostwriting a short relationship anniversary email from a Canadian real estate agent named ${agentFirst} to their long-time client ${clientName}.

Context:
- It's been ${years} year${years !== 1 ? "s" : ""} since they first connected as agent and client

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph note (under 100 words) that:
- Acknowledges the ${ordinal} year of working together — naturally, not formally
- DO NOT open with "Time flies!" or similar clichés
- DO NOT start with "Subject:"
- Expresses genuine appreciation without being overly sentimental
- Keeps it light — maybe a small reflection on what's changed in the market or their life
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [warm, personal subject — reference the ${ordinal} year naturally]`;
}

export function buildMultiDealMilestonePrompt(
  agentFirst: string,
  clientName: string,
  dealCount:  number,
  tone:       Tone = "friendly",
): string {
  const ordinal = dealCount === 2 ? "second" : dealCount === 3 ? "third" : `${dealCount}th`;
  return `You are ghostwriting a short thank-you from a Canadian real estate agent named ${agentFirst} to their repeat client ${clientName}, who has just completed their ${ordinal} deal together.

${TONE_INSTRUCTIONS[tone]}

Write a genuine 2-paragraph note (under 110 words) that:
- Thanks ${clientName} for trusting ${agentFirst} again — but naturally, not formally
- DO NOT open with "It means so much to me!" or generic gratitude clichés
- DO NOT start with "Subject:"
- Acknowledges that returning clients are rare and appreciated — make it feel earned
- Ends with a forward-looking note: here whenever they need anything next
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [concise, warm subject that references working together again]`;
}

// ── Batch 3: Seasonal Campaigns ───────────────────────────────────────────────

export function buildSeasonalSpringPrompt(
  agentFirst: string,
  clientName: string,
  province:   string | null,
  tone:       Tone = "friendly",
): string {
  const market = province ? `the ${province} real estate market` : "the Canadian real estate market";
  return `You are ghostwriting a spring market update email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's the spring real estate season in Canada
- ${market} typically sees increased activity this time of year

${TONE_INSTRUCTIONS[tone]}

Write a 3-paragraph spring market note (under 160 words) that:
- Opens with a seasonal observation about spring and real estate — but NOT "Spring is in the air!"
- DO NOT start with "Subject:"
- Shares a brief, genuine insight about the current spring market — what's moving, what's changed
- Includes a soft CTA: happy to share what their home could be worth now, or discuss options
- Does NOT feel like a mass newsletter — reads like it's written specifically for them
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [conversational spring market subject — not "Spring Market Update" which screams newsletter]`;
}

export function buildSeasonalFallPrompt(
  agentFirst: string,
  clientName: string,
  province:   string | null,
  tone:       Tone = "friendly",
): string {
  const market = province ? `the ${province} market` : "the market";
  return `You are ghostwriting a fall market check-in from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's the fall real estate season in Canada
- ${market} enters one of its two active selling periods

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph fall note (under 150 words) that:
- Opens with something real about fall — NOT "The leaves are changing and so is the market!"
- DO NOT start with "Subject:"
- Mentions that fall is a serious buying/selling window before winter slows things down
- Offers a free home-value check or a 10-minute call to discuss the current market
- Feels personal, not mass-blasted
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual fall subject — something that doesn't scream "seasonal real estate email"]`;
}

export function buildSeasonalYearEndPrompt(
  agentFirst: string,
  clientName: string,
  tone:       Tone = "friendly",
): string {
  return `You are ghostwriting a genuine year-end note from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

${TONE_INSTRUCTIONS[tone]}

Write a short 2-paragraph year-end message (under 120 words) that:
- Reflects briefly on the year — NOT with "What a year it's been!"
- DO NOT start with "Subject:"
- Expresses genuine appreciation for the relationship — without being saccharine
- Wishes them well for the coming year with one forward-looking sentence
- Does NOT mention real estate, listings, or market trends — this is a pure relationship touchpoint
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [warm year-end subject that doesn't feel like a corporate holiday card]`;
}

export function buildSeasonalTaxPrompt(
  agentFirst: string,
  clientName: string,
  province:   string | null,
  tone:       Tone = "friendly",
): string {
  const prov = province ?? "Canada";
  return `You are ghostwriting a helpful tax-season tip email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}, who owns real estate in ${prov}.

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph tax-season note (under 150 words) that:
- Opens with an observation about tax season arriving — NOT "Tax season is here!"
- DO NOT start with "Subject:"
- Shares one or two genuinely useful reminders: principal residence exemption, rental income, FHSA/RRSP home buyer's plan, capital gains on investment properties — pick what's relevant
- Reminds them that ${agentFirst} can connect them with a great accountant or mortgage broker if needed
- Ends with a low-pressure offer to answer any real estate–related tax questions
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [practical, approachable subject about tax season — not "Important Tax Reminder!"]`;
}

// ── Batch 4: Intelligent Outreach (briefing-triggered) ────────────────────────

export function buildMortgageRenewalDuePrompt(
  agentFirst:       string,
  clientName:       string,
  closeDate:        string,       // "YYYY-MM-DD" — original purchase date
  daysUntilRenewal: number,
  address:          string | null,
  tone:             Tone = "friendly",
): string {
  const closeYear = closeDate.slice(0, 4);
  const prop      = address ?? "their home";
  const timing    =
    daysUntilRenewal <= 0
      ? "has arrived (or is overdue)"
      : daysUntilRenewal <= 30
      ? `is in about ${daysUntilRenewal} days`
      : `is approximately ${Math.round(daysUntilRenewal / 30)} month${Math.round(daysUntilRenewal / 30) !== 1 ? "s" : ""} away`;

  return `You are ghostwriting a proactive, helpful email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- The client's mortgage on ${prop} (purchased ${closeYear}) is due for renewal — the 5-year term ${timing}
- Standard Canadian mortgages renew every 5 years — this is a financially significant moment
- The agent wants to reach out before the bank does and position themselves as a trusted advisor
- ${agentFirst} can connect the client with a trusted mortgage broker to shop rates

${TONE_INSTRUCTIONS[tone]}

Write a genuine 2–3 paragraph email (under 150 words) that:
- Opens with awareness of the renewal — NOT "Your mortgage renewal is coming up!"
- DO NOT start with "Subject:"
- Notes that most clients just auto-renew with their existing lender without shopping — this costs them
- Mentions that ${agentFirst} can make a warm introduction to a broker who can review options
- Keeps the CTA soft: a quick call or intro whenever they're ready — no pressure
- Sign off with just "${agentFirst}"
- Vary sentence length. This should feel like someone genuinely thought of them.

On the very last line, write exactly:
SUBJECT: [timely, personal subject — references the timing naturally without being alarmist]`;
}

export function buildMortgageRenewalWindowPrompt(
  agentFirst:         string,
  clientName:         string,
  closeDate:          string,
  monthsUntilRenewal: number,
  address:            string | null,
  tone:               Tone = "friendly",
): string {
  const closeYear = closeDate.slice(0, 4);
  const prop      = address ?? "their home";

  return `You are ghostwriting a forward-thinking, low-pressure email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- The client's home (${prop}, purchased ${closeYear}) has a 5-year mortgage term renewing in approximately ${monthsUntilRenewal} months
- This is early — the goal is to start the conversation, not pressure them

${TONE_INSTRUCTIONS[tone]}

Write a brief 2-paragraph email (under 130 words) that:
- Opens with a natural check-in — does NOT launch straight into mortgage talk
- DO NOT start with "Subject:"
- Eases into it: with renewal roughly ${monthsUntilRenewal} months away, now is actually a good time to start monitoring rates
- Notes that getting a broker to watch options early often pays off — no rush, just worth knowing
- Keeps it very low-key — plant the seed, don't water it too aggressively
- Offers to connect them with a trusted broker when the time feels right
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [casual subject — could reference their home, neighbourhood, or upcoming milestone naturally]`;
}

export function buildPastClientCheckInPrompt(
  agentFirst:  string,
  clientName:  string,
  monthsIdle:  number,
  province:    string | null,
  tone:        Tone = "friendly",
): string {
  const month  = new Date().getMonth();
  const season =
    month >= 2 && month <= 4 ? "spring market season" :
    month >= 5 && month <= 7 ? "summer"               :
    month >= 8 && month <= 10 ? "fall market"         : "new year";

  return `You are ghostwriting a warm, genuine check-in from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's been approximately ${monthsIdle} months since the agent has been in touch
- It's the ${season} in Canada${province ? `, specifically in ${province}` : ""}
- This is purely a relationship touchpoint — no agenda, no ask

${TONE_INSTRUCTIONS[tone]}

Write a natural 2-paragraph check-in (under 130 words) that:
- Picks up naturally — NO apology for the gap in communication
- DO NOT open with "I hope this email finds you well" or similar clichés
- DO NOT start with "Subject:"
- References the ${season} or something real about homeownership or life in general
- Ends with an open invitation: coffee, a quick call, or just a warm "hello"
- Does NOT pitch anything — pure human connection
- Sign off with just "${agentFirst}"
- Short sentences. Real language. No corporate warmth.

On the very last line, write exactly:
SUBJECT: [casual, personal subject — not "Checking In!" — something that looks like it came from a real person]`;
}

export function buildTimeframeApproachingPrompt(
  agentFirst:     string,
  clientName:     string,
  timeframeLabel: string,   // e.g. "1–3 Month", "3–6 Month"
  daysRemaining:  number,
  budget:         number | null,
  tone:           Tone = "friendly",
): string {
  const urgency   =
    daysRemaining <= 0
      ? "their stated window has now arrived"
      : `their window is closing in about ${daysRemaining} days`;
  const budgetLine =
    budget && budget > 0
      ? `Their stated budget is approximately $${budget.toLocaleString("en-CA")}.`
      : "";

  return `You are ghostwriting a timely, helpful check-in from a Canadian real estate agent named ${agentFirst} to their active client ${clientName}.

Context:
- The client mentioned they were planning to buy or sell in a ${timeframeLabel} timeframe
- ${urgency}
- ${budgetLine}
- The agent wants to check in: are they still on track? Is there anything blocking them?

${TONE_INSTRUCTIONS[tone]}

Write a focused 2-paragraph email (under 130 words) that:
- Opens with direct but warm acknowledgement of where they are in their timeline — NOT "Just following up!"
- DO NOT start with "Subject:"
- Asks genuinely: where are things at? Still on track, or has something shifted?
- Offers a clear next step: a quick call, a pre-approval review, a market walkthrough — whatever fits
- Keeps the tone collaborative — the agent is a partner, not a closer
- Sign off with just "${agentFirst}"

On the very last line, write exactly:
SUBJECT: [direct, caring subject that references their timeline — not "Just Checking In!"]`;
}

export function buildPropertyValueMilestonePrompt(
  agentFirst:     string,
  clientName:     string,
  milestoneYears: number,
  address:        string | null,
  province:       string | null,
  tone:           Tone = "friendly",
  side?:          "buyer" | "seller" | "both" | null,
): string {
  const location = [address, province].filter(Boolean).join(", ") || (wasSeller(side) ? "the property" : "their home");
  const ordinal  =
    milestoneYears === 1  ? "1-year"  :
    milestoneYears === 2  ? "2-year"  :
    milestoneYears === 3  ? "3-year"  : `${milestoneYears}-year`;

  if (wasSeller(side)) {
    return `You are ghostwriting a market intelligence check-in from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's been ${milestoneYears} year${milestoneYears !== 1 ? "s" : ""} since ${clientName} SOLD ${location}
- CRITICAL: ${clientName} was the SELLER — they no longer own this property. Do NOT offer a home value update as if they still own it.
- This is a neighbourood/market update framed as useful context — great for someone thinking about their next move

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph email (under 150 words) that:
- Opens with a natural nod to the ${ordinal} mark since the sale — NOT "Time flies!"
- DO NOT start with "Subject:"
- Shares that the neighbourhood has moved quite a bit since then — positions the agent as someone who tracks these things
- Offers to share a quick market snapshot for the area — useful context whether they're thinking about buying again or just curious
- Soft CTA: happy to share over email or a quick call — no pressure, just a touch point
- Sign off with just "${agentFirst}"
- Vary sentence length. This should feel like the agent genuinely thought of them.

On the very last line, write exactly:
SUBJECT: [warm subject that references the milestone or neighbourhood naturally — NOT implying they still own the property]`;
  }

  return `You are ghostwriting a genuine, value-driven email from a Canadian real estate agent named ${agentFirst} to their past client ${clientName}.

Context:
- It's been ${milestoneYears} year${milestoneYears !== 1 ? "s" : ""} since the client purchased ${location}
- This is a meaningful milestone — markets shift and the ${ordinal} mark is worth acknowledging
- The agent is offering a complimentary, no-obligation home value update (CMA / market snapshot)

${TONE_INSTRUCTIONS[tone]}

Write a 2–3 paragraph email (under 150 words) that:
- Opens with a natural nod to the ${ordinal} milestone — NOT "Time flies!" or "Can you believe it's been ${milestoneYears} years?"
- DO NOT start with "Subject:"
- Mentions that a lot can change in ${milestoneYears} year${milestoneYears !== 1 ? "s" : ""} — market shifts, equity built, neighbourhood evolution
- Offers a complimentary current value estimate — completely no-obligation, "just so you have the number"
- Soft CTA: happy to share the update over email or a 10-minute call — whatever works for them
- Sign off with just "${agentFirst}"
- Vary sentence length. This should feel like the agent pulled up their file and genuinely thought of them.

On the very last line, write exactly:
SUBJECT: [warm subject that references the milestone or property naturally — not "Your Home's Value Update"]`;
}
