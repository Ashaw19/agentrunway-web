import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import {
  AlertCircle,
  Clock,
  Mail,
  Handshake,
  UserCheck,
  CheckCircle2,
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading */}
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ color: c.textMuted, marginTop: Space.md, ...Type.caption }}>Loading...</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── 1. Greeting + Runway Score Badge ── */}
        <View style={{ paddingTop: Space.lg, paddingBottom: Space.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ ...Type.hero, color: c.text, flex: 1 }} numberOfLines={1}>
            {getGreeting()}, {displayName.split(" ")[0]}
          </Text>
          <RunwayBadge score={runway.score} color={runway.color} />
        </View>

        {/* ── 2. Last Synced Indicator ── */}
        <Text style={{ ...Type.micro, color: c.textDim, marginBottom: Space.xl }}>
          {isLoading
            ? "\u26A0 Updating\u2026"
            : lastFetched
              ? formatLastSynced(lastFetched)
              : ""}
        </Text>

        {/* ── 3. Action Items Strip ── */}
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

        {/* ── 4. Key Metrics Row ── */}
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

        {/* ── 5. Goal Progress Bar ── */}
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

        {/* ── 6. Next Task Card ── */}
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
