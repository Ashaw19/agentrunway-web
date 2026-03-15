"use client";

import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { cn } from "@/lib/utils";

interface ScrollRevealSectionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: 0 | 1 | 2 | 3 | 4;
  as?: "section" | "div" | "article";
}

/**
 * Wraps children in a scroll-reveal container.
 * Elements fade and slide up as they enter the viewport.
 */
export function ScrollRevealSection({
  children,
  className,
  style,
  delay = 0,
  as: Tag = "div",
}: ScrollRevealSectionProps) {
  const ref = useScrollReveal<HTMLDivElement>();
  const delayClass = delay > 0 ? `reveal-delay-${delay}` : "";

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement & HTMLDivElement>}
      className={cn("reveal", delayClass, className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
