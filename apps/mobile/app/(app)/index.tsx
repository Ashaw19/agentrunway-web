import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import {
  Plane,
  ChevronRight,
  AlertCircle,
  Clock,
  TrendingUp,
  Users as UsersIcon,
  Briefcase,
} from "lucide-react-native";
import {
  useColors,
  useTheme,
  gradients,
  shadows,
  Space,
  Radius,
  Type,
  STAGE_COLORS,
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
  if (mins < 5) return `Updated ${mins} min ago`;
  return `Updated ${mins} min ago`;
}

function runwayScoreMeta(score: number) {
  return {
    score,
    label: score >= 80 ? "Excellent" : score >= 60 ? "On Track" : score >= 40 ? "Needs Focus" : "At Risk",
    color: score >= 80 ? "#10B981" : score >= 60 ? "#6366F1" : score >= 40 ? "#F59E0B" : "#EF4444",
  };
}

// ── Runway Gauge ─────────────────────────────────────────────────────────────

function RunwayGauge({ score, color, textColor, dimColor }: { score: number; color: string; textColor: string; dimColor: string }) {
  const size = 100;
  const sw = 7;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(128,128,128,0.12)" strokeWidth={sw} fill="none" />
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      />
      <SvgText x={cx} y={cy - 2} textAnchor="middle" fill={textColor} fontSize="28" fontWeight="800">
        {score}
      </SvgText>
      <SvgText x={cx} y={cy + 14} textAnchor="middle" fill={dimColor} fontSize="11" fontWeight="600">
        /100
      </SvgText>
    </Svg>
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
  const goalDeals = settings?.goal_transactions ?? 12;
  const goalPct = goalGci > 0 ? Math.round((gci / goalGci) * 100) : 0;
  const displayName = settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const outreachCount = outreachReadyCount;
  const runway = runwayScoreMeta(runwayScore());

  // Upcoming: first task or first pipeline deal close date
  const nextTask = tasks[0] ?? null;
  const overdueTasks = tasks.filter((t) => t.due_date && isOverdue(t.due_date));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading */}
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ color: c.textMuted, marginTop: Space.md, ...Type.caption }}>Loading…</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── Header ── */}
        <View style={{ paddingTop: Space.lg, paddingBottom: Space.xxl }}>
          <Text style={{ ...Type.caption, color: c.textMuted }}>{getGreeting()}</Text>
          <Text style={{ ...Type.hero, color: c.text, marginTop: 2 }}>{displayName}</Text>
        </View>

        {/* ── Hero Card — Runway Score + Key Metrics ── */}
        <View style={[{ borderRadius: Radius.xl, overflow: "hidden", marginBottom: Space.xl }, sh.cardLg]}>
          <LinearGradient colors={g.heroCard as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: Space.xxl }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Gauge */}
              <RunwayGauge score={runway.score} color={runway.color} textColor={c.text} dimColor={c.textDim} />
              {/* Metrics */}
              <View style={{ flex: 1, marginLeft: Space.xl }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginBottom: Space.sm }}>
                  <Text style={{ ...Type.label, color: c.textMuted }}>RUNWAY SCORE</Text>
                  <View style={{ backgroundColor: runway.color + "22", paddingHorizontal: Space.sm, paddingVertical: 2, borderRadius: Radius.sm }}>
                    <Text style={{ color: runway.color, fontSize: 10, fontWeight: "700" }}>{runway.label}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: Space.md }}>
                  <MetricPill label="GCI" value={fmtCurrency(gci)} color={c.gold} c={c} />
                  <MetricPill label="Deals" value={String(deals)} color={c.success} c={c} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <MetricPill label="Pipeline" value={fmtCurrency(pipVal)} color={c.primaryLight} c={c} />
                  <MetricPill label="Clients" value={String(clients.length)} color={c.cyan} c={c} />
                </View>
                {/* Goal progress */}
                {goalGci > 0 && (
                  <View style={{ marginTop: Space.md }}>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.15)", overflow: "hidden" }}>
                      <LinearGradient
                        colors={goalPct >= 100 ? (g.successBar as unknown as string[]) : (g.progressBar as unknown as string[])}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ height: 3, borderRadius: 2, width: `${Math.min(goalPct, 100)}%` as any }}
                      />
                    </View>
                    <Text style={{ ...Type.micro, color: c.textDim, marginTop: Space.xs }}>{goalPct}% of annual goal</Text>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Last Synced Indicator ── */}
        <Text style={{ ...Type.micro, color: c.textDim, marginBottom: Space.lg, textAlign: "center" }}>
          {isLoading
            ? "\u26A0 Updating\u2026"
            : lastFetched
              ? formatLastSynced(lastFetched)
              : ""}
        </Text>

        {/* ── Urgent: Overdue Tasks ── */}
        {overdueTasks.length > 0 && (
          <Pressable
            onPress={() => router.push("/deals")}
            style={[{
              flexDirection: "row", alignItems: "center", gap: Space.md,
              backgroundColor: c.dangerDim, borderRadius: Radius.lg,
              padding: Space.lg, marginBottom: Space.lg,
              borderWidth: 1, borderColor: "rgba(239,68,68,0.15)",
            }]}
          >
            <AlertCircle size={20} color={c.danger} />
            <Text style={{ ...Type.bodyBold, color: c.danger, flex: 1 }}>
              {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
            </Text>
            <ChevronRight size={16} color={c.danger} />
          </Pressable>
        )}

        {/* ── Next Up ── */}
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
                    {isOverdue(nextTask.due_date) ? "Overdue · " : ""}
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

        {/* ── Outreach Ready ── */}
        {outreachCount > 0 && (
          <Pressable
            onPress={() => router.push("/outreach")}
            style={[{
              backgroundColor: c.card, borderRadius: Radius.lg, padding: Space.lg,
              borderWidth: 1, borderColor: c.primaryBorder,
              flexDirection: "row", alignItems: "center", gap: Space.md,
              marginBottom: Space.xl,
            }, sh.card]}
          >
            <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.primaryDim, alignItems: "center", justifyContent: "center" }}>
              <Plane size={20} color={c.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.bodyBold, color: c.text }}>
                {outreachCount} message{outreachCount !== 1 ? "s" : ""} ready
              </Text>
              <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}>Flight Control</Text>
            </View>
            <View style={{ backgroundColor: c.primary, width: Space.xxl, height: Space.xxl, borderRadius: Space.md, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{outreachCount}</Text>
            </View>
            <ChevronRight size={16} color={c.textDim} />
          </Pressable>
        )}

        {/* ── Active Pipeline (compact) ── */}
        {pipeline.length > 0 && (
          <View style={{ marginBottom: Space.xl }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Space.sm }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>PIPELINE</Text>
              <Pressable onPress={() => router.push("/deals")} hitSlop={Space.sm} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ ...Type.caption, color: c.primary }}>View All</Text>
              </Pressable>
            </View>
            <View style={{ gap: Space.sm }}>
              {pipeline.slice(0, 3).map((d) => {
                const sc = STAGE_COLORS[d.stage] ?? c.textDim;
                return (
                  <View key={d.id} style={[{
                    backgroundColor: c.card, borderRadius: Radius.lg, padding: Space.lg,
                    borderWidth: 1, borderColor: c.cardBorder,
                    flexDirection: "row", alignItems: "center",
                  }, sh.card]}>
                    <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: sc, marginRight: Space.md }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...Type.bodyBold, color: c.text }} numberOfLines={1}>
                        {d.address ?? d.client_name ?? "Deal"}
                      </Text>
                      <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}>
                        {d.stage.charAt(0).toUpperCase() + d.stage.slice(1)}
                        {d.expected_close_date && ` · ${new Date(d.expected_close_date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`}
                      </Text>
                    </View>
                    <Text style={{ ...Type.bodyBold, color: c.gold }}>{fmtCurrency(d.estimated_price)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Quick Access ── */}
        <View style={{ marginBottom: Space.sm }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>QUICK ACCESS</Text>
          <View style={{ flexDirection: "row", gap: Space.md }}>
            <QuickBtn label="Add Deal" icon={<TrendingUp size={20} color={c.primary} />} bg={c.primaryDim} c={c} sh={sh} onPress={() => router.push("/deals")} />
            <QuickBtn label="Add Client" icon={<UsersIcon size={20} color={c.cyan} />} bg={c.cyanDim} c={c} sh={sh} onPress={() => router.push("/clients")} />
            <QuickBtn label="Scan" icon={<Briefcase size={20} color={c.success} />} bg={c.successDim} c={c} sh={sh} onPress={() => router.push("/expenses")} />
          </View>
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

// ── Small Components ─────────────────────────────────────────────────────────

function MetricPill({ label, value, color, c }: { label: string; value: string; color: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={{ alignItems: "flex-start" }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ ...Type.micro, color: c.textDim, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function QuickBtn({ label, icon, bg, c, sh, onPress }: {
  label: string; icon: React.ReactNode; bg: string;
  c: ReturnType<typeof useColors>; sh: ReturnType<typeof shadows>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1, backgroundColor: c.card, borderRadius: Radius.lg,
          borderWidth: 1, borderColor: c.cardBorder,
          padding: Space.lg, alignItems: "center", gap: Space.sm,
        },
        sh.card,
        pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
      ]}
    >
      <View style={{ width: 44, height: 44, borderRadius: Radius.md, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <Text style={{ ...Type.caption, color: c.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

