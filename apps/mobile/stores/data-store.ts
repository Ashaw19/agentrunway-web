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
  date: string;
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
  estimated_commission_pct: number;
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

export interface ReceiptExpense {
  id: string;
  vendor: string | null;
  expense_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  subtotal: number | null;
  currency: string;
  category_key: string | null;
  notes: string | null;
  receipt_path: string | null;
  ocr_confidence: number | null;
  created_at: string;
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
  receipts: ReceiptExpense[];

  // Loading states
  loading: boolean;
  /** Alias for loading — use either */
  isLoading: boolean;
  lastFetched: number | null;

  // Derived / convenience
  /** Soonest incomplete task (null if none) */
  nextTask: ContactTask | null;
  /** Count of outreach items with status = 'ready' */
  outreachReadyCount: number;

  // Actions
  fetchAll: () => Promise<void>;
  /** Alias for fetchAll */
  fetch: () => Promise<void>;
  fetchClients: () => Promise<void>;
  fetchOutreach: () => Promise<void>;
  fetchReceipts: () => Promise<void>;
  addTransaction: (tx: Omit<Transaction, "id" | "created_at">) => Promise<boolean>;
  addClient: (client: Omit<Client, "id" | "created_at">) => Promise<boolean>;
  addActivity: (activity: Omit<ContactActivity, "id" | "created_at">) => Promise<boolean>;
  updateOutreachDraft: (id: string, subject: string, body: string) => Promise<boolean>;
  skipOutreach: (id: string) => Promise<boolean>;

  // Computed methods
  ytdGci: () => number;
  ytdDealCount: () => number;
  /** Sum of estimated_price for all pipeline deals */
  pipelineValue: () => number;
  /** Count of all pipeline deals */
  pipelineCount: () => number;
  /**
   * 0-100 runway score:
   *   40% pace (ytdGci vs prorated goal)
   *   30% pipeline coverage vs remaining goal
   *   30% client activity (contacted in last 30 days)
   * Clamped to [0, 100].
   */
  runwayScore: () => number;
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
        receipts: state.receipts,
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
    receipts: (cached.receipts as ReceiptExpense[]) ?? [],
    loading: false,
    isLoading: false,
    lastFetched: null,
    nextTask: (cached.tasks as ContactTask[] | undefined)?.[0] ?? null,
    outreachReadyCount: 0,

    fetchAll: async () => {
      set({ loading: true, isLoading: true });
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
              .gte("date", `${currentYear}-01-01`)
              .order("date", { ascending: false }),
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

        const tasks = (taskRes.data ?? []) as ContactTask[];
        const newState = {
          transactions: (txRes.data ?? []) as Transaction[],
          pipeline: (pipeRes.data ?? []) as PipelineDeal[],
          clients: (clientRes.data ?? []) as Client[],
          tasks,
          settings: (settingsRes.data as UserSettings) ?? null,
          loading: false,
          isLoading: false,
          lastFetched: Date.now(),
          // Derived values — computed eagerly so screens can read them without calling methods
          nextTask: tasks[0] ?? null,
        };

        set(newState);
        saveCache(newState);
      } catch (err) {
        console.error("fetchAll error:", err);
        set({ loading: false, isLoading: false });
      }
    },

    fetch: async () => get().fetchAll(),

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
        const items = data as OutreachItem[];
        set({
          outreachQueue: items,
          outreachReadyCount: items.filter((i) => i.status === "ready").length,
        });
      }
    },

    fetchReceipts: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("receipt_expenses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        set({ receipts: data as ReceiptExpense[] });
        const current = get();
        saveCache(current);
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

    updateOutreachDraft: async (id, subject, body) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from("outreach_queue")
        .update({
          final_subject: subject,
          final_body: body,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("updateOutreachDraft error:", error);
        return false;
      }

      // Update local state without refetching
      set({
        outreachQueue: get().outreachQueue.map((item) =>
          item.id === id
            ? { ...item, final_subject: subject, final_body: body }
            : item
        ),
      });
      return true;
    },

    skipOutreach: async (id) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from("outreach_queue")
        .update({ status: "skipped" })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("skipOutreach error:", error);
        return false;
      }

      // Remove from local queue
      set({
        outreachQueue: get().outreachQueue.filter((item) => item.id !== id),
      });
      return true;
    },

    ytdGci: () => {
      const txs = get().transactions;
      return txs
        .filter((t) => t.status === "closed")
        .reduce((sum, t) => {
          if (t.gci_override) return sum + t.gci_override;
          return sum + t.sale_price * t.commission_pct;
        }, 0);
    },

    ytdDealCount: () => {
      return get().transactions.filter((t) => t.status === "closed").length;
    },

    pipelineValue: () => {
      return get().pipeline.reduce((sum, d) => sum + d.estimated_price, 0);
    },

    pipelineCount: () => {
      return get().pipeline.length;
    },

    runwayScore: () => {
      const state = get();
      const gci = state.ytdGci();
      const goalGci = state.settings?.goal_gci ?? 0;
      const pipeVal = state.pipelineValue();
      const clients = state.clients;

      // Pace component (40%): how well ytdGci tracks against prorated annual goal
      const dayOfYear = Math.floor(
        (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
      );
      const progress = Math.max(dayOfYear / 365, 0.01);
      const expectedGci = goalGci * progress;
      const paceScore =
        expectedGci > 0
          ? Math.min(gci / expectedGci, 1.5) / 1.5
          : gci > 0
          ? 0.7
          : 0.4;

      // Pipeline coverage component (30%): pipeline vs remaining goal (1.5x buffer)
      const remainingGoal = Math.max((goalGci - gci) * 1.5, 1);
      const pipelineScore =
        goalGci > 0
          ? Math.min(pipeVal / remainingGoal, 2) / 2
          : pipeVal > 0
          ? 0.8
          : 0.4;

      // Client activity component (30%): % of clients contacted in last 30 days
      const recentlyContacted = clients.filter((c) => {
        if (!c.last_contact_at) return false;
        return (Date.now() - new Date(c.last_contact_at).getTime()) / 86400000 <= 30;
      }).length;
      const activityScore =
        clients.length > 0
          ? Math.min(recentlyContacted / Math.max(clients.length * 0.4, 1), 1)
          : 0.4;

      const raw = paceScore * 0.40 + pipelineScore * 0.30 + activityScore * 0.30;
      return Math.round(Math.max(0, Math.min(100, raw * 100)));
    },
  };
});
