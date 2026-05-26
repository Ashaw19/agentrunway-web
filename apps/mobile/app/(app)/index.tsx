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
  type DimensionValue,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import type { Client, BriefingItem } from "@/stores/data-store";
import {
  RUNWAY_SCORE_BANDS,
  bandColorHexForScore,
  stateLabel as runwayStateLabel,
} from "@agent-runway/core/engines/runway-score-engine";
import { BriefingRow } from "@/components/BriefingRow";
import { ScoreBreakdownSheet } from "@/components/ScoreBreakdownSheet";
import { useOfflineQueueStore } from "@/stores/offline-queue";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import {
  AlertCircle,
  Clock,
  Mail,
  Handshake,
  UserCheck,
  CheckCircle2,
  Plus,
  TrendingUp,
  ArrowRight,
  Briefcase,
  Users,
} from "lucide-react-native";
import {
  useColors,
  useTheme,
  gradients,
  shadows,
  Space,
  Radius,
  Type,
  fmtCurrency,
  fmtCompact,
} from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { FadeIn } from "@/components/ui/FadeIn";
import { Sparkline } from "@/components/ui/Sparkline";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h < 12) return "greeting.morning";
  if (h < 17) return "greeting.afternoon";
  return "greeting.evening";
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function formatLastSyncedKey(ts: number): { key: string; count?: number } {
  const ago = Date.now() - ts;
  if (ago < 60_000) return { key: "status.updatedJustNow" };
  const mins = Math.round(ago / 60_000);
  return { key: "status.updatedMinAgo", count: mins };
}

// Two parallel band schemes — both derived from canonical engine constants in
// `packages/core/engines/runway-score-engine.ts`. See
// `memory/spec_runway_score_canonical_bands.md` §4.4 for why.
//
// - `grade` (visual-shorthand glyph: A+ / A / B / C / D / F) is keyed off
//   stricter thresholds (92/85/75/62/50). Allowed ONLY in the gauge chip.
// - `label` (prose: Strong / On Track / Building / At Risk) is keyed off
//   stateLabel thresholds (81/61/41). The ONLY scheme allowed in prose, and
//   the scheme the band COLOR follows.
//
// Score 76 → grade "B" + label "On Track" + blue color (not Strong/emerald).
// Score 80 → grade "B" + label "On Track" + blue (boundary case — intentional).
const SCORE_LABEL_KEY: Record<"Strong" | "On Track" | "Building" | "At Risk", string> = {
  "Strong": "score.strong",
  "On Track": "score.onTrack",
  "Building": "score.building",
  "At Risk": "score.atRisk",
};

function gradeGlyph(score: number): string {
  if (!isFinite(score)) return "—";
  for (const band of RUNWAY_SCORE_BANDS.grade) {
    if (score >= band.min) return band.glyph;
  }
  return RUNWAY_SCORE_BANDS.grade[RUNWAY_SCORE_BANDS.grade.length - 1].glyph;
}

function runwayScoreMeta(
  score: number,
  snapshotGrade: string | undefined,
  snapshotStateLabel: "Strong" | "On Track" | "Building" | "At Risk" | undefined,
): { grade: string; labelKey: string; color: string } {
  // Prefer the values the web engine emitted into the snapshot. Fall back to
  // engine-backed derivation when reading a legacy snapshot pre-PR #147.
  const grade = snapshotGrade ?? gradeGlyph(score);
  const label = snapshotStateLabel ?? runwayStateLabel(score);
  return {
    grade,
    labelKey: SCORE_LABEL_KEY[label],
    color: bandColorHexForScore(score),
  };
}

// ── Runway Score Gauge (Hero — 140px, gold ring matching web) ──────────────

function RunwayGauge({ score, textColor, dimColor, mode }: { score: number; textColor: string; dimColor: string; mode: string }) {
  const size = 140;
  const sw = 9;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  // Web uses Commission Gold gradient for the score ring
  return (
    <View style={{ ...shadows(mode as "light" | "dark").goldGlow }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke="rgba(240,168,0,0.08)" strokeWidth={sw} fill="none" />
        <Circle cx={cx} cy={cy} r={r} stroke="#F0A800" strokeWidth={sw} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        />
        <SvgText x={cx} y={cy - 2} textAnchor="middle" fill={textColor} fontSize="42" fontWeight="800">
          {score}
        </SvgText>
        <SvgText x={cx} y={cy + 18} textAnchor="middle" fill={dimColor} fontSize="13" fontWeight="600">
          /100
        </SvgText>
      </Svg>
    </View>
  );
}

// ── Action Pill ─────────────────────────────────────────────────────────────

function ActionPill({
  count,
  label,
  color,
  icon: Icon,
  onPress,
}: {
  count: number;
  label: string;
  color: string;
  icon: typeof AlertCircle;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 36,
          borderRadius: 18,
          backgroundColor: color + "20",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: Space.md,
          gap: 6,
          marginRight: Space.sm,
          borderWidth: 1,
          borderColor: color + "30",
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Icon size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>
        {count} {label}
      </Text>
    </Pressable>
  );
}

function AllCaughtUpPill({ color, label }: { color: string; label: string }) {
  return (
    <View
      style={{
        height: 36,
        borderRadius: 18,
        backgroundColor: color + "20",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Space.md,
        gap: 6,
        borderWidth: 1,
        borderColor: color + "30",
      }}
    >
      <CheckCircle2 size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

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
      <Skeleton width={180} height={20} borderRadius={Radius.sm} />
      <Skeleton width={260} height={36} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
      <Skeleton width={100} height={12} borderRadius={Radius.sm} style={{ marginTop: Space.sm, marginBottom: Space.xl }} />
      {/* Score card skeleton */}
      <Skeleton width="100%" height={200} borderRadius={Radius.xl} style={{ marginBottom: Space.xl }} />
      {/* Metrics row */}
      <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.xl }}>
        <Skeleton width="48%" height={80} borderRadius={Radius.lg} />
        <Skeleton width="48%" height={80} borderRadius={Radius.lg} />
      </View>
      <Skeleton width="100%" height={6} borderRadius={3} style={{ marginBottom: Space.xl }} />
      <Skeleton width="100%" height={72} borderRadius={Radius.lg} />
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode } = useTheme();
  const c = useColors();
  const g = gradients(mode);
  const sh = shadows(mode);
  const { t } = useTranslation("home");
  const { t: tCommon } = useTranslation("common");

  const {
    fetchAll, fetchOutreach, fetchReceipts, isLoading, lastFetched,
    settings, transactions, pipeline, tasks, clients,
    outreachReadyCount, ytdGci, ytdDealCount, pipelineValue, runwayScore,
    todayBriefing, todayActivityCount, contactStreak,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const [showCapture, setShowCapture] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);

  useEffect(() => { fetchAll(); fetchOutreach(); fetchReceipts(); }, []);
  useFocusEffect(useCallback(() => { fetchAll(); fetchOutreach(); fetchReceipts(); }, []));

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
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
    await Promise.all([fetchAll(), fetchOutreach(), fetchReceipts()]);
    setRefreshing(false);
  };

  const gci = ytdGci();
  const deals = ytdDealCount();
  const pending = transactions.filter((t) => t.status === "pending").length;
  const pipVal = pipelineValue();
  const goalGci = settings?.goal_gci ?? 0;
  const goalPct = goalGci > 0 ? Math.round((gci / goalGci) * 100) : 0;
  const displayName = settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const outreachCount = outreachReadyCount;
  const score = runwayScore();
  const snapshot = settings?.runway_score_snapshot;
  const meta = runwayScoreMeta(score, snapshot?.grade, snapshot?.stateLabel);

  const { pendingCount: offlinePending, isOnline } = useOfflineQueueStore();

  const nextTask = tasks[0] ?? null;
  const overdueTasks = tasks.filter((t) => t.due_date && isOverdue(t.due_date));

  const followUpsDue = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return clients.filter((cl) => {
      if (!cl.last_contact_at) return true;
      return new Date(cl.last_contact_at).getTime() < cutoff;
    }).length;
  }, [clients]);

  const actionItems = useMemo(() => {
    const items: { key: string; count: number; label: string; color: string; icon: typeof AlertCircle; route: string }[] = [];
    if (overdueTasks.length > 0) items.push({ key: "overdue", count: overdueTasks.length, label: t("actions.overdue"), color: "#EF4444", icon: AlertCircle, route: "/deals" });
    if (outreachCount > 0) items.push({ key: "messages", count: outreachCount, label: t("actions.ready"), color: "#6366F1", icon: Mail, route: "/profile/outreach" });
    if (pending > 0) items.push({ key: "pending", count: pending, label: t("actions.pending"), color: "#F59E0B", icon: Handshake, route: "/deals" });
    if (followUpsDue > 0) items.push({ key: "followups", count: followUpsDue, label: t("actions.followUps"), color: "#06B6D4", icon: UserCheck, route: "/clients" });
    return items;
  }, [overdueTasks.length, outreachCount, pending, followUpsDue]);

  const briefing = useMemo(() => todayBriefing(), [clients, pipeline, tasks]);
  const streak = contactStreak();
  const todayCount = todayActivityCount();

  // Sparkline data: monthly GCI trend from closed transactions
  const gciSparkData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthCount = Math.max(now.getMonth() + 1, 2);
    const months = new Array(monthCount).fill(0);
    for (const t of transactions) {
      if (t.status !== "closed") continue;
      const d = new Date(t.date);
      if (d.getFullYear() === year) {
        const gci = t.gci_override ?? (t.sale_price * t.commission_pct * (t.team_split_pct ?? 1));
        months[d.getMonth()] += gci;
      }
    }
    return months;
  }, [transactions]);

  // Sparkline data: monthly deal count
  const dealSparkData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthCount = Math.max(now.getMonth() + 1, 2);
    const months = new Array(monthCount).fill(0);
    for (const t of transactions) {
      if (t.status !== "closed") continue;
      const d = new Date(t.date);
      if (d.getFullYear() === year) months[d.getMonth()]++;
    }
    return months;
  }, [transactions]);

  const handleBriefingPress = useCallback(
    (item: BriefingItem) => {
      if (item.type === "hot_pipeline") {
        router.push("/deals");
      } else if (item.clientId) {
        router.push("/clients");
      } else if (item.type === "task_due_today") {
        router.push("/deals");
      }
    },
    [router]
  );

  const handleFabPress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setShowCapture(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg }]}>
          <DashboardSkeleton />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── 1. Greeting ── */}
        <FadeIn delay={0}>
          <View style={{ paddingTop: Space.lg }}>
            {/* Agent Runway brand mark */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Space.sm }}>
              <Text style={{ fontSize: 10, fontWeight: "500", letterSpacing: 1.5, color: "#8CA4C8" }}>
                AGENT
              </Text>
              <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: c.primary, marginLeft: 4 }}>
                RUNWAY
              </Text>
            </View>
            <Text style={{ ...Type.caption, color: c.textDim }}>{t(getGreetingKey())}</Text>
            <Text style={{ ...Type.hero, color: c.text, marginTop: 2 }} numberOfLines={1}>
              {displayName.split(" ")[0]}
            </Text>
          </View>
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

        {/* ── 2b. Activity Streak (positive reinforcement) ── */}
        {(todayCount > 0 || streak >= 2) && (
          <View
            style={{
              flexDirection: "row",
              gap: Space.sm,
              marginBottom: Space.lg,
            }}
          >
            {todayCount > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: c.successDim,
                  paddingHorizontal: Space.md,
                  paddingVertical: Space.xs + 1,
                  borderRadius: Radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.20)",
                }}
              >
                <CheckCircle2 size={12} color={c.success} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: c.success,
                  }}
                >
                  {t("streak.loggedToday", { count: todayCount })}
                </Text>
              </View>
            )}
            {streak >= 2 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: c.goldDim,
                  paddingHorizontal: Space.md,
                  paddingVertical: Space.xs + 1,
                  borderRadius: Radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(240,168,0,0.20)",
                }}
              >
                <Text style={{ fontSize: 11 }}>
                  {streak >= 7 ? "\uD83D\uDD25" : "\u2B50"}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: c.gold,
                  }}
                >
                  {t("streak.dayStreak", { count: streak })}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── 3. Runway Score Hero Card (tap to see breakdown) ── */}
        <FadeIn delay={100}>
        <Pressable
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setShowScoreBreakdown(true);
          }}
          style={({ pressed }) => [
            { borderRadius: Radius.xxl, overflow: "hidden", marginBottom: Space.xxl },
            sh.cardLg,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <LinearGradient
            colors={g.heroCard as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingVertical: Space.xxl, paddingHorizontal: Space.xxl, alignItems: "center" }}
          >
            <RunwayGauge score={score} textColor={c.text} dimColor={c.textDim} mode={mode} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: Space.md }}>
              <Text style={{ ...Type.h3, color: c.text }}>{t("score.runwayScore")}</Text>
              <View style={{ backgroundColor: meta.color + "22", paddingHorizontal: Space.sm + 2, paddingVertical: 3, borderRadius: Radius.sm }}>
                <Text style={{ color: meta.color, fontSize: 11, fontWeight: "800" }}>{meta.grade}</Text>
              </View>
            </View>
            <Text style={{ ...Type.caption, color: c.textDim, marginTop: Space.xs }}>{t("score.tapForDetails", { label: t(meta.labelKey) })}</Text>

            {/* Score component mini-bar */}
            <View style={{ flexDirection: "row", marginTop: Space.lg, gap: Space.xs, width: "100%" }}>
              <ScoreBar label={t("scoreBar.pace")} pct={35} color="#6366F1" c={c} />
              <ScoreBar label={t("scoreBar.pipeline")} pct={25} color="#818CF8" c={c} />
              <ScoreBar label={t("scoreBar.expenses")} pct={15} color="#10B981" c={c} />
              <ScoreBar label={t("scoreBar.bench")} pct={10} color="#06B6D4" c={c} />
              <ScoreBar label={t("scoreBar.survival")} pct={15} color="#8B5CF6" c={c} />
            </View>
          </LinearGradient>
        </Pressable>
        </FadeIn>

        {/* ── 4. Action Items Strip ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          decelerationRate="fast"
          style={{ marginBottom: Space.xxl }}
          contentContainerStyle={{ paddingRight: Space.md }}
        >
          {actionItems.length > 0 ? (
            actionItems.map((item) => (
              <ActionPill
                key={item.key}
                count={item.count}
                label={item.label}
                color={item.color}
                icon={item.icon}
                onPress={() => router.push(item.route as any)}
              />
            ))
          ) : (
            <AllCaughtUpPill color={c.success} label={t("actions.allCaughtUp")} />
          )}
        </ScrollView>

        {/* ── 5. Today's Focus ── */}
        {briefing.length > 0 && (
          <View style={{ marginBottom: Space.xxl }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: Space.md,
              }}
            >
              <Text style={{ ...Type.label, color: c.textMuted }}>
                {t("briefing.title")}
              </Text>
              <View
                style={{
                  backgroundColor: c.primaryDim,
                  paddingHorizontal: Space.sm + 2,
                  paddingVertical: 2,
                  borderRadius: Radius.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: c.primary,
                  }}
                >
                  {t(briefing.length === 1 ? "briefing.itemCount" : "briefing.itemCount_plural", { count: briefing.length })}
                </Text>
              </View>
            </View>
            {briefing.map((item) => (
              <BriefingRow
                key={item.id}
                item={item}
                onPress={() => handleBriefingPress(item)}
              />
            ))}
          </View>
        )}

        {/* ── 6. Key Metrics Grid (2x2) ── */}
        <FadeIn delay={250}>
        <View style={{ marginBottom: Space.xxl }}>
          <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.md }}>
            <MetricCard
              label={t("metrics.ytdGci")}
              value={fmtCompact(gci)}
              icon={<TrendingUp size={16} color={c.gold} />}
              color={c.gold}
              c={c} sh={sh}
              sparkData={gciSparkData}
            />
            <MetricCard
              label={t("metrics.dealsClosed")}
              value={String(deals)}
              icon={<Handshake size={16} color={c.success} />}
              color={c.success}
              c={c} sh={sh}
              sparkData={dealSparkData}
            />
          </View>
          <View style={{ flexDirection: "row", gap: Space.md }}>
            <MetricCard
              label={t("metrics.pipeline")}
              value={fmtCompact(pipVal)}
              subtitle={t("metrics.deals", { count: pipeline.length })}
              icon={<Briefcase size={16} color={c.primaryLight} />}
              color={c.primaryLight}
              c={c} sh={sh}
              onPress={() => router.push("/deals")}
            />
            <MetricCard
              label={t("metrics.clients")}
              value={String(clients.length)}
              subtitle={followUpsDue > 0 ? t("metrics.needFollowUp", { count: followUpsDue }) : ""}
              icon={<Users size={16} color={c.cyan} />}
              color={c.cyan}
              c={c} sh={sh}
              onPress={() => router.push("/clients")}
            />
          </View>
        </View>
        </FadeIn>

        {/* ── 6. Goal Progress ── */}
        {goalGci > 0 && (
          <Pressable
            onPress={() => router.push("/profile/forecast")}
            style={({ pressed }) => [
              {
                marginBottom: Space.xxl,
                backgroundColor: c.card,
                borderRadius: Radius.xl,
                borderWidth: 1,
                borderColor: c.cardBorder,
                padding: Space.lg,
              },
              sh.card,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.md }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>{t("goal.annualGoal")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}>
                <Text style={{ ...Type.caption, color: c.primary, fontWeight: "700" }}>{goalPct}%</Text>
                <ArrowRight size={12} color={c.textDim} />
              </View>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(128,128,128,0.10)", overflow: "hidden" }}>
              <LinearGradient
                colors={goalPct >= 100 ? (g.successBar as [string, string, ...string[]]) : (g.progressBar as [string, string, ...string[]])}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 8, borderRadius: 4, width: `${Math.min(goalPct, 100)}%` as DimensionValue }}
              />
            </View>
            <Text style={{ ...Type.micro, color: c.textDim, marginTop: Space.sm }}>
              {t("goal.ofGoal", { current: fmtCurrency(gci), goal: fmtCurrency(goalGci) })}
            </Text>
          </Pressable>
        )}

        {/* ── 7. Next Task Card ── */}
        {nextTask && (
          <View style={{ marginBottom: Space.xl }}>
            <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("nextUp.title")}</Text>
            <View style={[{
              backgroundColor: c.card, borderRadius: Radius.xl, padding: Space.lg,
              borderWidth: 1, borderColor: c.cardBorder,
              flexDirection: "row", alignItems: "center", gap: Space.md,
            }, sh.card]}>
              <View style={{ width: 42, height: 42, borderRadius: Radius.md, backgroundColor: c.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Clock size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...Type.bodyBold, color: c.text }} numberOfLines={1}>{nextTask.title}</Text>
                {nextTask.due_date && (
                  <Text style={{ ...Type.caption, color: isOverdue(nextTask.due_date) ? c.danger : c.textDim, marginTop: 2 }}>
                    {isOverdue(nextTask.due_date) ? t("nextUp.overdue") + " \u00B7 " : ""}
                    {new Date(nextTask.due_date).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                )}
              </View>
              {nextTask.priority === "high" && (
                <View style={{ backgroundColor: c.dangerDim, paddingHorizontal: Space.sm, paddingVertical: Space.xs, borderRadius: Radius.sm }}>
                  <Text style={{ color: c.danger, fontSize: 10, fontWeight: "700" }}>{t("nextUp.high")}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── 8. Quick Pipeline Preview ── */}
        {pipeline.length > 0 && (
          <View style={{ marginBottom: Space.xl }}>
            <Pressable
              onPress={() => router.push("/deals")}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.sm }}
            >
              <Text style={{ ...Type.label, color: c.textMuted }}>{t("pipelinePreview.title")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}>
                <Text style={{ ...Type.micro, color: c.primary }}>{t("pipelinePreview.seeAll")}</Text>
                <ArrowRight size={10} color={c.primary} />
              </View>
            </Pressable>
            {pipeline.slice(0, 3).map((deal) => (
              <View
                key={deal.id}
                style={[{
                  backgroundColor: c.card,
                  borderRadius: Radius.lg,
                  padding: Space.md,
                  marginBottom: Space.sm,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space.md,
                }, sh.card]}
              >
                <View style={{
                  width: 4, height: 32, borderRadius: 2,
                  backgroundColor: ({ lead: "#6B7280", showing: "#3B82F6", offer: "#F59E0B", conditional: "#8B5CF6", firm: "#10B981", closed: "#10B981" }[deal.stage] ?? c.textDim),
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Type.bodyBold, color: c.text }} numberOfLines={1}>
                    {deal.address ?? deal.client_name ?? t("pipelinePreview.pipelineDeal")}
                  </Text>
                  <Text style={{ ...Type.micro, color: c.textDim, marginTop: 2, textTransform: "capitalize" }}>
                    {deal.stage} {deal.client_name ? `\u00B7 ${deal.client_name}` : ""}
                  </Text>
                </View>
                <Text style={{ ...Type.caption, color: c.gold, fontWeight: "700" }}>
                  {fmtCompact(deal.estimated_price)}
                </Text>
              </View>
            ))}
          </View>
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
      <ScoreBreakdownSheet
        visible={showScoreBreakdown}
        onClose={() => setShowScoreBreakdown(false)}
        totalScore={score}
      />
    </SafeAreaView>
  );
}

// ── Small Components ─────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  color,
  c,
  sh,
  onPress,
  sparkData,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  c: ReturnType<typeof useColors>;
  sh: ReturnType<typeof shadows>;
  onPress?: () => void;
  sparkData?: number[];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          backgroundColor: c.card,
          borderRadius: Radius.xl,
          borderWidth: 1,
          borderColor: c.cardBorder,
          padding: Space.lg,
          overflow: "hidden",
        },
        sh.card,
        pressed && onPress && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
    >
      {/* Sparkline watermark behind content */}
      {sparkData && sparkData.length >= 2 && (
        <View style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.5 }}>
          <Sparkline data={sparkData} width={90} height={36} color={color} fill />
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.sm }}>
        {icon}
        <Text style={{ ...Type.micro, color: c.textDim }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "900", color, letterSpacing: -0.5 }}>{value}</Text>
      {subtitle ? (
        <Text style={{ ...Type.micro, color: c.textDim, marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

function ScoreBar({ label, pct, color, c }: { label: string; pct: number; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: pct, alignItems: "center" }}>
      <View style={{ height: 4, width: "100%", borderRadius: 2, backgroundColor: color, opacity: 0.7 }} />
      <Text style={{ fontSize: 9, fontWeight: "600", color: c.textDim, marginTop: 4, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}
