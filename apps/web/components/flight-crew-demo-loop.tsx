"use client";

/**
 * components/flight-crew-demo-loop.tsx
 *
 * Marketing-only animated demo of a Flight Crew conversation. Pure frontend:
 * no API calls, no Supabase, no real AI. A pre-scripted sequence of user
 * messages, Captain replies, a narrated handoff seam, and a Dispatcher reply,
 * looping every ~20 seconds.
 *
 * Phase 1.5 from `memory/project_hml_gap_strategy.md` — make the Flight Crew
 * visually demonstrable to anonymous visitors. The "narrated handoff" is the
 * differentiator vs HML's "6 agents" copy claim.
 *
 * Script updated 2026-05-07: switched from tax/finance demo to a CRM client-add
 * demo (Captain → Dispatcher). Shows natural-language client entry — the feature
 * most likely to wow a realtor prospect on first view. No tax-advice surface in
 * this script; info-not-advice compliance note is N/A for Dispatcher.
 *
 * Visual + accessibility spec: memory/project_flight_crew_ui_design.md
 * - Captain:    Tailfin icon, blue-600 accent
 * - Dispatcher: Radio icon,   violet-600 accent
 * - aria-live="polite" on message container
 * - prefers-reduced-motion: skip typewriter, fade messages in sequentially
 *
 * Independent of the real Flight Crew chat surface (`components/ai-chat.tsx`).
 * No new npm dependencies — only React, Tailwind, lucide-react.
 */

import { Radio, RotateCw, type LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Tailfin } from "@/components/icons/brand-icons";

type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── Script ────────────────────────────────────────────────────────────────────

type CaptainStep = {
  kind: "captain";
  text: string;
};

type DispatcherStep = {
  kind: "dispatcher";
  text: string;
};

type UserStep = {
  kind: "user";
  text: string;
};

type HandoffStep = {
  kind: "handoff";
  label: string;
};

type Step = UserStep | CaptainStep | DispatcherStep | HandoffStep;

/**
 * Fixed conversation script — shows natural-language CRM client entry with a
 * Captain → Dispatcher handoff. Demonstrates the feature most likely to wow a
 * realtor prospect: "just talk to it and your client is in the system."
 */
const SCRIPT: ReadonlyArray<Step> = [
  {
    kind: "user",
    text: "Add a new client — Matthew Smith. He's at 555 Main Street in Saint John, NB. We talked about listing his home next month around $450,000.",
  },
  {
    kind: "captain",
    text: "Client adds are Dispatcher's lane — handing it over.",
  },
  {
    kind: "handoff",
    label: "— Dispatcher stepping in —",
  },
  {
    kind: "dispatcher",
    text: "Done — Matthew Smith added to Flight Control at the Boarding stage. 555 Main Street, Saint John NB logged to his record. Listing conversation noted: ~$450K range, target next month. Should I schedule a follow-up touchpoint or draft an intro message for Matthew?",
  },
];

// Animation timing
const TYPE_SPEED_MS = 20;
const PRE_MESSAGE_PAUSE_MS = 300;
const END_OF_SCRIPT_PAUSE_MS = 2500;
const FADE_OUT_MS = 300;

// ── Persona visual tokens ────────────────────────────────────────────────────

interface PersonaTokens {
  name: string;
  icon: IconComponent;
  // Tailwind classes — pre-composed so Tailwind's JIT picks them up.
  textClass: string;
  bubbleBorderClass: string;
  avatarBgClass: string;
  avatarBorderClass: string;
  avatarIconClass: string;
}

const CAPTAIN_TOKENS: PersonaTokens = {
  name: "Captain",
  icon: Tailfin,
  textClass: "text-blue-400",
  // 3px left border in the persona accent color
  bubbleBorderClass: "border-l-[3px] border-blue-500",
  avatarBgClass: "bg-blue-600/15",
  avatarBorderClass: "border-blue-500/25",
  avatarIconClass: "text-blue-400",
};

const DISPATCHER_TOKENS: PersonaTokens = {
  name: "Dispatcher",
  icon: Radio,
  textClass: "text-violet-400",
  bubbleBorderClass: "border-l-[3px] border-violet-500",
  avatarBgClass: "bg-violet-600/15",
  avatarBorderClass: "border-violet-500/25",
  avatarIconClass: "text-violet-400",
};

// ── Hook: prefers-reduced-motion ─────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14 fallback
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}

// ── Rendered-step type ───────────────────────────────────────────────────────

/**
 * What we actually render in the message list. Each entry corresponds to one
 * SCRIPT entry that has either fully landed or is currently animating.
 *
 * For typewriter steps (captain/dispatcher), `text` is the partial substring
 * being typed; `isTyping` indicates the cursor should still blink.
 */
type RenderedStep =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "captain"; text: string; isTyping: boolean }
  | { id: number; kind: "dispatcher"; text: string; isTyping: boolean }
  | { id: number; kind: "handoff"; label: string };

// ── Component ────────────────────────────────────────────────────────────────

export function FlightCrewDemoLoop() {
  const reducedMotion = usePrefersReducedMotion();
  const [rendered, setRendered] = useState<RenderedStep[]>([]);
  const [fadingOut, setFadingOut] = useState(false);
  // `runId` increments on every replay; effects keyed off it cancel cleanly.
  const [runId, setRunId] = useState(0);
  // Refs for cancellation — any pending timeout from a prior run should be
  // cleared the moment the user clicks Replay or `runId` changes.
  const cancelledRef = useRef(false);

  const restart = useCallback(() => {
    cancelledRef.current = true;
    setFadingOut(false);
    setRendered([]);
    setRunId((n) => n + 1);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, ms);
      });

    const isCancelled = () => cancelledRef.current;

    const run = async () => {
      // Clean slate on each run.
      setRendered([]);
      setFadingOut(false);

      for (let i = 0; i < SCRIPT.length; i++) {
        if (isCancelled()) return;
        const step = SCRIPT[i];

        // Brief pause before each new message, giving the eye a beat.
        await wait(PRE_MESSAGE_PAUSE_MS);
        if (isCancelled()) return;

        if (step.kind === "user") {
          setRendered((prev) => [
            ...prev,
            { id: i, kind: "user", text: step.text },
          ]);
          continue;
        }

        if (step.kind === "handoff") {
          setRendered((prev) => [
            ...prev,
            { id: i, kind: "handoff", label: step.label },
          ]);
          continue;
        }

        // captain | dispatcher — typewriter (or instant under reduced motion).
        if (reducedMotion) {
          setRendered((prev) => [
            ...prev,
            {
              id: i,
              kind: step.kind,
              text: step.text,
              isTyping: false,
            },
          ]);
          continue;
        }

        // Insert empty bubble, then grow text char-by-char.
        setRendered((prev) => [
          ...prev,
          { id: i, kind: step.kind, text: "", isTyping: true },
        ]);

        for (let charIdx = 1; charIdx <= step.text.length; charIdx++) {
          if (isCancelled()) return;
          const partial = step.text.slice(0, charIdx);
          setRendered((prev) =>
            prev.map((entry) =>
              entry.id === i && entry.kind === step.kind
                ? { ...entry, text: partial }
                : entry,
            ),
          );
          await wait(TYPE_SPEED_MS);
        }

        // Stop blinking cursor on this bubble.
        setRendered((prev) =>
          prev.map((entry) =>
            entry.id === i && (entry.kind === "captain" || entry.kind === "dispatcher")
              ? { ...entry, isTyping: false }
              : entry,
          ),
        );
      }

      if (isCancelled()) return;

      // End-of-script pause, then fade out, then loop.
      await wait(END_OF_SCRIPT_PAUSE_MS);
      if (isCancelled()) return;

      setFadingOut(true);
      await wait(FADE_OUT_MS);
      if (isCancelled()) return;

      setRendered([]);
      setFadingOut(false);
      // Trigger the next run.
      setRunId((n) => n + 1);
    };

    void run();

    return () => {
      cancelledRef.current = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [runId, reducedMotion]);

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-lg backdrop-blur-sm transition-opacity duration-300 sm:p-6",
        fadingOut ? "opacity-0" : "opacity-100",
      )}
    >
      {/* Header strip — small label so the visitor knows this is a demo */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
          <span>Flight Crew demo</span>
        </div>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          aria-label="Restart Flight Crew demo"
        >
          <RotateCw className="h-3 w-3" aria-hidden="true" />
          <span>Replay</span>
        </button>
      </div>

      {/* Conversation surface */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="flex min-h-[18rem] flex-col gap-4"
      >
        {rendered.map((entry) => {
          if (entry.kind === "user") {
            return <UserBubble key={entry.id} text={entry.text} />;
          }
          if (entry.kind === "captain") {
            return (
              <PersonaBubble
                key={entry.id}
                tokens={CAPTAIN_TOKENS}
                text={entry.text}
                isTyping={entry.isTyping}
              />
            );
          }
          if (entry.kind === "dispatcher") {
            return (
              <PersonaBubble
                key={entry.id}
                tokens={DISPATCHER_TOKENS}
                text={entry.text}
                isTyping={entry.isTyping}
              />
            );
          }
          // handoff
          return <HandoffSeam key={entry.id} label={entry.label} />;
        })}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end" aria-label={`You: ${text}`}>
      <div className="max-w-[85%] rounded-2xl bg-blue-600/20 px-4 py-2.5 text-sm text-slate-200">
        {text}
      </div>
    </div>
  );
}

function PersonaBubble({
  tokens,
  text,
  isTyping,
}: {
  tokens: PersonaTokens;
  text: string;
  isTyping: boolean;
}) {
  const Icon = tokens.icon;
  // Even while typing, give screen readers the persona name + current text.
  const ariaText = text.length > 0 ? `${tokens.name}: ${text}` : `${tokens.name} is typing`;

  return (
    <div className="flex items-start gap-3" aria-label={ariaText}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border",
          tokens.avatarBgClass,
          tokens.avatarBorderClass,
        )}
        aria-hidden="true"
      >
        <Icon className={cn("h-4 w-4", tokens.avatarIconClass)} />
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "min-w-0 flex-1 rounded-r-xl rounded-bl-xl bg-slate-800/50 px-4 py-2.5",
          tokens.bubbleBorderClass,
        )}
      >
        <div className={cn("mb-1 text-xs font-semibold", tokens.textClass)}>
          {tokens.name}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
          {text}
          {isTyping ? <BlinkingCursor /> : null}
        </div>
      </div>
    </div>
  );
}

function BlinkingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block animate-pulse font-mono text-slate-400"
    >
      _
    </span>
  );
}

function HandoffSeam({ label }: { label: string }) {
  return (
    <div
      className="my-1 flex items-center gap-3"
      role="separator"
      aria-label={label}
    >
      <div className="h-px flex-1 border-t border-dashed border-violet-500/40" />
      <span className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="h-px flex-1 border-t border-dashed border-violet-500/40" />
    </div>
  );
}

// Default export so callers can `import FlightCrewDemoLoop from ...` if they
// prefer; both forms work.
export default FlightCrewDemoLoop;

// Exports for testing — useful in case someone wants to lock the script
// content in a unit test (no test added in this commit, but the surface is
// stable).
export const __SCRIPT_FOR_TEST__ = SCRIPT;
