/**
 * Brand icons not provided by lucide-react. Includes third-party marks (Instagram,
 * Facebook) and AR's own brand marks (Tailfin) used as Lucide-shaped components
 * so they drop into existing icon slots without API changes.
 */

import { forwardRef, type SVGProps } from "react";

/**
 * Tailfin — AR brand mark used as the Captain persona icon.
 * Stroke-only mono version of /public/brand/marks/tailfin-monogram.svg so it
 * inherits text color and reads cleanly at 12-32px. Cheatline stroke evokes
 * the airline livery on a vertical stabilizer. Uses forwardRef so it's
 * structurally compatible with lucide-react's LucideIcon (ForwardRefExoticComponent)
 * and drops into existing icon slots without type changes.
 */
export const Tailfin = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function Tailfin({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
      >
        <path d="M4 20 L10 4 L20 4 L20 20 Z" />
        <path d="M8 13 L20 13" />
      </svg>
    );
  },
);

export function Instagram({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="5" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function Facebook({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
