import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
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
import type { Client } from "@/stores/data-store";
import { useNextUpStore } from "@/stores/next-up-store";
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
import { nextUpClock } from "@/lib/next-up-clock";
import {
  ACTION_ROUTES,
  SECTION_ROUTES,
  checklistRowHasOverdue,
  nextUpInput,
  snoozeEndedBetween,
} from "@/lib/next-up-view";
import { WelcomeHeader } from "@/components/next-up/WelcomeHeader";
import { NextUpStack } from "@/components/next-up/NextUpStack";
import { AlsoWaitingList } from "@/components/next-up/AlsoWaitingList";
import { AllClearCard } from "@/components/next-up/AllClearCard";

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
// progress and streak), the sync status, the Next up stack, "Also waiting",
// the all-clear card when the stack is empty, and the "+" Quick Capture.
// Everything renders from the cached stores at once and refreshes behind.

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
  }, []);

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

  const handleAction = useCallback((action: NextUpAction, card: NextUpCardData) => {
    const href = ACTION_ROUTES[action];
    if (href) {
      router.push(href);
      return;
    }
    if (action === "open_client") {
      router.push(card.clientId ? { pathname: "/clients", params: { clientId: card.clientId } } : "/clients");
      return;
    }
    // Call, Text, Later, Not now, Mark one done and Record a note are not
    // wired here yet: they come with the card actions and their sheets.
  }, [router]);

  const handleOpenSection = useCallback((section: SectionKey) => {
    try { Haptics.selectionAsync(); } catch {}
    router.push(SECTION_ROUTES[section]);
  }, [router]);

  // Marking the Checklist row's one task done comes with the card actions.
  const handleSwipeDone = useCallback((_taskId: string) => {}, []);

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

        {/* ── 3. Next up ── */}
        {view.stack.length > 0 && (
          <FadeIn delay={60}>
            <View style={{ marginBottom: Space.xl }}>
              <NextUpStack cards={view.stack} onAction={handleAction} />
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

        {/* ── 5. All clear, and what's next ── */}
        {view.stack.length === 0 && (
          <FadeIn delay={60}>
            <AllClearCard allClear={view.allClear} hasRows={view.alsoWaiting.length > 0} today={clock.today} />
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
    </SafeAreaView>
  );
}
