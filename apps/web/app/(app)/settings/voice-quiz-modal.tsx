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
// Quiz data + derivation logic + display labels live in
// @agent-runway/core/voice-quiz so mobile and web share the same source
// of truth. Don't redefine QUESTIONS, deriveProfile, buildAiVoiceSummary,
// or VOICE_TRAIT_LABELS locally — edit the shared lib instead.
import {
  QUIZ_QUESTIONS as QUESTIONS,
  deriveProfile,
  buildAiVoiceSummary,
  VOICE_TRAIT_LABELS as TRAIT_LABELS,
} from "@agent-runway/core/voice-quiz";

// Web-only: Tailwind class strings for trait badges. Stays here because
// mobile renders the same traits with theme tokens instead of utility
// classes. If a new trait is added in the shared lib, mirror its colour
// here AND in apps/mobile/app/(app)/profile/voice-quiz.tsx.
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
    const ai_voice_summary = buildAiVoiceSummary(derived);
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
                      {buildAiVoiceSummary(derived)}
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
