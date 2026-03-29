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
} from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import * as Haptics from "expo-haptics";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function formatLastSynced(ts: number): string {
  const ago = Date.now() - ts;
  if (ago < 60_000) return "Updated just now";
  const mins = Math.round(ago / 60_000);
  return `Updated ${mins} min ago`;
}

function runwayScoreMeta(score: number) {
  return {
    score,
    label: score >= 80 ? "Excellent" : score >= 60 ? "On Track" : score >= 40 ? "Needs Focus" : "At Risk",
    color: score >= 80 ? "#10B981" : score >= 60 ? "#6366F1" : score >= 40 ? "#F59E0B" : "#EF4444",
  };
}

// ── Small Runway Score Badge (inline, 28px) ─────────────────────────────────

function RunwayBadge({ score, color }: { score: number; color: string }) {
  const size = 28;
  const sw = 2.5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(128,128,128,0.15)" strokeWidth={sw} fill="none" />
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      />
      <SvgText x={cx} y={cy + 4} textAnchor="middle" fill={color} fontSize="10" fontWeight="800">
        {score}
      </SvgText>
    </Svg>
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
          backgroundColor: color + "26",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: Space.md,
          gap: Space.sm,
          marginRight: Space.sm,
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Icon size={14} color={color} />
      <Text style={{ color, fontSize: 13, fontWeight: "700" }}>
        {count} {label}
      </Text>
    </Pressable>
  );
}

function AllCaughtUpPill({ color }: { color: string }) {
  return (
    <View
      style={{
        height: 36,
        borderRadius: 18,
        backgroundColor: color + "26",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Space.md,
        gap: Space.sm,
      }}
    >
      <CheckCircle2 size={14} color={color} />
      <Text style={{ color, fontSize: 13, fontWeight: "700" }}>All caught up</Text>
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
}: {
  selected: ActivityType;
  onSelect: (t: ActivityType) => void;
  colors: ReturnType<typeof useColors>;
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
                textTransform: "capitalize",
              }}
            >
              {type}
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
    // Reset and close
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
    <Sheet visible={visible} onClose={handleClose} title="Quick Capture">
      <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
        {/* Client picker */}
        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>CLIENT</Text>
          <TextInput
            value={clientQuery}
            onChangeText={(text) => {
              setClientQuery(text);
              if (selectedClient) setSelectedClient(null);
            }}
            placeholder="Search client name..."
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
          {/* Dropdown results */}
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

        {/* Activity type */}
        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>TYPE</Text>
          <ActivityTypePicker selected={activityType} onSelect={setActivityType} colors={c} />
        </View>

        {/* Notes */}
        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>NOTES</Text>
          <TextInput
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            placeholder="What happened?"
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

        {/* Save button */}
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
            {saving ? "Saving..." : "Save"}
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
      {/* Greeting */}
      <Skeleton width={140} height={20} borderRadius={Radius.sm} />
      {/* Name */}
      <Skeleton width={220} height={36} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
      {/* Last synced */}
      <Skeleton width={100} height={12} borderRadius={Radius.sm} style={{ marginTop: Space.sm, marginBottom: Space.xl }} />
      {/* Action pills row */}
      <View style={{ flexDirection: "row", gap: Space.sm, marginBottom: Space.xl }}>
        <Skeleton width={110} height={36} borderRadius={18} />
        <Skeleton width={130} height={36} borderRadius={18} />
        <Skeleton width={100} height={36} borderRadius={18} />
        <Skeleton width={110} height={36} borderRadius={18} />
      </View>
      {/* Metrics card */}
      <Skeleton width="100%" height={100} borderRadius={Radius.xl} style={{ marginBottom: Space.xl }} />
      {/* Goal progress */}
      <Skeleton width={80} height={10} borderRadius={Radius.sm} style={{ marginBottom: Space.sm }} />
      <Skeleton width="100%" height={6} borderRadius={3} style={{ marginBottom: Space.xl }} />
      {/* Next task card */}
      <Skeleton width={60} height={10} borderRadius={Radius.sm} style={{ marginBottom: Space.sm }} />
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

  const {
    fetchAll, fetchOutreach, fetchReceipts, isLoading, lastFetched,
    settings, transactions, pipeline, tasks, clients,
    outreachReadyCount, ytdGci, ytdDealCount, pipelineValue, runwayScore,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const [showCapture, setShowCapture] = useState(false);

  useEffect(() => { fetchAll(); fetchOutreach(); fetchReceipts(); }, []);
  useFocusEffect(useCallback(() => { fetchAll(); fetchOutreach(); fetchReceipts(); }, []));

  // Re-render every 30 s so the "Updated X ago" text stays fresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh when app comes to foreground and data is stale (> 2 min)
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
  const runway = runwayScoreMeta(runwayScore());

  const { pendingCount: offlinePending, isOnline } = useOfflineQueueStore();

  const nextTask = tasks[0] ?? null;
  const overdueTasks = tasks.filter((t) => t.due_date && isOverdue(t.due_date));

  // Follow-ups due: clients whose last_contact_at is older than 14 days
  const followUpsDue = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return clients.filter((cl) => {
      if (!cl.last_contact_at) return true; // never contacted = overdue
      return new Date(cl.last_contact_at).getTime() < cutoff;
    }).length;
  }, [clients]);

  // Action strip items
  const actionItems = useMemo(() => {
    const items: { key: string; count: number; label: string; color: string; icon: typeof AlertCircle; route: string }[] = [];
    if (overdueTasks.length > 0) items.push({ key: "overdue", count: overdueTasks.length, label: "overdue", color: "#EF4444", icon: AlertCircle, route: "/deals" });
    if (outreachCount > 0) items.push({ key: "messages", count: outreachCount, label: "messages ready", color: "#6366F1", icon: Mail, route: "/outreach" });
    if (pending > 0) items.push({ key: "pending", count: pending, label: "pending deals", color: "#F59E0B", icon: Handshake, route: "/deals" });
    if (followUpsDue > 0) items.push({ key: "followups", count: followUpsDue, label: "follow-ups due", color: "#06B6D4", icon: UserCheck, route: "/clients" });
    return items;
  }, [overdueTasks.length, outreachCount, pending, followUpsDue]);

  const handleFabPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setShowCapture(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading Skeleton */}
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
        {/* -- 1. Greeting + Runway Score Badge -- */}
        <View style={{ paddingTop: Space.lg, paddingBottom: Space.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ ...Type.hero, color: c.text, flex: 1 }} numberOfLines={1}>
            {getGreeting()}, {displayName.split(" ")[0]}
          </Text>
          <RunwayBadge score={runway.score} color={runway.color} />
        </View>

        {/* -- 2. Last Synced Indicator + Offline Queue Status -- */}
        <Text
          style={{
            ...Type.micro,
            color: !isOnline || offlinePending > 0 ? "#F59E0B" : c.textDim,
            marginBottom: Space.xl,
          }}
        >
          {!isOnline
            ? "Offline \u2014 changes saved locally"
            : offlinePending > 0
              ? `${offlinePending} change${offlinePending === 1 ? "" : "s"} pending sync`
              : isLoading
                ? "Updating\u2026"
                : lastFetched
                  ? formatLastSynced(lastFetched)
                  : ""}
        </Text>

        {/* -- 3. Action Items Strip -- */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          decelerationRate="fast"
          style={{ marginBottom: Space.xl }}
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
            <AllCaughtUpPill color={c.success} />
          )}
        </ScrollView>

        {/* -- 4. Key Metrics Row -- */}
        <View style={[{ borderRadius: Radius.xl, overflow: "hidden", marginBottom: Space.xl }, sh.cardLg]}>
          <LinearGradient colors={g.heroCard as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: Space.xxl }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <MetricPill label="GCI" value={fmtCurrency(gci)} color={c.gold} c={c} />
              <MetricPill label="Deals" value={String(deals)} color={c.success} c={c} />
              <MetricPill label="Pipeline" value={fmtCurrency(pipVal)} color={c.primaryLight} c={c} />
              <MetricPill label="Clients" value={String(clients.length)} color={c.cyan} c={c} />
            </View>
          </LinearGradient>
        </View>

        {/* -- 5. Goal Progress Bar -- */}
        {goalGci > 0 && (
          <View style={{ marginBottom: Space.xl }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.sm }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>ANNUAL GOAL</Text>
              <Text style={{ ...Type.caption, color: c.textSecondary, fontWeight: "700" }}>{goalPct}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(128,128,128,0.12)", overflow: "hidden" }}>
              <LinearGradient
                colors={goalPct >= 100 ? (g.successBar as unknown as string[]) : (g.progressBar as unknown as string[])}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ height: 6, borderRadius: 3, width: `${Math.min(goalPct, 100)}%` as any }}
              />
            </View>
            <Text style={{ ...Type.micro, color: c.textDim, marginTop: Space.xs }}>
              {fmtCurrency(gci)} of {fmtCurrency(goalGci)}
            </Text>
          </View>
        )}

        {/* -- 6. Next Task Card -- */}
        {nextTask && (
          <View style={{ marginBottom: Space.xl }}>
            <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>NEXT UP</Text>
            <View style={[{
              backgroundColor: c.card, borderRadius: Radius.lg, padding: Space.lg,
              borderWidth: 1, borderColor: c.cardBorder,
              flexDirection: "row", alignItems: "center", gap: Space.md,
            }, sh.card]}>
              <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Clock size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...Type.bodyBold, color: c.text }} numberOfLines={1}>{nextTask.title}</Text>
                {nextTask.due_date && (
                  <Text style={{ ...Type.caption, color: isOverdue(nextTask.due_date) ? c.danger : c.textDim, marginTop: 2 }}>
                    {isOverdue(nextTask.due_date) ? "Overdue \u00B7 " : ""}
                    {new Date(nextTask.due_date).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                )}
              </View>
              {nextTask.priority === "high" && (
                <View style={{ backgroundColor: c.dangerDim, paddingHorizontal: Space.sm, paddingVertical: Space.xs, borderRadius: Radius.sm }}>
                  <Text style={{ color: c.danger, fontSize: 10, fontWeight: "700" }}>HIGH</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* -- Floating Action Button -- */}
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
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            ...sh.cardLg,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.93 }] },
        ]}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>

      {/* -- Quick Capture Sheet -- */}
      <QuickCaptureSheet visible={showCapture} onClose={() => setShowCapture(false)} />
    </SafeAreaView>
  );
}

// ── Small Components ─────────────────────────────────────────────────────────

function MetricPill({ label, value, color, c }: { label: string; value: string; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ ...Type.micro, color: c.textDim, marginTop: 1 }}>{label}</Text>
    </View>
  );
}
