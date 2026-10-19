/**
 * Deals Screen — Premium, theme-aware pipeline & transaction tracker.
 * Uses shared UI components, design tokens, and subtle animations.
 *
 * Sprint 3: Search, tappable cards, detail sheets, stage advancement, FlatList.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  type DimensionValue,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect,
} from "react-native-svg";
import { Search } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useDataStore,
  type PipelineDeal,
  type PipelineDealCloseInput,
  type Transaction,
  type TransactionInput,
} from "@/stores/data-store";
import type { CaptureProposal } from "@agent-runway/core/lib/capture/types";
import { VoiceCaptureButton } from "@/components/voice/VoiceCaptureButton";
import { VoiceCaptureSheet } from "@/components/voice/VoiceCaptureSheet";
import {
  useColors,
  useTheme,
  shadows,
  gradients,
  Space,
  Radius,
  Type,
  Motion,
  STAGE_COLORS,
  fmtCurrency,
  fmtCompact,
} from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTranslation } from "react-i18next";
import { validateTransaction, parsePercent, parseDollar, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";
import { PIPELINE_STAGE_DEFAULTS, computeGCI } from "@agent-runway/core/types/database";
import { localISODate } from "@agent-runway/core/lib/local-date";
import {
  OPPORTUNITY_LOSS_REASONS,
  lossReasonLabel,
  type OpportunityLossReason,
} from "@agent-runway/core/lib/opportunity-loss-reasons";
import { DateField, formatDateLabel } from "@/components/ui/DateField";
import { ClientNameField } from "@/components/ClientNameField";

type Tab = "pipeline" | "closed" | "pending";

const STAGE_ORDER = ["lead", "showing", "offer", "conditional", "firm", "closed"] as const;

// Canonical default-probability map shared with the pipeline-forecast engine.
// Sourced from `@agent-runway/core/types/database`'s `PIPELINE_STAGE_DEFAULTS`
// so mobile cannot silently drift from web. See audit red flag #4.
const DEFAULT_PROBABILITIES: Record<string, number> = PIPELINE_STAGE_DEFAULTS;

// ── Deals Skeleton ──────────────────────────────────────────────────────────

function DealsSkeleton() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: Space.xl, paddingTop: Space.xl }}>
      {/* Header row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={100} height={32} borderRadius={Radius.sm} />
        <Skeleton width={72} height={40} borderRadius={Radius.md} />
      </View>
      {/* Search bar */}
      <Skeleton width="100%" height={48} borderRadius={Radius.md} style={{ marginTop: Space.lg }} />
      {/* Stat pills row */}
      <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg }}>
        <Skeleton width={0} height={52} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={52} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={52} borderRadius={Radius.md} style={{ flex: 1 }} />
      </View>
      {/* Tab row */}
      <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg }}>
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
      </View>
      {/* Card skeletons */}
      {[0, 1, 2, 3].map((i) => (
        <Skeleton
          key={i}
          width="100%"
          height={120}
          borderRadius={Radius.lg}
          style={{ marginTop: Space.sm }}
        />
      ))}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function DealsScreen() {
  const {
    transactions,
    pipeline,
    fetchAll,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    advancePipelineStage,
    updatePipelineDeal,
    closePipelineDeal,
    markPipelineDealLost,
    isLoading,
  } = useDataStore();
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useTranslation("deals");
  const { t: tCommon } = useTranslation("common");

  const [tab, setTab] = useState<Tab>("pipeline");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  // Detail sheet state
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Voice note: record → review the proposed writes → confirm
  const [capture, setCapture] = useState<CaptureProposal | null>(null);

  // Initial load
  useEffect(() => {
    if (transactions.length === 0 && pipeline.length === 0) fetchAll();
  }, []);

  // Re-fetch on focus
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ── Filtering & sorting ──
  const q = search.trim().toLowerCase();

  const filteredPipeline = useMemo(() => {
    let items = [...pipeline];

    // Filter by search
    if (q) {
      items = items.filter(
        (d) =>
          (d.address && d.address.toLowerCase().includes(q)) ||
          (d.client_name && d.client_name.toLowerCase().includes(q))
      );
    }

    // Sort by composite score: probability * estimated_price DESC
    items.sort((a, b) => {
      const probA = a.probability_override ?? DEFAULT_PROBABILITIES[a.stage] ?? 0.5;
      const probB = b.probability_override ?? DEFAULT_PROBABILITIES[b.stage] ?? 0.5;
      return probB * b.estimated_price - probA * a.estimated_price;
    });

    return items;
  }, [pipeline, q]);

  const filteredTransactions = useMemo(() => {
    let items = transactions;
    if (q) {
      items = items.filter(
        (t) =>
          (t.address && t.address.toLowerCase().includes(q)) ||
          (t.client_name && t.client_name.toLowerCase().includes(q))
      );
    }
    return items;
  }, [transactions, q]);

  const closed = useMemo(() => filteredTransactions.filter((t) => t.status === "closed"), [filteredTransactions]);
  const pending = useMemo(() => filteredTransactions.filter((t) => t.status === "pending"), [filteredTransactions]);

  // Stats always from unfiltered data. GCI per deal is core computeGCI;
  // `pipeline` holds active deals only (the store filters closed and lost).
  const totalGci = transactions
    .filter((t) => t.status === "closed")
    .reduce((s, t) => s + computeGCI(t), 0);
  const pipelineValue = pipeline.reduce((s, d) => s + d.estimated_price, 0);
  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  // ── List data for current tab ──
  const listData: (PipelineDeal | Transaction)[] =
    tab === "pipeline" ? filteredPipeline : tab === "closed" ? closed : pending;

  const renderItem = useCallback(
    ({ item }: { item: PipelineDeal | Transaction }) => {
      if ("stage" in item) {
        return <PipelineCard deal={item} onPress={() => setSelectedDeal(item)} />;
      }
      return <TransactionCard tx={item} onPress={() => setSelectedTx(item)} />;
    },
    []
  );

  const keyExtractor = useCallback((item: PipelineDeal | Transaction) => item.id, []);

  const ListHeader = useMemo(() => {
    if (tab !== "pipeline" || filteredPipeline.length === 0) return null;
    return (
      <Card variant="default">
        <Text style={{ ...Type.label, color: c.textDim }}>{t("stages.breakdown")}</Text>
        <View
          style={{
            flexDirection: "row",
            gap: Space.sm,
            marginTop: Space.sm,
            flexWrap: "wrap",
          }}
        >
          {STAGE_ORDER.map((stage) => {
            const count = pipeline.filter((d) => d.stage === stage).length;
            if (count === 0) return null;
            const stageColor = STAGE_COLORS[stage] ?? c.textDim;
            return (
              <Badge
                key={stage}
                label={`${t(`stages.${stage}`)} \u00b7 ${count}`}
                color={stageColor}
                size="sm"
              />
            );
          })}
        </View>
      </Card>
    );
  }, [tab, filteredPipeline.length, pipeline, c.textDim]);

  const ListEmpty = useMemo(() => {
    if (q) {
      return (
        <EmptyState
          icon="search-outline"
          title={t("searchEmpty.title")}
          subtitle={t("searchEmpty.subtitle", { query: search.trim() })}
        />
      );
    }
    if (tab === "pipeline") {
      return (
        <EmptyState
          icon="trending-up-outline"
          title={t("pipeline.empty.title")}
          subtitle={t("pipeline.empty.subtitle")}
          actionLabel={t("pipeline.empty.actionLabel")}
          onAction={() => setShowAdd(true)}
        />
      );
    }
    if (tab === "closed") {
      return (
        <EmptyState
          icon="checkmark-circle-outline"
          title={t("closedEmpty.title")}
          subtitle={t("closedEmpty.subtitle")}
        />
      );
    }
    return (
      <EmptyState
        icon="time-outline"
        title={t("pendingEmpty.title")}
        subtitle={t("pendingEmpty.subtitle")}
      />
    );
  }, [tab, q, search]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading Skeleton */}
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg }]}>
          <DealsSkeleton />
        </View>
      )}

      {/* ── Header ── */}
      <View style={{ paddingHorizontal: Space.xl, paddingTop: Space.xl, paddingBottom: Space.xs }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ ...Type.hero, color: c.text }}>{t("title")}</Text>
          <Button
            label={tCommon("actions.add")}
            icon="add"
            variant="primary"
            onPress={() => setShowAdd(true)}
          />
        </View>

        {/* ── Search Bar ── */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: c.card,
              borderColor: c.cardBorder,
              ...sh.card,
            },
          ]}
        >
          <Search size={18} color={c.textDim} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("search.placeholder")}
            placeholderTextColor={c.textDim}
            style={[Type.body, styles.searchInput, { color: c.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={Space.sm}>
              <Ionicons name="close-circle" size={20} color={c.textDim} />
            </Pressable>
          )}
        </View>

        {/* Summary stats */}
        <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg }}>
          <StatPill label={t("stats.gciClosed")} value={fmtCompact(totalGci)} color={c.success} />
          <StatPill label={t("stats.pipelineValue")} value={fmtCompact(pipelineValue)} color={c.primary} />
          <StatPill label={t("stats.pendingCount")} value={String(pendingCount)} color={c.warning} />
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg, marginBottom: Space.xs }}>
          {(
            [
              { key: "pipeline", label: t("tabs.pipeline"), count: pipeline.length },
              { key: "closed", label: t("tabs.closed"), count: transactions.filter((tx) => tx.status === "closed").length },
              { key: "pending", label: t("tabs.pending"), count: pendingCount },
            ] as { key: Tab; label: string; count: number }[]
          ).map((t) => {
            const isActive = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  minHeight: 44,
                  borderRadius: Radius.md,
                  backgroundColor: isActive ? c.primaryDim : c.card,
                  borderWidth: 1,
                  borderColor: isActive ? c.primaryBorder : c.cardBorder,
                }}
              >
                <Text
                  style={{
                    ...Type.caption,
                    fontWeight: "700",
                    color: isActive ? c.primary : c.textDim,
                  }}
                >
                  {t.label}
                </Text>
                {t.count > 0 && (
                  <View
                    style={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: Radius.pill,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: Space.xs,
                      backgroundColor: isActive ? c.primary : c.textFaint,
                    }}
                  >
                    <Text style={{ ...Type.micro, color: "#fff" }}>{t.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Deal List (FlatList) ── */}
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{
          padding: Space.xl,
          paddingTop: Space.md,
          paddingBottom: 120,
          gap: Space.sm,
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      />

      {/* ── Modals / Sheets ── */}
      <AddTransactionModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={async (tx) => {
          const ok = await addTransaction(tx);
          if (ok) setShowAdd(false);
          return ok;
        }}
      />

      <DealDetailSheet
        deal={selectedDeal}
        onClose={() => setSelectedDeal(null)}
        onAdvance={async (deal) => {
          const idx = STAGE_ORDER.indexOf(deal.stage);
          const nextStage = STAGE_ORDER[idx + 1];
          // Never a bare move to Closed: that is the Close deal form.
          if (nextStage && nextStage !== "closed") {
            await advancePipelineStage(deal.id, nextStage);
            // Update local selected deal to reflect new stage
            setSelectedDeal((prev) =>
              prev ? { ...prev, stage: nextStage } : null
            );
          }
        }}
        onCloseDeal={closePipelineDeal}
        onMarkLost={(deal, reason, notes) => markPipelineDealLost(deal.id, reason, notes)}
        onUpdate={async (dealId, updates) => {
          const ok = await updatePipelineDeal(dealId, updates);
          if (ok) {
            setSelectedDeal((prev) =>
              prev && prev.id === dealId ? { ...prev, ...updates } : prev
            );
          }
          return ok;
        }}
      />

      <TransactionDetailSheet
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
        onUpdate={async (id, input) => {
          const ok = await updateTransaction(id, input);
          if (ok) setSelectedTx((prev) => (prev && prev.id === id ? { ...prev, ...input } : prev));
          return ok;
        }}
        onDelete={deleteTransaction}
      />
      {/* ── Voice note ── */}
      {!selectedDeal && !selectedTx && !showAdd && <VoiceCaptureButton onProposal={setCapture} />}
      <VoiceCaptureSheet proposal={capture} onClose={() => setCapture(null)} />
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const c = useColors();
  const { mode } = useTheme();
  const dark = mode === "dark";

  return (
    <View
      style={{
        flex: 1,
        borderRadius: Radius.md,
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={
          dark
            ? [color + "1A", color + "08"] as [string, string]
            : [color + "14", color + "06"] as [string, string]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: Space.sm,
          paddingHorizontal: Space.sm,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: color + "66",
        }}
      >
        <Text style={{ ...Type.label, color: c.textDim, fontSize: 9 }}>
          {label}
        </Text>
        <Text
          style={{
            ...Type.bodyBold,
            fontWeight: "800",
            color,
            marginTop: 2,
            letterSpacing: -0.3,
          }}
        >
          {value}
        </Text>
      </LinearGradient>
    </View>
  );
}

function PipelineCard({ deal, onPress }: { deal: PipelineDeal; onPress: () => void }) {
  const c = useColors();
  const { mode } = useTheme();
  const { t } = useTranslation("deals");
  const sh = shadows(mode);
  const scale = useRef(new Animated.Value(1)).current;

  const sc = STAGE_COLORS[deal.stage] ?? c.textDim;
  const defaultProb =
    { lead: 10, showing: 25, offer: 50, conditional: 75, firm: 90, closed: 100 }[deal.stage] ?? 50;
  const prob =
    deal.probability_override != null
      ? Math.round(deal.probability_override * 100)
      : defaultProb;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: Motion.pressScale,
      duration: Motion.durationFast,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: Motion.durationFast,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
              flexDirection: "row",
            },
            sh.card,
          ]}
        >
          {/* Left accent bar with gradient tint */}
          <View style={{ width: Space.xs }}>
            <LinearGradient
              colors={[sc, sc + "66"] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>

          {/* Subtle stage-colored gradient tint on left edge */}
          <LinearGradient
            colors={[sc + "0C", "transparent"] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: "absolute",
              top: 0,
              left: Space.xs,
              bottom: 0,
              width: 80,
            }}
          />

          <View style={{ flex: 1, padding: Space.lg }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1, marginRight: Space.md }}>
                <Text
                  style={{ ...Type.bodyBold, color: c.text }}
                  numberOfLines={1}
                >
                  {deal.address || deal.client_name || t("pipeline.untitledDeal")}
                </Text>
                {!!deal.client_name && !!deal.address && (
                  <Text
                    style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {deal.client_name}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: Space.xs }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: c.success,
                    letterSpacing: -0.3,
                  }}
                >
                  {fmtCompact(deal.estimated_price)}
                </Text>
                <Badge
                  label={deal.stage.toUpperCase()}
                  color={sc}
                  size="sm"
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: Space.lg,
                marginTop: Space.md,
                alignItems: "center",
              }}
            >
              {deal.expected_close_date && (
                <Text style={{ ...Type.caption, color: c.textDim }}>
                  {t("pipeline.close")}{" "}
                  {/* date-only column — anchor at local noon or it renders the previous day */}
                  {new Date(deal.expected_close_date + "T12:00:00").toLocaleDateString(
                    "en-CA",
                    { month: "short", day: "numeric" }
                  )}
                </Text>
              )}
              <Text style={{ ...Type.caption, color: sc, fontWeight: "600" }}>
                {t("pipeline.probability", { pct: prob })}
              </Text>
            </View>

            {/* Probability bar */}
            <View
              style={{
                height: 4,
                borderRadius: Radius.pill,
                backgroundColor: c.textFaint,
                overflow: "hidden",
                marginTop: Space.sm,
              }}
            >
              <View
                style={{
                  height: 4,
                  borderRadius: Radius.pill,
                  width: `${prob}%` as DimensionValue,
                  backgroundColor: sc,
                }}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function TransactionCard({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  const c = useColors();
  const { mode } = useTheme();
  const { t } = useTranslation("deals");
  const sh = shadows(mode);
  const scale = useRef(new Animated.Value(1)).current;

  const gci = computeGCI(tx);
  const isPending = tx.status === "pending";
  const accentColor = isPending ? c.warning : c.success;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: Motion.pressScale,
      duration: Motion.durationFast,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: Motion.durationFast,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
            },
            sh.card,
          ]}
        >
          {/* SVG gradient background */}
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id={`txGrad${tx.id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={accentColor} stopOpacity="0.06" />
                <Stop offset="1" stopColor={c.bg} stopOpacity="0" />
              </SvgGrad>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#txGrad${tx.id})`} />
          </Svg>

          <View style={{ padding: Space.lg }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1, marginRight: Space.md }}>
                <Text
                  style={{ ...Type.bodyBold, color: c.text }}
                  numberOfLines={1}
                >
                  {tx.address || tx.client_name || t("transaction.transactionLabel")}
                </Text>
                {!!tx.client_name && !!tx.address && (
                  <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}>
                    {tx.client_name}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: Space.xs }}>
                <Text
                  style={{
                    ...Type.h3,
                    fontWeight: "800",
                    color: accentColor,
                  }}
                >
                  {fmtCurrency(gci)}
                </Text>
                <Text style={{ ...Type.micro, color: c.textDim }}>
                  {t("transaction.gci")} {"\u00b7"} {tx.side}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: Space.lg,
                marginTop: Space.sm,
                alignItems: "center",
              }}
            >
              <Text style={{ ...Type.caption, color: c.textDim }}>
                {t("transaction.sale")} {fmtCurrency(tx.sale_price)}
              </Text>
              <Text style={{ ...Type.caption, color: c.textDim }}>
                {t("transaction.commissionPct", { pct: (tx.commission_pct * 100).toFixed(1) })}
              </Text>
              <Text style={{ ...Type.caption, color: c.textDim }}>
                {/* date-only column — anchor at local noon or it renders the previous day */}
                {new Date(tx.date + "T12:00:00").toLocaleDateString("en-CA", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Deal Detail Sheet ────────────────────────────────────────────────────────

type DealUpdates = Partial<
  Pick<
    PipelineDeal,
    | "address"
    | "client_name"
    | "estimated_price"
    | "estimated_commission_pct"
    | "stage"
    | "expected_close_date"
    | "probability_override"
    | "notes"
  >
>;

/** Web offers Lost only on an open buyer prospect (opportunities_v: buyer side, Lead or Showing). */
function canMarkLost(deal: PipelineDeal): boolean {
  return deal.side === "buyer" && (deal.stage === "lead" || deal.stage === "showing");
}

/** The stages a deal moves through before closing. Closing itself is the Close deal form. */
const ACTIVE_STAGE_ORDER = STAGE_ORDER.filter((s) => s !== "closed");

function DealDetailSheet({
  deal,
  onClose,
  onAdvance,
  onUpdate,
  onCloseDeal,
  onMarkLost,
}: {
  deal: PipelineDeal | null;
  onClose: () => void;
  onAdvance: (deal: PipelineDeal) => Promise<void>;
  onUpdate: (dealId: string, updates: DealUpdates) => Promise<boolean>;
  onCloseDeal: (deal: PipelineDeal, close: PipelineDealCloseInput) => Promise<boolean>;
  onMarkLost: (deal: PipelineDeal, reason: OpportunityLossReason, notes: string) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");
  const { t: tCommon } = useTranslation("common");
  const [advancing, setAdvancing] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "close" | "lost">("view");

  // ── Edit mode state ──────────────────────────────────────────────────────
  const [editAddress, setEditAddress] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCommPct, setEditCommPct] = useState("");
  const [editStage, setEditStage] = useState<PipelineDeal["stage"]>("lead");
  const [editExpectedClose, setEditExpectedClose] = useState("");
  const [editProbOverride, setEditProbOverride] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Close deal form (web's Close Deal dialog) ────────────────────────────
  const [closeClient, setCloseClient] = useState("");
  const [closePrice, setClosePrice] = useState("");
  const [closeCommPct, setCloseCommPct] = useState("");
  const [closeSide, setCloseSide] = useState<PipelineDealCloseInput["side"]>("buyer");
  const [closeDate, setCloseDate] = useState(localISODate());
  const [closing, setClosing] = useState(false);

  // ── Lost form (web's Lost dialog) ────────────────────────────────────────
  const [lostReason, setLostReason] = useState<OpportunityLossReason>("chose_other_agent");
  const [lostNotes, setLostNotes] = useState("");
  const [savingLost, setSavingLost] = useState(false);

  // Reset every form when the deal changes / sheet opens
  useEffect(() => {
    if (!deal) return;
    setEditAddress(deal.address ?? "");
    setEditClientName(deal.client_name ?? "");
    setEditPrice(deal.estimated_price > 0 ? String(deal.estimated_price) : "");
    setEditCommPct(
      deal.estimated_commission_pct > 0
        ? (deal.estimated_commission_pct * 100).toFixed(2).replace(/\.?0+$/, "")
        : "",
    );
    setEditStage(deal.stage);
    setEditExpectedClose(deal.expected_close_date ?? "");
    setEditProbOverride(
      deal.probability_override != null
        ? String(Math.round(deal.probability_override * 100))
        : "",
    );
    setEditNotes(deal.notes ?? "");
    // Close form starts from the deal's estimate, as web's does.
    setCloseClient(deal.client_name ?? "");
    setClosePrice(deal.estimated_price > 0 ? String(deal.estimated_price) : "");
    setCloseCommPct(
      deal.estimated_commission_pct > 0
        ? (deal.estimated_commission_pct * 100).toFixed(2).replace(/\.?0+$/, "")
        : "",
    );
    setCloseSide(deal.side ?? "buyer");
    setCloseDate(localISODate());
    setLostReason("chose_other_agent");
    setLostNotes("");
    setMode("view");
  }, [deal?.id]);

  if (!deal) return null;

  const sc = STAGE_COLORS[deal.stage] ?? c.textDim;
  const prob = deal.probability_override ?? DEFAULT_PROBABILITIES[deal.stage] ?? 0.5;
  const stageIdx = ACTIVE_STAGE_ORDER.indexOf(deal.stage as (typeof ACTIVE_STAGE_ORDER)[number]);
  // From Firm the next step is closing, which records the sale.
  const nextStage = stageIdx >= 0 && stageIdx < ACTIVE_STAGE_ORDER.length - 1 ? ACTIVE_STAGE_ORDER[stageIdx + 1] : null;

  const handleAdvance = async () => {
    setAdvancing(true);
    await onAdvance(deal);
    setAdvancing(false);
  };

  const handleSaveEdit = async () => {
    // ── Parse + validate numeric fields (mirrors validatePipelineDeal in core) ──
    const trimPrice = editPrice.replace(/[$,\s]/g, "");
    const priceNum = trimPrice === "" ? NaN : Number(trimPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      Alert.alert(tCommon("status.error"), t("edit.invalidPrice"));
      return;
    }

    const commTrim = editCommPct.replace(/[%\s]/g, "");
    const commNum = commTrim === "" ? 0 : Number(commTrim);
    if (!Number.isFinite(commNum) || commNum < 0 || commNum > 50) {
      Alert.alert(tCommon("status.error"), t("edit.invalidCommission"));
      return;
    }

    let probOverride: number | null = null;
    if (editProbOverride.trim() !== "") {
      const probTrim = editProbOverride.replace(/[%\s]/g, "");
      const probNum = Number(probTrim);
      if (!Number.isFinite(probNum) || probNum < 0 || probNum > 100) {
        Alert.alert(
          tCommon("status.error"),
          t("edit.invalidProbability"),
        );
        return;
      }
      probOverride = probNum / 100;
    }

    setSavingEdit(true);
    const ok = await onUpdate(deal.id, {
      address: editAddress.trim(),
      client_name: editClientName.trim(),
      estimated_price: priceNum,
      estimated_commission_pct: commNum / 100,
      stage: editStage,
      expected_close_date: editExpectedClose || null,
      probability_override: probOverride,
      notes: editNotes.trim(),
    });
    setSavingEdit(false);
    if (ok) setMode("view");
  };

  const handleCloseDeal = async () => {
    // Same validation as web's Close Deal dialog (core validateTransaction).
    const check = validateTransaction({ sale_price: closePrice, commission_pct: closeCommPct });
    if (!check.valid || !check.parsed) {
      Alert.alert(t("close.invalidTitle"), check.errors[0]);
      return;
    }
    setClosing(true);
    const ok = await onCloseDeal(deal, {
      clientName: closeClient.trim(),
      salePrice: check.parsed.sale_price,
      commissionPct: check.parsed.commission_pct,
      side: closeSide,
      date: closeDate,
    });
    setClosing(false);
    if (ok) onClose();
  };

  const handleMarkLost = async () => {
    if (lostReason === "other" && lostNotes.trim() === "") {
      Alert.alert(t("lost.title"), t("lost.notesRequired"));
      return;
    }
    setSavingLost(true);
    const ok = await onMarkLost(deal, lostReason, lostNotes);
    setSavingLost(false);
    if (ok) onClose();
  };

  const closeGci = (parseDollar(closePrice) ?? 0) * (parsePercent(closeCommPct) ?? 0);

  const cancelLink = (
    <Pressable onPress={() => setMode("view")} style={{ paddingVertical: Space.md }}>
      <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
        {tCommon("nav.cancel")}
      </Text>
    </Pressable>
  );

  const title =
    mode === "edit" ? t("edit.title") : mode === "close" ? t("close.title") : mode === "lost" ? t("lost.title") : t("detail.title");

  return (
    <Sheet visible={!!deal} onClose={onClose} title={title} maxHeight="95%">
      {/* Edit button when viewing */}
      {mode === "view" && (
        <View
          style={{
            position: "absolute",
            top: Space.md,
            right: Space.xl + 44,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => setMode("edit")}
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Space.xs,
              paddingHorizontal: Space.md,
              height: 32,
              borderRadius: Radius.pill,
              backgroundColor: c.primaryDim,
            }}
            accessibilityLabel={t("edit.edit")}
          >
            <Ionicons name="create-outline" size={16} color={c.primary} />
            <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>
              {t("edit.edit")}
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "edit" && (
        <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
          <Input
            label={t("addDeal.addressLabel")}
            value={editAddress}
            onChange={setEditAddress}
            placeholder={t("addDeal.addressPlaceholder")}
          />
          <ClientNameField
            label={t("detail.client")}
            value={editClientName}
            onChange={setEditClientName}
            placeholder={t("edit.clientPlaceholder")}
          />
          <Input
            label={t("addDeal.priceLabel")}
            value={editPrice}
            onChange={setEditPrice}
            placeholder={t("addDeal.pricePlaceholder")}
            keyboardType="numeric"
          />
          <Input
            label={t("addDeal.commissionLabel")}
            value={editCommPct}
            onChange={setEditCommPct}
            placeholder={t("addDeal.commissionPlaceholder")}
            keyboardType="numeric"
          />

          {/* Stage picker. Closing is the Close deal button: it records the sale. */}
          <View style={{ gap: Space.xs }}>
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
              {t("detail.stage")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
              {ACTIVE_STAGE_ORDER.map((s) => {
                const isSelected = editStage === s;
                const pillColor = STAGE_COLORS[s] ?? c.textDim;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setEditStage(s)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Space.xs,
                      paddingHorizontal: Space.md,
                      height: 34,
                      borderRadius: Radius.pill,
                      borderWidth: 1,
                      backgroundColor: isSelected ? pillColor + "38" : c.card,
                      borderColor: isSelected ? pillColor + "80" : c.cardBorder,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: pillColor,
                      }}
                    />
                    <Text
                      style={[
                        Type.caption,
                        {
                          color: isSelected ? pillColor : c.textDim,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {t(`stages.${s}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <DateField
            label={t("edit.expectedCloseLabel")}
            value={editExpectedClose}
            onChange={setEditExpectedClose}
            clearable
            pastShortcuts={false}
          />
          <Input
            label={t("edit.probabilityOverrideLabel")}
            value={editProbOverride}
            onChange={setEditProbOverride}
            placeholder={t("edit.probabilityOverridePlaceholder", {
              defaultProb: Math.round((DEFAULT_PROBABILITIES[editStage] ?? 0.5) * 100),
            })}
            keyboardType="numeric"
          />
          <Input
            label={t("detail.notes")}
            value={editNotes}
            onChange={setEditNotes}
            placeholder={t("edit.notesPlaceholder")}
            multiline
          />

          <View style={{ marginTop: Space.sm, gap: Space.sm }}>
            <Button
              label={savingEdit ? t("edit.saving") : t("edit.save")}
              onPress={handleSaveEdit}
              loading={savingEdit}
              variant="primary"
              icon="checkmark-circle"
            />
            {cancelLink}
          </View>
        </View>
      )}

      {mode === "close" && (
        <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
          <Text style={[Type.h3, { color: c.text }]}>
            {deal.address || deal.client_name || t("pipeline.untitledDeal")}
          </Text>
          <ClientNameField
            label={t("addDeal.clientLabel")}
            value={closeClient}
            onChange={setCloseClient}
            placeholder={t("addDeal.clientPlaceholder")}
          />
          <Input
            label={t("addDeal.priceLabel")}
            value={closePrice}
            onChange={setClosePrice}
            placeholder={t("addDeal.pricePlaceholder")}
            keyboardType="numeric"
          />
          <Input
            label={t("addDeal.commissionLabel")}
            value={closeCommPct}
            onChange={setCloseCommPct}
            placeholder={t("addDeal.commissionPlaceholder")}
            keyboardType="numeric"
          />
          <SidePicker label={t("addDeal.typeLabel")} value={closeSide} onChange={setCloseSide} />
          <DateField label={t("close.dateLabel")} value={closeDate} onChange={(d) => setCloseDate(d || localISODate())} />
          <Text style={[Type.caption, { color: c.textMuted }]}>
            {t("close.gciPreview", { gci: fmtCurrency(closeGci) })}
          </Text>
          <Text style={[Type.micro, { color: c.textDim }]}>{t("close.explainer")}</Text>
          <View style={{ gap: Space.sm }}>
            <Button
              label={closing ? t("close.saving") : t("close.save")}
              onPress={handleCloseDeal}
              loading={closing}
              variant="primary"
              icon="checkmark-circle"
            />
            {cancelLink}
          </View>
        </View>
      )}

      {mode === "lost" && (
        <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
          <Text style={[Type.h3, { color: c.text }]}>
            {deal.client_name || deal.address || t("pipeline.untitledDeal")}
          </Text>
          <Text style={[Type.caption, { color: c.textDim }]}>{t("lost.explainer")}</Text>
          <View style={{ gap: Space.xs }}>
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
              {t("lost.reasonLabel")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
              {OPPORTUNITY_LOSS_REASONS.map((r) => {
                const isSelected = lostReason === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setLostReason(r)}
                    style={{
                      paddingHorizontal: Space.md,
                      minHeight: 34,
                      justifyContent: "center",
                      borderRadius: Radius.pill,
                      borderWidth: 1,
                      backgroundColor: isSelected ? c.dangerDim : c.card,
                      borderColor: isSelected ? c.danger : c.cardBorder,
                    }}
                  >
                    <Text
                      style={[
                        Type.caption,
                        { color: isSelected ? c.danger : c.textDim, fontWeight: isSelected ? "700" : "500" },
                      ]}
                    >
                      {lossReasonLabel(r)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Input
            label={t("lost.notesLabel")}
            value={lostNotes}
            onChange={setLostNotes}
            placeholder={lostReason === "other" ? t("lost.notesRequired") : t("lost.notesOptional")}
            multiline
          />
          <View style={{ gap: Space.sm }}>
            <Button
              label={savingLost ? t("lost.saving") : t("lost.save")}
              onPress={handleMarkLost}
              loading={savingLost}
              disabled={lostReason === "other" && lostNotes.trim() === ""}
              variant="danger"
              icon="close-circle"
            />
            {cancelLink}
          </View>
        </View>
      )}

      {mode === "view" && (
        <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
          {/* Address / title */}
          <Text style={{ ...Type.h2, color: c.text }}>
            {deal.address || deal.client_name || t("pipeline.untitledDeal")}
          </Text>

          {/* Info rows */}
          {!!deal.client_name && (
            <InfoRow label={t("detail.client")} value={deal.client_name} />
          )}
          {!!deal.address && !!deal.client_name && (
            <InfoRow label={t("detail.address")} value={deal.address} />
          )}
          <InfoRow
            label={t("detail.estimatedPrice")}
            value={fmtCurrency(deal.estimated_price)}
          />
          <View style={styles.infoRow}>
            <Text style={{ ...Type.label, color: c.textMuted }}>
              {t("detail.stage")}
            </Text>
            <Badge label={deal.stage.toUpperCase()} color={sc} size="sm" />
          </View>
          <InfoRow
            label={t("detail.probability")}
            value={`${Math.round(prob * 100)}%${
              deal.probability_override != null ? ` (${t("edit.overrideTag")})` : ""
            }`}
          />
          {deal.expected_close_date && (
            <InfoRow
              label={t("detail.expectedClose")}
              // date-only column — anchor at local noon or it renders the previous day
              value={new Date(deal.expected_close_date + "T12:00:00").toLocaleDateString(
                "en-CA",
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                },
              )}
            />
          )}
          {deal.estimated_commission_pct > 0 && (
            <InfoRow
              label={t("transaction.commission")}
              value={`${(deal.estimated_commission_pct * 100).toFixed(1)}%`}
            />
          )}
          {!!deal.notes && (
            <View style={{ gap: Space.xs }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>
                {t("detail.notes")}
              </Text>
              <Text style={{ ...Type.body, color: c.text }}>{deal.notes}</Text>
            </View>
          )}

          <View style={{ marginTop: Space.sm, gap: Space.sm }}>
            {/* Advance one stage; from Firm the next step is Close deal. */}
            {nextStage && (
              <Button
                label={
                  advancing
                    ? t("detail.updating")
                    : t("detail.advanceTo", { stage: t(`stages.${nextStage}`) })
                }
                variant="secondary"
                icon="arrow-forward"
                onPress={handleAdvance}
                loading={advancing}
              />
            )}
            {/* Web offers Close on every active deal. */}
            <Button
              label={t("close.button")}
              variant="primary"
              icon="checkmark-circle"
              onPress={() => setMode("close")}
            />
            {canMarkLost(deal) && (
              <Button
                label={t("lost.button")}
                variant="ghost"
                icon="close-circle-outline"
                onPress={() => setMode("lost")}
              />
            )}
          </View>
        </View>
      )}
    </Sheet>
  );
}

/** Buyer / Seller / Both, as web's Side select. */
function SidePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "buyer" | "seller" | "both";
  onChange: (side: "buyer" | "seller" | "both") => void;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");
  return (
    <View>
      <Text style={{ ...Type.caption, color: c.textMuted, marginLeft: Space.xs, marginBottom: Space.xs }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: Space.sm }}>
        {(["buyer", "seller", "both"] as const).map((s) => {
          const isActive = value === s;
          return (
            <Pressable
              key={s}
              onPress={() => onChange(s)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: Radius.md,
                backgroundColor: isActive ? c.primary : c.card,
                borderWidth: 1.5,
                borderColor: isActive ? c.primary : c.cardBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ ...Type.bodyBold, color: isActive ? "#fff" : c.textMuted }}>
                {s === "buyer" ? t("addDeal.buy") : s === "seller" ? t("addDeal.sell") : t("addDeal.both")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Transaction Detail Sheet ─────────────────────────────────────────────────

function TransactionDetailSheet({
  tx,
  onClose,
  onUpdate,
  onDelete,
}: {
  tx: Transaction | null;
  onClose: () => void;
  onUpdate: (id: string, input: TransactionInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");
  const { t: tCommon } = useTranslation("common");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [tx?.id]);

  if (!tx) return null;

  const gci = computeGCI(tx);
  const isPending = tx.status === "pending";
  const accentColor = isPending ? c.warning : c.success;

  const confirmDelete = () => {
    Alert.alert(t("transactionDetail.deleteConfirmTitle"), t("transactionDetail.deleteConfirmBody"), [
      { text: tCommon("nav.cancel"), style: "cancel" },
      {
        text: t("transactionDetail.delete"),
        style: "destructive",
        onPress: async () => {
          if (await onDelete(tx.id)) onClose();
        },
      },
    ]);
  };

  return (
    <Sheet
      visible={!!tx}
      onClose={onClose}
      title={editing ? t("transactionDetail.editTitle") : t("transactionDetail.title")}
      maxHeight="95%"
    >
      {editing ? (
        <TransactionForm
          initial={tx}
          submitLabel={t("edit.save")}
          savingLabel={t("edit.saving")}
          onSubmit={async (input) => {
            const ok = await onUpdate(tx.id, input);
            if (ok) setEditing(false);
            return ok;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
          <Text style={{ ...Type.h2, color: c.text }}>
            {tx.address || tx.client_name || t("transaction.transactionLabel")}
          </Text>

          {!!tx.client_name && <InfoRow label={t("detail.client")} value={tx.client_name} />}
          {!!tx.address && !!tx.client_name && <InfoRow label={t("detail.address")} value={tx.address} />}
          <InfoRow label={t("transaction.salePrice")} value={fmtCurrency(tx.sale_price)} />
          <InfoRow label={t("transaction.commission")} value={`${(tx.commission_pct * 100).toFixed(1)}%`} />
          <InfoRow
            label={t("transaction.gci")}
            value={fmtCurrency(gci)}
            valueColor={accentColor}
          />
          <InfoRow
            label={t("transaction.side")}
            value={tx.side.charAt(0).toUpperCase() + tx.side.slice(1)}
          />
          <View style={styles.infoRow}>
            <Text style={{ ...Type.label, color: c.textMuted }}>{t("transaction.status")}</Text>
            <Badge
              label={tx.status.toUpperCase()}
              color={accentColor}
              size="sm"
            />
          </View>
          <InfoRow
            label={t("transaction.date")}
            // date-only column — anchor at local noon or it renders the previous day
            value={new Date(tx.date + "T12:00:00").toLocaleDateString("en-CA", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          />
          {!!tx.commission_paid_date && (
            <InfoRow label={t("transactionDetail.paidDate")} value={formatDateLabel(tx.commission_paid_date)} />
          )}
          {!!tx.notes && (
            <View style={{ gap: Space.xs }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>{t("detail.notes")}</Text>
              <Text style={{ ...Type.body, color: c.text }}>{tx.notes}</Text>
            </View>
          )}

          <View style={{ marginTop: Space.sm, gap: Space.sm }}>
            <Button label={t("transactionDetail.edit")} variant="secondary" icon="create-outline" onPress={() => setEditing(true)} />
            <Button label={t("transactionDetail.delete")} variant="ghost" icon="trash-outline" onPress={confirmDelete} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

// ── Shared Info Row ──────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const c = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={{ ...Type.label, color: c.textMuted }}>{label.toUpperCase()}</Text>
      <Text style={{ ...Type.body, color: valueColor ?? c.text }}>{value}</Text>
    </View>
  );
}

// ── Transaction Form (Add Deal / Edit Deal) ───────────────────────────────────

const TX_STATUSES = ["closed", "pending", "fallen"] as const;

/**
 * The fields of web's Transactions → Deals form that matter on a phone:
 * closing date (any day, not only today), client, side, status and the
 * commission paid date (cash-method agents report a commission in the year
 * it was paid). Validated with core validateTransaction, as web. An edit
 * keeps the deal's GCI override and team split (set on web).
 */
function TransactionForm({
  initial,
  submitLabel,
  savingLabel,
  onSubmit,
  onCancel,
}: {
  initial: Transaction | null;
  submitLabel: string;
  savingLabel: string;
  onSubmit: (input: TransactionInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");
  const { t: tCommon } = useTranslation("common");

  const blank = () => ({
    address: initial?.address ?? "",
    client: initial?.client_name ?? "",
    price: initial ? String(initial.sale_price) : "",
    commPct: initial ? (initial.commission_pct * 100).toFixed(3).replace(/\.?0+$/, "") : "2.5",
    side: (initial?.side ?? "buyer") as Transaction["side"],
    status: (initial?.status ?? "closed") as Transaction["status"],
    date: initial?.date ?? localISODate(),
    paidDate: initial?.commission_paid_date ?? "",
    notes: initial?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm(blank());
  }, [initial?.id]);

  const handleSubmit = async () => {
    const check = validateTransaction({
      sale_price: form.price,
      commission_pct: form.commPct,
      address: form.address,
      notes: form.notes,
      date: form.date,
      commission_paid_date: form.paidDate || null,
    });
    if (!check.valid || !check.parsed) {
      Alert.alert(t("close.invalidTitle"), check.errors[0]);
      return;
    }
    setSaving(true);
    const ok = await onSubmit({
      date: form.date,
      address: form.address.trim().slice(0, FIELD_LIMITS.address),
      client_name: form.client.trim().slice(0, FIELD_LIMITS.clientName),
      sale_price: check.parsed.sale_price,
      commission_pct: check.parsed.commission_pct,
      gci_override: initial?.gci_override ?? null,
      team_split_pct: initial?.team_split_pct ?? null,
      side: form.side,
      status: form.status,
      notes: form.notes.trim().slice(0, FIELD_LIMITS.notes),
      commission_paid_date: check.parsed.commission_paid_date,
    });
    setSaving(false);
    if (ok && !initial) setForm(blank());
  };

  const statusLabel = (s: Transaction["status"]) =>
    s === "closed" ? t("tabs.closed") : s === "pending" ? t("tabs.pending") : t("addDeal.fallen");

  return (
    <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
      <Input
        label={t("addDeal.addressLabel")}
        value={form.address}
        onChange={(v) => set("address", v)}
        placeholder={t("addDeal.addressPlaceholder")}
      />
      <ClientNameField
        label={t("addDeal.clientLabel")}
        value={form.client}
        onChange={(v) => set("client", v)}
        placeholder={t("addDeal.clientPlaceholder")}
      />
      <Input
        label={t("addDeal.priceLabel")}
        value={form.price}
        onChange={(v) => set("price", v)}
        placeholder={t("addDeal.pricePlaceholder")}
        keyboardType="numeric"
      />
      <Input
        label={t("addDeal.commissionLabel")}
        value={form.commPct}
        onChange={(v) => set("commPct", v)}
        placeholder={t("addDeal.commissionPlaceholder")}
        keyboardType="numeric"
      />
      <SidePicker label={t("addDeal.typeLabel")} value={form.side} onChange={(v) => set("side", v)} />

      <View>
        <Text style={{ ...Type.caption, color: c.textMuted, marginLeft: Space.xs, marginBottom: Space.xs }}>
          {t("addDeal.statusLabel")}
        </Text>
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          {TX_STATUSES.map((s) => {
            const isActive = form.status === s;
            return (
              <Pressable
                key={s}
                onPress={() => set("status", s)}
                style={{
                  flex: 1,
                  minHeight: 40,
                  borderRadius: Radius.md,
                  backgroundColor: isActive ? c.primaryDim : c.card,
                  borderWidth: 1.5,
                  borderColor: isActive ? c.primary : c.cardBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ ...Type.caption, fontWeight: "700", color: isActive ? c.primary : c.textMuted }}>
                  {statusLabel(s)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <DateField
        label={t("addDeal.closingDateLabel")}
        value={form.date}
        onChange={(d) => set("date", d || localISODate())}
      />
      <DateField
        label={t("addDeal.paidDateLabel")}
        value={form.paidDate}
        onChange={(d) => set("paidDate", d)}
        clearable
        placeholder={t("addDeal.paidDatePlaceholder")}
      />
      <Input
        label={t("detail.notes")}
        value={form.notes}
        onChange={(v) => set("notes", v)}
        placeholder={t("edit.notesPlaceholder")}
        multiline
      />

      <Button
        label={saving ? savingLabel : submitLabel}
        onPress={handleSubmit}
        loading={saving}
        variant="primary"
        icon="checkmark"
      />
      {onCancel && (
        <Pressable onPress={onCancel} style={{ paddingVertical: Space.md }}>
          <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
            {tCommon("nav.cancel")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (tx: TransactionInput) => Promise<boolean>;
}) {
  const { t } = useTranslation("deals");
  return (
    <Sheet visible={visible} onClose={onClose} title={t("addDeal.title")} maxHeight="95%">
      <TransactionForm
        initial={null}
        submitLabel={t("addDeal.save")}
        savingLabel={t("addDeal.saving")}
        onSubmit={onAdd}
      />
    </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 48,
    paddingVertical: 0,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
