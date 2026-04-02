"use client";

import { HelpCircle } from "lucide-react";
import { useAiChat } from "@/lib/ai-chat-context";
import { cn } from "@/lib/utils";

interface Props {
  /** The question to auto-send to the AI assistant */
  question: string;
  /** Accessible aria-label (defaults to "Ask AI about this") */
  label?: string;
  className?: string;
}

/**
 * Small "?" icon button that opens the AI chat panel and auto-sends a question.
 * Designed to sit inline next to metric labels alongside MetricInfo tooltips.
 * Only renders for Pro users (gate externally via `isPro`).
 */
export function ExplainButton({ question, label, className }: Props) {
  const { askQuestion } = useAiChat();

  return (
    <button
      type="button"
      aria-label={label ?? "Ask AI about this"}
      onClick={() => askQuestion(question)}
      className={cn(
        "inline-flex items-center justify-center rounded-full p-0.5",
        "text-primary/40 hover:text-primary hover:bg-primary/10",
        "transition-colors cursor-help shrink-0",
        className,
      )}
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
  );
}
