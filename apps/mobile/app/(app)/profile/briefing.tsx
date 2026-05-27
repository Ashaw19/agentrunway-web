/**
 * Full Morning Briefing screen — expanded version of Today's Focus.
 * Shows all briefing items organized by severity with actionable context.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Animated,
  ActivityIndicator,
  type DimensionValue,
} from "react-native";
import { useRouter } from "expo-router";
import { useDataStore } from "@/stores/data-store";
import type { BriefingItem } from "@/stores/data-store";
import { BriefingRow } from "@/components/BriefingRow";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/useT";
import {
  useColors,
  Space,
  Radius,
  Type,
  fmtCurrency,
  fmtCompact,
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
  Sparkles,
  ChevronDown,
} from "lucide-react-native";

// ── AI Briefing Types & Config ────────────────────────────────────────────────

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

interface AIBriefingContent {
  greeting: string;
  priorities: string[];
  alerts: string[];
  encouragement: string;
}

interface AIBriefingResponse {
  briefing: AIBriefingContent;
  generated_at: string;
  source: string;
}

const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;

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
    labelKey: "briefing.needsAttention",
    icon: AlertTriangle,
    color: "#EF4444",
    bg: "rgba(239,68,68,0.08)",
  },
  attention: {
    labelKey: "briefing.worthALook",
    icon: Eye,
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
  },
  upcoming: {
    labelKey: "briefing.comingUp",
    icon: CalendarClock,
    color: "#3B5EF6",
    bg: "rgba(59,94,246,0.08)",
  },
} as const;

// ── Session-level cache for AI briefing (survives re-renders, resets on app restart) ──
let _aiBriefingCache: AIBriefingContent | null = null;
let _aiBriefingFetched = false;

function useAIBriefing() {
  const [data, setData] = useState<AIBriefingContent | null>(_aiBriefingCache);
  const [loading, setLoading] = useState(!_aiBriefingFetched);

  useEffect(() => {
    if (_aiBriefingFetched) return;
    _aiBriefingFetched = true;

    (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) { setLoading(false); return; }

        const res = await fetch(`${API_URL}/api/briefing`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) { setLoading(false); return; }

        const json: AIBriefingResponse = await res.json();
        _aiBriefingCache = json.briefing;
        setData(json.briefing);
      } catch {
        // Silently fail — card just won't show
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { data, loading };
}

// ── AI Briefing Card ──────────────────────────────────────────────────────────

function AIBriefingCard({ c }: { c: ReturnType<typeof useColors> }) {
  const { data, loading } = useAIBriefing();
  const [collapsed, setCollapsed] = useState(false);
  const animHeight = useRef(new Animated.Value(1)).current;

  const toggle = useCallback(() => {
    Animated.timing(animHeight, {
      toValue: collapsed ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setCollapsed((v) => !v);
  }, [collapsed, animHeight]);

  // Loading skeleton
  if (loading) {
    return (
      <View
        style={{
          marginHorizontal: Space.xl,
          marginBottom: Space.xl,
          backgroundColor: "rgba(99,102,241,0.06)",
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: "rgba(99,102,241,0.15)",
          padding: Space.lg,
          gap: Space.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={{ ...Type.caption, color: c.primaryLight }}>
            Preparing your AI briefing...
          </Text>
        </View>
        {[80, 60, 70].map((w, i) => (
          <View
            key={i}
            style={{
              height: 12,
              width: `${w}%` as DimensionValue,
              backgroundColor: c.divider,
              borderRadius: 6,
            }}
          />
        ))}
      </View>
    );
  }

  // No data — hidden gracefully
  if (!data) return null;

  return (
    <View
      style={{
        marginHorizontal: Space.xl,
        marginBottom: Space.xl,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.20)",
        overflow: "hidden",
      }}
    >
      {/* Gradient-like tinted background */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(99,102,241,0.06)",
        }}
      />

      {/* Header — always visible */}
      <Pressable
        onPress={toggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: Space.lg,
          paddingVertical: Space.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
          <Sparkles size={16} color={c.primary} />
          <Text style={{ ...Type.label, color: c.primary, fontWeight: "700" }}>
            AI Morning Briefing
          </Text>
        </View>
        <Animated.View
          style={{
            transform: [
              {
                rotate: animHeight.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["180deg", "0deg"],
                }),
              },
            ],
          }}
        >
          <ChevronDown size={16} color={c.primaryLight} />
        </Animated.View>
      </Pressable>

      {/* Collapsible body */}
      <Animated.View
        style={{
          maxHeight: animHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 800],
          }),
          opacity: animHeight,
          overflow: "hidden",
        }}
      >
        <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.lg, gap: Space.md }}>
          {/* Greeting */}
          <Text style={{ ...Type.body, color: c.text, fontWeight: "600" }}>
            {data.greeting}
          </Text>

          {/* Priorities */}
          {data.priorities.length > 0 && (
            <View style={{ gap: Space.xs }}>
              <Text style={{ ...Type.label, color: c.textMuted, marginBottom: 2 }}>
                PRIORITIES
              </Text>
              {data.priorities.map((p, i) => (
                <Text key={i} style={{ ...Type.body, color: c.text }}>
                  {i + 1}. {p}
                </Text>
              ))}
            </View>
          )}

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <View
              style={{
                backgroundColor: "rgba(245,158,11,0.10)",
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.25)",
                padding: Space.md,
                gap: Space.xs,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}>
                <AlertTriangle size={13} color="#F59E0B" />
                <Text style={{ ...Type.label, color: "#F59E0B" }}>ALERTS</Text>
              </View>
              {data.alerts.map((a, i) => (
                <Text key={i} style={{ ...Type.caption, color: c.text }}>
                  {a}
                </Text>
              ))}
            </View>
          )}

          {/* Encouragement */}
          <Text style={{ ...Type.caption, color: c.primaryLight, fontStyle: "italic" }}>
            {data.encouragement}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function BriefingScreen() {
  const router = useRouter();
  const c = useColors();
  const { t } = useT("profile");
  const {
    todayBriefing,
    clients,
    pipeline,
    tasks,
    briefings,
    fetchAll,
    fetchBriefing,
    smartListCounts,
    runwayScore,
    ytdGci,
    ytdDealCount,
    settings,
  } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);

  const briefing = useMemo(
    () => todayBriefing(),
    // `briefings` is the engine-fetched cache; include it so the memo
    // recomputes when /api/mobile/briefing resolves (audit red flag #3).
    [clients, pipeline, tasks, briefings, todayBriefing]
  );
  const groups = useMemo(() => groupBySeverity(briefing), [briefing]);
  const counts = useMemo(() => smartListCounts(), [clients, pipeline]);
  const score = runwayScore();
  const gci = ytdGci();
  const deals = ytdDealCount();
  const goalGci = settings?.goal_gci ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh both the local data and the engine-emitted briefing in
    // parallel — the engine fetch is fire-and-forget on cold start but
    // explicit on pull-to-refresh. See audit red flag #3.
    await Promise.all([fetchAll(), fetchBriefing()]);
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
    hour < 12 ? t("briefing.morning") : hour < 17 ? t("briefing.afternoon") : t("briefing.evening");
  const dateStr = now.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Progress through the year
  const doy = dayOfYear();
  const yearProgress = Math.round((doy / daysInYear(new Date().getFullYear())) * 100);

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
            {t("briefing.greeting", { timeOfDay })}
          </Text>
        </View>
        <Text style={{ ...Type.hero, color: c.text }}>{dateStr}</Text>
      </View>

      {/* ── AI Morning Briefing ── */}
      <AIBriefingCard c={c} />

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
          label={t("briefing.score")}
          value={String(score)}
          c={c}
        />
        <QuickStat
          icon={<Briefcase size={14} color={c.primaryLight} />}
          label={t("briefing.ytdGci")}
          value={fmtCompact(gci)}
          c={c}
        />
        <QuickStat
          icon={<Users size={14} color={c.cyan} />}
          label={t("briefing.deals")}
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
              {t("briefing.goalProgress", { day: doy })}
            </Text>
            <Text
              style={{ ...Type.caption, color: c.primary, fontWeight: "700" }}
            >
              {t("briefing.percentOfGoal", { percent: Math.round((gci / goalGci) * 100) })}
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
                  gci / goalGci >= doy / daysInYear(new Date().getFullYear()) ? "#10B981" : "#F59E0B",
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
            {gci / goalGci >= doy / daysInYear(new Date().getFullYear())
              ? t("briefing.aheadOfPace")
              : t("briefing.behindPace", { amount: fmtCompact(Math.max(0, goalGci * (doy / daysInYear(new Date().getFullYear())) - gci)) })}
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
            {t("briefing.atAGlance")}
          </Text>
          <View style={{ flexDirection: "row", gap: Space.sm, flexWrap: "wrap" }}>
            {counts.overdueFollowups > 0 && (
              <GlancePill
                count={counts.overdueFollowups}
                label={t("briefing.overdueFollowUps")}
                color="#EF4444"
              />
            )}
            {counts.uncontactedLeads > 0 && (
              <GlancePill
                count={counts.uncontactedLeads}
                label={t("briefing.newLeads")}
                color="#6366F1"
              />
            )}
            {counts.hotPipeline > 0 && (
              <GlancePill
                count={counts.hotPipeline}
                label={t("briefing.hotDeals")}
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
                  {t(meta.labelKey).toUpperCase()}
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
            {t("briefing.allClear")}
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
            {t("briefing.noUrgentItems")}
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
          {t("briefing.footerTip")}
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
