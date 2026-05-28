/**
 * Voice & Personality Quiz — canonical question set + derivation logic.
 *
 * Shared between the web Settings Voice Quiz modal
 * (`apps/web/app/(app)/settings/voice-quiz-modal.tsx`) and the mobile
 * Voice Quiz screen (`apps/mobile/app/(app)/profile/voice-quiz.tsx`).
 *
 * Lifted from the web modal during the mobile Settings parity build
 * (PR closing audit gap #14, 2026-05-27). Before this lift, the quiz
 * data + derivation lived only in the web modal — porting to mobile
 * would have duplicated 12 questions × 5 options × derivation rules
 * with no enforcement, so a future content edit on either side would
 * silently drift. This module is the single source of truth.
 *
 * Both surfaces import the QUESTIONS array, `deriveProfile`, and
 * `buildAiVoiceSummary` from here. Trait display labels + colors stay
 * with each surface (web uses Tailwind class strings; mobile uses
 * theme tokens).
 */
import type { CommunicationProfile } from "../types/database";

// ── Quiz data ──────────────────────────────────────────────────────────────

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "A client just got their offer accepted. Your first instinct?",
    options: [
      { key: "A", text: "ALL CAPS TEXT. Possibly multiple exclamation marks. Zero regrets." },
      { key: "B", text: "A genuine warm message — excited but composed. You're a professional, after all." },
      { key: "C", text: "You call them. This moment deserves a real voice." },
      { key: "D", text: "Short and punchy. \"We got it. Let's talk next steps.\" They know you're thrilled." },
      { key: "E", text: "You probably cry a little. You're invested in these people." },
    ],
  },
  {
    id: "q2",
    question: "A client ghosts you after three follow-ups. What do you send next?",
    options: [
      { key: "A", text: "The classic \"just bumping this up\" — simple, no drama." },
      { key: "B", text: "Something self-aware: \"I'm starting to feel like I'm leaving voicemails for a celebrity.\"" },
      { key: "C", text: "A genuine check-in that acknowledges the silence without making it weird." },
      { key: "D", text: "You give them real space and try again in two weeks with fresh context." },
      { key: "E", text: "One final \"door's always open\" message and then you move on with your life." },
    ],
  },
  {
    id: "q3",
    question: "You need to tell a seller their price is too high. How?",
    options: [
      { key: "A", text: "Blunt and data-first. Numbers don't lie and neither do you." },
      { key: "B", text: "Soften it with context — comparables, market conditions, then the number." },
      { key: "C", text: "Frame it around their goal: \"Here's what we need to do to get you sold by June.\"" },
      { key: "D", text: "Ask questions until they arrive at the conclusion themselves." },
      { key: "E", text: "You've had this conversation enough times you have a whole script. It works." },
    ],
  },
  {
    id: "q4",
    question: "Which of these would you actually write? (Pick every one that fits)",
    options: [
      { key: "A", text: "\"Happy to connect this week if you have a few minutes.\"" },
      { key: "B", text: "\"Let me know when works — I'm flexible.\"" },
      { key: "C", text: "\"Shoot me a time that's good for you and we'll make it happen.\"" },
      { key: "D", text: "\"I've got Tuesday at 2 or Thursday morning — which works?\"" },
      { key: "E", text: "\"Would love to chat when you get a chance — no rush at all.\"" },
    ],
  },
  {
    id: "q5",
    question: "A client sends a rambling 3-paragraph email to ask one simple question. You:",
    options: [
      { key: "A", text: "Answer exactly what they asked. Clean and concise." },
      { key: "B", text: "Answer the question AND the three things buried in there they didn't realize they were asking." },
      { key: "C", text: "Gently organize your reply so things are clearer going forward." },
      { key: "D", text: "Match their energy — if they're wordy, you're wordy back." },
      { key: "E", text: "Pick up the phone. Some people just aren't email people." },
    ],
  },
  {
    id: "q6",
    question: "How would a client describe your texting style?",
    options: [
      { key: "A", text: "Fast. Short. Gets to the point." },
      { key: "B", text: "Thoughtful — never feels rushed, always has the full picture." },
      { key: "C", text: "Surprisingly funny for a real estate agent." },
      { key: "D", text: "Professional but warm — you always feel like they actually care." },
      { key: "E", text: "Enthusiastic emoji user and you will not be taking questions." },
    ],
  },
  {
    id: "q7",
    question: "Following up after a showing where the client seemed lukewarm. You lead with:",
    options: [
      { key: "A", text: "\"Great seeing you today — wanted to follow up on the showing.\"" },
      { key: "B", text: "\"I could tell that one wasn't it. Here's what I think gets us closer.\"" },
      { key: "C", text: "\"Honest gut check — what felt off?\"" },
      { key: "D", text: "\"Every showing tells us something. Today definitely narrowed things down.\"" },
      { key: "E", text: "You let them come to you. Some clients need a beat before they're ready to talk." },
    ],
  },
  {
    id: "q8",
    question: "Your relationship with real estate jargon:",
    options: [
      { key: "A", text: "Avoided at all costs. If a client needs a glossary, you've failed." },
      { key: "B", text: "Used when it adds precision, explained when it might not land." },
      { key: "C", text: "You lean in — your clients are adults, they hired you to be the expert." },
      { key: "D", text: "Completely depends on the client. You read the room every time." },
      { key: "E", text: "You actively translate it into plain language because the industry is needlessly confusing." },
    ],
  },
  {
    id: "q9",
    question: "A new client was referred by your best past client. How do you open?",
    options: [
      { key: "A", text: "Mention the referral immediately — it's the warmest possible opener." },
      { key: "B", text: "Establish yourself first, mention the referral casually midway." },
      { key: "C", text: "Let the referral speak for itself and focus entirely on their situation." },
      { key: "D", text: "\"So [name] sent you my way — that means I already like you.\"" },
      { key: "E", text: "Reference a specific thing the referring client likely told them about you." },
    ],
  },
  {
    id: "q10",
    question: "Which of these would you genuinely never say?",
    options: [
      { key: "A", text: "\"Honestly, I think you can do better for this price.\"" },
      { key: "B", text: "\"I've seen this situation before — here's exactly what's going to happen.\"" },
      { key: "C", text: "\"The market is what it is. Let's just work with what we've got.\"" },
      { key: "D", text: "\"I know this isn't what you were hoping to hear, but...\"" },
      { key: "E", text: "\"At the end of the day it's just a house.\" (It is never just a house.)" },
    ],
  },
  {
    id: "q11",
    question: "How do you sign off on emails?",
    options: [
      { key: "A", text: "First name only. Clean." },
      { key: "B", text: "Full name and title — every time, no exceptions." },
      { key: "C", text: "Something warm before your name: \"Talk soon,\" \"Looking forward to it,\" etc." },
      { key: "D", text: "Whatever fits the moment — you're not a template person." },
      { key: "E", text: "You have a whole branded sign-off block. It has your photo in it." },
    ],
  },
  {
    id: "q12",
    question: "Which of these agents are you? Pick every one that fits.",
    options: [
      { key: "A", text: "The trusted advisor — clients feel like they're talking to a knowledgeable friend." },
      { key: "B", text: "The closer — efficient, confident, gets things done without the fluff." },
      { key: "C", text: "The educator — you want every client to actually understand every step." },
      { key: "D", text: "The advocate — you fight hard for your clients and everyone knows it." },
      { key: "E", text: "The connector — the relationship matters more than any single transaction." },
    ],
  },
];

export const QUIZ_QUESTION_COUNT = QUIZ_QUESTIONS.length;

// ── Derivation logic ───────────────────────────────────────────────────────

/**
 * Map raw answers (multi-select per question) into the derived voice
 * profile the AI consumes downstream. The web modal historically owned
 * this function — lifted here so mobile produces identical output.
 *
 * Source of truth: previous body of `deriveProfile()` in
 * `apps/web/app/(app)/settings/voice-quiz-modal.tsx`. Behaviour preserved
 * byte-for-byte; any rule changes here re-derive every user's voice on
 * next quiz save.
 */
export function deriveProfile(
  answers: Record<string, string[]>,
): CommunicationProfile["derived"] {
  // Humor: Q2-B, Q6-C, Q9-D, Q6-E selected
  const humorSignals = [
    answers.q2?.includes("B"),
    answers.q6?.includes("C"),
    answers.q9?.includes("D"),
    answers.q6?.includes("E"),
  ].filter(Boolean).length;
  const humor_level: CommunicationProfile["derived"]["humor_level"] =
    humorSignals >= 3
      ? "frequent"
      : humorSignals >= 2
        ? "moderate"
        : humorSignals >= 1
          ? "light"
          : "none";

  // Directness: Q3-A, Q4-D, Q7-C selected
  const directSignals = [
    answers.q3?.includes("A"),
    answers.q4?.includes("D"),
    answers.q7?.includes("C"),
  ].filter(Boolean).length;
  const directness: CommunicationProfile["derived"]["directness"] =
    directSignals >= 2 ? "high" : directSignals >= 1 ? "medium" : "low";

  // Verbosity: Q5-A/Q4-A = concise; Q5-B/Q5-C = thorough
  const conciseSignals = [
    answers.q5?.includes("A"),
    answers.q4?.includes("A"),
    answers.q4?.includes("B"),
  ].filter(Boolean).length;
  const thoroughSignals = [
    answers.q5?.includes("B"),
    answers.q5?.includes("C"),
  ].filter(Boolean).length;
  const verbosity: CommunicationProfile["derived"]["verbosity"] =
    thoroughSignals > conciseSignals
      ? "thorough"
      : conciseSignals > thoroughSignals
        ? "concise"
        : "balanced";

  // Archetype from Q12
  const archetypeMap: Record<string, string> = {
    A: "trusted_advisor",
    B: "closer",
    C: "educator",
    D: "advocate",
    E: "connector",
  };
  const archetype = (answers.q12 ?? [])
    .map((k) => archetypeMap[k])
    .filter(Boolean);

  // Voice traits
  const voice_traits: string[] = [];
  if (answers.q1?.includes("A") || answers.q1?.includes("E"))
    voice_traits.push("expressive");
  if (answers.q1?.includes("B") || answers.q6?.includes("D"))
    voice_traits.push("warm");
  if (answers.q6?.includes("A") || answers.q5?.includes("A"))
    voice_traits.push("concise");
  if (answers.q7?.includes("B") || answers.q7?.includes("C"))
    voice_traits.push("candid");
  if (answers.q8?.includes("A") || answers.q8?.includes("E"))
    voice_traits.push("plain_language");
  if (answers.q1?.includes("C") || answers.q5?.includes("E"))
    voice_traits.push("phone_preferred");

  // Sign-off from Q11
  const signOffMap: Record<string, string> = {
    A: "first_name_only",
    B: "full_name_title",
    C: "warm_valediction",
    D: "situational",
    E: "branded_block",
  };
  const sign_off_style = signOffMap[answers.q11?.[0] ?? ""] ?? "first_name_only";

  // Avoids from Q10
  const avoidsMap: Record<string, string> = {
    A: "overconfidence_on_value",
    B: "overconfidence_on_outcome",
    C: "dismissiveness",
    D: "bad_news_framing",
    E: "minimizing_emotion",
  };
  const avoids = (answers.q10 ?? []).map((k) => avoidsMap[k]).filter(Boolean);

  return {
    voice_traits,
    humor_level,
    directness,
    verbosity,
    archetype,
    sign_off_style,
    avoids,
  };
}

/**
 * Human-readable summary of the derived profile, used as a system-prompt
 * paragraph the Flight Crew personas consume. Behaviour preserved
 * byte-for-byte from the web modal's `buildAiVoiceSummary`. Any change
 * here re-tones every AI response for every user — keep in lock-step
 * with the web copy.
 */
export function buildAiVoiceSummary(
  derived: CommunicationProfile["derived"],
): string {
  const archetypeLabels: Record<string, string> = {
    trusted_advisor: "trusted advisor",
    closer: "closer",
    educator: "educator",
    advocate: "advocate",
    connector: "connector",
  };
  const archetypes = derived.archetype
    .map((a) => archetypeLabels[a] ?? a)
    .join(" and ");
  const voiceDesc = archetypes || "real estate agent";

  const humorPhrases: Record<
    CommunicationProfile["derived"]["humor_level"],
    string
  > = {
    none: "no humor",
    light: "occasional light humor when the moment earns it",
    moderate: "moderate humor that keeps things engaging",
    frequent: "frequent humor and personality throughout",
  };

  const directnessPhrases: Record<
    CommunicationProfile["derived"]["directness"],
    string
  > = {
    low: "a gentle, exploratory tone",
    medium: "a balanced mix of directness and warmth",
    high: "direct, confident language",
  };

  const verbosityPhrases: Record<
    CommunicationProfile["derived"]["verbosity"],
    string
  > = {
    concise: "Use concise, to-the-point language.",
    balanced: "Balance clarity with thoroughness.",
    thorough: "Be thorough — give context and explain the full picture.",
  };

  const avoidsText =
    derived.avoids.length > 0
      ? ` Avoid ${derived.avoids
          .map((a) => a.replace(/_/g, " "))
          .join(", ")}.`
      : "";

  const signOffPhrases: Record<string, string> = {
    first_name_only: "Sign off with first name only.",
    full_name_title: "Sign off with full name and title.",
    warm_valediction: "Use a warm closing phrase before your name.",
    situational: "Adapt sign-off to the context.",
    branded_block: "Use a full branded signature block.",
  };
  const signOff = signOffPhrases[derived.sign_off_style] ?? "";

  return `Write as a ${
    derived.directness === "high" ? "direct" : "warm"
  }, ${
    derived.humor_level !== "none" ? "personable" : "professional"
  } ${voiceDesc}. ${verbosityPhrases[derived.verbosity]} Use ${
    humorPhrases[derived.humor_level]
  } and ${directnessPhrases[derived.directness]}.${avoidsText} ${signOff}`.trim();
}

// ── Trait display labels (shared so web + mobile show identical strings) ──

/**
 * Human-readable labels for traits and archetypes. Both surfaces render
 * these as badges — keeping the table here ensures the same trait map
 * appears in both UIs.
 */
export const VOICE_TRAIT_LABELS: Record<string, string> = {
  expressive: "Expressive",
  warm: "Warm",
  concise: "Concise",
  candid: "Candid",
  plain_language: "Plain Language",
  phone_preferred: "Phone-First",
  trusted_advisor: "Trusted Advisor",
  closer: "Closer",
  educator: "Educator",
  advocate: "Advocate",
  connector: "Connector",
};
