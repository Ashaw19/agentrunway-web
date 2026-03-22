import { useEffect } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import { useState } from "react";

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const {
    fetchAll,
    loading,
    settings,
    transactions,
    pipeline,
    tasks,
    ytdGci,
    ytdDealCount,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const gci = ytdGci();
  const deals = ytdDealCount();
  const pendingDeals = transactions.filter((t) => t.status === "pending").length;
  const pipelineCount = pipeline.length;
  const pipelineValue = pipeline.reduce((s, d) => s + d.estimated_price, 0);
  const nextTask = tasks.find((t) => !t.completed_at);
  const goalGci = settings?.goal_gci ?? 0;
  const goalPct = goalGci > 0 ? Math.round((gci / goalGci) * 100) : 0;
  const displayName = settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        <Text style={{ fontSize: 28, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 }}>
          Hey, {displayName}
        </Text>

        {/* GCI Hero */}
        <View
          style={{
            backgroundColor: "#1A1A2E",
            borderRadius: 16,
            padding: 24,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#2D2D44",
          }}
        >
          <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 }}>
            YTD GCI
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: 42, fontWeight: "800", marginTop: 4 }}>
            {fmtCurrency(gci)}
          </Text>
          {goalGci > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <View style={{ width: 120, height: 6, borderRadius: 3, backgroundColor: "#2D2D44" }}>
                <View
                  style={{
                    width: `${Math.min(goalPct, 100)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: goalPct >= 100 ? "#10B981" : "#6366F1",
                  }}
                />
              </View>
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{goalPct}% of goal</Text>
            </View>
          )}
        </View>

        {/* KPI Cards */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <KpiCard label="Closed Deals" value={String(deals)} />
          <KpiCard label="Pending" value={String(pendingDeals)} accent="#F59E0B" />
          <KpiCard label="Pipeline" value={String(pipelineCount)} />
        </View>

        {/* Pipeline Value */}
        {pipelineValue > 0 && (
          <View
            style={{
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: "#2D2D44",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>
                Pipeline Value
              </Text>
              <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 2 }}>
                {fmtCurrency(pipelineValue)}
              </Text>
            </View>
            <Text style={{ color: "#6366F1", fontSize: 13, fontWeight: "600" }}>
              {pipelineCount} deal{pipelineCount !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {/* Next Task */}
        {nextTask && (
          <View
            style={{
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: "#2D2D44",
            }}
          >
            <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600", textTransform: "uppercase", marginBottom: 6 }}>
              Next Task
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
              {nextTask.title}
            </Text>
            {nextTask.due_date && (
              <Text style={{ color: "#6366F1", fontSize: 12, marginTop: 4 }}>
                Due: {new Date(nextTask.due_date).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({
  label,
  value,
  accent = "#FFFFFF",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#1A1A2E",
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: "#2D2D44",
      }}
    >
      <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: accent, fontSize: 22, fontWeight: "700", marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}
