"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommunicationProfile } from "@/lib/types/database";

// ── Quiz data ──────────────────────────────────────────────────────────────

interface QuizOption {
  key: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
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

// ── Derive profile from answers ────────────────────────────────────────────

function deriveProfile(answers: Record<string, string[]>): CommunicationProfile["derived"] {
  // Humor: Q2-B, Q6-C, Q9-D, Q6-E selected
  const humorSignals = [
    answers.q2?.includes("B"),
    answers.q6?.includes("C"),
    answers.q9?.includes("D"),
    answers.q6?.includes("E"),
  ].filter(Boolean).length;
  const humor_level: CommunicationProfile["derived"]["humor_level"] =
    humorSignals >= 3 ? "frequent" : humorSignals >= 2 ? "moderate" : humorSignals >= 1 ? "light" : "none";

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
    thoroughSignals > conciseSignals ? "thorough" : conciseSignals > thoroughSignals ? "concise" : "balanced";

  // Archetype from Q12
  const archetypeMap: Record<string, string> = {
    A: "trusted_advisor",
    B: "closer",
    C: "educator",
    D: "advocate",
    E: "connector",
  };
  const archetype = (answers.q12 ?? []).map((k) => archetypeMap[k]).filter(Boolean);

  // Voice traits
  const voice_traits: string[] = [];
  if (answers.q1?.includes("A") || answers.q1?.includes("E")) voice_traits.push("expressive");
  if (answers.q1?.includes("B") || answers.q6?.includes("D")) voice_traits.push("warm");
  if (answers.q6?.includes("A") || answers.q5?.includes("A")) voice_traits.push("concise");
  if (answers.q7?.includes("B") || answers.q7?.includes("C")) voice_traits.push("candid");
  if (answers.q8?.includes("A") || answers.q8?.includes("E")) voice_traits.push("plain_language");
  if (answers.q1?.includes("C") || answers.q5?.includes("E")) voice_traits.push("phone_preferred");

  // Sign-off from Q11
  const signOffMap: Record<string, string> = {
    A: "first_name_only",
    B: "full_name_title",
    C: "warm_valediction",
    D: "situational",
    E: "branded_block",
  };
  const sign_off_style = signOffMap[answers.q11?.[0] ?? ""] ?? "first_name_only";

  // Avoids from Q10 (invert — what they'd never say signals what to avoid)
  const avoidsMap: Record<string, string> = {
    A: "overconfidence_on_value",
    B: "overconfidence_on_outcome",
    C: "dismissiveness",
    D: "bad_news_framing",
    E: "minimizing_emotion",
  };
  const avoids = (answers.q10 ?? []).map((k) => avoidsMap[k]).filter(Boolean);

  return { voice_traits, humor_level, directness, verbosity, archetype, sign_off_style, avoids };
}

function buildAiVoiceSummary(
  derived: CommunicationProfile["derived"],
  _answers: Record<string, string[]>,
): string {
  const archetypeLabels: Record<string, string> = {
    trusted_advisor: "trusted advisor",
    closer: "closer",
    educator: "educator",
    advocate: "advocate",
    connector: "connector",
  };
  const archetypes = derived.archetype.map((a) => archetypeLabels[a] ?? a).join(" and ");
  const voiceDesc = archetypes || "real estate agent";

  const humorPhrases: Record<CommunicationProfile["derived"]["humor_level"], string> = {
    none: "no humor",
    light: "occasional light humor when the moment earns it",
    moderate: "moderate humor that keeps things engaging",
    frequent: "frequent humor and personality throughout",
  };

  const directnessPhrases: Record<CommunicationProfile["derived"]["directness"], string> = {
    low: "a gentle, exploratory tone",
    medium: "a balanced mix of directness and warmth",
    high: "direct, confident language",
  };

  const verbosityPhrases: Record<CommunicationProfile["derived"]["verbosity"], string> = {
    concise: "Use concise, to-the-point language.",
    balanced: "Balance clarity with thoroughness.",
    thorough: "Be thorough — give context and explain the full picture.",
  };

  const avoidsText =
    derived.avoids.length > 0
      ? ` Avoid ${derived.avoids.map((a) => a.replace(/_/g, " ")).join(", ")}.`
      : "";

  const signOffPhrases: Record<string, string> = {
    first_name_only: "Sign off with first name only.",
    full_name_title: "Sign off with full name and title.",
    warm_valediction: "Use a warm closing phrase before your name.",
    situational: "Adapt sign-off to the context.",
    branded_block: "Use a full branded signature block.",
  };
  const signOff = signOffPhrases[derived.sign_off_style] ?? "";

  return `Write as a ${derived.directness === "high" ? "direct" : "warm"}, ${derived.humor_level !== "none" ? "personable" : "professional"} ${voiceDesc}. ${verbosityPhrases[derived.verbosity]} Use ${humorPhrases[derived.humor_level]} and ${directnessPhrases[derived.directness]}.${avoidsText} ${signOff}`.trim();
}

// ── Trait display helpers ──────────────────────────────────────────────────

const TRAIT_LABELS: Record<string, string> = {
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

const TRAIT_COLORS: Record<string, string> = {
  expressive: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  warm: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  concise: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  candid: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  plain_language: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  phone_preferred: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  trusted_advisor: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  closer: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  educator: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  advocate: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  connector: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

// ── Component ──────────────────────────────────────────────────────────────

interface VoiceQuizModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (profile: CommunicationProfile) => Promise<void>;
  existingProfile?: CommunicationProfile | null;
}

export function VoiceQuizModal({
  open,
  onOpenChange,
  onSave,
  existingProfile,
}: VoiceQuizModalProps) {
  const [step, setStep] = useState<"quiz" | "summary">("quiz");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(
    existingProfile?.answers ?? {},
  );
  const [saving, setSaving] = useState(false);

  const question = QUESTIONS[currentQ];
  const selected = answers[question.id] ?? [];
  const totalQ = QUESTIONS.length;
  const progress = ((currentQ + 1) / totalQ) * 100;

  function toggleOption(key: string) {
    const current = answers[question.id] ?? [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
  }

  function handleNext() {
    if (currentQ < totalQ - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      setStep("summary");
    }
  }

  function handleBack() {
    if (step === "summary") {
      setStep("quiz");
      setCurrentQ(totalQ - 1);
    } else if (currentQ > 0) {
      setCurrentQ((q) => q - 1);
    }
  }

  function handleClose(open: boolean) {
    onOpenChange(open);
    if (!open) {
      // Reset to first question if they close without saving
      setTimeout(() => {
        setStep("quiz");
        setCurrentQ(0);
        setSaving(false);
      }, 300);
    }
  }

  async function handleSave() {
    setSaving(true);
    const derived = deriveProfile(answers);
    const ai_voice_summary = buildAiVoiceSummary(derived, answers);
    const profile: CommunicationProfile = {
      completed: true,
      answers,
      derived,
      ai_voice_summary,
    };
    await onSave(profile);
    setSaving(false);
    handleClose(false);
  }

  // Summary screen derived values
  const derived = step === "summary" ? deriveProfile(answers) : null;
  const summaryTraits = derived
    ? [...derived.voice_traits, ...derived.archetype].slice(0, 6)
    : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === "quiz" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold tracking-tight">
                  Let&apos;s find your voice
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  BE YOU!
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                12 quick questions. No wrong answers. Takes 3 minutes.
              </p>
            </DialogHeader>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Question {currentQ + 1} of {totalQ}</span>
                <span>{Math.round(progress)}% complete</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Question */}
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-base font-semibold leading-snug">
                  {question.question}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Select all that apply — BE YOU!
                </p>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {question.options.map((opt) => {
                  const isSelected = selected.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleOption(opt.key)}
                      className={cn(
                        "text-left rounded-xl border p-3 text-sm transition-all duration-150",
                        "hover:border-violet-400 hover:bg-violet-50 dark:hover:border-violet-500 dark:hover:bg-violet-950/30",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                        isSelected
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-400 font-medium text-violet-900 dark:text-violet-100"
                          : "border-border bg-card text-foreground",
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold mr-2 shrink-0",
                        isSelected
                          ? "bg-violet-500 text-white"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {opt.key}
                      </span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={currentQ === 0}
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {currentQ === totalQ - 1 ? "See my results →" : "Next →"}
              </Button>
            </div>
          </>
        ) : (
          /* Summary screen */
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">✨</span>
                <DialogTitle className="text-lg font-bold">
                  Here&apos;s your voice
                </DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Your AI will use this to communicate exactly like you.
              </p>
            </DialogHeader>

            <div className="space-y-5">
              {/* Trait badges */}
              {summaryTraits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Your voice traits
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {summaryTraits.map((trait) => (
                      <span
                        key={trait}
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          TRAIT_COLORS[trait] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {TRAIT_LABELS[trait] ?? trait.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats row */}
              {derived && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Humor</p>
                    <p className="text-sm font-semibold capitalize">{derived.humor_level}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Directness</p>
                    <p className="text-sm font-semibold capitalize">{derived.directness}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Style</p>
                    <p className="text-sm font-semibold capitalize">{derived.verbosity}</p>
                  </div>
                </div>
              )}

              {/* AI voice summary */}
              {derived && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    How your AI will introduce itself
                  </p>
                  <blockquote className="border-l-4 border-violet-400 pl-4 py-2 bg-violet-50/50 dark:bg-violet-950/20 rounded-r-lg">
                    <p className="text-sm text-foreground/80 italic leading-relaxed">
                      {buildAiVoiceSummary(derived, answers)}
                    </p>
                  </blockquote>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {saving ? "Saving…" : "Looks good, save it ✓"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
