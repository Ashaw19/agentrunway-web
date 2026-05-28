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
import { useOfflineQueueStore } from "./offline-queue";
import { safeDateMs } from "../lib/safe-date";
import { isExpectedAuthBootstrapError } from "../lib/auth-context";
// Score is read directly from the web dashboard's snapshot in user_settings.
// No local recomputation needed — guarantees exact parity.

// ── Types (lightweight — matches Supabase row shapes) ────────────────────────

export interface Transaction {
  id: string;
  date: string;
  address: string | null;
  sale_price: number;
  commission_pct: number;
  gci_override: number | null;
  team_split_pct: number | null;
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
  stage: "lead" | "showing" | "offer" | "conditional" | "firm" | "closed";
  probability_override: number | null;
  expected_close_date: string | null;
  client_name: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Mobile client shape — kept in lock-step with the canonical `Client`
 * interface in `packages/core/types/database.ts`. Every nullable field on
 * the canonical Client is mirrored here so mobile's add/edit forms can
 * capture and edit the same data web does (mobile parity audit gap #7,
 * `memory/project_mobile_parity_audit_2026-05-26.md`).
 *
 * Defaults applied at insert (status="boarding", country="Canada",
 * communication_tone="friendly", preferred_contact="phone", phone_type="mobile")
 * match the web `handleAddClient` payload at
 * `apps/web/app/(app)/crm/clients-content.tsx`.
 *
 * fetchClients uses `select("*")` so all columns are already returned —
 * this type just exposes them to mobile callers.
 */
export interface Client {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_type: "mobile" | "home" | "work" | "other";
  secondary_email: string | null;
  secondary_phone: string | null;
  secondary_phone_type: "mobile" | "home" | "work" | "other";
  preferred_contact: "phone" | "email" | "text";
  communication_tone: "casual" | "friendly" | "professional" | "formal";
  status: string;
  tags: string[];
  lead_source: string | null;
  last_contact_at: string | null;
  notes: string | null;
  birthdate: string | null;

  // Full address (matches web `handleAddClient` payload)
  street_address: string | null;
  unit_number: string | null;
  city: string | null;
  province_region: string | null;
  postal_code: string | null;
  country: string;

  // Property interest + timeframe
  property_interest: number | null;
  property_interest_type: "budget" | "listing";
  timeframe: string | null; // ClientTimeframe value

  // Buyer profile (migration 00049)
  buyer_pre_approved: boolean | null;
  buyer_pre_approval_amount: number | null;
  buyer_financing_type: string | null;
  buyer_target_close_date: string | null;
  buyer_target_area: string | null;

  // Archive (migration 00037)
  archived_at: string | null;
  archive_reason: "deceased" | "moved_away" | "do_not_contact" | "other" | null;

  created_at: string;
}

/**
 * The minimum required to insert a client. Everything else is optional
 * (defaults applied by Postgres or by `addClient` itself). Used by
 * `addClient(client)` so callers don't have to provide every nullable
 * column.
 */
export type NewClientInput = Pick<
  Client,
  "name" | "status" | "tags"
> &
  Partial<Omit<Client, "id" | "created_at" | "name" | "status" | "tags">>;

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

/**
 * Mobile UserSettings — superset of what the dashboard needs PLUS the
 * fields the Settings screens edit. Stays narrower than the canonical
 * `UserSettings` interface in `packages/core/types/database.ts` (which
 * carries 50+ web-only columns); when a new mobile-equal field lands,
 * extend this type AND the `select()` in `fetchAll`.
 *
 * Per the parity audit gap #14 close-out (PR closing 2026-05-27), mobile
 * now edits Voice Quiz + Business Identity + Signature Phrases + Hard
 * No-Gos + Province + Split + Cash Reserve + GCI/transaction goals. The
 * JSONB blobs land here as their canonical shapes from
 * `@agent-runway/core/types/database`.
 */
export interface UserSettings {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  goal_gci: number | null;
  goal_transactions: number | null;
  split_preset: string | null;
  province: string | null;
  experience_years: number | null;
  subscription_tier: string;
  cash_reserve: number | null;
  growth_goal_year_pcts: number[] | null;
  monthly_brokerage_fee: number | null;
  /**
   * AI Voice & Identity blobs. Defined in
   * `packages/core/types/database.ts`. Mobile reads them through the
   * canonical types but stores them as nullable on the row.
   */
  communication_profile:
    | import("@agent-runway/core/types/database").CommunicationProfile
    | null;
  business_identity:
    | import("@agent-runway/core/types/database").BusinessIdentity
    | null;
  agent_goals:
    | import("@agent-runway/core/types/database").AgentGoals
    | null;
  /**
   * Plain-text summary the Flight Crew personas inject into their
   * system prompt. Web writes this whenever the Voice Quiz saves
   * (mirror of `communication_profile.ai_voice_summary`); mobile keeps
   * it in lock-step so the prompt assembly works whether the user saved
   * the quiz on web or on mobile.
   */
  ai_voice_guide: string | null;
  runway_score_snapshot: {
    score: number;
    grade?: string;
    /**
     * Optional. Written by the web snapshot writer as of PR #147 (engine
     * canonicalization). Legacy snapshots predating that commit will not have
     * this field — callers must fall back to `stateLabel(score)` from
     * `@agent-runway/core/engines/runway-score-engine`.
     */
    stateLabel?: "Strong" | "On Track" | "Building" | "At Risk";
    month: string;
    components?: { label: string; score: number; weight: number }[];
  } | null;
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

// ── Briefing Types ───────────────────────────────────────────────────────────
//
// All `engine-*` types are emitted by the canonical
// `computeIntelligenceBriefing` engine in
// `packages/core/engines/crm-analytics-engine.ts` and served via
// `/api/mobile/briefing`. Mobile is the consumer — when web adds a new
// `BriefingItemType` to the engine, mobile picks it up automatically
// (unknown types render with a generic icon + the engine-supplied
// title/detail). See audit red flag #3 /
// `memory/project_mobile_parity_audit_2026-05-26.md`.
//
// `hot_pipeline` and `task_due_today` are mobile-only locally-computed
// supplements — neither is in the engine today. They survive here so the
// existing Today's Focus surfaces don't regress; if web ever wants them,
// move the rule to the engine and drop the local computation here.

export type EngineBriefingType =
  | "vip_overdue"
  | "uncontacted_lead"
  | "in_flight_stale"
  | "birthday_today"
  | "birthday_soon"
  | "closing_anniversary"
  | "mortgage_renewal_window"
  | "mortgage_renewal_due"
  | "past_client_check_in"
  | "timeframe_approaching"
  | "property_value_milestone"
  | "no_contact_info"
  | "possible_duplicate"
  | "listing_appointment_overdue"
  | "listing_stale";

export type LocalBriefingType =
  | "hot_pipeline"
  | "task_due_today"
  | "overdue_followup"; // legacy fallback when offline + no cached engine result

export type BriefingType = EngineBriefingType | LocalBriefingType | string;

export interface BriefingItem {
  id: string;
  type: BriefingType;
  severity: "urgent" | "attention" | "upcoming";
  clientId?: string;
  clientName: string;
  title: string;
  detail: string;
  actionLabel: string;
  /** Optional engine-emitted day count (used by the BriefingRow for context). */
  daysValue?: number;
}

export interface SmartListCounts {
  overdueFollowups: number;
  hotPipeline: number;
  uncontactedLeads: number;
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
  clientActivities: Record<string, ContactActivity[]>;
  /** Timestamp of last fetch per client ID — used for 60s cache */
  _clientActivitiesFetchedAt: Record<string, number>;

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
  advancePipelineStage: (dealId: string, newStage: PipelineDeal["stage"]) => Promise<boolean>;
  /**
   * Field-by-field edit for a pipeline deal. Mirrors `updateClient`'s
   * contract — optimistic update, Supabase round-trip, rollback + toast on
   * failure. The web edit form lives at
   * `apps/web/app/(app)/transactions/transactions-pipeline-tab.tsx`
   * (`handleSave` function). Mobile uses the same write contract through
   * Supabase RLS — no new engine, no new edge function.
   */
  updatePipelineDeal: (
    dealId: string,
    updates: Partial<
      Pick<
        PipelineDeal,
        | "address"
        | "client_name"
        | "estimated_price"
        | "estimated_commission_pct"
        | "stage"
        | "expected_close_date"
        | "probability_override"
        | "notes"
      >
    >,
  ) => Promise<boolean>;
  addClient: (client: NewClientInput) => Promise<boolean>;
  addActivity: (activity: Omit<ContactActivity, "id" | "created_at">) => Promise<boolean>;
  /**
   * Updates any subset of the canonical Client fields. Web counterpart:
   * `apps/web/app/(app)/crm/clients-content.tsx` `handleSaveProfileEdit`
   * and inline edit handlers — same Supabase RLS write contract.
   */
  updateClient: (
    clientId: string,
    updates: Partial<Omit<Client, "id" | "created_at" | "last_contact_at">>,
  ) => Promise<boolean>;
  updateOutreachDraft: (id: string, subject: string, body: string) => Promise<boolean>;
  skipOutreach: (id: string) => Promise<boolean>;

  // Client detail methods
  fetchClientActivities: (clientId: string) => Promise<void>;
  getClientDeals: (clientName: string) => { pipeline: PipelineDeal[]; transactions: Transaction[] };

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
   * 0-100 composite Runway Score.
   *
   * Reads the precomputed snapshot from
   * `user_settings.runway_score_snapshot` JSONB (written by the web engine
   * at `apps/web/app/(app)/dashboard/dashboard-content.tsx`). NO local
   * recomputation — parity with the web engine is guaranteed by
   * construction. See `packages/core/engines/runway-score-engine.ts` for the
   * canonical computation (component weights, band thresholds, version).
   *
   * Returns 0 if no snapshot exists yet (user has never opened the web
   * dashboard).
   */
  runwayScore: () => number;

  // Smart Lists & Today's Briefing
  /**
   * Returns the current briefing — engine-emitted items (from
   * `/api/mobile/briefing`, cached in `briefings`) merged with
   * mobile-only `hot_pipeline` + `task_due_today` supplements derived
   * locally. When offline AND no cached engine result exists, falls back
   * to a narrow legacy heuristic so the user still sees something.
   */
  todayBriefing: () => BriefingItem[];
  /**
   * Engine-fetched briefing cache. Populated by `fetchBriefing`; consumed
   * by `todayBriefing`. Persisted with the rest of the store cache so the
   * last-seen briefing is available offline.
   */
  briefings: BriefingItem[];
  /** ms timestamp of last successful briefing fetch (null = never). */
  briefingsFetchedAt: number | null;
  /**
   * Calls `/api/mobile/briefing` with Bearer auth, populates `briefings`,
   * and persists to cache. No-op when offline. 15s timeout via
   * `withTimeout` like other fetches.
   */
  fetchBriefing: () => Promise<void>;
  smartListCounts: () => SmartListCounts;
  overdueFollowupClients: () => Client[];
  uncontactedLeadClients: () => Client[];
  hotPipelineDeals: () => PipelineDeal[];

  // Activity Tracking
  /** Number of activities logged today (across all clients) */
  todayActivityCount: () => number;
  /** Number of consecutive days with at least 1 activity logged */
  contactStreak: () => number;
  /** Get pipeline context for a client (for smart note suggestions) */
  clientPipelineContext: (clientName: string) => string | null;
  /** Quick-log an activity with minimal friction (no notes required) */
  quickLogActivity: (
    clientId: string,
    type: "call" | "text" | "email" | "voicemail"
  ) => Promise<boolean>;
}

// Cache key — bump version when schema changes to avoid stale data crashes
// v3 (2026-05-27): added `briefings` + `briefingsFetchedAt` (audit red flag #3)
// v4 (2026-05-27): added `communication_profile` + `business_identity`
//   + `agent_goals` + `ai_voice_guide` on `settings` (parity gap #14 — mobile
//   Voice Quiz close-out). Bumping forces a one-time cache flush so returning
//   users repopulate `settings` from the broader `select()` in `fetchAll`.
const CACHE_VERSION = 4;
const CACHE_KEY = "data_store_cache";
const CACHE_VERSION_KEY = "data_store_cache_version";

function loadCache(): Partial<DataStore> {
  try {
    const version = storage.getNumber(CACHE_VERSION_KEY);
    if (version !== CACHE_VERSION) {
      // Schema changed — clear stale cache to avoid runtime crashes
      storage.delete(CACHE_KEY);
      storage.set(CACHE_VERSION_KEY, CACHE_VERSION);
      return {};
    }
    const raw = storage.getString(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted cache — wipe it
    try { storage.delete(CACHE_KEY); } catch { /* noop */ }
  }
  return {};
}

/** Timeout wrapper for network requests */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout")), ms)
    ),
  ]);
}

const FETCH_TIMEOUT_MS = 15_000; // 15-second network timeout

/**
 * Maps a briefing item type → the action-button CTA. Engine items don't
 * carry `actionLabel` (it's a presentation concern), so mobile derives
 * one per type. Unknown types fall back to a neutral "Review" label so
 * future engine additions don't crash the UI.
 */
function actionLabelForType(type: string): string {
  switch (type) {
    case "vip_overdue":
    case "overdue_followup":
      return "Follow Up";
    case "uncontacted_lead":
      return "Reach Out";
    case "in_flight_stale":
      return "Check In";
    case "birthday_today":
      return "Wish";
    case "birthday_soon":
      return "Plan";
    case "closing_anniversary":
      return "Acknowledge";
    case "mortgage_renewal_window":
    case "mortgage_renewal_due":
      return "Reach Out";
    case "past_client_check_in":
      return "Check In";
    case "timeframe_approaching":
      return "Follow Up";
    case "property_value_milestone":
      return "Share";
    case "no_contact_info":
      return "Complete";
    case "possible_duplicate":
      return "Review";
    case "listing_appointment_overdue":
      return "Follow Up";
    case "listing_stale":
      return "Review";
    case "task_due_today":
      return "Do It";
    case "hot_pipeline":
      return "View";
    default:
      return "Review";
  }
}

/** Simple mutex to prevent duplicate concurrent mutations (e.g. double-tap). */
const _mutationLocks = new Set<string>();
function withMutationGuard<T>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  if (_mutationLocks.has(key)) return Promise.resolve(fallback);
  _mutationLocks.add(key);
  return fn().finally(() => _mutationLocks.delete(key));
}

function saveCache(state: Partial<DataStore>) {
  try {
    storage.set(CACHE_VERSION_KEY, CACHE_VERSION);
    storage.set(
      CACHE_KEY,
      JSON.stringify({
        transactions: state.transactions,
        pipeline: state.pipeline,
        clients: state.clients,
        tasks: state.tasks,
        settings: state.settings,
        receipts: state.receipts,
        briefings: state.briefings,
        briefingsFetchedAt: state.briefingsFetchedAt,
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
    briefings: (cached.briefings as BriefingItem[]) ?? [],
    briefingsFetchedAt: (cached.briefingsFetchedAt as number | null) ?? null,
    clientActivities: {},
    _clientActivitiesFetchedAt: {},
    loading: false,
    isLoading: false,
    lastFetched: null,
    nextTask: (cached.tasks as ContactTask[] | undefined)?.[0] ?? null,
    outreachReadyCount: 0,

    fetchAll: async () => {
      set({ loading: true, isLoading: true });
      try {
        // Guard against running pre-login: getSession() never throws on
        // missing session, but getUser() can throw AuthApiError on stale
        // tokens. Bail early when there's no session at all.
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          set({ loading: false, isLoading: false });
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          set({ loading: false, isLoading: false });
          return;
        }

        const currentYear = new Date().getFullYear();

        const [txRes, pipeRes, clientRes, taskRes, settingsRes] =
          await withTimeout(
            Promise.all([
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
                  // Columns added 2026-05-27 for Settings parity (gap #14):
                  // communication_profile, business_identity, agent_goals,
                  // ai_voice_guide. CACHE_VERSION bumped to 4 in tandem so
                  // returning users repopulate from the wider select.
                  "user_id, display_name, avatar_url, goal_gci, goal_transactions, split_preset, province, experience_years, subscription_tier, cash_reserve, growth_goal_year_pcts, monthly_brokerage_fee, runway_score_snapshot, communication_profile, business_identity, agent_goals, ai_voice_guide"
                )
                .eq("user_id", user.id)
                .single(),
            ]),
            FETCH_TIMEOUT_MS,
          );

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

        // Kick off the engine briefing fetch in the background — don't
        // await it, the main UI doesn't block on Today's Focus.
        // (audit red flag #3)
        void get().fetchBriefing();
      } catch (err) {
        // Stale-refresh-token / no-session bootstrap errors are expected
        // on first launch (and after a server-side rotation). Don't show
        // a scary toast — auth-context will silently sign-out + redirect
        // to /login. Just bail out of the fetch.
        if (isExpectedAuthBootstrapError(err)) {
          set({ loading: false, isLoading: false });
          return;
        }
        console.error("fetchAll error:", err);
        const toast = useToastStore.getState();
        const msg = err instanceof Error && err.message === "Network timeout"
          ? "Connection timed out — showing cached data"
          : "Couldn't reach server — showing cached data";
        toast.show(msg, "error");
        set({ loading: false, isLoading: false });
      }
    },

    fetch: async () => get().fetchAll(),

    fetchBriefing: async () => {
      // Engine-fetched briefing — see audit red flag #3. Calls
      // /api/mobile/briefing which runs the canonical
      // `computeIntelligenceBriefing` engine server-side and returns
      // engine-shaped items. Offline → no-op (cached briefings stay
      // visible; the local-heuristic fallback in `todayBriefing` covers
      // the cold-start offline case).
      try {
        if (!useOfflineQueueStore.getState().isOnline) return;
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session?.access_token) return;

        const API_URL =
          process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

        const res = await withTimeout(
          fetch(`${API_URL}/api/mobile/briefing`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${sess.session.access_token}`,
            },
          }),
          FETCH_TIMEOUT_MS,
        );

        if (!res.ok) {
          // Silent failure — the UI keeps showing the last cached
          // briefing. Don't toast: this is a background fetch.
          return;
        }
        const json = await res.json();
        const items = Array.isArray(json.items)
          ? (json.items as BriefingItem[])
          : [];

        // Engine items don't carry `actionLabel` — derive it client-side
        // from the type so each row gets a sensible CTA.
        const decorated: BriefingItem[] = items.map((it) => ({
          ...it,
          actionLabel: actionLabelForType(it.type),
        }));

        const newState = {
          briefings: decorated,
          briefingsFetchedAt: Date.now(),
        };
        set(newState);
        saveCache(get());
      } catch (err) {
        if (isExpectedAuthBootstrapError(err)) return;
        // Background fetch — log but don't surface to the user. The
        // cached briefing (or local fallback) keeps the UI useful.
        console.warn("fetchBriefing error:", err);
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

    addTransaction: (tx) => withMutationGuard("addTransaction", async () => {
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
        // Keep optimistic data — enqueue for retry when online
        useOfflineQueueStore.getState().enqueue("addTransaction", tx);
        toast.show("Saved locally \u2014 will sync when online", "info");
        return false; // Signal failure so caller knows sync is pending
      }

      // Refresh with real server data
      await get().fetchAll();
      toast.show("Transaction logged \u2713", "success");
      return true;
    }, false),

    advancePipelineStage: (dealId, newStage) => withMutationGuard(`advanceStage_${dealId}`, async () => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Optimistic update
      const prevPipeline = get().pipeline;
      set({
        pipeline: prevPipeline.map((d) =>
          d.id === dealId ? { ...d, stage: newStage } : d
        ),
      });
      saveCache(get());

      // Fire Supabase update in background
      const { error } = await supabase
        .from("pipeline_deals")
        .update({ stage: newStage })
        .eq("id", dealId)
        .eq("user_id", user.id);

      if (error) {
        console.error("advancePipelineStage error:", error);
        // Keep optimistic data — enqueue for retry when online
        useOfflineQueueStore.getState().enqueue("advanceStage", { dealId, newStage });
        toast.show("Saved locally \u2014 will sync when online", "info");
        return false; // Signal failure so caller knows sync is pending
      }

      toast.show("Stage updated \u2713", "success");
      return true;
    }, false),

    updatePipelineDeal: async (dealId, updates) => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Optimistic update \u2014 mirrors `updateClient` shape exactly.
      const prevPipeline = get().pipeline;
      set({
        pipeline: prevPipeline.map((d) =>
          d.id === dealId ? { ...d, ...updates } : d
        ),
      });
      saveCache(get());

      const { error } = await supabase
        .from("pipeline_deals")
        .update(updates)
        .eq("id", dealId)
        .eq("user_id", user.id);

      if (error) {
        console.error("updatePipelineDeal error:", error);
        // Rollback \u2014 same pattern as updateClient (clear toast lets the user retry)
        set({ pipeline: prevPipeline });
        saveCache(get());
        toast.show("Failed to update deal \u2014 tap to retry", "error", () =>
          get().updatePipelineDeal(dealId, updates),
        );
        return false;
      }

      toast.show("Deal updated \u2713", "success");
      return true;
    },

    addClient: (client) => withMutationGuard("addClient", async () => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Apply the same defaults the web `handleAddClient` uses, so the
      // optimistic row matches what the DB will write. Anything the caller
      // passed in overrides these.
      const defaults = {
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        phone_type: "mobile" as const,
        secondary_email: null,
        secondary_phone: null,
        secondary_phone_type: "mobile" as const,
        preferred_contact: "phone" as const,
        communication_tone: "friendly" as const,
        lead_source: null,
        last_contact_at: null,
        notes: null,
        birthdate: null,
        street_address: null,
        unit_number: null,
        city: null,
        province_region: null,
        postal_code: null,
        country: "Canada",
        property_interest: null,
        property_interest_type: "budget" as const,
        timeframe: null,
        buyer_pre_approved: null,
        buyer_pre_approval_amount: null,
        buyer_financing_type: null,
        buyer_target_close_date: null,
        buyer_target_area: null,
        archived_at: null,
        archive_reason: null,
      };
      const merged: Omit<Client, "id" | "created_at"> = {
        ...defaults,
        ...client,
      };

      // Optimistic insert
      const tempId = `temp_${Date.now()}`;
      const tempClient: Client = {
        ...merged,
        id: tempId,
        created_at: new Date().toISOString(),
      };
      const prevClients = get().clients;
      set({ clients: [tempClient, ...prevClients] });
      saveCache(get());

      // Fire Supabase insert in background
      const { error } = await supabase
        .from("clients")
        .insert({ ...merged, user_id: user.id });

      if (error) {
        console.error("addClient error:", error);
        // Keep optimistic data — enqueue for retry when online
        useOfflineQueueStore.getState().enqueue("addClient", client);
        toast.show("Saved locally \u2014 will sync when online", "info");
        return false; // Signal failure so caller knows sync is pending
      }

      // Refresh with real server data
      await get().fetchClients();
      toast.show("Client added", "success");
      return true;
    }, false),

    addActivity: (activity) => withMutationGuard("addActivity", async () => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Capture prior status so we can detect Phase 3 auto-promotion (the
      // DB trigger from migration 00105 may flip cruising/scheduled → boarding
      // when a real, recent, non-note touchpoint is logged).
      const priorClient = get().clients.find((c) => c.id === activity.client_id);
      const priorStatus = priorClient?.status;

      // Fire Supabase insert
      const { error } = await supabase
        .from("contact_activities")
        .insert({ ...activity, user_id: user.id });

      if (error) {
        console.error("addActivity error:", error);
        // Enqueue for retry when online
        useOfflineQueueStore.getState().enqueue("addActivity", activity);
        toast.show("Saved locally \u2014 will sync when online", "info");
        return false; // Signal failure so caller knows sync is pending
      }

      // Invalidate activity cache for this client
      const prev = get()._clientActivitiesFetchedAt;
      set({ _clientActivitiesFetchedAt: { ...prev, [activity.client_id]: 0 } });

      // Detect auto-promotion. We only re-fetch the row when the prior status
      // is one the trigger could have promoted, to avoid an extra query in
      // the common case where the client was already boarding/in_flight.
      let promoted = false;
      if (priorStatus === "cruising" || priorStatus === "scheduled") {
        const { data: updated } = await supabase
          .from("clients")
          .select("status")
          .eq("id", activity.client_id)
          .single();
        const newStatus = updated?.status as string | undefined;
        if (newStatus && newStatus !== priorStatus) {
          set({
            clients: get().clients.map((c) =>
              c.id === activity.client_id
                ? { ...c, status: newStatus as typeof c.status }
                : c
            ),
          });
          saveCache(get());
          promoted = true;
        }
      }

      toast.show(
        promoted
          ? `${priorClient?.name ?? "Client"} auto-promoted to Boarding \u2713`
          : "Activity logged \u2713",
        "success",
      );
      return true;
    }, false),

    updateClient: async (clientId, updates) => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Optimistic update
      const prevClients = get().clients;
      set({
        clients: prevClients.map((c) =>
          c.id === clientId ? { ...c, ...updates } : c
        ),
      });
      saveCache(get());

      // Fire Supabase update
      const { error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", clientId)
        .eq("user_id", user.id);

      if (error) {
        console.error("updateClient error:", error);
        // Rollback
        set({ clients: prevClients });
        saveCache(get());
        toast.show("Failed to update client \u2014 tap to retry", "error", () =>
          get().updateClient(clientId, updates)
        );
        return false;
      }

      toast.show("Client updated \u2713", "success");
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

    fetchClientActivities: async (clientId: string) => {
      // Simple 60-second cache — skip if fetched recently
      const lastFetchedAt = get()._clientActivitiesFetchedAt[clientId];
      if (lastFetchedAt && Date.now() - lastFetchedAt < 60_000) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("contact_activities")
        .select("*")
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("activity_date", { ascending: false })
        .limit(20);

      if (data) {
        set({
          clientActivities: {
            ...get().clientActivities,
            [clientId]: data as ContactActivity[],
          },
          _clientActivitiesFetchedAt: {
            ...get()._clientActivitiesFetchedAt,
            [clientId]: Date.now(),
          },
        });
      }
    },

    getClientDeals: (clientName: string) => {
      const state = get();
      const q = clientName.toLowerCase();
      return {
        pipeline: state.pipeline.filter(
          (d) => d.client_name && d.client_name.toLowerCase() === q
        ),
        transactions: state.transactions.filter(
          (t) => t.client_name && t.client_name.toLowerCase() === q
        ),
      };
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
          return sum + t.sale_price * t.commission_pct * (t.team_split_pct ?? 1);
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
     * Runway Score — reads the snapshot saved by the web dashboard to Supabase.
     * The web computes the score using seasonal weights, structured expense
     * categories, benchmark engine, and survival engine. Mobile simply displays
     * the web's computed result for guaranteed parity.
     *
     * Returns 0 if no snapshot exists yet (user hasn't loaded web dashboard).
     */
    runwayScore: (): number => {
      const snapshot = get().settings?.runway_score_snapshot;
      return snapshot?.score ?? 0;
    },

    // ── Smart Lists & Today's Briefing ──────────────────────────────────────

    todayBriefing: () => {
      const state = get();

      // Preferred path: engine-emitted briefings from /api/mobile/briefing
      // (see audit red flag #3). When we have them, supplement with the
      // mobile-only `task_due_today` + `hot_pipeline` rules that aren't
      // in the engine yet.
      if (state.briefings.length > 0) {
        const items: BriefingItem[] = [...state.briefings];
        const DAY = 86400000;

        // Mobile-only: tasks due today (engine doesn't surface tasks)
        const todayStr = new Date().toISOString().split("T")[0];
        const dueTasks = state.tasks.filter(
          (t) => t.due_date && t.due_date.startsWith(todayStr),
        );
        for (const task of dueTasks.slice(0, 2)) {
          items.push({
            id: `task_${task.id}`,
            type: "task_due_today",
            severity: task.priority === "high" ? "urgent" : "attention",
            clientName: task.title,
            title: task.title,
            detail:
              task.priority === "high"
                ? "High priority · Due today"
                : "Due today",
            actionLabel: "Do It",
          });
        }

        // Mobile-only: hot pipeline (offer / conditional / firm)
        const hot = state.pipeline.filter(
          (d) =>
            d.stage === "offer" ||
            d.stage === "conditional" ||
            d.stage === "firm",
        );
        for (const deal of hot.slice(0, 2)) {
          const p = deal.estimated_price;
          const priceStr =
            p >= 1_000_000
              ? `$${(p / 1_000_000).toFixed(1)}M`
              : p >= 1_000
                ? `$${(p / 1_000).toFixed(0)}K`
                : `$${Math.round(p)}`;
          items.push({
            id: `hot_${deal.id}`,
            type: "hot_pipeline",
            severity: "attention",
            clientName: deal.client_name ?? "Pipeline Deal",
            title: deal.address ?? deal.client_name ?? "Pipeline Deal",
            detail: `${deal.stage.charAt(0).toUpperCase() + deal.stage.slice(1)} · ${priceStr}`,
            actionLabel: "View",
          });
        }

        const order: Record<string, number> = {
          urgent: 0,
          attention: 1,
          upcoming: 2,
        };
        items.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
        // Silence unused-var warning from the `now`/`DAY` reservations in
        // the legacy fallback below — keep them scoped down there only.
        void DAY;
        return items.slice(0, 9);
      }

      // Fallback: legacy local heuristic. Only triggers when the engine
      // briefing hasn't loaded yet (cold start / offline first-launch).
      // Mirrors the pre-2026-05-27 behavior. See audit red flag #3.
      const items: BriefingItem[] = [];
      const now = Date.now();
      const DAY = 86400000;
      const activeStatuses = new Set(["boarding", "scheduled", "in_flight"]);

      // 1. Uncontacted leads — never contacted (urgent)
      const uncontacted = state.clients.filter(
        (cl) => cl.status === "boarding" && !cl.last_contact_at
      );
      for (const cl of uncontacted.slice(0, 3)) {
        const createdMs = safeDateMs(cl.created_at);
        const daysOld = createdMs ? Math.floor((now - createdMs) / DAY) : 0;
        items.push({
          id: `uncontacted_${cl.id}`,
          type: "uncontacted_lead",
          severity: daysOld > 2 ? "urgent" : "attention",
          clientId: cl.id,
          clientName: cl.name,
          title: cl.name,
          detail:
            daysOld === 0
              ? "New lead — never contacted"
              : `New lead — ${daysOld}d without contact`,
          actionLabel: "Reach Out",
        });
      }

      // 2. Overdue follow-ups — active clients, 14+ days since contact
      const overdue = state.clients
        .filter((cl) => {
          if (!activeStatuses.has(cl.status)) return false;
          if (!cl.last_contact_at) return false;
          return now - new Date(cl.last_contact_at).getTime() > 14 * DAY;
        })
        .sort((a, b) => {
          const aT = new Date(a.last_contact_at!).getTime();
          const bT = new Date(b.last_contact_at!).getTime();
          return aT - bT;
        });

      for (const cl of overdue.slice(0, 3)) {
        const days = Math.floor(
          (now - new Date(cl.last_contact_at!).getTime()) / DAY
        );
        const isVip = cl.tags?.some(
          (t) => t.toLowerCase() === "vip" || t.toLowerCase() === "high value"
        );
        items.push({
          id: `overdue_${cl.id}`,
          type: "overdue_followup",
          severity: days > 30 || isVip ? "urgent" : "attention",
          clientId: cl.id,
          clientName: cl.name,
          title: cl.name,
          detail: `${days}d without contact${isVip ? " · VIP" : ""}`,
          actionLabel: "Follow Up",
        });
      }

      // 3. Tasks due today
      const todayStr = new Date().toISOString().split("T")[0];
      const dueTasks = state.tasks.filter(
        (t) => t.due_date && t.due_date.startsWith(todayStr)
      );
      for (const task of dueTasks.slice(0, 2)) {
        items.push({
          id: `task_${task.id}`,
          type: "task_due_today",
          severity: task.priority === "high" ? "urgent" : "attention",
          clientName: task.title,
          title: task.title,
          detail:
            task.priority === "high"
              ? "High priority · Due today"
              : "Due today",
          actionLabel: "Do It",
        });
      }

      // 4. Hot pipeline — offer / conditional / firm
      const hot = state.pipeline.filter(
        (d) =>
          d.stage === "offer" ||
          d.stage === "conditional" ||
          d.stage === "firm"
      );
      for (const deal of hot.slice(0, 2)) {
        const p = deal.estimated_price;
        const priceStr =
          p >= 1_000_000
            ? `$${(p / 1_000_000).toFixed(1)}M`
            : p >= 1_000
              ? `$${(p / 1_000).toFixed(0)}K`
              : `$${Math.round(p)}`;
        items.push({
          id: `hot_${deal.id}`,
          type: "hot_pipeline",
          severity: "attention",
          clientName: deal.client_name ?? "Pipeline Deal",
          title: deal.address ?? deal.client_name ?? "Pipeline Deal",
          detail: `${deal.stage.charAt(0).toUpperCase() + deal.stage.slice(1)} · ${priceStr}`,
          actionLabel: "View",
        });
      }

      // 5. Birthdays this week
      const nowDate = new Date();
      const thisYear = nowDate.getFullYear();
      let bdayCount = 0;
      for (const cl of state.clients) {
        if (bdayCount >= 2) break;
        if (!cl.birthdate) continue;
        const bday = new Date(cl.birthdate);
        const bdayThisYear = new Date(
          thisYear,
          bday.getMonth(),
          bday.getDate()
        );
        const daysUntil = Math.floor(
          (bdayThisYear.getTime() - nowDate.getTime()) / DAY
        );
        if (daysUntil >= 0 && daysUntil <= 7) {
          items.push({
            id: `bday_${cl.id}`,
            type: "birthday_soon",
            severity: daysUntil === 0 ? "attention" : "upcoming",
            clientId: cl.id,
            clientName: cl.name,
            title: cl.name,
            detail:
              daysUntil === 0
                ? "Birthday today!"
                : daysUntil === 1
                  ? "Birthday tomorrow"
                  : `Birthday in ${daysUntil} days`,
            actionLabel: daysUntil === 0 ? "Wish" : "Plan",
          });
          bdayCount++;
        }
      }

      // Sort: urgent → attention → upcoming
      const order: Record<string, number> = {
        urgent: 0,
        attention: 1,
        upcoming: 2,
      };
      items.sort((a, b) => order[a.severity] - order[b.severity]);

      return items.slice(0, 7);
    },

    smartListCounts: () => {
      const state = get();
      const now = Date.now();
      const DAY = 86400000;
      const activeStatuses = new Set([
        "boarding",
        "scheduled",
        "in_flight",
      ]);

      return {
        overdueFollowups: state.clients.filter((cl) => {
          if (!activeStatuses.has(cl.status)) return false;
          if (!cl.last_contact_at) return cl.status === "boarding";
          const ms = safeDateMs(cl.last_contact_at);
          return ms ? now - ms > 14 * DAY : false;
        }).length,
        hotPipeline: state.pipeline.filter(
          (d) =>
            d.stage === "offer" ||
            d.stage === "conditional" ||
            d.stage === "firm"
        ).length,
        uncontactedLeads: state.clients.filter(
          (cl) => cl.status === "boarding" && !cl.last_contact_at
        ).length,
      };
    },

    overdueFollowupClients: () => {
      const state = get();
      const now = Date.now();
      const DAY = 86400000;
      const activeStatuses = new Set([
        "boarding",
        "scheduled",
        "in_flight",
      ]);
      return state.clients
        .filter((cl) => {
          if (!activeStatuses.has(cl.status)) return false;
          if (!cl.last_contact_at) return cl.status === "boarding";
          const ms = safeDateMs(cl.last_contact_at);
          return ms ? now - ms > 14 * DAY : false;
        })
        .sort((a, b) => {
          const aT = safeDateMs(a.last_contact_at) ?? 0;
          const bT = safeDateMs(b.last_contact_at) ?? 0;
          return aT - bT;
        });
    },

    uncontactedLeadClients: () => {
      return get().clients.filter(
        (cl) => cl.status === "boarding" && !cl.last_contact_at
      );
    },

    hotPipelineDeals: () => {
      return get().pipeline.filter(
        (d) =>
          d.stage === "offer" ||
          d.stage === "conditional" ||
          d.stage === "firm"
      );
    },

    // ── Activity Tracking ───────────────────────────────────────────────────

    todayActivityCount: () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const allActivities = Object.values(get().clientActivities).flat();
      return allActivities.filter((a) =>
        a.activity_date.startsWith(todayStr)
      ).length;
    },

    contactStreak: () => {
      const allActivities = Object.values(get().clientActivities).flat();
      if (allActivities.length === 0) return 0;

      // Get unique dates with activity (sorted newest first)
      const dates = [
        ...new Set(
          allActivities.map((a) => a.activity_date.split("T")[0])
        ),
      ].sort((a, b) => b.localeCompare(a));

      if (dates.length === 0) return 0;

      // Check if today or yesterday has activity (streak must be current)
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      if (dates[0] !== today && dates[0] !== yesterday) return 0;

      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]).getTime();
        const curr = new Date(dates[i]).getTime();
        if (prev - curr <= 86400000 * 1.5) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    },

    clientPipelineContext: (clientName: string) => {
      const state = get();
      const q = clientName.toLowerCase();
      const deals = state.pipeline.filter(
        (d) => d.client_name && d.client_name.toLowerCase() === q
      );
      if (deals.length === 0) return null;

      const deal = deals[0];
      const stage =
        deal.stage.charAt(0).toUpperCase() + deal.stage.slice(1);
      const price =
        deal.estimated_price >= 1_000_000
          ? `$${(deal.estimated_price / 1_000_000).toFixed(1)}M`
          : deal.estimated_price >= 1_000
            ? `$${(deal.estimated_price / 1_000).toFixed(0)}K`
            : `$${Math.round(deal.estimated_price)}`;
      const addr = deal.address ? ` at ${deal.address}` : "";
      return `${stage} deal${addr} · ${price}`;
    },

    quickLogActivity: async (clientId, type) => {
      const toast = useToastStore.getState();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const description =
        type === "voicemail"
          ? "Left voicemail"
          : type === "email"
            ? "Sent email"
            : null;
      const actType = type === "voicemail" ? "call" : type;

      // Capture prior status for Phase 3 promotion detection.
      const priorClient = get().clients.find((c) => c.id === clientId);
      const priorStatus = priorClient?.status;

      const { error } = await supabase
        .from("contact_activities")
        .insert({
          client_id: clientId,
          user_id: user.id,
          type: actType,
          description,
          activity_date: new Date().toISOString(),
        });

      if (error) {
        console.error("quickLogActivity error:", error);
        useOfflineQueueStore.getState().enqueue("addActivity", {
          client_id: clientId,
          type: actType,
          description,
          activity_date: new Date().toISOString(),
        });
        toast.show("Saved locally — will sync when online", "info");
        return false;
      }

      // Invalidate activity cache for this client
      const prev = get()._clientActivitiesFetchedAt;
      set({
        _clientActivitiesFetchedAt: { ...prev, [clientId]: 0 },
      });

      // Detect auto-promotion (migration 00105 trigger).
      let promoted = false;
      if (priorStatus === "cruising" || priorStatus === "scheduled") {
        const { data: updated } = await supabase
          .from("clients")
          .select("status")
          .eq("id", clientId)
          .single();
        const newStatus = updated?.status as string | undefined;
        if (newStatus && newStatus !== priorStatus) {
          set({
            clients: get().clients.map((c) =>
              c.id === clientId
                ? { ...c, status: newStatus as typeof c.status }
                : c
            ),
          });
          saveCache(get());
          promoted = true;
        }
      }

      toast.show(
        promoted
          ? `${priorClient?.name ?? "Client"} auto-promoted to Boarding \u2713`
          : "Activity logged \u2713",
        "success",
      );
      return true;
    },
  };
});
