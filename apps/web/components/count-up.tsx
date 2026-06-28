"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CountUpProps {
  end: number;
  duration?: number; // ms
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** If true, format with locale-aware commas */
  compact?: boolean;
  /** Value to count from on first mount (default 0). */
  start?: number;
  /** Flash (scale pop) when the value changes after the initial mount. */
  popOnChange?: boolean;
}

/**
 * Animates a number to `end` using easeOutExpo.
 *
 * On first mount it counts from `start` (default 0). When `end` later changes
 * (e.g. after a focus-triggered server re-sync), it animates from the PREVIOUS
 * displayed value to the new one — a trading-terminal "tick" — instead of
 * snapping back to 0 and re-booting. A subtle scale pop marks the change.
 *
 * Respects prefers-reduced-motion: jumps straight to the value, no pop.
 */
export function CountUp({
  end,
  duration = 1200,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  compact = false,
  start = 0,
  popOnChange = true,
}: CountUpProps) {
  const [value, setValue] = useState(start);
  const [popping, setPopping] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const displayedRef = useRef(start); // latest displayed value (animate FROM here)
  const mountedRef = useRef(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = displayedRef.current;

    if (prefersReduced) {
      displayedRef.current = end;
      setValue(end);
      mountedRef.current = true;
      return;
    }

    // Pop only on a real post-mount value change (not the initial 0→end boot).
    if (mountedRef.current && popOnChange && from !== end) {
      setPopping(true);
    }
    mountedRef.current = true;

    startTimeRef.current = null;

    function easeOutExpo(t: number): number {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(ts: number) {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      const current = from + (end - from) * eased;
      displayedRef.current = current;
      setValue(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = end;
        setValue(end);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [end, duration, popOnChange]);

  // Clear the pop class after it plays (counter-pop is 0.4s in globals.css).
  useEffect(() => {
    if (!popping) return;
    const t = setTimeout(() => setPopping(false), 450);
    return () => clearTimeout(t);
  }, [popping]);

  function format(n: number): string {
    if (compact) {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
      if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
      return n.toFixed(decimals);
    }
    return n.toLocaleString("en-CA", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return (
    <span className={cn(className, popping && "counter-pop inline-block")}>
      {prefix}
      {format(value)}
      {suffix}
    </span>
  );
}
