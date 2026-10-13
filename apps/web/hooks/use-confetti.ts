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

// ── The cannon ──────────────────────────────────────────────────────────────
// NOT the library's default `confetti(opts)`. The default draws from a web
// worker on an OffscreenCanvas. If the page has no size when it fires (a 0×0
// viewport: a zero-size or hidden frame, a link-preview renderer, an automated
// check), the worker tries to measure the canvas with getBoundingClientRect,
// which an OffscreenCanvas doesn't have, and throws. That reaches the page as
//   "Uncaught TypeError: t.getBoundingClientRect is not a function"
// from a `blob:` script with no stack (Sentry AGENTRUNWAY-WEB-K, on
// /demo/dashboard, 2026-10-13; reproduced with the library alone in a 0×0
// iframe). Drawing on the main thread has no such path: with no size it
// simply draws nothing. A burst is at most 220 particles for a few seconds,
// so the worker was buying nothing.
let cannon: confetti.CreateTypes | null = null;
function getCannon(): confetti.CreateTypes {
  if (!cannon) cannon = confetti.create(undefined, { resize: true, useWorker: false });
  return cannon;
}

/** True when there is somewhere to draw: the page has a width or a height. */
function pageHasSize(): boolean {
  const root = document.documentElement;
  return root.clientWidth > 0 || root.clientHeight > 0;
}

export function useConfetti() {
  const fire = useCallback((variant: ConfettiVariant = "deal") => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    if (!pageHasSize()) return;

    const shots = variantConfig[variant];
    const shoot = getCannon();
    shots.forEach((opts) => {
      void shoot(opts);
    });
  }, []);

  return { fire };
}
