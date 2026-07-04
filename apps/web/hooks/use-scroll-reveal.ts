"use client";

import { useEffect, useRef } from "react";

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

/**
 * Returns a ref. Attach it to any element.
 * Adds `data-revealed="true"` when the element enters the viewport,
 * which triggers CSS transitions defined in globals.css.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  // Trigger BEFORE the element enters the viewport (20% early) so fast
  // scrollers never see a blank canvas waiting to fade in. The old values
  // (threshold 0.12, -40px margin) left visible dead zones mid-scroll.
  const {
    threshold = 0.01,
    rootMargin = "0px 0px 20% 0px",
    once = true,
  } = options;

  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      el.setAttribute("data-revealed", "true");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-revealed", "true");
          if (once) observer.disconnect();
        } else if (!once) {
          el.removeAttribute("data-revealed");
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return ref;
}
