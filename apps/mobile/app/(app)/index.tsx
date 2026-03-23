import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import {
  Plane,
  TrendingUp,
  ChevronRight,
  CheckSquare,
  Zap,
  Users,
  Target,
} from "lucide-react-native";
import { C, STAGE_COLORS, fmtCurrency, dayOfYear } from "@/lib/theme";

// ── Runway Score ─────────────────────────────────────────────────────────────

function computeRunwayScore({
  gci,
  goalGci,
  pipelineValue,
  clients,
  dealCount,
  goalDeals,
}: {
  gci: number;
  goalGci: number;
  pipelineValue: number;
  clients: { last_contact_at: string | null }[];
  dealCount: number;
  goalDeals: number;
}): { score: number; label: string; color: string } {
  const progress = Math.max(dayOfYear() / 365, 0.01);

  const expectedGci = goalGci * progress;
  const paceScore =
    expectedGci > 0
      ? Math.min(gci / expectedGci, 1.5) / 1.5
      : gci > 0
      ? 0.7
      : 0.4;

  const remainingGoal = Math.max((goalGci - gci) * 1.5, 1);
  const pipelineScore =
    goalGci > 0
      ? Math.min(pipelineValue / remainingGoal, 2) / 2
      : pipelineValue > 0
      ? 0.8
      : 0.4;

  const recentlyContacted = clients.filter((c) => {
    if (!c.last_contact_at) return false;
    return (
      (Date.now() - new Date(c.last_contact_at).getTime()) / 86400000 <= 30
    );
  }).length;
  const activityScore =
    clients.length > 0
      ? Math.min(recentlyContacted / Math.max(clients.length * 0.4, 1), 1)
      : 0.4;

  const expectedDeals = goalDeals * progress;
  const velocityScore =
    expectedDeals > 0 ? Math.min(dealCount / expectedDeals, 2) / 2 : 0.4;

  const raw =
    paceScore * 0.35 +
    pipelineScore * 0.25 +
    activityScore * 0.25 +
    velocityScore * 0.15;
  const score = Math.round(Math.max(0, Math.min(100, raw * 100)));
  const label =
    score >= 80
      ? "Excellent"
      : score >= 60
      ? "On Track"
      : score >= 40
      ? "Needs Focus"
      : "At Risk";
  const color =
    score >= 80
      ? C.success
      : score >= 60
      ? C.primary
      : score >= 40
      ? C.warning
      : C.danger;

  return { score, label, color };
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

// ── Sub-components ───────────────────────────────────────────────────────────

function RunwayGauge({ score, color }: { score: number; color: string }) {
  const size = 96;
  const sw = 9;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={C.textFaint}
        strokeWidth={sw}
        fill="none"
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={color}
        strokeWidth={sw}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <SvgText
        x={cx}
        y={cy - 3}
        textAnchor="middle"
        fill={C.text}
        fontSize="22"
        fontWeight="800"
      >
        {score}
      </SvgText>
      <SvgText
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        fill={C.textDim}
        fontSize="9"
        fontWeight="600"
      >
        / 100
      </SvgText>
    </Svg>
  );
}

function KpiChip({
  label,
  value,
  color = C.text,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <View style={S.chip}>
      <Text style={[S.chipValue, { color }]}>{value}</Text>
      <Text style={S.chipLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={S.sectionHeader}>
      <Text style={S.sectionTitle}>{title}</Text>
      {action && (
        <Pressable onPress={onAction}>
          <Text style={{ color: C.primary, fontSize: 13, fontWeight: "600" }}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    fetchAll,
    fetchOutreach,
    isLoading,
    settings,
    transactions,
    pipeline,
    tasks,
    clients,
    outreachReadyCount,
    ytdGci,
    ytdDealCount,
    pipelineValue,
    runwayScore,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch on mount
  useEffect(() => {
    fetchAll();
    fetchOutreach();
  }, []);

  // Re-fetch whenever screen comes into focus (e.g. returning from Deals/Clients)
  useFocusEffect(
    useCallback(() => {
      fetchAll();
      fetchOutreach();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(), fetchOutreach()]);
    setRefreshing(false);
  };

  const gci = ytdGci();
  const deals = ytdDealCount();
  const pending = transactions.filter((t) => t.status === "pending").length;
  const pipVal = pipelineValue();
  const goalGci = settings?.goal_gci ?? 0;
  const goalDeals = settings?.goal_transactions ?? 12;
  const goalPct = goalGci > 0 ? Math.round((gci / goalGci) * 100) : 0;
  const displayName =
    settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const outreachCount = outreachReadyCount;

  const runway = computeRunwayScore({
    gci,
    goalGci,
    pipelineValue: pipVal,
    clients,
    dealCount: deals,
    goalDeals,
  });

  const isEmpty =
    pipeline.length === 0 && tasks.length === 0 && outreachCount === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Loading indicator overlay — shown only on initial load when store is empty */}
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.bg,
          }}
        >
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.textDim, marginTop: 12, fontSize: 13 }}>
            Loading your runway…
          </Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
      >
        {/* ── Header ── */}
        <View style={{ paddingTop: 20, paddingBottom: 22 }}>
          <Text style={S.greeting}>{getGreeting()}</Text>
          <Text style={S.screenTitle}>{displayName}</Text>
        </View>

        {/* ── Runway Score + GCI ── */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          {/* Runway Score */}
          <View
            style={[
              S.card,
              {
                flex: 1,
                padding: 16,
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              },
            ]}
          >
            <RunwayGauge score={runway.score} color={runway.color} />
            <Text style={S.cardLabel}>RUNWAY SCORE</Text>
            <View
              style={{
                backgroundColor: runway.color + "20",
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 20,
              }}
            >
              <Text
                style={{ color: runway.color, fontSize: 11, fontWeight: "700" }}
              >
                {runway.label}
              </Text>
            </View>
          </View>

          {/* GCI + Pipeline stacked */}
          <View style={{ flex: 1.3, gap: 10 }}>
            {/* GCI */}
            <View style={[S.card, { padding: 16, overflow: "hidden" }]}>
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgGrad id="dashGciGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#1C1C3A" stopOpacity="1" />
                    <Stop offset="1" stopColor="#0D0D1A" stopOpacity="1" />
                  </SvgGrad>
                </Defs>
                <Rect
                  width="100%"
                  height="100%"
                  fill="url(#dashGciGrad)"
                  rx="16"
                />
              </Svg>
              <Text style={S.cardLabel}>YTD GCI</Text>
              <Text style={S.cardBigNumber}>{fmtCurrency(gci)}</Text>
              {goalGci > 0 && (
                <>
                  <View style={S.progressTrack}>
                    <View
                      style={[
                        S.progressFill,
                        {
                          width: `${Math.min(goalPct, 100)}%` as any,
                          backgroundColor:
                            goalPct >= 100 ? C.success : C.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={S.microLabel}>{goalPct}% of goal</Text>
                </>
              )}
            </View>

            {/* Pipeline */}
            <View style={[S.card, { padding: 16, overflow: "hidden" }]}>
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgGrad id="dashPipeGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#1A2A1A" stopOpacity="1" />
                    <Stop offset="1" stopColor="#0D0D14" stopOpacity="1" />
                  </SvgGrad>
                </Defs>
                <Rect
                  width="100%"
                  height="100%"
                  fill="url(#dashPipeGrad)"
                  rx="16"
                />
              </Svg>
              <Text style={S.cardLabel}>PIPELINE</Text>
              <Text style={S.cardBigNumber}>{fmtCurrency(pipVal)}</Text>
              <Text style={S.microLabel}>
                {pipeline.length} deal{pipeline.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* ── KPI Row ── */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
          <KpiChip
            label="Closed"
            value={deals}
            color={deals > 0 ? C.success : C.text}
          />
          <KpiChip
            label="Pending"
            value={pending}
            color={pending > 0 ? C.warning : C.textDim}
          />
          <KpiChip label="Clients" value={clients.length} />
          <KpiChip
            label="Tasks"
            value={tasks.length}
            color={tasks.length > 3 ? C.warning : C.text}
          />
        </View>

        {/* ── Outreach CTA ── */}
        {outreachCount > 0 && (
          <Pressable
            onPress={() => router.push("/outreach")}
            style={[
              S.card,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                marginBottom: 24,
                borderColor: C.primaryBorder,
              },
            ]}
          >
            <View style={S.iconBox}>
              <Plane size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: C.text, fontSize: 14, fontWeight: "700" }}
              >
                {outreachCount} message
                {outreachCount !== 1 ? "s" : ""} ready to send
              </Text>
              <Text style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>
                Flight Control · Tap to review
              </Text>
            </View>
            <View style={S.badge}>
              <Text style={S.badgeText}>{outreachCount}</Text>
            </View>
            <ChevronRight size={16} color={C.textDim} />
          </Pressable>
        )}

        {/* ── Pipeline Deals ── */}
        {pipeline.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader
              title="Active Pipeline"
              action="View All"
              onAction={() => router.push("/deals")}
            />
            <View style={{ gap: 8 }}>
              {pipeline.slice(0, 4).map((d) => {
                const sc = STAGE_COLORS[d.stage] ?? C.textDim;
                return (
                  <View key={d.id} style={[S.card, { padding: 14 }]}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: C.text,
                          fontSize: 14,
                          fontWeight: "600",
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {d.address ?? d.client_name ?? "Deal"}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Text
                          style={{
                            color: C.success,
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          {fmtCurrency(d.estimated_price)}
                        </Text>
                        <View
                          style={{
                            backgroundColor: sc + "22",
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: sc,
                              fontSize: 10,
                              fontWeight: "700",
                              textTransform: "uppercase",
                            }}
                          >
                            {d.stage}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {d.expected_close_date && (
                      <Text
                        style={{
                          color: C.textDim,
                          fontSize: 11,
                          marginTop: 5,
                        }}
                      >
                        Close:{" "}
                        {new Date(d.expected_close_date).toLocaleDateString(
                          "en-CA",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Tasks ── */}
        {tasks.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <SectionHeader title="Upcoming Tasks" />
            <View style={[S.card, { padding: 4 }]}>
              {tasks.slice(0, 4).map((t, i) => (
                <View
                  key={t.id}
                  style={[
                    {
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: 14,
                    },
                    i > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: C.cardBorder,
                    },
                  ]}
                >
                  <CheckSquare
                    size={15}
                    color={C.textDim}
                    style={{ marginTop: 1 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: C.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {t.title}
                    </Text>
                    {t.due_date && (
                      <Text
                        style={{
                          color: isOverdue(t.due_date) ? C.danger : C.textDim,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {isOverdue(t.due_date) ? "Overdue · " : ""}
                        {new Date(t.due_date).toLocaleDateString("en-CA", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                    )}
                  </View>
                  {t.priority === "high" && (
                    <View
                      style={{
                        backgroundColor: C.dangerDim,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        marginTop: 1,
                      }}
                    >
                      <Text
                        style={{
                          color: C.danger,
                          fontSize: 10,
                          fontWeight: "700",
                        }}
                      >
                        HIGH
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Quick Actions ── */}
        <View style={{ marginBottom: 8 }}>
          <SectionHeader title="Quick Actions" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/deals")}
              style={[S.quickAction]}
            >
              <View
                style={[S.quickActionIcon, { backgroundColor: C.primaryDim }]}
              >
                <TrendingUp size={20} color={C.primary} />
              </View>
              <Text style={S.quickActionLabel}>Add Deal</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/clients")}
              style={[S.quickAction]}
            >
              <View
                style={[S.quickActionIcon, { backgroundColor: C.cyanDim }]}
              >
                <Users size={20} color={C.cyan} />
              </View>
              <Text style={S.quickActionLabel}>Add Client</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/expenses")}
              style={[S.quickAction]}
            >
              <View
                style={[S.quickActionIcon, { backgroundColor: C.successDim }]}
              >
                <Target size={20} color={C.success} />
              </View>
              <Text style={S.quickActionLabel}>Scan Receipt</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Empty State ── */}
        {isEmpty && (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: C.primaryDim,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={32} color={C.primary} />
            </View>
            <Text
              style={{ color: C.text, fontSize: 18, fontWeight: "700" }}
            >
              Ready for takeoff
            </Text>
            <Text
              style={{
                color: C.textDim,
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Add your first deal or client{"\n"}to start tracking your runway
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  chip: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingVertical: 12,
    alignItems: "center",
    gap: 3,
  },
  chipValue: {
    fontSize: 22,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.5,
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  greeting: {
    fontSize: 13,
    fontWeight: "600",
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  cardBigNumber: {
    fontSize: 26,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  microLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: "500",
    marginTop: 3,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.textFaint,
    overflow: "hidden",
    marginTop: 10,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.3,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: C.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    backgroundColor: C.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  quickAction: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    alignItems: "center",
    gap: 10,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textMuted,
    textAlign: "center",
  },
});
