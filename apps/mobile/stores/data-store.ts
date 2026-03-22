/**
 * Central data store for the mobile app.
 *
 * Uses Zustand + MMKV for state management with offline caching.
 * Fetches from Supabase and caches results in MMKV storage.
 */

import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { storage } from "../lib/mmkv";

// ── Types (lightweight — matches Supabase row shapes) ────────────────────────

export interface Transaction {
  id: string;
  close_date: string;
  address: string | null;
  sale_price: number;
  commission_pct: number;
  gci_override: number | null;
  side: "buyer" | "seller" | "both";
  status: "closed" | "pending" | "fallen";
  client_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface PipelineDeal {
  id: string;
  address: string | null;
  estimated_price: number;
  commission_pct: number;
  stage: "lead" | "showing" | "offer" | "conditional" | "firm";
  probability_override: number | null;
  expected_close_date: string | null;
  client_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  tags: string[];
  lead_source: string | null;
  last_contact_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContactActivity {
  id: string;
  client_id: string;
  type: "call" | "email" | "text" | "showing" | "meeting" | "offer" | "note";
  description: string | null;
  activity_date: string;
  created_at: string;
}

export interface ContactTask {
  id: string;
  client_id: string | null;
  title: string;
  due_date: string | null;
  priority: "low" | "normal" | "high";
  notes: string | null;
  completed_at: string | null;
}

export interface UserSettings {
  user_id: string;
  display_name: string | null;
  goal_gci: number | null;
  goal_transactions: number | null;
  split_preset: string | null;
  province: string | null;
  experience_years: number | null;
  subscription_tier: string;
}

export interface OutreachItem {
  id: string;
  client_id: string;
  opportunity_type: string;
  status: "draft" | "ready" | "sent" | "skipped";
  ai_subject: string | null;
  ai_body: string | null;
  final_subject: string | null;
  final_body: string | null;
  trigger_date: string;
  clients: { name: string; email: string | null } | null;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface DataStore {
  // Data
  transactions: Transaction[];
  pipeline: PipelineDeal[];
  clients: Client[];
  tasks: ContactTask[];
  settings: UserSettings | null;
  outreachQueue: OutreachItem[];

  // Loading states
  loading: boolean;
  lastFetched: number | null;

  // Actions
  fetchAll: () => Promise<void>;
  fetchClients: () => Promise<void>;
  fetchOutreach: () => Promise<void>;
  addTransaction: (tx: Omit<Transaction, "id" | "created_at">) => Promise<boolean>;
  addClient: (client: Omit<Client, "id" | "created_at">) => Promise<boolean>;
  addActivity: (activity: Omit<ContactActivity, "id" | "created_at">) => Promise<boolean>;

  // Computed
  ytdGci: () => number;
  ytdDealCount: () => number;
}

// Cache key
const CACHE_KEY = "data_store_cache";

function loadCache(): Partial<DataStore> {
  try {
    const raw = storage.getString(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function saveCache(state: Partial<DataStore>) {
  try {
    storage.set(
      CACHE_KEY,
      JSON.stringify({
        transactions: state.transactions,
        pipeline: state.pipeline,
        clients: state.clients,
        tasks: state.tasks,
        settings: state.settings,
      })
    );
  } catch {
    // ignore
  }
}

export const useDataStore = create<DataStore>((set, get) => {
  const cached = loadCache();

  return {
    transactions: (cached.transactions as Transaction[]) ?? [],
    pipeline: (cached.pipeline as PipelineDeal[]) ?? [],
    clients: (cached.clients as Client[]) ?? [],
    tasks: (cached.tasks as ContactTask[]) ?? [],
    settings: (cached.settings as UserSettings | null) ?? null,
    outreachQueue: [],
    loading: false,
    lastFetched: null,

    fetchAll: async () => {
      set({ loading: true });
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const currentYear = new Date().getFullYear();

        const [txRes, pipeRes, clientRes, taskRes, settingsRes] =
          await Promise.all([
            supabase
              .from("transactions")
              .select("*")
              .eq("user_id", user.id)
              .gte("close_date", `${currentYear}-01-01`)
              .order("close_date", { ascending: false }),
            supabase
              .from("pipeline_deals")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false }),
            supabase
              .from("clients")
              .select("*")
              .eq("user_id", user.id)
              .order("last_contact_at", { ascending: false, nullsFirst: false })
              .limit(200),
            supabase
              .from("contact_tasks")
              .select("*")
              .eq("user_id", user.id)
              .is("completed_at", null)
              .order("due_date", { ascending: true })
              .limit(50),
            supabase
              .from("user_settings")
              .select(
                "user_id, display_name, goal_gci, goal_transactions, split_preset, province, experience_years, subscription_tier"
              )
              .eq("user_id", user.id)
              .single(),
          ]);

        const newState = {
          transactions: (txRes.data ?? []) as Transaction[],
          pipeline: (pipeRes.data ?? []) as PipelineDeal[],
          clients: (clientRes.data ?? []) as Client[],
          tasks: (taskRes.data ?? []) as ContactTask[],
          settings: (settingsRes.data as UserSettings) ?? null,
          loading: false,
          lastFetched: Date.now(),
        };

        set(newState);
        saveCache(newState);
      } catch (err) {
        console.error("fetchAll error:", err);
        set({ loading: false });
      }
    },

    fetchClients: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("last_contact_at", { ascending: false, nullsFirst: false })
        .limit(200);

      if (data) {
        set({ clients: data as Client[] });
      }
    },

    fetchOutreach: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("outreach_queue")
        .select("*, clients(name, email)")
        .eq("user_id", user.id)
        .in("status", ["draft", "ready"])
        .order("trigger_date", { ascending: true });

      if (data) {
        set({ outreachQueue: data as OutreachItem[] });
      }
    },

    addTransaction: async (tx) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user.id });

      if (error) {
        console.error("addTransaction error:", error);
        return false;
      }

      await get().fetchAll();
      return true;
    },

    addClient: async (client) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from("clients")
        .insert({ ...client, user_id: user.id });

      if (error) {
        console.error("addClient error:", error);
        return false;
      }

      await get().fetchClients();
      return true;
    },

    addActivity: async (activity) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from("contact_activities")
        .insert({ ...activity, user_id: user.id });

      if (error) {
        console.error("addActivity error:", error);
        return false;
      }

      return true;
    },

    ytdGci: () => {
      const txs = get().transactions;
      return txs
        .filter((t) => t.status === "closed")
        .reduce((sum, t) => {
          if (t.gci_override) return sum + t.gci_override;
          return sum + t.sale_price * (t.commission_pct / 100);
        }, 0);
    },

    ytdDealCount: () => {
      return get().transactions.filter((t) => t.status === "closed").length;
    },
  };
});
