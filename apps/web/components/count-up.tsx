"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  end: number;
  duration?: number; // ms
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** If true, format with locale-aware commas */
  compact?: boolean;
}

/**
 * Animates a number from 0 → end over `duration` ms using easeOutExpo.
 * Respects prefers-reduced-motion (skips animation).
 */
export function CountUp({
  end,
  duration = 1200,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  compact = false,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setValue(end);
      return;
    }

    startTimeRef.current = null;

    function easeOutExpo(t: number): number {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(ts: number) {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      setValue(easedProgress * end);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setValue(end);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [end, duration]);

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
    <span className={className}>
      {prefix}
      {format(value)}
      {suffix}
    </span>
  );
}
