"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { dismissAiProfilePrompt } from "@/app/(app)/settings/actions";

interface AiProfilePromptProps {
  hasVoiceProfile: boolean;
  hasBusinessIdentity: boolean;
  lastDismissedAt: string | null;
}

function shouldShow(hasVoice: boolean, hasBiz: boolean, lastDismissed: string | null): boolean {
  // If both complete, never show
  if (hasVoice && hasBiz) return false;
  // If dismissed within 7 days, don't show
  if (lastDismissed) {
    const dismissedMs = new Date(lastDismissed).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedMs < sevenDaysMs) return false;
  }
  return true;
}

function getPromptMessage(hasVoice: boolean, hasBiz: boolean): string {
  if (!hasVoice && !hasBiz) {
    return "Your AI is flying blind. Give it 3 minutes and it'll sound exactly like you.";
  }
  if (hasVoice && !hasBiz) {
    return "One more step. Tell us about your business and your AI gets a lot smarter.";
  }
  return "Your AI still doesn't know how you talk. The voice quiz takes 3 minutes.";
}

/**
 * The Quick tip: a slim row in the page flow, below the Today zone. Until
 * 2026-11-04 it was a card fixed to the corner of the screen, which covered the
 * income cards at phone width. Dismissing hides it for 7 days.
 */
export function AiProfilePrompt({
  hasVoiceProfile,
  hasBusinessIdentity,
  lastDismissedAt,
}: AiProfilePromptProps) {
  const [visible, setVisible] = useState(() => shouldShow(hasVoiceProfile, hasBusinessIdentity, lastDismissedAt));

  async function handleDismiss() {
    setVisible(false);
    await dismissAiProfilePrompt();
  }

  if (!visible) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3.5 py-2 dark:border-violet-800/40 dark:bg-violet-950/20">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 text-xs text-slate-700 dark:text-slate-200">
          <span className="font-semibold">Quick tip:</span>{" "}
          {getPromptMessage(hasVoiceProfile, hasBusinessIdentity)}
        </p>
        <Link
          href="/settings#ai-voice"
          className="shrink-0 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
        >
          Complete your AI profile →
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
