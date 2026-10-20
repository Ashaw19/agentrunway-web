import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import type { Client, ContactTask } from "@/stores/data-store";
import { useNextUpStore, type PendingCall } from "@/stores/next-up-store";
import { useToastStore } from "@/stores/toast-store";
import { useOfflineQueueStore } from "@/stores/offline-queue";
import { Plus } from "lucide-react-native";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
} from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { FadeIn } from "@/components/ui/FadeIn";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  buildNextUp,
  type NextUpAction,
  type NextUpCard as NextUpCardData,
  type SectionKey,
} from "@agent-runway/core/lib/next-up/build";
import type { HandfulItem } from "@agent-runway/core/lib/next-up/types";
import {
  dismissChoicesFor,
  type DismissChoice,
  type LaterChoice,
} from "@agent-runway/core/lib/suggestion-dismissals";
import { laterChoicesAt, laterUntilAt, nextUpClock, stopUntilAt } from "@/lib/next-up-clock";
import {
  ACTION_ROUTES,
  SECTION_ROUTES,
  checklistRowHasOverdue,
  nextUpInput,
  snoozeEndedBetween,
  textPlan,
} from "@/lib/next-up-view";
import { handledToast } from "@/lib/next-up-copy";
import { shouldAskAfterCall, telUrl } from "@/lib/post-call";
import { sendQueuedText } from "@/lib/send-queued-text";
import { queuedTextDeps } from "@/lib/queued-text-deps";
import { WelcomeHeader } from "@/components/next-up/WelcomeHeader";
import { NextUpStack } from "@/components/next-up/NextUpStack";
import { AlsoWaitingList } from "@/components/next-up/AlsoWaitingList";
import { AllClearCard } from "@/components/next-up/AllClearCard";
import { LaterSheet } from "@/components/next-up/LaterSheet";
import { DismissSheet, pickKey, type DismissPick } from "@/components/next-up/DismissSheet";
import { PostCallSheet } from "@/components/next-up/PostCallSheet";
import { CompleteTaskSheet } from "@/components/CompleteTaskSheet";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatLastSyncedKey(ts: number): { key: string; count?: number } {
  const ago = Date.now() - ts;
  if (ago < 60_000) return { key: "status.updatedJustNow" };
  const mins = Math.round(ago / 60_000);
  return { key: "status.updatedMinAgo", count: mins };
}

/** How often the dashboard re-reads the clock: the band, what comes back from Later, "Updated". */
const CLOCK_TICK_MS = 30_000;

// ── Activity Type Pill Selector ─────────────────────────────────────────────

const ACTIVITY_TYPES = ["call", "text", "showing", "meeting", "note"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

function ActivityTypePicker({
  selected,
  onSelect,
  colors: c,
  labels,
}: {
  selected: ActivityType;
  onSelect: (t: ActivityType) => void;
  colors: ReturnType<typeof useColors>;
  labels?: Record<string, string>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: Space.sm, flexWrap: "wrap" }}>
      {ACTIVITY_TYPES.map((type) => {
        const active = type === selected;
        return (
          <Pressable
            key={type}
            onPress={() => onSelect(type)}
            style={{
              paddingHorizontal: Space.md,
              paddingVertical: Space.sm,
              borderRadius: Radius.pill,
              backgroundColor: active ? c.primary : c.primaryDim,
              borderWidth: 1,
              borderColor: active ? c.primary : c.primaryBorder,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: active ? "#FFFFFF" : c.primary,
              }}
            >
              {labels?.[type] ?? type}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Quick Capture Sheet ─────────────────────────────────────────────────────

function QuickCaptureSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("home");
  const { t: tCommon } = useTranslation("common");
  const { clients, addActivity } = useDataStore();
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const notesRef = useRef<TextInput>(null);

  const filteredClients = useMemo(() => {
    if (!clientQuery.trim() || selectedClient) return [];
    const q = clientQuery.toLowerCase().trim();
    return clients
      .filter((cl) => cl.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [clientQuery, clients, selectedClient]);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setTimeout(() => notesRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    if (!selectedClient || !notes.trim()) return;
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    await addActivity({
      client_id: selectedClient.id,
      type: activityType,
      description: notes.trim(),
      activity_date: new Date().toISOString(),
    });
    setSaving(false);
    setClientQuery("");
    setSelectedClient(null);
    setActivityType("note");
    setNotes("");
    onClose();
  };

  const handleClose = () => {
    setClientQuery("");
    setSelectedClient(null);
    setActivityType("note");
    setNotes("");
    onClose();
  };

  const canSave = selectedClient && notes.trim().length > 0 && !saving;

  return (
    <Sheet visible={visible} onClose={handleClose} title={t("quickCapture.title")}>
      <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.clientLabel")}</Text>
          <TextInput
            value={clientQuery}
            onChangeText={(text) => {
              setClientQuery(text);
              if (selectedClient) setSelectedClient(null);
            }}
            placeholder={t("quickCapture.searchClient")}
            placeholderTextColor={c.textDim}
            style={{
              backgroundColor: c.card,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: Space.md,
              paddingVertical: Space.md,
              ...Type.body,
              color: c.text,
            }}
            autoCorrect={false}
          />
          {filteredClients.length > 0 && (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: c.cardHighBorder,
                marginTop: Space.xs,
                overflow: "hidden",
              }}
            >
              {filteredClients.map((client, idx) => (
                <Pressable
                  key={client.id}
                  onPress={() => handleSelectClient(client)}
                  style={({ pressed }) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: Space.md,
                      paddingVertical: Space.sm,
                      gap: Space.md,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: c.divider,
                    },
                    pressed && { backgroundColor: c.primaryDim },
                  ]}
                >
                  <Avatar name={client.name} size="sm" />
                  <Text style={{ ...Type.bodyBold, color: c.text, flex: 1 }} numberOfLines={1}>
                    {client.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.typeLabel")}</Text>
          <ActivityTypePicker selected={activityType} onSelect={setActivityType} colors={c} labels={{
            call: t("quickCapture.activityTypes.call"),
            text: t("quickCapture.activityTypes.text"),
            showing: t("quickCapture.activityTypes.showing"),
            meeting: t("quickCapture.activityTypes.meeting"),
            note: t("quickCapture.activityTypes.note"),
          }} />
          {activityType === "note" && (
            <Text style={{ ...Type.caption, color: c.textMuted, marginTop: Space.xs }}>
              {t("quickCapture.noteNotContact")}
            </Text>
          )}
        </View>

        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.notesLabel")}</Text>
          <TextInput
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("quickCapture.notesPlaceholder")}
            placeholderTextColor={c.textDim}
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: c.card,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: Space.md,
              paddingVertical: Space.md,
              ...Type.body,
              color: c.text,
              minHeight: 80,
            }}
          />
        </View>

        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={({ pressed }) => [
            {
              backgroundColor: canSave ? c.primary : c.primaryDim,
              borderRadius: Radius.md,
              paddingVertical: Space.md,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && canSave && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={{ color: canSave ? "#FFFFFF" : c.textDim, fontSize: 15, fontWeight: "700" }}>
            {saving ? tCommon("actions.saving") : tCommon("actions.save")}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

// ── Dashboard Skeleton ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: Space.xl, paddingTop: Space.lg }}>
      <Skeleton width={90} height={10} borderRadius={Radius.sm} />
      <Skeleton width={240} height={30} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
      <Skeleton width={150} height={24} borderRadius={Radius.pill} style={{ marginTop: Space.sm }} />
      <Skeleton width={170} height={12} borderRadius={Radius.sm} style={{ marginTop: Space.sm, marginBottom: Space.xl }} />
      {/* Next up card */}
      <Skeleton width="100%" height={176} borderRadius={22} style={{ marginBottom: Space.xl }} />
      {/* Also waiting */}
      <Skeleton width="100%" height={168} borderRadius={Radius.xl} />
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
//
// Top to bottom: the welcome (mark, greeting, one line of context, the day's
// progress and streak), the sync status, the Next up stack (or, when it is
// empty, the all-clear card in its place), "Also waiting", and the "+" Quick
// Capture. Everything renders from the cached stores at once and refreshes
// behind.
//
// The card buttons: Call dials and asks how it went when the app is back;
// Text sends today's queued text, or drafts one first (CASL: only where the
// server said a text can go, and the consent check runs again before
// Messages opens); Later, Not now (Skip, Stop, the Hangar, already talked)
// go through the shared writers (stores/next-up-store.ts); Mark one done
// ticks off the oldest task; Record a note opens the voice note. After each
// handled card the server is asked again.

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = useTheme();
  const c = useColors();
  const sh = shadows(mode);
  const { t } = useTranslation("home");
  const { t: tCommon } = useTranslation("common");

  const {
    fetchAll, fetchOutreach, fetchReceipts, isLoading, lastFetched,
    settings, transactions, pipeline, tasks, clients, clientRecords, briefings,
    receipts, outreachQueue, schedule, tripsLoggedToday,
    todayBriefing, contactStreak,
  } = useDataStore();
  const { payload, localSnoozes, voiceNoteDoneOn, fetchNextUp } = useNextUpStore();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [showCapture, setShowCapture] = useState(false);
  // False only for the first frame, before the first refresh has begun.
  const [started, setStarted] = useState(false);

  // The card buttons' sheets, and the card whose tap is being handled.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [later, setLater] = useState<{ card: NextUpCardData; choices: LaterChoice[] } | null>(null);
  const [laterBusy, setLaterBusy] = useState<LaterChoice | null>(null);
  const [dismiss, setDismiss] = useState<{
    card: NextUpCardData; item: HandfulItem | null; choices: DismissChoice[]; laterChoices: LaterChoice[];
  } | null>(null);
  const [dismissBusy, setDismissBusy] = useState<string | null>(null);
  /** The voice note sheet: after a call, or the "Record a note" card. */
  const [noteSheet, setNoteSheet] = useState<{ kind: "call"; call: PendingCall } | { kind: "day" } | null>(null);
  const [loggingCall, setLoggingCall] = useState(false);
  const [tickingTask, setTickingTask] = useState<ContactTask | null>(null);
  // iOS shows one sheet at a time: the after-call question waits while another is open.
  const sheetOpen = useRef(false);
  sheetOpen.current = !!(later || dismiss || noteSheet || tickingTask || showCapture);

  /** A call placed from Next up: ask how it went, within 2 hours of dialling. */
  const askAboutCall = useCallback(() => {
    const call = useNextUpStore.getState().pendingCall;
    if (!call || sheetOpen.current) return;
    if (shouldAskAfterCall(call, Date.now())) setNoteSheet({ kind: "call", call });
    else useNextUpStore.getState().clearPendingCall();
  }, []);

  useEffect(() => { fetchAll(); fetchOutreach(); fetchReceipts(); setStarted(true); }, []);
  useFocusEffect(useCallback(() => { fetchAll(); fetchOutreach(); fetchReceipts(); }, []));

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        // Back in front: the band may have moved and a Later may have run out.
        setNow(new Date());
        askAboutCall();
        const lf = useDataStore.getState().lastFetched;
        if (!lf || Date.now() - lf > 2 * 60 * 1000) {
          fetchAll();
          fetchOutreach();
          fetchReceipts();
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [askAboutCall]);

  // Opened again after a call (the app was closed meanwhile): ask now.
  useEffect(() => { askAboutCall(); }, [askAboutCall]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(), fetchOutreach(), fetchReceipts(), fetchNextUp({ force: true })]);
    setRefreshing(false);
  };

  // Next up, rebuilt from the stores on every change and every clock tick.
  // `briefings` is listed because todayBriefing() reads it.
  const { clock, view } = useMemo(() => {
    const clock = nextUpClock(now);
    const view = buildNextUp(nextUpInput({
      clients, tasks, pipeline, clientRecords, receipts, outreachQueue, schedule, tripsLoggedToday,
      briefingCount: todayBriefing().length,
      payload, localSnoozes, voiceNoteDoneOn,
    }, clock, now));
    return { clock, view };
  }, [now, clients, tasks, pipeline, clientRecords, receipts, outreachQueue, schedule, tripsLoggedToday,
      briefings, todayBriefing, payload, localSnoozes, voiceNoteDoneOn]);

  // A handful client's Later ran out while the screen was open: ask the
  // server again, so their card gets its Text button and Skip back.
  const laterCheckedAt = useRef(Date.now());
  useEffect(() => {
    const nowMs = now.getTime();
    if (snoozeEndedBetween(payload?.snoozed ?? [], laterCheckedAt.current, nowMs)) void fetchNextUp({ force: true });
    laterCheckedAt.current = Math.max(laterCheckedAt.current, nowMs);
  }, [now, payload, fetchNextUp]);

  const displayName = settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const streak = contactStreak();
  const checklistOverdue = checklistRowHasOverdue(view, tasks, clock.today);

  const { pendingCount: offlinePending, isOnline } = useOfflineQueueStore();

  // The skeleton only covers a first open with nothing cached at all, until
  // that first refresh ends (an empty "all caught up" would be wrong there).
  const hasCache = !!settings || clients.length > 0 || tasks.length > 0 || transactions.length > 0
    || pipeline.length > 0 || !!payload;
  const showSkeleton = !lastFetched && !hasCache && (isLoading || !started);

  // ── Card buttons ───────────────────────────────────────────────────────────

  const refetchNextUp = useCallback(() => { void useNextUpStore.getState().fetchNextUp({ force: true }); }, []);

  /** Call: dial, and keep the call so the after-call sheet can ask how it went. */
  const handleCall = useCallback((card: NextUpCardData) => {
    const url = telUrl(card.phone);
    if (!url || !card.clientId) return;
    const store = useNextUpStore.getState();
    store.setPendingCall({ clientId: card.clientId, clientName: card.clientName ?? "", at: Date.now() });
    Linking.openURL(url).catch(() => store.clearPendingCall());
  }, []);

  /**
   * Text (CASL): only where textPlan allows it. A ready text goes from the
   * queue; otherwise one is drafted first (the drafter checks consent and
   * may answer call only). sendQueuedText checks consent again with the
   * server before Messages opens, and the agent presses Send there.
   */
  const handleText = useCallback(async (card: NextUpCardData) => {
    const plan = textPlan(card);
    const clientId = card.clientId;
    if (!plan || !clientId) return;
    const data = useDataStore.getState();
    const name = card.clientName ?? "";
    setBusyKey(card.key);
    try {
      let queueId: string | null = plan.kind === "send" ? plan.queueId : null;
      let notQueuedReason: string | null = null;
      if (plan.kind === "draft") {
        const drafted = await data.draftTexts([clientId], plan.purpose, plan.note);
        if ("error" in drafted) {
          Alert.alert(t("textFlow.draftFailedTitle"), drafted.error);
          return;
        }
        const result = drafted.results[0];
        if (!result || result.status === "call_only" || result.status === "skipped") {
          Alert.alert(t("textFlow.callInstead"), result?.reason || t("textFlow.noDraft", { name: name || t("nextUpToast.thisClient") }));
          refetchNextUp();
          return;
        }
        queueId = result.queueItemId ?? null;
        notQueuedReason = result.reason ?? null; // "You already texted <name> today."
      }
      // The queue row: on the phone already, else read the queue once more.
      const find = () => useDataStore.getState().outreachQueue.find((q) =>
        q.channel === "sms" && q.status === "ready" && (queueId ? q.id === queueId : q.client_id === clientId));
      let row = find();
      if (!row) {
        await useDataStore.getState().fetchOutreach();
        row = find();
      }
      if (!row) {
        Alert.alert(t("textFlow.notQueuedTitle"), notQueuedReason ?? t("textFlow.notQueued"));
        refetchNextUp();
        return;
      }
      const sent = await sendQueuedText(row, queuedTextDeps());
      if (sent === "sent") {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        // markTexted logged a Text activity: they're contacted.
        useNextUpStore.getState().dropHandfulClient(clientId);
        void useDataStore.getState().refreshClient(clientId);
      }
      if (sent === "sent" || sent === "refused") refetchNextUp();
    } finally {
      setBusyKey(null);
    }
  }, [t, refetchNextUp]);

  /** Later: a handful client's is the server's hold; any other card is put off on this phone. */
  const pickLater = useCallback(async (card: NextUpCardData, choice: LaterChoice) => {
    const until = laterUntilAt(choice, new Date());
    if (card.kind === "handful_client" && card.clientId) {
      setLaterBusy(choice);
      await useNextUpStore.getState().holdSuggestion(
        { client_id: card.clientId, client_name: card.clientName ?? "" }, "later", until, choice);
      setLaterBusy(null);
    } else {
      const store = useNextUpStore.getState();
      store.snoozeCard(card.key, until.toISOString());
      useToastStore.getState().show(
        handledToast({ kind: "snoozed", choice }, card.clientName, t), "success", undefined,
        { label: t("nextUpToast.undo"), onPress: () => useNextUpStore.getState().unsnoozeCard(card.key) },
      );
    }
    setLater(null);
  }, [t]);

  /**
   * Not now: core's choices for the card. A client back from Later has no
   * occurrence to skip until the server answers again, so ask it first; if
   * there is still none, Skip isn't offered.
   */
  const openDismiss = useCallback(async (card: NextUpCardData) => {
    if (!card.clientId) return;
    const pick = () => useNextUpStore.getState().payload?.handful.find((h) => h.client_id === card.clientId) ?? null;
    let item = card.occurrence ? pick() : null;
    if (!item) {
      setBusyKey(card.key);
      await useNextUpStore.getState().fetchNextUp({ force: true });
      setBusyKey(null);
      item = pick();
    }
    const choices: DismissChoice[] = item ? dismissChoicesFor(item.opportunity_type) : ["already_talked", "later", "stop"];
    setDismiss({ card, item, choices, laterChoices: laterChoicesAt(new Date()) });
  }, []);

  const pickDismiss = useCallback(async (p: DismissPick) => {
    if (!dismiss?.card.clientId) return;
    const { card, item } = dismiss;
    const client = { client_id: dismiss.card.clientId, client_name: card.clientName ?? "" };
    const store = useNextUpStore.getState();
    setDismissBusy(pickKey(p));
    switch (p.kind) {
      case "talked": await store.logTalkedTo(client.client_id, client.client_name, p.type); break;
      case "later": await store.holdSuggestion(client, "later", laterUntilAt(p.choice, new Date()), p.choice); break;
      case "skip": if (item) await store.skipSuggestion(item); break;
      case "stop": await store.holdSuggestion(client, "stop", stopUntilAt(p.choice, new Date()), p.choice); break;
      case "hangar": await store.moveToHangar(client.client_id, client.client_name); break;
    }
    setDismissBusy(null);
    setDismiss(null);
  }, [dismiss]);

  /** Mark one done (the card) or the row's swipe: a client's task opens the tick-off sheet. */
  const tickTask = useCallback(async (taskId: string | undefined) => {
    const task = useDataStore.getState().tasks.find((x) => x.id === taskId);
    if (!task) return;
    if (task.client_id) {
      setTickingTask(task);
      return;
    }
    if (await useDataStore.getState().markTaskDone(task)) {
      useToastStore.getState().show(t("nextUp.ticked"), "success");
      refetchNextUp();
    }
  }, [t, refetchNextUp]);

  const handleAction = useCallback((action: NextUpAction, card: NextUpCardData) => {
    const href = ACTION_ROUTES[action];
    if (href) {
      router.push(href);
      return;
    }
    switch (action) {
      case "open_client":
        router.push(card.clientId ? { pathname: "/clients", params: { clientId: card.clientId } } : "/clients");
        return;
      case "call": handleCall(card); return;
      case "text": void handleText(card); return;
      case "later": setLater({ card, choices: laterChoicesAt(new Date()) }); return;
      case "dismiss": void openDismiss(card); return;
      // The oldest overdue (or due today) task: the card's items are oldest first.
      case "mark_one_done": void tickTask(card.itemIds[0]); return;
      case "record_voice_note": setNoteSheet({ kind: "day" }); return;
    }
  }, [router, handleCall, handleText, openDismiss, tickTask]);

  const handleOpenSection = useCallback((section: SectionKey) => {
    try { Haptics.selectionAsync(); } catch {}
    router.push(SECTION_ROUTES[section]);
  }, [router]);

  // The Checklist row's one task: the same as the card's Mark one done.
  const handleSwipeDone = useCallback((taskId: string) => { void tickTask(taskId); }, [tickTask]);

  // ── The voice note sheet (after a call, or "Record a note") ───────────────

  const closeNoteSheet = useCallback(() => {
    if (noteSheet?.kind === "call") useNextUpStore.getState().clearPendingCall();
    setNoteSheet(null);
  }, [noteSheet]);

  const logCallOnly = useCallback(async () => {
    if (noteSheet?.kind !== "call") return;
    const { call } = noteSheet;
    setLoggingCall(true);
    await useNextUpStore.getState().logTalkedTo(call.clientId, call.clientName, "call");
    setLoggingCall(false);
    useNextUpStore.getState().clearPendingCall();
    setNoteSheet(null);
  }, [noteSheet]);

  const noteNotNow = useCallback(() => {
    if (noteSheet?.kind === "day") useNextUpStore.getState().markVoiceNoteDone(clock.today);
    closeNoteSheet();
  }, [noteSheet, clock.today, closeNoteSheet]);

  const noteSaved = useCallback(() => {
    if (noteSheet?.kind === "day") useNextUpStore.getState().markVoiceNoteDone(clock.today);
    // The note may have logged the call: the server says who's still waiting.
    refetchNextUp();
  }, [noteSheet, clock.today, refetchNextUp]);

  const handleFabPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setShowCapture(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {showSkeleton && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg }]}>
          <DashboardSkeleton />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── 1. Welcome: mark, greeting, context, progress (top-right kept for the score badge) ── */}
        <FadeIn delay={0}>
          <WelcomeHeader
            firstName={displayName.split(" ")[0]}
            band={clock.band}
            context={view.context}
            progress={view.progress}
            streak={streak}
          />
        </FadeIn>

        {/* ── 2. Sync status ── */}
        <Text
          style={{
            ...Type.micro,
            color: !isOnline || offlinePending > 0 ? "#F59E0B" : c.textDim,
            marginTop: Space.sm,
            marginBottom: Space.xl,
          }}
        >
          {!isOnline
            ? t("sync.offline")
            : offlinePending > 0
              ? t(offlinePending === 1 ? "sync.pendingSync" : "sync.pendingSync_plural", { count: offlinePending })
              : isLoading
                ? t("sync.updating")
                : lastFetched
                  ? tCommon(formatLastSyncedKey(lastFetched).key, { count: formatLastSyncedKey(lastFetched).count })
                  : ""}
        </Text>

        {/* ── 3. Next up, or (with nothing on it) all clear and what's next, in its place ── */}
        {view.stack.length > 0 ? (
          <FadeIn delay={60}>
            <View style={{ marginBottom: Space.xl }}>
              <NextUpStack cards={view.stack} onAction={handleAction} busyKey={busyKey} />
            </View>
          </FadeIn>
        ) : (
          <FadeIn delay={60}>
            <View style={{ marginBottom: Space.xl }}>
              <AllClearCard allClear={view.allClear} hasRows={view.alsoWaiting.length > 0} today={clock.today} />
            </View>
          </FadeIn>
        )}

        {/* ── 4. Also waiting ── */}
        {view.alsoWaiting.length > 0 && (
          <FadeIn delay={120}>
            <View style={{ marginBottom: Space.xl }}>
              <AlsoWaitingList
                rows={view.alsoWaiting}
                onOpen={handleOpenSection}
                onSwipeDone={handleSwipeDone}
                checklistOverdue={checklistOverdue}
              />
            </View>
          </FadeIn>
        )}
      </ScrollView>

      {/* ── Floating Action Button ── */}
      <Pressable
        onPress={handleFabPress}
        style={({ pressed }) => [
          {
            position: "absolute",
            bottom: 100,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: 28,
            overflow: "hidden",
            zIndex: 20,
            ...sh.cardLg,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.93 }] },
        ]}
      >
        <LinearGradient
          colors={["#6366F1", "#4F46E5"]}
          style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}
        >
          <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
        </LinearGradient>
      </Pressable>

      <QuickCaptureSheet visible={showCapture} onClose={() => setShowCapture(false)} />

      {/* ── The card buttons' sheets ── */}
      <LaterSheet
        visible={!!later}
        choices={later?.choices ?? []}
        busy={laterBusy}
        onPick={(choice) => { if (later) void pickLater(later.card, choice); }}
        onClose={() => setLater(null)}
      />
      <DismissSheet
        visible={!!dismiss}
        name={dismiss?.card.clientName ?? ""}
        choices={dismiss?.choices ?? []}
        laterChoices={dismiss?.laterChoices ?? []}
        busy={dismissBusy}
        onPick={(p) => void pickDismiss(p)}
        onClose={() => setDismiss(null)}
      />
      <PostCallSheet
        visible={!!noteSheet}
        title={noteSheet?.kind === "call"
          ? t("postCall.title", { name: noteSheet.call.clientName || t("nextUpToast.thisClient") })
          : t("postCall.dayTitle")}
        context={noteSheet?.kind === "call" ? { clientId: noteSheet.call.clientId, clientName: noteSheet.call.clientName } : undefined}
        onRecorded={() => { if (noteSheet?.kind === "call") useNextUpStore.getState().clearPendingCall(); }}
        onSaved={noteSaved}
        onLogOnly={noteSheet?.kind === "call" ? () => void logCallOnly() : undefined}
        logging={loggingCall}
        onNotNow={noteNotNow}
        onClose={closeNoteSheet}
      />
      <CompleteTaskSheet
        task={tickingTask}
        clientName={clients.find((cl) => cl.id === tickingTask?.client_id)?.name ?? ""}
        onClose={() => {
          // Ticked off (maybe with a contact logged): the server says who's still waiting.
          if (tickingTask && !useDataStore.getState().tasks.some((x) => x.id === tickingTask.id)) refetchNextUp();
          setTickingTask(null);
        }}
      />
    </SafeAreaView>
  );
}
