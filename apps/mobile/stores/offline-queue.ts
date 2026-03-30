/**
 * Offline mutation queue store.
 *
 * Persists failed mutations in MMKV and replays them when connectivity returns.
 * Zustand store accessed both inside and outside React (via getState()).
 */

import { create } from "zustand";
import { storage } from "../lib/mmkv";
import { supabase } from "../lib/supabase";
import { useToastStore } from "./toast-store";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QueuedMutation {
  id: string;
  type: "addClient" | "addTransaction" | "addActivity" | "advanceStage";
  payload: any;
  createdAt: number;
  retryCount: number;
}

interface OfflineQueueStore {
  queue: QueuedMutation[];
  failed: QueuedMutation[]; // Mutations that exhausted retries — kept for user review
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  _processing: boolean;

  enqueue: (type: QueuedMutation["type"], payload: any) => void;
  dequeue: (id: string) => void;
  setOnline: (online: boolean) => void;
  processQueue: () => Promise<void>;
  /** Retry a specific failed mutation (moves it back to active queue). */
  retryFailed: (id: string) => void;
  /** Dismiss a failed mutation permanently. */
  dismissFailed: (id: string) => void;
}

// ── MMKV Persistence Helpers ─────────────────────────────────────────────────

const QUEUE_KEY = "offline_queue";
const FAILED_KEY = "offline_failed"; // Permanently failed mutations kept for user review
const MAX_RETRIES = 10;

function loadQueue(): QueuedMutation[] {
  try {
    const raw = storage.getString(QUEUE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveQueue(queue: QueuedMutation[]) {
  try {
    storage.set(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function loadFailed(): QueuedMutation[] {
  try {
    const raw = storage.getString(FAILED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveFailed(failed: QueuedMutation[]) {
  try {
    storage.set(FAILED_KEY, JSON.stringify(failed));
  } catch {
    // ignore
  }
}

// ── Mutation Executors ───────────────────────────────────────────────────────

async function executeMutation(mutation: QueuedMutation): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  switch (mutation.type) {
    case "addTransaction": {
      const { error } = await supabase
        .from("transactions")
        .insert({ ...mutation.payload, user_id: user.id });
      return !error;
    }
    case "addClient": {
      const { error } = await supabase
        .from("clients")
        .insert({ ...mutation.payload, user_id: user.id });
      return !error;
    }
    case "addActivity": {
      const { error } = await supabase
        .from("contact_activities")
        .insert({ ...mutation.payload, user_id: user.id });
      return !error;
    }
    case "advanceStage": {
      const { dealId, newStage } = mutation.payload;
      const { error } = await supabase
        .from("pipeline_deals")
        .update({ stage: newStage })
        .eq("id", dealId)
        .eq("user_id", user.id);
      return !error;
    }
    default:
      return false;
  }
}

// ── Store ────────────────────────────────────────────────────────────────────

const initialQueue = loadQueue();
const initialFailed = loadFailed();

export const useOfflineQueueStore = create<OfflineQueueStore>((set, get) => ({
  queue: initialQueue,
  failed: initialFailed,
  isOnline: true,
  pendingCount: initialQueue.length,
  failedCount: initialFailed.length,
  _processing: false,

  enqueue: (type, payload) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mutation: QueuedMutation = {
      id,
      type,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
    };
    const newQueue = [...get().queue, mutation];
    set({ queue: newQueue, pendingCount: newQueue.length });
    saveQueue(newQueue);
  },

  dequeue: (id) => {
    const newQueue = get().queue.filter((m) => m.id !== id);
    set({ queue: newQueue, pendingCount: newQueue.length });
    saveQueue(newQueue);
  },

  setOnline: (online) => {
    set({ isOnline: online });
  },

  processQueue: async () => {
    const state = get();
    if (state._processing || state.queue.length === 0) return;

    set({ _processing: true });
    const toast = useToastStore.getState();

    // Process a snapshot of the current queue
    const snapshot = [...state.queue];

    for (const mutation of snapshot) {
      const success = await executeMutation(mutation);

      if (success) {
        get().dequeue(mutation.id);
      } else {
        // Increment retry count
        const updated = get().queue.map((m) =>
          m.id === mutation.id ? { ...m, retryCount: m.retryCount + 1 } : m
        );

        // Check for max retries
        const failed = updated.find(
          (m) => m.id === mutation.id && m.retryCount >= MAX_RETRIES
        );
        if (failed) {
          // Move to failed list (persistent) instead of discarding
          const filtered = updated.filter((m) => m.id !== mutation.id);
          const newFailed = [...get().failed, failed];
          set({
            queue: filtered,
            pendingCount: filtered.length,
            failed: newFailed,
            failedCount: newFailed.length,
          });
          saveQueue(filtered);
          saveFailed(newFailed);
          toast.show(
            `Failed to sync ${mutation.type} after ${MAX_RETRIES} attempts — tap Settings to retry`,
            "error"
          );
        } else {
          set({ queue: updated, pendingCount: updated.length });
          saveQueue(updated);
        }
      }
    }

    set({ _processing: false });

    // If everything synced, show a success toast
    if (get().queue.length === 0 && snapshot.length > 0) {
      toast.show("All changes synced", "success");
    }
  },

  retryFailed: (id) => {
    const mutation = get().failed.find((m) => m.id === id);
    if (!mutation) return;
    // Move back to active queue with reset retry count
    const newFailed = get().failed.filter((m) => m.id !== id);
    const requeued = { ...mutation, retryCount: 0 };
    const newQueue = [...get().queue, requeued];
    set({
      failed: newFailed,
      failedCount: newFailed.length,
      queue: newQueue,
      pendingCount: newQueue.length,
    });
    saveFailed(newFailed);
    saveQueue(newQueue);
  },

  dismissFailed: (id) => {
    const newFailed = get().failed.filter((m) => m.id !== id);
    set({ failed: newFailed, failedCount: newFailed.length });
    saveFailed(newFailed);
  },
}));
