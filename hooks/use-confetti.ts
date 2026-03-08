"use client";

import { useCallback } from "react";
import confetti from "canvas-confetti";

type ConfettiVariant = "goal" | "deal" | "milestone";

const variantConfig: Record<
  ConfettiVariant,
  confetti.Options[]
> = {
  deal: [
    {
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ["#3b82f6", "#22d3ee", "#6366f1", "#a78bfa"],
    },
    {
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ["#3b82f6", "#22d3ee", "#6366f1", "#a78bfa"],
    },
  ],
  goal: [
    {
      particleCount: 120,
      spread: 80,
      origin: { x: 0.5, y: 0.55 },
      colors: ["#34d399", "#22d3ee", "#3b82f6", "#a78bfa", "#f59e0b"],
      startVelocity: 35,
    },
    {
      particleCount: 50,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors: ["#34d399", "#22d3ee", "#3b82f6"],
    },
    {
      particleCount: 50,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors: ["#a78bfa", "#f59e0b", "#22d3ee"],
    },
  ],
  milestone: [
    {
      particleCount: 80,
      spread: 65,
      origin: { x: 0.5, y: 0.6 },
      colors: ["#f59e0b", "#fbbf24", "#fde68a", "#3b82f6"],
      startVelocity: 30,
    },
  ],
};

export function useConfetti() {
  const fire = useCallback((variant: ConfettiVariant = "deal") => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const shots = variantConfig[variant];
    shots.forEach((opts) => confetti(opts));
  }, []);

  return { fire };
}
