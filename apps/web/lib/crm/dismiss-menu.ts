/**
 * The menu on a Flight Control card's Dismiss button: Skip this time, Later
 * (in an hour, tonight, tomorrow) and Stop suggesting (3 months, 6 months,
 * move to the Hangar). The phone's Next up offers the same choices, so the
 * rules come from core (lib/suggestion-dismissals.ts) and the writes from the
 * shim (dismissed-opportunities.ts); this file is the menu's shape, its copy,
 * and the glue that turns one pick into writes and an Undo.
 *
 * "Already talked" is the Log contact button on the web card, so the menu
 * leaves it out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dismissChoicesFor,
  laterChoices,
  laterUntil,
  stopUntil,
  type LaterChoice,
  type StopChoice,
} from "@agent-runway/core/lib/suggestion-dismissals";
import {
  bringBackFromHangar,
  dismissOpportunity,
  holdSuggestion,
  moveToHangar,
  reopenTodaysPin,
  resumeSuggestion,
  undismissOpportunity,
} from "./dismissed-opportunities";

export type { LaterChoice, StopChoice };

export type DismissMenuEntry =
  | { choice: "skip" }
  | { choice: "later"; options: LaterChoice[] }
  | { choice: "stop"; options: StopChoice[] };

/** What Stop suggesting offers, in menu order. */
const STOP_OPTIONS: readonly StopChoice[] = ["3_months", "6_months", "hangar"];

/**
 * The menu for a card at `now`. Which choices exist comes from core's
 * dismissChoicesFor (a consent-lapsing card can't be stopped); the Later
 * times come from laterChoices (no "tonight" from 19:00 Atlantic).
 */
export function dismissMenuFor(opportunityType: string, now: Date): DismissMenuEntry[] {
  const offered = new Set(dismissChoicesFor(opportunityType));
  const menu: DismissMenuEntry[] = [];
  if (offered.has("skip")) menu.push({ choice: "skip" });
  if (offered.has("later")) menu.push({ choice: "later", options: laterChoices(now) });
  if (offered.has("stop")) menu.push({ choice: "stop", options: [...STOP_OPTIONS] });
  return menu;
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export const SKIP_LABEL = "Skip this time";
export const MENU_HEADINGS = { later: "Later", stop: "Stop suggesting" } as const;
export const LATER_LABELS: Record<LaterChoice, string> = {
  in_an_hour: "In an hour",
  tonight:    "Tonight",
  tomorrow:   "Tomorrow",
};
export const STOP_LABELS: Record<StopChoice, string> = {
  "3_months": "For 3 months",
  "6_months": "For 6 months",
  hangar:     "Move to the Hangar",
};

export interface DismissToastText {
  title:       string;
  /** Blank when the title says it all. */
  description: string;
}

const LATER_WORDS: Record<LaterChoice, string> = {
  in_an_hour: "in an hour",
  tonight:    "tonight",
  tomorrow:   "tomorrow",
};

/** What the toast says after a pick. The Undo button is added by the caller: every toast carries one. */
export function dismissToast(
  choice:     "skip" | "later" | "stop" | "hangar",
  clientName: string,
  detail:     LaterChoice | StopChoice | null = null,
): DismissToastText {
  const name = clientName.trim();
  const mid = name || "this client";
  const start = name || "This client";

  if (choice === "hangar" || (choice === "stop" && detail === "hangar")) {
    return { title: `${start} moved to the Hangar.`, description: "" };
  }
  if (choice === "skip") {
    return { title: `Skipped ${mid} this time.`, description: "They come back at their next reason to reach out." };
  }
  if (choice === "later") {
    const when = detail && detail in LATER_WORDS ? LATER_WORDS[detail as LaterChoice] : "later";
    return { title: `${start} is back ${when}.`, description: "" };
  }
  const span = detail === "3_months" ? "3 months" : detail === "6_months" ? "6 months" : "a while";
  return { title: `No suggestions for ${mid} for ${span}.`, description: "" };
}

// ── One pick, the writes, and the Undo ──────────────────────────────────────

export type DismissPick =
  | { choice: "skip" }
  | { choice: "later"; option: LaterChoice }
  | { choice: "stop"; option: StopChoice };

/** The part of a Flight Control card a dismissal needs. */
export interface DismissTarget {
  client_id:        string;
  client_name:      string;
  opportunity_type: string;
  trigger_date:     string;
}

export interface UndoResult {
  ok: boolean;
  /** Set when the Undo worked but something around it didn't: shown to the agent. */
  message?: string;
}

export type DismissResult =
  | {
      ok:    true;
      toast: DismissToastText;
      /** False when nothing was written (a Stop is already running): the card stays. */
      hidesCard: boolean;
      /** Null when there is nothing to undo. */
      undo: (() => Promise<UndoResult>) | null;
    }
  | { ok: false; message: string };

const PIN_NOT_REOPENED = "Undone. They may not show on today's list until tomorrow.";

/**
 * Applies one pick from the menu and returns what to show.
 *
 * Skip, Stop and the Hangar free the client's slot in the day's handful, and
 * a sync may already have closed their pin for it; Undo reopens that pin
 * (reopenTodaysPin) after the undo itself saved. A Later keeps the slot, so
 * its Undo only takes the hold off.
 *
 * A Later made while a Stop is running writes nothing: the writer's message
 * is the toast, and there is no Undo, since resuming would delete the Stop.
 */
export async function applyDismiss(
  supabase: SupabaseClient,
  target:   DismissTarget,
  pick:     DismissPick,
  now:      Date = new Date(),
): Promise<DismissResult> {
  try {
    return await dismissNow(supabase, target, pick, now);
  } catch (err) {
    // The writers report instead of throwing; this is the sign-in lookup or the clock.
    console.error("[flight-control] dismiss failed:", err);
    return { ok: false, message: `Couldn't save that for ${target.client_name.trim() || "this client"}. Try again.` };
  }
}

async function dismissNow(
  supabase: SupabaseClient,
  target:   DismissTarget,
  pick:     DismissPick,
  now:      Date,
): Promise<DismissResult> {
  const { client_id: clientId, client_name: clientName } = target;
  const who = { clientId, clientName };

  /** Runs an undo step, then reopens today's pin when `reopen` is set. */
  const undoWith = (step: () => Promise<{ ok: boolean }>, reopen: boolean) => async (): Promise<UndoResult> => {
    try {
      const undone = await step();
      if (!undone.ok) return { ok: false };
      if (!reopen) return { ok: true };
      const reopened = await reopenTodaysPin(supabase, clientId);
      return reopened.ok ? { ok: true } : { ok: true, message: PIN_NOT_REOPENED };
    } catch (err) {
      console.error("[flight-control] undo failed:", err);
      return { ok: false };
    }
  };

  if (pick.choice === "skip") {
    const saved = await dismissOpportunity(supabase, target);
    if (!saved.ok) return { ok: false, message: `Couldn't save that for ${clientName.trim() || "this client"}. Try again.` };
    return {
      ok: true,
      toast: dismissToast("skip", clientName, null),
      hidesCard: true,
      undo: undoWith(() => undismissOpportunity(supabase, target), true),
    };
  }

  if (pick.choice === "later") {
    const held = await holdSuggestion(supabase, { ...who, kind: "later", until: laterUntil(pick.option, now) });
    if (!held.ok) return { ok: false, message: held.message };
    if (held.stoppedUntil) {
      return { ok: true, toast: { title: held.message, description: "" }, hidesCard: false, undo: null };
    }
    return {
      ok: true,
      toast: dismissToast("later", clientName, pick.option),
      hidesCard: true,
      undo: undoWith(() => resumeSuggestion(supabase, clientId), false),
    };
  }

  if (pick.option === "hangar") {
    const moved = await moveToHangar(supabase, who);
    if (!moved.ok) return { ok: false, message: moved.message };
    return {
      ok: true,
      toast: dismissToast("hangar", clientName),
      hidesCard: true,
      undo: undoWith(() => bringBackFromHangar(supabase, who), true),
    };
  }

  const stopped = await holdSuggestion(supabase, { ...who, kind: "stop", until: stopUntil(pick.option, now) });
  if (!stopped.ok) return { ok: false, message: stopped.message };
  return {
    ok: true,
    toast: dismissToast("stop", clientName, pick.option),
    hidesCard: true,
    undo: undoWith(() => resumeSuggestion(supabase, clientId), true),
  };
}
