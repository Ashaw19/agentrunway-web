/**
 * components/flight-crew/persona-badge.tsx
 *
 * Renders a Flight Crew persona in one of three visual variants:
 * - "avatar"  — icon-only circular badge (for message bubbles)
 * - "inline"  — icon + name, compact (for in-sentence references)
 * - "block"   — icon + name + domain (for menus, dropdowns, autocomplete)
 *
 * Single component because the metadata lookup (persona → icon + colors)
 * is identical across all variants; only the layout differs.
 *
 * No "use client" directive — this is a pure display component with no
 * state or event handlers. Usable in both server and client components.
 *
 * See memory/project_flight_crew_ui_design.md for design rationale.
 * See lib/flight-crew/personas.ts for canonical persona metadata.
 */

import { cn } from "@/lib/utils";
import { getPersona, type Persona } from "@/lib/flight-crew/personas";

type Variant = "avatar" | "inline" | "block";

export interface PersonaBadgeProps {
  /** Persona to render. Falls back to Captain for unknown IDs. */
  persona: Persona | string | null | undefined;
  /** Visual variant. Defaults to "inline". */
  variant?: Variant;
  /** Extra class names appended to the outer element. */
  className?: string;
}

export function PersonaBadge({
  persona,
  variant = "inline",
  className,
}: PersonaBadgeProps) {
  const meta = getPersona(persona);
  const Icon = meta.icon;
  const ariaLabel = `${meta.name} — ${meta.domain}`;

  if (variant === "avatar") {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          meta.accentBg,
          className,
        )}
      >
        <Icon className={cn("h-4 w-4", meta.accentText)} aria-hidden="true" />
      </div>
    );
  }

  if (variant === "block") {
    return (
      <div
        className={cn("flex items-center gap-2.5", className)}
        aria-label={ariaLabel}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            meta.accentBg,
          )}
        >
          <Icon className={cn("h-4 w-4", meta.accentText)} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className={cn("text-sm font-semibold", meta.accentText)}>
            {meta.name}
          </span>
          <span className="truncate text-xs text-slate-400">{meta.domain}</span>
        </div>
      </div>
    );
  }

  // inline (default)
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={ariaLabel}
    >
      <Icon
        className={cn("h-3.5 w-3.5", meta.accentText)}
        aria-hidden="true"
      />
      <span className={cn("text-xs font-medium", meta.accentText)}>
        {meta.name}
      </span>
    </span>
  );
}
