"use client";

import { useState, useEffect } from "react";
import { X, DollarSign, Briefcase, Target, Award } from "lucide-react";
import { useConfetti } from "@/hooks/use-confetti";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface AnnualReviewProps {
  year: number;
  ytdGCI: number;
  goalGCI: number;
  dealCount: number;
  avgDealSize: number;
  benchmarkPercentile: number;
  projectedGCI: number;
  onClose: () => void;
}

const SLIDES = [
  "title",
  "gci",
  "deals",
  "goal",
  "benchmark",
  "summary",
] as const;
type Slide = (typeof SLIDES)[number];

export function AnnualReview({
  year,
  ytdGCI,
  goalGCI,
  dealCount,
  avgDealSize,
  benchmarkPercentile,
  projectedGCI: _projectedGCI,
  onClose,
}: AnnualReviewProps) {
  const [slide, setSlide] = useState<Slide>("title");
  const { fire } = useConfetti();
  const goalPct = goalGCI > 0 ? Math.min((ytdGCI / goalGCI) * 100, 100) : 0;

  // Auto-advance with a 3.5s timer (user can also click)
  useEffect(() => {
    const idx = SLIDES.indexOf(slide);
    if (idx === SLIDES.length - 1) return; // last slide — no auto-advance
    const t = setTimeout(() => {
      setSlide(SLIDES[idx + 1]);
    }, 3800);
    return () => clearTimeout(t);
  }, [slide]);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Confetti on last slide
  useEffect(() => {
    if (slide === "summary") fire("goal");
  }, [slide, fire]);

  function next() {
    const idx = SLIDES.indexOf(slide);
    if (idx < SLIDES.length - 1) setSlide(SLIDES[idx + 1]);
    else onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl text-white shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          className="absolute right-4 top-4 z-10 text-white/40 hover:text-white"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress dots */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {SLIDES.map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                s === slide ? "w-6 bg-white" : "w-1.5 bg-white/30"
              )}
            />
          ))}
        </div>

        {/* Slide content */}
        <div
          className="flex min-h-[480px] flex-col items-center justify-center px-8 py-16 text-center cursor-pointer"
          onClick={next}
        >
          {slide === "title" && (
            <>
              <div className="mb-4 text-6xl">✈️</div>
              <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
                Your {year} Year in Review
              </p>
              <h2 className="mt-3 text-3xl font-black">
                Here&apos;s how your runway looked.
              </h2>
              <p className="mt-4 text-sm text-white/50">Tap to continue</p>
            </>
          )}

          {slide === "gci" && (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20">
                <DollarSign className="h-8 w-8 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
                Gross Commission Income
              </p>
              <p
                className="mt-4 text-5xl font-black"
                style={{
                  background: "linear-gradient(135deg, #34d399, #22d3ee)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {fmtCurrency(ytdGCI)}
              </p>
              <p className="mt-3 text-base text-white/70">
                {ytdGCI > 100000
                  ? "Six figures. Respect."
                  : ytdGCI > 50000
                  ? "Solid year. Keep building."
                  : "Foundation laid. The best is ahead."}
              </p>
            </>
          )}

          {slide === "deals" && (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
                <Briefcase className="h-8 w-8 text-blue-400" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
                Deals Closed
              </p>
              <p
                className="mt-4 text-6xl font-black"
                style={{
                  background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {dealCount}
              </p>
              {avgDealSize > 0 && (
                <p className="mt-3 text-base text-white/70">
                  {fmtCurrency(avgDealSize)} average per deal
                </p>
              )}
              <p className="mt-2 text-sm text-white/50">
                {dealCount === 0
                  ? "Every agent starts somewhere."
                  : dealCount >= 20
                  ? "You were everywhere this year."
                  : dealCount >= 10
                  ? "Double digits. Impressive."
                  : "Quality over quantity."}
              </p>
            </>
          )}

          {slide === "goal" && goalGCI > 0 && (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20">
                <Target className="h-8 w-8 text-violet-400" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
                Goal Achievement
              </p>
              <p
                className="mt-4 text-5xl font-black"
                style={{
                  background: goalPct >= 100
                    ? "linear-gradient(135deg, #34d399, #22d3ee)"
                    : "linear-gradient(135deg, #a78bfa, #60a5fa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {Math.round(goalPct)}%
              </p>
              <p className="mt-3 text-base text-white/70">
                of your {fmtCurrency(goalGCI)} goal
              </p>
              <p className="mt-2 text-sm text-white/50">
                {goalPct >= 100
                  ? "🎉 You hit it. That's rare."
                  : goalPct >= 75
                  ? "So close. Next year, you get there."
                  : "Every year is data. Use it."}
              </p>
            </>
          )}

          {slide === "goal" && goalGCI === 0 && (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20">
                <Target className="h-8 w-8 text-amber-400" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
                Goal Tip
              </p>
              <h3 className="mt-4 text-2xl font-bold">Set a goal for {year + 1}.</h3>
              <p className="mt-3 text-base text-white/70">
                Agents with a clear annual GCI target close 23% more deals on average. Set yours in Settings.
              </p>
            </>
          )}

          {slide === "benchmark" && (
            <>
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20">
                <Award className="h-8 w-8 text-amber-400" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">
                Industry Cohort Rank
              </p>
              <p
                className="mt-4 text-5xl font-black"
                style={{
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                P{benchmarkPercentile}
              </p>
              <p className="mt-3 text-base text-white/70">
                {benchmarkPercentile >= 75
                  ? "You outperformed most agents in your cohort."
                  : benchmarkPercentile >= 50
                  ? "Above the median. Room to grow."
                  : "Early stage. The trajectory is what matters."}
              </p>
            </>
          )}

          {slide === "summary" && (
            <>
              <div className="mb-4 text-5xl">🚀</div>
              <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
                See You in {year + 1}
              </p>
              <h3 className="mt-3 text-2xl font-bold">
                You logged {dealCount} deal{dealCount !== 1 ? "s" : ""}, earned {fmtCurrency(ytdGCI)}, and kept flying.
              </h3>
              <p className="mt-4 text-sm text-white/60">
                Come back next year for your {year + 1} review. The numbers only get better from here.
              </p>
              <button
                className="mt-8 rounded-xl px-8 py-3 text-sm font-bold text-white transition-all"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
                }}
                onClick={onClose}
              >
                Back to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
