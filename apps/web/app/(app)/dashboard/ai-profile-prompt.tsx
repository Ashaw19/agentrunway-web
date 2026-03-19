"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissAiProfilePrompt } from "@/app/(app)/settings/actions";
import { cn } from "@/lib/utils";

interface AiProfilePromptProps {
  userId: string;
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
    return "One more step — tell us about your business and your AI gets a lot smarter.";
  }
  if (!hasVoice && hasBiz) {
    return "Your AI still doesn't know how you talk. The voice quiz takes 3 minutes.";
  }
  return "Almost there — finish your AI profile for smarter drafts.";
}

function getPromptTitle(hasVoice: boolean, hasBiz: boolean): string {
  if (!hasVoice && !hasBiz) return "Your AI is working with limited context.";
  return "Almost there — finish your AI profile for smarter drafts.";
}

export function AiProfilePrompt({
  userId: _userId,
  hasVoiceProfile,
  hasBusinessIdentity,
  lastDismissedAt,
}: AiProfilePromptProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const show = shouldShow(hasVoiceProfile, hasBusinessIdentity, lastDismissedAt);
    if (show) {
      // Small delay so it doesn't immediately pop on page load
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, [hasVoiceProfile, hasBusinessIdentity, lastDismissedAt]);

  async function handleDismiss() {
    setVisible(false);
    await dismissAiProfilePrompt();
  }

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-border/80 bg-card shadow-xl transition-all duration-500",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-8 opacity-0 pointer-events-none",
      )}
    >
      {/* Gradient accent bar */}
      <div className="h-1 rounded-t-2xl bg-gradient-to-r from-violet-500 to-amber-400" />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">✨</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quick tip
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold leading-snug mb-1">
          {getPromptTitle(hasVoiceProfile, hasBusinessIdentity)}
        </p>

        {/* Message */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {getPromptMessage(hasVoiceProfile, hasBusinessIdentity)}
        </p>

        {/* CTA */}
        <Button asChild size="sm" className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs">
          <Link href="/settings#ai-voice">
            Complete your AI profile →
          </Link>
        </Button>
      </div>
    </div>
  );
}
