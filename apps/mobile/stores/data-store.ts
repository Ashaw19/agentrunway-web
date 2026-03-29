/**
 * Central data store for the mobile app.
 *
 * Uses Zustand + MMKV for state management with offline caching.
 * Fetches from Supabase and caches results in MMKV storage.
 */

import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { storage } from "../lib/mmkv";
import { useToastStore } from "./toast-store";

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
  cash_reserve: number | null;
  growth_goal_year_pcts: number[] | null;
  monthly_brokerage_fee: number | null;
  runway_score_snapshot: { score: number; month: string } | null;
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

  // Search
  search: (query: string) => { clients: Client[]; pipeline: PipelineDeal[]; transactions: Transaction[] };

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
                "user_id, display_name, goal_gci, goal_transactions, split_preset, province, experience_years, subscription_tier, cash_reserve, growth_goal_year_pcts, monthly_brokerage_fee, runway_score_snapshot"
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
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Optimistic insert
      const tempId = `temp_${Date.now()}`;
      const tempTx: Transaction = {
        ...tx,
        id: tempId,
        created_at: new Date().toISOString(),
      };
      const prevTransactions = get().transactions;
      set({ transactions: [tempTx, ...prevTransactions] });
      saveCache(get());

      // Fire Supabase insert in background
      const { error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user.id });

      if (error) {
        console.error("addTransaction error:", error);
        // Rollback
        set({ transactions: prevTransactions });
        saveCache(get());
        const retryFn = () => get().addTransaction(tx);
        toast.show("Failed to save transaction \u2014 tap to retry", "error", retryFn);
        return false;
      }

      // Refresh with real server data
      await get().fetchAll();
      toast.show("Transaction logged \u2713", "success");
      return true;
    },

    addClient: async (client) => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Optimistic insert
      const tempId = `temp_${Date.now()}`;
      const tempClient: Client = {
        ...client,
        id: tempId,
        created_at: new Date().toISOString(),
      };
      const prevClients = get().clients;
      set({ clients: [tempClient, ...prevClients] });
      saveCache(get());

      // Fire Supabase insert in background
      const { error } = await supabase
        .from("clients")
        .insert({ ...client, user_id: user.id });

      if (error) {
        console.error("addClient error:", error);
        // Rollback
        set({ clients: prevClients });
        saveCache(get());
        const retryFn = () => get().addClient(client);
        toast.show("Failed to add client \u2014 tap to retry", "error", retryFn);
        return false;
      }

      // Refresh with real server data
      await get().fetchClients();
      toast.show("Client added", "success");
      return true;
    },

    addActivity: async (activity) => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Fire Supabase insert
      const { error } = await supabase
        .from("contact_activities")
        .insert({ ...activity, user_id: user.id });

      if (error) {
        console.error("addActivity error:", error);
        const retryFn = () => get().addActivity(activity);
        toast.show("Failed to log activity \u2014 tap to retry", "error", retryFn);
        return false;
      }

      toast.show("Activity logged \u2713", "success");
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

    search: (query: string) => {
      const q = query.toLowerCase().trim();
      if (!q) return { clients: [], pipeline: [], transactions: [] };

      const state = get();

      const clients = state.clients
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q))
        )
        .slice(0, 10);

      const pipeline = state.pipeline
        .filter(
          (d) =>
            (d.address && d.address.toLowerCase().includes(q)) ||
            (d.client_name && d.client_name.toLowerCase().includes(q))
        )
        .slice(0, 10);

      const transactions = state.transactions
        .filter(
          (t) =>
            (t.address && t.address.toLowerCase().includes(q)) ||
            (t.client_name && t.client_name.toLowerCase().includes(q))
        )
        .slice(0, 10);

      return { clients, pipeline, transactions };
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

    /**
     * Real Runway Score — matches the web app's 6-component scoring engine.
     * Uses the monthly snapshot saved by the web dashboard when available,
     * otherwise computes locally using the same algorithm.
     *
     * Components (weights):
     *   Goal Pace 30% | Pipeline 20% | Expenses 15% | Setup 10% | Benchmark 10% | Survival 15%
     */
    runwayScore: () => {
      const state = get();
      const settings = state.settings;

      // If the web app saved a snapshot this month, use it directly for exact parity
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const snapshot = settings?.runway_score_snapshot;
      if (snapshot && snapshot.month === currentMonthKey) {
        return snapshot.score;
      }

      // Otherwise compute using the same algorithm as the web dashboard
      const ytdGCI = state.ytdGci();
      const goalGCI = settings?.goal_gci ?? 0;
      const dayOfYear = Math.floor(
        (Date.now() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
      );
      const fraction = Math.max(dayOfYear / 365, 0.01);

      // 1. Pace score (0–100): maps [-50%, +50%] vs goal → [0, 100]
      let paceScore = 50;
      if (goalGCI > 0 && fraction > 0) {
        const expectedAtThisPoint = goalGCI * fraction;
        const paceVsGoal = expectedAtThisPoint > 0
          ? ((ytdGCI - expectedAtThisPoint) / expectedAtThisPoint) * 100
          : 0;
        const raw = (paceVsGoal + 50) / 100;
        paceScore = Math.round(Math.min(1, Math.max(0, raw)) * 100);
      }

      // 2. Pipeline score (0–100, default 65)
      let pipelineScore = 65;
      const remaining = Math.max(0, goalGCI - ytdGCI);
      // Weighted pipeline GCI = sum(price * commission * probability)
      const pipelineWeightedGCI = state.pipeline.reduce((sum, d) => {
        const prob = d.probability_override ??
          ({ lead: 0.1, showing: 0.25, offer: 0.5, conditional: 0.75, firm: 0.9 }[d.stage] ?? 0.5);
        return sum + d.estimated_price * d.estimated_commission_pct * prob;
      }, 0);
      if (remaining > 0 && pipelineWeightedGCI > 0) {
        pipelineScore = Math.min(100, Math.round((pipelineWeightedGCI / remaining) * 100));
      } else if (goalGCI > 0 && ytdGCI >= goalGCI) {
        pipelineScore = 90;
      }

      // 3. Expense score (0–100, default 80)
      let expenseScore = 80;
      if (ytdGCI > 0) {
        const expensesYTD = state.receipts.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);
        const ratio = expensesYTD / ytdGCI;
        if (ratio > 0.5) expenseScore = 30;
        else if (ratio > 0.35) expenseScore = 55;
        else if (ratio > 0.25) expenseScore = 75;
        else expenseScore = 90;
      }

      // 4. Readiness / Setup score (0–100, default 25)
      let readinessScore = 25;
      if (settings) {
        let points = 0;
        if ((settings.goal_gci ?? 0) > 0) points += 30;
        if ((settings.goal_transactions ?? 0) > 0) points += 20;
        const growthRates = settings.growth_goal_year_pcts;
        if (growthRates && growthRates.some((r: number) => r > 0)) points += 25;
        if ((settings.cash_reserve ?? 0) > 0) points += 15;
        if (settings.experience_years != null) points += 10;
        readinessScore = points;
      }

      // 5. Benchmark percentile — requires CREA stats comparison, use snapshot or neutral 50
      const benchmarkPercentile = 50;

      // 6. Survival score — based on cash_reserve / monthly expenses
      let survivalScore = 50; // neutral default
      const cashReserve = settings?.cash_reserve ?? 0;
      const monthlyFee = settings?.monthly_brokerage_fee ?? 0;
      const monthlyExpenses = state.receipts.length > 0
        ? state.receipts.reduce((sum, r) => sum + (r.total_amount ?? 0), 0) / Math.max(fraction * 12, 1)
        : monthlyFee;
      if (cashReserve > 0 && monthlyExpenses > 0) {
        const survivalMonths = cashReserve / monthlyExpenses;
        if (survivalMonths >= 6) survivalScore = 95;
        else if (survivalMonths >= 4) survivalScore = 75;
        else if (survivalMonths >= 2) survivalScore = 50;
        else if (survivalMonths >= 1) survivalScore = 25;
        else survivalScore = 10;
      }

      // Composite: Goal Pace 30% + Pipeline 20% + Expenses 15% + Setup 10% + Benchmark 10% + Survival 15%
      const composite =
        paceScore * 0.30 +
        pipelineScore * 0.20 +
        expenseScore * 0.15 +
        readinessScore * 0.10 +
        benchmarkPercentile * 0.10 +
        survivalScore * 0.15;

      return Math.round(composite);
    },
  };
});
