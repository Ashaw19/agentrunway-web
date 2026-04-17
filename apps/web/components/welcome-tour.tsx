"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, SkipForward, Sparkles, LayoutDashboard, Menu, BookOpen, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface TourStep {
  selector: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "bottom" | "right" | "left" | "top";
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: "[data-tour='dashboard-score']",
    title: "Your Command Center",
    description:
      "This is your Runway Score — a composite grade across 5 business health factors. It updates in real time as you add deals, expenses, and pipeline activity.",
    icon: <LayoutDashboard className="h-5 w-5" />,
    position: "bottom",
  },
  {
    selector: "[data-tour='sidebar']",
    title: "Navigate Your Business",
    description:
      "Use the sidebar to jump between Transactions, Expenses, Forecast, Reports, CRM, and more. Each page gives you deep insight into a different part of your business.",
    icon: <Menu className="h-5 w-5" />,
    position: "right",
  },
  {
    selector: "[data-tour='fab']",
    title: "Quick Actions",
    description:
      "Tap here to quickly add deals, log expenses, or use voice input. Just speak naturally — the system classifies what you said and fills in the right form.",
    icon: <Mic className="h-5 w-5" />,
    position: "top",
  },
  {
    selector: "[data-tour='ai-chat']",
    title: "AI Business Assistant",
    description:
      "Your Flight Crew can explore your business data. Ask about pace, pipeline, expenses, or any platform feature. All outputs are estimates for informational purposes only.",
    icon: <Sparkles className="h-5 w-5" />,
    position: "left",
  },
  {
    selector: "[data-tour='guide-link']",
    title: "Platform Guide",
    description:
      "Your complete searchable guide to every feature, metric, and concept on Agent Runway. Look up anything, anytime. You can also download it as a PDF.",
    icon: <BookOpen className="h-5 w-5" />,
    position: "right",
  },
];

interface Props {
  /** Whether the AI chat is available (Pro users) — adjusts step list */
  hasAiChat?: boolean;
  /** Callback after tour completes or is skipped */
  onComplete?: () => void;
}

export function WelcomeTour({ hasAiChat = false, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Filter steps: skip AI chat step for non-Pro users
  const steps = hasAiChat
    ? TOUR_STEPS
    : TOUR_STEPS.filter((s) => s.selector !== "[data-tour='ai-chat']");

  const step = steps[currentStep];

  // Find and highlight the target element
  const updateTarget = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Wait for scroll to settle
      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
      }, 300);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateTarget();
    window.addEventListener("resize", updateTarget);
    return () => window.removeEventListener("resize", updateTarget);
  }, [updateTarget, currentStep]);

  const markComplete = useCallback(async () => {
    setVisible(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("user_settings")
        .update({ has_seen_tour: true })
        .eq("user_id", user.id);
    }
    onComplete?.();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      markComplete();
    }
  }, [currentStep, steps.length, markComplete]);

  // Dismiss tour on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSkip]);

  if (!visible || !step) return null;

  // Compute card position based on target rect and step position
  const cardStyle = computeCardPosition(targetRect, step.position);

  return (
    <>
      {/* Overlay backdrop with spotlight cutout */}
      <div className="fixed inset-0 z-[100]" onClick={handleSkip}>
        <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 8}
                  y={targetRect.top - 8}
                  width={targetRect.width + 16}
                  height={targetRect.height + 16}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.6)"
            mask="url(#tour-mask)"
          />
        </svg>

        {/* Spotlight ring glow */}
        {targetRect && (
          <div
            className="absolute rounded-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-transparent pointer-events-none"
            style={{
              left: targetRect.left - 8,
              top: targetRect.top - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
              boxShadow: "0 0 0 4px rgba(59,130,246,0.2), 0 0 30px rgba(59,130,246,0.15)",
            }}
          />
        )}
      </div>

      {/* Tour card */}
      <div
        ref={cardRef}
        className="fixed z-[101] w-80 rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step icon + title */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
            {step.icon}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">{step.title}</p>
            <p className="text-[10px] text-slate-500">
              Step {currentStep + 1} of {steps.length}
            </p>
          </div>
          <button
            onClick={handleSkip}
            className="rounded-lg p-1 text-slate-600 hover:text-slate-400 transition-colors"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-slate-300 mb-4">
          {step.description}
        </p>

        {/* Progress dots + actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep
                    ? "w-4 bg-primary"
                    : i < currentStep
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-slate-700"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs text-slate-500 hover:text-slate-300 h-8"
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="h-8 text-xs"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
            >
              {currentStep < steps.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="h-3 w-3 ml-1" />
                </>
              ) : (
                "Get Started"
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Compute the position style for the tour card based on target rect and desired position */
function computeCardPosition(
  rect: DOMRect | null,
  position: "bottom" | "right" | "left" | "top",
): React.CSSProperties {
  if (!rect) {
    // Center on screen if no target found
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const CARD_WIDTH = 320; // w-80 = 20rem = 320px
  const GAP = 16;

  switch (position) {
    case "bottom":
      return {
        top: rect.bottom + GAP,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 16)),
      };
    case "top":
      return {
        bottom: window.innerHeight - rect.top + GAP,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 16)),
      };
    case "right":
      return {
        top: Math.max(16, rect.top),
        left: rect.right + GAP,
      };
    case "left":
      return {
        top: Math.max(16, rect.top),
        right: window.innerWidth - rect.left + GAP,
      };
  }
}
