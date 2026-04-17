/**
 * components/flight-crew/mention-autocomplete.tsx
 *
 * Autocomplete popover for @mentions of Flight Crew members in the chat
 * input. Appears above the textarea when the user types `@` at the start of
 * the input or after whitespace.
 *
 * Controlled component:
 * - Parent passes current `value` (textarea contents)
 * - Parent provides `onSelect(newValue)` which updates the textarea
 *
 * Keyboard support (attached to document via useEffect):
 * - ArrowDown / ArrowUp navigate options
 * - Enter / Tab select the highlighted option
 * - Esc: no-op here; parent can control blur/dismiss
 *
 * Returns null when no @mention is detected at the end of the current input,
 * so parents can unconditionally render this and it stays invisible until
 * relevant.
 *
 * See memory/project_flight_crew_ui_design.md for design rationale.
 */

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CREW_PERSONAS, type Persona } from "@/lib/flight-crew/personas";
import { PersonaBadge } from "./persona-badge";

export interface MentionAutocompleteProps {
  /** Current textarea value. */
  value: string;
  /** Called with the new textarea value after a persona is selected. */
  onSelect: (newValue: string) => void;
  /** Extra class names appended to the outer container. */
  className?: string;
}

/**
 * Match `@` at start of input or after whitespace, followed by zero or more
 * letters at the very end of the string. Captures the (possibly empty) query.
 */
const MENTION_RE = /(?:^|\s)@([a-zA-Z]*)$/;

export function MentionAutocomplete({
  value,
  onSelect,
  className,
}: MentionAutocompleteProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const mentionMatch = value.match(MENTION_RE);
  const mentionQuery = mentionMatch?.[1] ?? null;

  // Filter personas by prefix match on name (case-insensitive)
  const filtered =
    mentionQuery === null
      ? []
      : CREW_PERSONAS.filter((p) =>
          mentionQuery === "" ||
          p.name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
        );

  // Reset highlight when the query changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [mentionQuery]);

  // Replace the @mention token in the input with "@<FullName> " and fire onSelect
  const selectPersona = (id: Persona, name: string) => {
    if (!mentionMatch) return;
    // mentionMatch[0] may start with a whitespace char; find the position of
    // the `@` itself.
    const atIndex = value.lastIndexOf("@");
    if (atIndex < 0) return;
    const before = value.slice(0, atIndex);
    const newValue = `${before}@${name} `;
    onSelect(newValue);
  };

  // Keyboard navigation — only active while the autocomplete has options
  useEffect(() => {
    if (filtered.length === 0) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        // Only consume if we're actively showing a filtered list
        e.preventDefault();
        const persona = filtered[selectedIdx];
        if (persona) selectPersona(persona.id, persona.name);
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  // selectPersona reads `value` + `mentionMatch`; re-bind when options or idx change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selectedIdx]);

  if (filtered.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Crew member mentions"
      className={cn(
        "absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl",
        className,
      )}
    >
      {filtered.map((meta, i) => {
        const isHighlighted = i === selectedIdx;
        return (
          <button
            key={meta.id}
            type="button"
            role="option"
            aria-selected={isHighlighted}
            onMouseEnter={() => setSelectedIdx(i)}
            onClick={() => selectPersona(meta.id, meta.name)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
              isHighlighted ? "bg-white/5" : "hover:bg-white/5",
            )}
          >
            <PersonaBadge persona={meta.id} variant="block" />
          </button>
        );
      })}
    </div>
  );
}
