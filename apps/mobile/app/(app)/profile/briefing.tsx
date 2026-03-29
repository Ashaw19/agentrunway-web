/**
 * Full Morning Briefing screen — expanded version of Today's Focus.
 * Shows all briefing items organized by severity with actionable context.
 */

import { useMemo, useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import { useDataStore } from "@/stores/data-store";
import type { BriefingItem } from "@/stores/data-store";
import { BriefingRow } from "@/components/BriefingRow";
import {
  useColors,
  Space,
  Radius,
  Type,
  fmtCurrency,
  dayOfYear,
} from "@/lib/theme";
import {
  Sunrise,
  AlertTriangle,
  Eye,
  CalendarClock,
  CheckCircle2,
  TrendingUp,
  Briefcase,
  Users,
} from "lucide-react-native";

const SEVERITY_ORDER = { urgent: 0, attention: 1, upcoming: 2 } as const;

function groupBySeverity(items: BriefingItem[]) {
  const groups: Record<string, BriefingItem[]> = {
    urgent: [],
    attention: [],
    upcoming: [],
  };
  for (const item of items) {
    groups[item.severity]?.push(item);
  }
  return groups;
}

const SEVERITY_META = {
  urgent: {
    label: "Needs Attention",
    icon: AlertTriangle,
    color: "#EF4444",
    bg: "rgba(239,68,68,0.08)",
  },
  attention: {
    label: "Worth a Look",
    icon: Eye,
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
  },
  upcoming: {
    label: "Coming Up",
    icon: CalendarClock,
    color: "#3B5EF6",
    bg: "rgba(59,94,246,0.08)",
  },
} as const;

export default function BriefingScreen() {
  const router = useRouter();
  const c = useColors();
  const {
    todayBriefing,
    clients,
    pipeline,
    tasks,
    fetchAll,
    smartListCounts,
    runwayScore,
    ytdGci,
    ytdDealCount,
    settings,
  } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);

  const briefing = useMemo(
    () => todayBriefing(),
    [clients, pipeline, tasks]
  );
  const groups = useMemo(() => groupBySeverity(briefing), [briefing]);
  const counts = useMemo(() => smartListCounts(), [clients, pipeline]);
  const score = runwayScore();
  const gci = ytdGci();
  const deals = ytdDealCount();
  const goalGci = settings?.goal_gci ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

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

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const dateStr = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Progress through the year
  const doy = dayOfYear();
  const yearProgress = Math.round((doy / 365) * 100);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.primary}
        />
      }
    >
      {/* ── Header ── */}
      <View
        style={{
          paddingHorizontal: Space.xl,
          paddingTop: Space.lg,
          paddingBottom: Space.xl,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Space.sm,
            marginBottom: Space.sm,
          }}
        >
          <Sunrise size={20} color="#F59E0B" />
          <Text style={{ ...Type.caption, color: c.textDim }}>
            Your {timeOfDay} briefing
          </Text>
        </View>
        <Text style={{ ...Type.hero, color: c.text }}>{dateStr}</Text>
      </View>

      {/* ── Quick Stats Row ── */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: Space.xl,
          gap: Space.md,
          marginBottom: Space.xxl,
        }}
      >
        <QuickStat
          icon={<TrendingUp size={14} color={c.gold} />}
          label="Score"
          value={String(score)}
          c={c}
        />
        <QuickStat
          icon={<Briefcase size={14} color={c.primaryLight} />}
          label="YTD GCI"
          value={fmtCurrency(gci)}
          c={c}
        />
        <QuickStat
          icon={<Users size={14} color={c.cyan} />}
          label="Deals"
          value={String(deals)}
          c={c}
        />
      </View>

      {/* ── Goal pace indicator ── */}
      {goalGci > 0 && (
        <View
          style={{
            marginHorizontal: Space.xl,
            marginBottom: Space.xxl,
            backgroundColor: c.card,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: c.cardBorder,
            padding: Space.md,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: Space.sm,
            }}
          >
            <Text style={{ ...Type.caption, color: c.textDim }}>
              Goal progress · Day {doy}/365
            </Text>
            <Text
              style={{ ...Type.caption, color: c.primary, fontWeight: "700" }}
            >
              {Math.round((gci / goalGci) * 100)}% of goal
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: c.divider,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 6,
                borderRadius: 3,
                width:
                  `${Math.min(Math.round((gci / goalGci) * 100), 100)}%` as DimensionValue,
                backgroundColor:
                  gci / goalGci >= doy / 365 ? "#10B981" : "#F59E0B",
              }}
            />
          </View>
          <Text
            style={{
              ...Type.micro,
              color: c.textDim,
              marginTop: Space.xs,
            }}
          >
            {gci / goalGci >= doy / 365
              ? "Ahead of pace"
              : `${fmtCurrency(Math.max(0, goalGci * (doy / 365) - gci))} behind pace`}
          </Text>
        </View>
      )}

      {/* ── Smart List Summary ── */}
      {(counts.overdueFollowups > 0 ||
        counts.uncontactedLeads > 0 ||
        counts.hotPipeline > 0) && (
        <View
          style={{
            marginHorizontal: Space.xl,
            marginBottom: Space.xxl,
          }}
        >
          <Text
            style={{
              ...Type.label,
              color: c.textMuted,
              marginBottom: Space.md,
            }}
          >
            AT A GLANCE
          </Text>
          <View style={{ flexDirection: "row", gap: Space.sm, flexWrap: "wrap" }}>
            {counts.overdueFollowups > 0 && (
              <GlancePill
                count={counts.overdueFollowups}
                label="overdue follow-ups"
                color="#EF4444"
              />
            )}
            {counts.uncontactedLeads > 0 && (
              <GlancePill
                count={counts.uncontactedLeads}
                label="new leads"
                color="#6366F1"
              />
            )}
            {counts.hotPipeline > 0 && (
              <GlancePill
                count={counts.hotPipeline}
                label="hot deals"
                color="#F59E0B"
              />
            )}
          </View>
        </View>
      )}

      {/* ── Briefing items by severity ── */}
      {briefing.length > 0 ? (
        (["urgent", "attention", "upcoming"] as const).map((severity) => {
          const items = groups[severity];
          if (!items || items.length === 0) return null;
          const meta = SEVERITY_META[severity];
          const Icon = meta.icon;

          return (
            <View
              key={severity}
              style={{
                marginHorizontal: Space.xl,
                marginBottom: Space.xl,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space.sm,
                  marginBottom: Space.md,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: meta.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={12} color={meta.color} />
                </View>
                <Text
                  style={{
                    ...Type.label,
                    color: meta.color,
                  }}
                >
                  {meta.label.toUpperCase()}
                </Text>
                <View
                  style={{
                    backgroundColor: meta.bg,
                    paddingHorizontal: Space.sm,
                    paddingVertical: 2,
                    borderRadius: Radius.sm,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: meta.color,
                    }}
                  >
                    {items.length}
                  </Text>
                </View>
              </View>
              {items.map((item) => (
                <BriefingRow
                  key={item.id}
                  item={item}
                  onPress={() => handleBriefingPress(item)}
                />
              ))}
            </View>
          );
        })
      ) : (
        <View
          style={{
            marginHorizontal: Space.xl,
            alignItems: "center",
            paddingVertical: Space.xxl * 2,
          }}
        >
          <CheckCircle2 size={48} color={c.success} />
          <Text
            style={{
              ...Type.h3,
              color: c.text,
              marginTop: Space.lg,
            }}
          >
            All clear
          </Text>
          <Text
            style={{
              ...Type.body,
              color: c.textDim,
              textAlign: "center",
              marginTop: Space.sm,
              paddingHorizontal: Space.xxl,
            }}
          >
            No urgent items right now. Check back later or keep building your
            pipeline.
          </Text>
        </View>
      )}

      {/* ── Footer tip ── */}
      <View
        style={{
          marginHorizontal: Space.xl,
          marginTop: Space.lg,
          backgroundColor: c.primaryDim,
          borderRadius: Radius.md,
          padding: Space.md,
          borderWidth: 1,
          borderColor: c.primaryBorder,
        }}
      >
        <Text
          style={{
            ...Type.caption,
            color: c.primaryLight,
            textAlign: "center",
          }}
        >
          Your briefing updates throughout the day as you log activities and
          close deals. Pull down to refresh.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Small Components ──

function QuickStat({
  icon,
  label,
  value,
  c,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: c.cardBorder,
        padding: Space.md,
        alignItems: "center",
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: c.text,
          marginTop: Space.xs,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={{ ...Type.micro, color: c.textDim }}>{label}</Text>
    </View>
  );
}

function GlancePill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space.xs,
        backgroundColor: color + "15",
        paddingHorizontal: Space.md,
        paddingVertical: Space.xs + 1,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: color + "25",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "800", color }}>{count}</Text>
      <Text style={{ fontSize: 12, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}
