/**
 * apps/mobile/stores/chat-store.ts
 *
 * Persisted chat state for the Flight Crew mobile surface (Phase A).
 *
 * Design choices:
 *   - Single conversation thread (matches web's UX — Flight Crew is a
 *     single conversation with shifting personas, not parallel threads
 *     per `memory/project_flight_crew_direction.md`).
 *   - MMKV-backed. Persists between launches so Andrew can pick up where
 *     he left off (daily-driver requirement). Hard-capped at 100 messages
 *     to keep MMKV writes cheap; older messages drop off.
 *   - Active persona persists too (so the user's last selection survives
 *     a restart). Defaults to Captain on first run per DEFAULT_PERSONA.
 *
 * NOT persisted server-side. The mobile thread is local to the device.
 * Web stores its conversation in component state too (no server-side
 * conversation table as of 2026-05-26), so mobile is consistent with that.
 * If web later moves conversations server-side, this store reads from the
 * shared source instead — do not fork at that point.
 */

import { create } from "zustand";
import { storage } from "../lib/mmkv";
import { DEFAULT_PERSONA, type Persona } from "../lib/flight-crew/personas";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  /** Stable ID for FlatList keys + handoff routing. */
  id: string;
  role: "user" | "assistant";
  /** Message text. For handoff bubbles this may be the truncated handoff
   *  sentence (web treats the same way — see detectHandoff). */
  content: string;
  /** Persona for assistant messages. User messages leave this undefined. */
  persona?: Persona;
  /** Millis timestamp. */
  createdAt: number;
  /** True while the assistant message is still streaming. */
  pending?: boolean;
  /** True for the placeholder/seam bubble that announces a handoff target
   *  before the target's content streams in. Renders the handoff seam UI. */
  handoffTo?: Persona;
  /** True if the assistant turn ended with a tool-approval-required event.
   *  Phase A shows a single inline notice (web-only completion). */
  approvalDeferred?: { toolName: string; description: string };
}

interface ChatStore {
  messages: ChatMessage[];
  activePersona: Persona;
  /** Set in flight while a chat request is open — used by the screen to
   *  show a stop button and to suppress double-sends. */
  isStreaming: boolean;

  /** Append a fully-formed message. */
  appendMessage: (m: ChatMessage) => void;
  /** Patch an existing message by id (for streaming updates). */
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /** Drop a message by id (used when handoff routing replaces a placeholder). */
  removeMessage: (id: string) => void;

  setActivePersona: (p: Persona) => void;
  setStreaming: (s: boolean) => void;
  /** Clear the entire conversation. Confirmation should happen at call site. */
  clear: () => void;
}

const MESSAGES_KEY = "flight_crew_messages_v1";
const PERSONA_KEY = "flight_crew_active_persona_v1";
const MAX_MESSAGES = 100;

function loadMessages(): ChatMessage[] {
  try {
    const raw = storage.getString(MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed)) return parsed.slice(-MAX_MESSAGES);
    }
  } catch {
    /* ignore corrupt cache */
  }
  return [];
}

function saveMessages(messages: ChatMessage[]) {
  try {
    const capped = messages.slice(-MAX_MESSAGES);
    storage.set(MESSAGES_KEY, JSON.stringify(capped));
  } catch {
    /* ignore — chat history is non-critical */
  }
}

function loadActivePersona(): Persona {
  try {
    const raw = storage.getString(PERSONA_KEY);
    if (raw === "captain" || raw === "navigator" || raw === "dispatcher") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PERSONA;
}

function saveActivePersona(p: Persona) {
  try { storage.set(PERSONA_KEY, p); } catch { /* ignore */ }
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: loadMessages(),
  activePersona: loadActivePersona(),
  isStreaming: false,

  appendMessage: (m) => {
    set((s) => {
      const next = [...s.messages, m].slice(-MAX_MESSAGES);
      saveMessages(next);
      return { messages: next };
    });
  },

  updateMessage: (id, patch) => {
    set((s) => {
      const next = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      saveMessages(next);
      return { messages: next };
    });
  },

  removeMessage: (id) => {
    set((s) => {
      const next = s.messages.filter((m) => m.id !== id);
      saveMessages(next);
      return { messages: next };
    });
  },

  setActivePersona: (p) => {
    saveActivePersona(p);
    set({ activePersona: p });
  },

  setStreaming: (s) => set({ isStreaming: s }),

  clear: () => {
    saveMessages([]);
    set({ messages: [] });
  },
}));

let counter = 0;
/** Generate a stable message id. Combines a per-process counter with
 *  Date.now() so ids stay unique even when many messages land in the same
 *  millisecond (common during fast streaming). */
export function nextMessageId(): string {
  counter += 1;
  return `msg-${Date.now()}-${counter}`;
}
