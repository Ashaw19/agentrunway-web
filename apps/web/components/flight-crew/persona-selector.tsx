/**
 * components/flight-crew/persona-selector.tsx
 *
 * Dropdown that lets the user pick which crew member their next message goes
 * to. Controlled component — parent owns `activePersona` state and receives
 * change callbacks. Displays current selection as a chip with persona badge
 * and chevron; opens a listbox menu showing all three personas.
 *
 * Accessibility:
 * - aria-haspopup / aria-expanded on the trigger
 * - role="listbox" + role="option" on the menu
 * - Keyboard: Escape closes, Tab moves focus naturally through options
 * - Click outside closes the menu
 *
 * See memory/project_flight_crew_ui_design.md for the design rationale.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CREW_PERSONAS, getPersona, type Persona } from "@/lib/flight-crew/personas";
import { PersonaBadge } from "./persona-badge";

export interface PersonaSelectorProps {
  /** Currently active persona — controlled by parent. */
  activePersona: Persona;
  /** Called when user picks a different persona. */
  onChange: (persona: Persona) => void;
  /** Extra class names appended to the outer container. */
  className?: string;
}

export function PersonaSelector({
  activePersona,
  onChange,
  className,
}: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = getPersona(activePersona);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active crew member: ${active.name}. Click to change.`}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <span className="text-slate-500">Talking to:</span>
        <PersonaBadge persona={activePersona} variant="inline" />
        <ChevronDown
          className={cn(
            "h-3 w-3 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Select crew member"
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl"
        >
          {CREW_PERSONAS.map((meta) => {
            const isActive = meta.id === activePersona;
            return (
              <button
                key={meta.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(meta.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5 focus:bg-white/5 focus:outline-none",
                  isActive && "bg-white/5",
                )}
              >
                <PersonaBadge persona={meta.id} variant="block" />
                {isActive && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">
                    active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
