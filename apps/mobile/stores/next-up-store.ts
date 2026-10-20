/**
 * The phone dashboard's "Next up": the day's handful cached from
 * GET /api/next-up, and the few things the phone keeps for itself.
 *
 *   payload          the last good /api/next-up answer, kept on the phone so
 *                    the handful still shows offline (the builder treats it as
 *                    sticky: yesterday's picks stay until the next refresh)
 *   localSnoozes     "Later" on cards that exist only on the phone (an overdue
 *                    task, the briefing, ...): card key -> ISO instant it
 *                    comes back. A handful client's Later is the server's.
 *   voiceNoteDoneOn  the day the "record a voice note" card was handled
 *   pendingCall      a call just placed, so the after-call sheet can open when
 *                    the app comes back to the front; stamped when the app
 *                    then went to the background (R34, lib/post-call.ts)
 *
 * Reads storage when the store is created, which is before saved storage has
 * loaded, so `hydrate` re-reads it (lib/storage-bootstrap.ts).
 *
 * The server is asked at most once a minute (60 requests an hour is its
 * limit) unless forced, and any failure leaves the cached payload as it was.
 *
 * The card writes (Skip, Later, Stop, the Hangar, "already talked") go
 * through core's writers (packages/core/lib/record-writers.ts) with the
 * signed-in user's own client, as web Flight Control's Dismiss does
 * (apps/web/lib/crm/dismiss-menu.ts). Once one saves, the card leaves at
 * once (a Later keeps the client's slot and isn't counted done; the rest
 * free it), the server is asked again, and the toast offers Undo. A Later
 * that a running Stop blocked saves nothing and has no Undo; the server is
 * asked again all the same. Undo for
 * Skip, Stop and the Hangar also puts the client back on today's list
 * (reopenHandfulPin). Nothing is queued offline (correction 16): the card
 * stays and the toast says to try again.
 *
 * R22: an answer to a request that left before a card was handled here may
 * still show that card, so it is ignored; the handled card's own forced
 * refetch, which leaves after it, is the one taken.
 */

import { create } from "zustand";
import i18next from "i18next";
import { supabase } from "../lib/supabase";
import { storage } from "../lib/mmkv";
import { nextUpClock } from "../lib/next-up-clock";
import { handledToast, type HandledCard } from "../lib/next-up-copy";
import { useToastStore } from "./toast-store";
import { useOfflineQueueStore } from "./offline-queue";
import { NEXT_UP_PAYLOAD_VERSION, type HandfulItem, type NextUpPayload } from "@agent-runway/core/lib/next-up/types";
import type { LaterChoice } from "@agent-runway/core/lib/suggestion-dismissals";
import { localISODate } from "@agent-runway/core/lib/local-date";
import {
  removeSuggestionDismissal,
  removeSuggestionSkipByKey,
  reopenHandfulPin,
  restoreClientFromHangar,
  resumeSuggestions,
  writeClientToHangar,
  writeContactActivity,
  writeSuggestionHold,
  writeSuggestionSkip,
  type WriteOutcome,
} from "@agent-runway/core/lib/record-writers";

export interface PendingCall {
  clientId: string;
  clientName: string;
  /** ms timestamp of when the call was started. */
  at: number;
  /** ms timestamp of the app's first trip to the background after that (the call took the phone). */
  backgroundedAt?: number;
}

interface NextUpStore {
  payload: NextUpPayload | null;
  /** ms timestamp of the last good fetch; after a restart, when the saved payload was built. */
  fetchedAt: number | null;
  localSnoozes: Record<string, string>;
  voiceNoteDoneOn: string | null;
  pendingCall: PendingCall | null;

  /** Restores the saved values once storage has loaded (app startup). */
  hydrate: () => void;
  /**
   * Asks /api/next-up for today's handful. At most once a minute unless
   * `force`; a forced call made while a request is out asks again once it
   * lands, so it sees anything saved since. Never throws.
   */
  fetchNextUp: (opts?: { force?: boolean }) => Promise<void>;
  /** Hides a phone-only card until `until` (ISO instant). */
  snoozeCard: (key: string, until: string) => void;
  markVoiceNoteDone: (day: string) => void;
  setPendingCall: (call: PendingCall) => void;
  clearPendingCall: () => void;
  /** The app went to the background at `at`: stamps the call waiting, if any (the first time only). */
  noteAppBackgrounded: (at: number) => void;
  /** Brings a phone-only card back before its Later ends (the toast's Undo). */
  unsnoozeCard: (key: string) => void;
  /**
   * A handful client was handled (contacted, skipped, stopped, Hangar): off
   * the handful now and counted done, before the server's answer confirms it.
   */
  dropHandfulClient: (clientId: string) => void;

  // ── Card writes: each returns true when the card was handled ──────────────
  /** Skip this time: the one occurrence (client, reason, trigger date). */
  skipSuggestion: (item: HandfulItem) => Promise<boolean>;
  /**
   * Later (in an hour, tonight, tomorrow) or Stop suggesting (3 or 6 months)
   * until `until`. `choice` only picks the toast's words. False when nothing
   * was written (a running Stop blocked a Later).
   */
  holdSuggestion: (
    item: { client_id: string; client_name: string },
    kind: "later" | "stop",
    until: Date,
    choice?: LaterChoice | "3_months" | "6_months",
  ) => Promise<boolean>;
  /** Takes the client's Later and Stop off. */
  resumeSuggestion: (clientId: string) => Promise<boolean>;
  /** Archives the client (the Hangar), after the agent confirmed. */
  moveToHangar: (clientId: string, name: string) => Promise<boolean>;
  /** Already talked to them: logs the contact (a call, a text or in person). */
  logTalkedTo: (clientId: string, name: string, type: "call" | "text" | "meeting") => Promise<boolean>;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";
const FETCH_TIMEOUT_MS = 15_000;
/** The least time between requests; the server allows 60 an hour. */
export const NEXT_UP_REFETCH_MS = 60_000;

const PAYLOAD_KEY = "next_up_payload";
const SNOOZES_KEY = "next_up_local_snoozes";
const VOICE_NOTE_KEY = "next_up_voice_note_done_on";
const PENDING_CALL_KEY = "next_up_pending_call";

// ── Reading what is saved ────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The parts of a payload the dashboard reads, checked so a damaged copy or an
 * error body never replaces a good one. A payload in another shape (an older
 * one with no version, saved before new_leads, R31) is ignored too, so it
 * can't be read as this one.
 */
function isNextUpPayload(v: unknown): v is NextUpPayload {
  return (
    isObject(v) &&
    v.version === NEXT_UP_PAYLOAD_VERSION &&
    Array.isArray(v.new_leads) &&
    typeof v.day === "string" &&
    typeof v.target === "number" &&
    typeof v.done_today === "number" &&
    typeof v.generated_at === "string" &&
    Array.isArray(v.handful) &&
    Array.isArray(v.snoozed) &&
    isObject(v.urgent)
  );
}

function isPendingCall(v: unknown): v is PendingCall {
  return (
    isObject(v) && typeof v.clientId === "string" && typeof v.clientName === "string" && typeof v.at === "number" &&
    (v.backgroundedAt === undefined || typeof v.backgroundedAt === "number")
  );
}

function readJson(key: string): unknown {
  try {
    const raw = storage.getString(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSaved() {
  const payload = readJson(PAYLOAD_KEY);
  const snoozes = readJson(SNOOZES_KEY);
  const call = readJson(PENDING_CALL_KEY);
  const builtAt = isNextUpPayload(payload) ? Date.parse(payload.generated_at) : NaN;
  return {
    payload: isNextUpPayload(payload) ? payload : null,
    fetchedAt: Number.isNaN(builtAt) ? null : builtAt,
    localSnoozes: isObject(snoozes)
      ? (Object.fromEntries(Object.entries(snoozes).filter(([, until]) => typeof until === "string")) as Record<string, string>)
      : {},
    voiceNoteDoneOn: storage.getString(VOICE_NOTE_KEY) ?? null,
    pendingCall: isPendingCall(call) ? call : null,
  };
}

function save(key: string, value: unknown) {
  try {
    storage.set(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // The copy on disk is a convenience; the store still holds the value.
  }
}

// ── The network ──────────────────────────────────────────────────────────────

/** Rejects if `promise` takes longer than `ms`; the timer is cleared either way. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Network timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The request in flight, and when the last one was started (not saved; a restart may ask at once). */
let inFlight: Promise<void> | null = null;
let lastAttemptAt: number | null = null;
/**
 * Counts the cards handled (or put back) on the phone. A request carries the
 * count it left with; an answer that comes back to a different count was
 * built before that change and is ignored (R22).
 */
let localChanges = 0;

// ── The data store's side ────────────────────────────────────────────────────

/**
 * What a write here changes in the data store: "contacted" (a contact was
 * logged: the streak, and the client's row, which the trigger moved) or
 * "changed" (the client's row, e.g. archived). The data store registers it;
 * it imports this store, so this store doesn't import it back.
 */
export type ClientChange = "contacted" | "changed";
let clientChanged: ((clientId: string, change: ClientChange) => void) | null = null;

export function onNextUpClientChange(fn: ((clientId: string, change: ClientChange) => void) | null): void {
  clientChanged = fn;
}

function tellDataStore(clientId: string, change: ClientChange) {
  try {
    clientChanged?.(clientId, change);
  } catch (err) {
    console.warn("next up: data store update failed:", err);
  }
}

// ── The words and the writes ─────────────────────────────────────────────────

/**
 * The "home" words in the app's language. i18next's one instance, which
 * lib/i18n.ts sets up at launch (imported here directly, so the store
 * doesn't load the locale files and the device's language itself).
 */
const tHome = (key: string, options?: Record<string, unknown>): string =>
  // eslint-disable-next-line import/no-named-as-default-member -- the shared instance, not a fresh getFixedT
  i18next.getFixedT(null, "home")(key, options) as string;

const toast = (message: string, variant: "success" | "error" | "info" = "success", undo?: () => Promise<void>) =>
  useToastStore.getState().show(message, variant, undefined, undo ? { label: tHome("nextUpToast.undo"), onPress: undo } : undefined);

/** The signed-in user's id, from the saved session (known with no connection). */
async function signedInUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return (data.session as { user?: { id?: string } } | null)?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs one write with the signed-in user's id. Not saved: says why (no
 * connection, or `failure` for that outcome) and returns null.
 */
async function attempt<T extends WriteOutcome>(
  write: (userId: string) => Promise<T>,
  failure: (outcome: T | null) => string,
): Promise<T | null> {
  if (!useOfflineQueueStore.getState().isOnline) {
    toast(tHome("nextUpToast.offline"), "error");
    return null;
  }
  const userId = await signedInUserId();
  let outcome: T | null = null;
  try {
    outcome = userId ? await write(userId) : null;
  } catch (err) {
    console.warn("next up: write failed:", err);
  }
  if (outcome?.ok) return outcome;
  toast(outcome?.offline ? tHome("nextUpToast.offline") : failure(outcome), "error");
  return null;
}

/** The client's place in a payload, kept so Undo can put it back. */
interface Place {
  day: string;
  clientId: string;
  handful: { item: HandfulItem; index: number } | null;
  snoozed: { entry: NextUpPayload["snoozed"][number]; index: number } | null;
  /** The change counted them done today. */
  counted: boolean;
}

function placeOf(payload: NextUpPayload, clientId: string, counted: boolean): Place | null {
  const h = payload.handful.findIndex((x) => x.client_id === clientId);
  const s = payload.snoozed.findIndex((x) => x.client_id === clientId);
  if (h < 0 && s < 0) return null;
  return {
    day: payload.day,
    clientId,
    handful: h >= 0 ? { item: payload.handful[h], index: h } : null,
    snoozed: s >= 0 ? { entry: payload.snoozed[s], index: s } : null,
    counted,
  };
}

/** How long an Undo waits for a refetch already on its way. */
const UNDO_WAIT_MS = 4_000;

/** Resolves when `promise` settles or after `ms`, whichever comes first; never rejects. */
function settledWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([promise.then(() => {}, () => {}), cap]).finally(() => clearTimeout(timer));
}

const insertAt = <T>(list: readonly T[], index: number, value: T): T[] => {
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, value);
  return next;
};

// ── The store ────────────────────────────────────────────────────────────────

export const useNextUpStore = create<NextUpStore>((set, get) => {
  const saved = readSaved();

  /** One request. Leaves the cached payload alone on any failure. */
  const request = async (): Promise<void> => {
    const leftWith = localChanges;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      lastAttemptAt = Date.now();
      const body = await withTimeout(
        (async () => {
          const res = await fetch(`${API_URL}/api/next-up`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.ok ? ((await res.json()) as unknown) : null;
        })(),
        FETCH_TIMEOUT_MS,
      );
      if (!isNextUpPayload(body)) return;
      // R22: built before a card was handled here, so it may still show it.
      if (leftWith !== localChanges) return;
      set({ payload: body, fetchedAt: Date.now() });
      save(PAYLOAD_KEY, body);
    } catch (err) {
      // Background refresh: the cached payload keeps the dashboard useful.
      console.warn("fetchNextUp error:", err);
    }
  };

  const start = (): Promise<void> => {
    const run: Promise<void> = request().finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  };

  /** A changed payload, shown and saved; answers already on their way are ignored (R22). */
  const setPayload = (next: NextUpPayload) => {
    localChanges += 1;
    set({ payload: next });
    save(PAYLOAD_KEY, next);
  };

  /** Later on a handful client: hidden until `until`, keeping their slot (not counted done). */
  const holdLocally = (clientId: string, until: string) => {
    const payload = get().payload;
    if (!payload) return;
    const pick = payload.handful.find((h) => h.client_id === clientId);
    const held = payload.snoozed.find((s) => s.client_id === clientId);
    if (!pick && !held) return;
    const entry = held
      ? { ...held, until }
      : { client_id: clientId, client_name: pick!.client_name, until, phone: pick!.phone };
    setPayload({
      ...payload,
      handful: payload.handful.filter((h) => h.client_id !== clientId),
      snoozed: [...payload.snoozed.filter((s) => s.client_id !== clientId), entry],
    });
  };

  /** Undo: the client back where they were, if the day hasn't turned since. */
  const putBack = (place: Place | null) => {
    const payload = get().payload;
    if (!place || !payload || payload.day !== place.day) return;
    let handful = payload.handful.filter((h) => h.client_id !== place.clientId);
    let snoozed = payload.snoozed.filter((s) => s.client_id !== place.clientId);
    if (place.handful) handful = insertAt(handful, place.handful.index, place.handful.item);
    if (place.snoozed) snoozed = insertAt(snoozed, place.snoozed.index, place.snoozed.entry);
    setPayload({
      ...payload,
      handful,
      snoozed,
      done_today: place.counted ? Math.max(0, payload.done_today - 1) : payload.done_today,
    });
  };

  /**
   * The card's Undo: `step` takes the write back; `reopen` (Skip, Stop, the
   * Hangar) then puts the client back on today's list, in its own try, so a
   * failure there never reports the Undo itself as failed.
   */
  const undoWith = (
    clientId: string,
    place: Place | null,
    step: (userId: string) => Promise<WriteOutcome>,
    opts: { reopen: boolean; rowChanged?: boolean },
  ) => async (): Promise<void> => {
    // Let a refetch already on its way (the sync that closes the pin) land
    // first, so it can't close the pin again after Undo reopened it. A slow
    // one is waited for a few seconds at most.
    if (inFlight) await settledWithin(inFlight, UNDO_WAIT_MS);
    const undone = await attempt(step, () => tHome("nextUpToast.undoFailed"));
    if (!undone) return;
    putBack(place);
    if (opts.rowChanged) tellDataStore(clientId, "changed");
    let pinBack = true;
    if (opts.reopen) {
      try {
        const userId = await signedInUserId();
        pinBack = !!userId && (await reopenHandfulPin(supabase, userId, clientId)).ok;
      } catch (err) {
        console.warn("next up: reopen failed:", err);
        pinBack = false;
      }
    }
    void get().fetchNextUp({ force: true });
    if (!pinBack) toast(tHome("nextUpToast.undoNoPin"), "info");
  };

  /** After a write saved: the card leaves, the server is asked again, and the toast says what happened. */
  const handled = (
    clientId: string,
    name: string,
    done: HandledCard,
    local: "drop" | { until: string },
    undo: ((place: Place | null) => () => Promise<void>) | null,
  ) => {
    const payload = get().payload;
    const place = payload ? placeOf(payload, clientId, local === "drop") : null;
    if (local === "drop") get().dropHandfulClient(clientId);
    else holdLocally(clientId, local.until);
    void get().fetchNextUp({ force: true });
    toast(handledToast(done, name, tHome), "success", undo ? undo(place) : undefined);
  };

  return {
    payload: saved.payload,
    fetchedAt: saved.fetchedAt,
    localSnoozes: saved.localSnoozes,
    voiceNoteDoneOn: saved.voiceNoteDoneOn,
    pendingCall: saved.pendingCall,

    hydrate: () => {
      const disk = readSaved();
      const now = get();
      set({
        // A payload fetched this session beats the saved one.
        payload: now.payload ?? disk.payload,
        fetchedAt: now.payload ? now.fetchedAt : disk.fetchedAt,
        // Anything snoozed this session is kept on top of what was saved.
        localSnoozes: { ...disk.localSnoozes, ...now.localSnoozes },
        // The later of the two days (YYYY-MM-DD sorts as text).
        voiceNoteDoneOn: [now.voiceNoteDoneOn, disk.voiceNoteDoneOn].filter((d): d is string => !!d).sort().pop() ?? null,
        pendingCall: now.pendingCall ?? disk.pendingCall,
      });
    },

    fetchNextUp: async (opts) => {
      if (inFlight) {
        if (!opts?.force) return inFlight;
        const prior = inFlight;
        await prior;
        // Another forced call started a request after this one was made.
        if (inFlight && inFlight !== prior) return inFlight;
      } else if (!opts?.force && lastAttemptAt !== null && Date.now() - lastAttemptAt < NEXT_UP_REFETCH_MS) {
        return;
      }
      return start();
    },

    snoozeCard: (key, until) => {
      const now = Date.now();
      // Snoozes whose time has passed hide nothing: let go of them here.
      const localSnoozes = Object.fromEntries(Object.entries(get().localSnoozes).filter(([, u]) => Date.parse(u) > now));
      localSnoozes[key] = until;
      set({ localSnoozes });
      save(SNOOZES_KEY, localSnoozes);
    },

    markVoiceNoteDone: (day) => {
      set({ voiceNoteDoneOn: day });
      save(VOICE_NOTE_KEY, day);
    },

    setPendingCall: (call) => {
      set({ pendingCall: call });
      save(PENDING_CALL_KEY, call);
    },

    noteAppBackgrounded: (at) => {
      const call = get().pendingCall;
      if (!call || call.backgroundedAt !== undefined) return;
      const stamped = { ...call, backgroundedAt: at };
      set({ pendingCall: stamped });
      save(PENDING_CALL_KEY, stamped);
    },

    clearPendingCall: () => {
      set({ pendingCall: null });
      try {
        storage.delete(PENDING_CALL_KEY);
      } catch {
        // see save()
      }
    },

    unsnoozeCard: (key) => {
      if (!(key in get().localSnoozes)) return;
      const localSnoozes = { ...get().localSnoozes };
      delete localSnoozes[key];
      set({ localSnoozes });
      save(SNOOZES_KEY, localSnoozes);
    },

    dropHandfulClient: (clientId) => {
      const payload = get().payload;
      if (!payload) return;
      const listed = payload.handful.some((h) => h.client_id === clientId) || payload.snoozed.some((s) => s.client_id === clientId);
      if (!listed) return;
      setPayload({
        ...payload,
        handful: payload.handful.filter((h) => h.client_id !== clientId),
        snoozed: payload.snoozed.filter((s) => s.client_id !== clientId),
        done_today: payload.done_today + 1,
      });
    },

    // ── Card writes ──────────────────────────────────────────────────────────

    skipSuggestion: async (item) => {
      const name = item.client_name;
      const key = { client_id: item.client_id, opportunity_type: item.opportunity_type, trigger_date: item.trigger_date };
      const saved = await attempt(
        (userId) => writeSuggestionSkip(supabase, userId, key),
        () => tHome("nextUpToast.couldntSave", { name: name.trim() || tHome("nextUpToast.thisClient") }),
      );
      if (!saved) return false;
      handled(item.client_id, name, { kind: "skip" }, "drop", (place) => undoWith(item.client_id, place, (userId) =>
        saved.id ? removeSuggestionDismissal(supabase, userId, saved.id) : removeSuggestionSkipByKey(supabase, userId, key),
      { reopen: true }));
      return true;
    },

    holdSuggestion: async (item, kind, until, choice) => {
      const who = { clientId: item.client_id, clientName: item.client_name };
      const now = new Date();
      const held = await attempt(
        (userId) => writeSuggestionHold(supabase, userId, { ...who, kind, until }, nextUpClock(now).today, now),
        (outcome) => outcome?.message || tHome("nextUpToast.couldntSave", { name: item.client_name.trim() || tHome("nextUpToast.thisClient") }),
      );
      if (!held) return false;
      // A running Stop blocked the Later: nothing was written, so there is
      // nothing to undo (resuming would delete the Stop). The card stays for
      // now; the server, which knows about the Stop, is asked again.
      if (held.stoppedUntil) {
        toast(held.message, "info");
        void get().fetchNextUp({ force: true });
        return false;
      }
      const resume = (place: Place | null) =>
        undoWith(item.client_id, place, (userId) => resumeSuggestions(supabase, userId, item.client_id), { reopen: kind === "stop" });
      if (kind === "later") {
        const later = choice === "in_an_hour" || choice === "tonight" || choice === "tomorrow" ? choice : undefined;
        handled(item.client_id, item.client_name, { kind: "later", choice: later }, { until: until.toISOString() }, resume);
      } else {
        const months = choice === "3_months" ? 3 : choice === "6_months" ? 6 : undefined;
        handled(item.client_id, item.client_name, { kind: "stop", months }, "drop", resume);
      }
      return true;
    },

    resumeSuggestion: async (clientId) => {
      const resumed = await attempt(
        (userId) => resumeSuggestions(supabase, userId, clientId),
        (outcome) => outcome?.message || tHome("nextUpToast.undoFailed"),
      );
      if (!resumed) return false;
      void get().fetchNextUp({ force: true });
      toast(tHome("nextUpToast.resumed"));
      return true;
    },

    moveToHangar: async (clientId, name) => {
      const who = { clientId, clientName: name };
      const moved = await attempt(
        (userId) => writeClientToHangar(supabase, userId, who),
        (outcome) => outcome?.message || tHome("nextUpToast.couldntSave", { name: name.trim() || tHome("nextUpToast.thisClient") }),
      );
      if (!moved) return false;
      tellDataStore(clientId, "changed");
      handled(clientId, name, { kind: "hangar" }, "drop", (place) => undoWith(clientId, place, (userId) =>
        restoreClientFromHangar(supabase, userId, who), { reopen: true, rowChanged: true }));
      return true;
    },

    logTalkedTo: async (clientId, name, type) => {
      const logged = await attempt(
        (userId) => writeContactActivity(supabase, userId, { clientId, clientName: name, type, description: "" }, localISODate()),
        () => tHome("nextUpToast.couldntSave", { name: name.trim() || tHome("nextUpToast.thisClient") }),
      );
      if (!logged) return false;
      tellDataStore(clientId, "contacted");
      // No Undo, as on web's Log contact: the pin closes as contacted, which
      // is never reopened, and the contact moved last_contact_at.
      handled(clientId, name, { kind: "logged", type }, "drop", null);
      return true;
    },
  };
});
