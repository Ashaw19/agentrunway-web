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
 *                    the app comes back to the front
 *
 * Reads storage when the store is created, which is before saved storage has
 * loaded, so `hydrate` re-reads it (lib/storage-bootstrap.ts).
 *
 * The server is asked at most once a minute (60 requests an hour is its
 * limit) unless forced, and any failure leaves the cached payload as it was.
 */

import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { storage } from "../lib/mmkv";
import type { NextUpPayload } from "@agent-runway/core/lib/next-up/types";

export interface PendingCall {
  clientId: string;
  clientName: string;
  /** ms timestamp of when the call was started. */
  at: number;
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
  /**
   * A handful client was handled (contacted, skipped, stopped, Hangar): off
   * the handful now and counted done, before the server's answer confirms it.
   */
  dropHandfulClient: (clientId: string) => void;
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

/** The parts of a payload the dashboard reads, checked so a damaged copy or an error body never replaces a good one. */
function isNextUpPayload(v: unknown): v is NextUpPayload {
  return (
    isObject(v) &&
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
  return isObject(v) && typeof v.clientId === "string" && typeof v.clientName === "string" && typeof v.at === "number";
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

// ── The store ────────────────────────────────────────────────────────────────

export const useNextUpStore = create<NextUpStore>((set, get) => {
  const saved = readSaved();

  /** One request. Leaves the cached payload alone on any failure. */
  const request = async (): Promise<void> => {
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

    clearPendingCall: () => {
      set({ pendingCall: null });
      try {
        storage.delete(PENDING_CALL_KEY);
      } catch {
        // see save()
      }
    },

    dropHandfulClient: (clientId) => {
      const payload = get().payload;
      if (!payload) return;
      const listed = payload.handful.some((h) => h.client_id === clientId) || payload.snoozed.some((s) => s.client_id === clientId);
      if (!listed) return;
      const next: NextUpPayload = {
        ...payload,
        handful: payload.handful.filter((h) => h.client_id !== clientId),
        snoozed: payload.snoozed.filter((s) => s.client_id !== clientId),
        done_today: payload.done_today + 1,
      };
      set({ payload: next });
      save(PAYLOAD_KEY, next);
    },
  };
});
