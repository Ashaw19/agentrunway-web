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
import { useDataStore, type Transaction, type PipelineDeal } from "@/stores/data-store";
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
import { validateSalePrice, validateCommissionPct, parsePercent, parseDollar } from "@agent-runway/core/validation/input-guards";
import { PIPELINE_STAGE_DEFAULTS } from "@agent-runway/core/types/database";

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
    advancePipelineStage,
    updatePipelineDeal,
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

  // Stats always from unfiltered data
  const totalGci = transactions
    .filter((t) => t.status === "closed")
    .reduce((s, t) => s + (t.gci_override ?? (t.sale_price * t.commission_pct * (t.team_split_pct ?? 1))), 0);
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
          if (idx < STAGE_ORDER.length - 1) {
            const nextStage = STAGE_ORDER[idx + 1];
            await advancePipelineStage(deal.id, nextStage);
            // Update local selected deal to reflect new stage
            setSelectedDeal((prev) =>
              prev ? { ...prev, stage: nextStage } : null
            );
          }
        }}
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
      />
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
                  {deal.address ?? deal.client_name ?? t("pipeline.untitledDeal")}
                </Text>
                {deal.client_name && deal.address && (
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
                  {new Date(deal.expected_close_date).toLocaleDateString(
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

  const gci = tx.gci_override ?? (tx.sale_price * tx.commission_pct * (tx.team_split_pct ?? 1));
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
                  {tx.address ?? tx.client_name ?? t("transaction.transactionLabel")}
                </Text>
                {tx.client_name && tx.address && (
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
                {new Date(tx.date).toLocaleDateString("en-CA", {
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

function DealDetailSheet({
  deal,
  onClose,
  onAdvance,
  onUpdate,
}: {
  deal: PipelineDeal | null;
  onClose: () => void;
  onAdvance: (deal: PipelineDeal) => Promise<void>;
  onUpdate: (
    dealId: string,
    updates: Partial<
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
    >,
  ) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");
  const { t: tCommon } = useTranslation("common");
  const [advancing, setAdvancing] = useState(false);

  // ── Edit mode state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCommPct, setEditCommPct] = useState("");
  const [editStage, setEditStage] = useState<PipelineDeal["stage"]>("lead");
  const [editExpectedClose, setEditExpectedClose] = useState("");
  const [editProbOverride, setEditProbOverride] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset edit form when deal changes / sheet opens
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
    setEditing(false);
  }, [deal?.id]);

  if (!deal) return null;

  const sc = STAGE_COLORS[deal.stage] ?? c.textDim;
  const prob = deal.probability_override ?? DEFAULT_PROBABILITIES[deal.stage] ?? 0.5;
  const isLastStage = deal.stage === "closed";

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

    // ── Expected close date — accept "" or YYYY-MM-DD ──
    let expectedCloseDate: string | null = null;
    const ecdTrim = editExpectedClose.trim();
    if (ecdTrim !== "") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ecdTrim)) {
        Alert.alert(tCommon("status.error"), t("edit.invalidDate"));
        return;
      }
      expectedCloseDate = ecdTrim;
    }

    setSavingEdit(true);
    const ok = await onUpdate(deal.id, {
      address: editAddress.trim() || null,
      client_name: editClientName.trim() || null,
      estimated_price: priceNum,
      estimated_commission_pct: commNum / 100,
      stage: editStage,
      expected_close_date: expectedCloseDate,
      probability_override: probOverride,
      notes: editNotes.trim() || null,
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  };

  return (
    <Sheet
      visible={!!deal}
      onClose={onClose}
      title={editing ? t("edit.title") : t("detail.title")}
      maxHeight="95%"
    >
      {/* Edit button when viewing */}
      {!editing && (
        <View
          style={{
            position: "absolute",
            top: Space.md,
            right: Space.xl + 44,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => setEditing(true)}
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

      {editing ? (
        /* ── Edit mode ── */
        <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
          <Input
            label={t("addDeal.addressLabel")}
            value={editAddress}
            onChange={setEditAddress}
            placeholder={t("addDeal.addressPlaceholder")}
          />
          <Input
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

          {/* Stage picker — replaces one-way "advance" with arbitrary edit (matches web) */}
          <View style={{ gap: Space.xs }}>
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
              {t("detail.stage")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
              {STAGE_ORDER.map((s) => {
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

          <Input
            label={t("edit.expectedCloseLabel")}
            value={editExpectedClose}
            onChange={setEditExpectedClose}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
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
            <Pressable
              onPress={() => setEditing(false)}
              style={{ paddingVertical: Space.md }}
            >
              <Text
                style={[
                  Type.bodyBold,
                  { color: c.textMuted, textAlign: "center" },
                ]}
              >
                {tCommon("nav.cancel")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ── View mode (existing) ── */
        <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
          {/* Address / title */}
          <Text style={{ ...Type.h2, color: c.text }}>
            {deal.address ?? deal.client_name ?? t("pipeline.untitledDeal")}
          </Text>

          {/* Info rows */}
          {deal.client_name && (
            <InfoRow label={t("detail.client")} value={deal.client_name} />
          )}
          {deal.address && deal.client_name && (
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
              value={new Date(deal.expected_close_date).toLocaleDateString(
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
          {deal.notes && (
            <View style={{ gap: Space.xs }}>
              <Text style={{ ...Type.label, color: c.textMuted }}>
                {t("detail.notes")}
              </Text>
              <Text style={{ ...Type.body, color: c.text }}>{deal.notes}</Text>
            </View>
          )}

          {/* Advance Stage button */}
          <View style={{ marginTop: Space.sm }}>
            <Button
              label={
                advancing
                  ? t("detail.updating")
                  : isLastStage
                    ? t("detail.markClosed")
                    : t("detail.advanceTo", {
                        stage: t(
                          `stages.${STAGE_ORDER[STAGE_ORDER.indexOf(deal.stage) + 1]}`,
                        ),
                      })
              }
              variant="primary"
              icon={isLastStage ? "checkmark-circle" : "arrow-forward"}
              onPress={handleAdvance}
              loading={advancing}
              disabled={isLastStage}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

// ── Transaction Detail Sheet ─────────────────────────────────────────────────

function TransactionDetailSheet({
  tx,
  onClose,
}: {
  tx: Transaction | null;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");

  if (!tx) return null;

  const gci = tx.gci_override ?? (tx.sale_price * tx.commission_pct * (tx.team_split_pct ?? 1));
  const isPending = tx.status === "pending";
  const accentColor = isPending ? c.warning : c.success;

  return (
    <Sheet visible={!!tx} onClose={onClose} title={t("transactionDetail.title")}>
      <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
        <Text style={{ ...Type.h2, color: c.text }}>
          {tx.address ?? tx.client_name ?? t("transaction.transactionLabel")}
        </Text>

        {tx.client_name && <InfoRow label={t("detail.client")} value={tx.client_name} />}
        {tx.address && tx.client_name && <InfoRow label={t("detail.address")} value={tx.address} />}
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
          value={new Date(tx.date).toLocaleDateString("en-CA", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        />
        {tx.notes && (
          <View style={{ gap: Space.xs }}>
            <Text style={{ ...Type.label, color: c.textMuted }}>{t("detail.notes")}</Text>
            <Text style={{ ...Type.body, color: c.text }}>{tx.notes}</Text>
          </View>
        )}
      </View>
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

// ── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (tx: Omit<Transaction, "id" | "created_at">) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("deals");

  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [commPct, setCommPct] = useState("2.5");
  const [side, setSide] = useState<"buyer" | "seller">("buyer");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const salePrice = parseDollar(price);
    const pct = parsePercent(commPct);
    const spCheck = validateSalePrice(salePrice);
    const cpCheck = validateCommissionPct(pct);
    if (!spCheck.valid) { Alert.alert("Invalid", spCheck.errors[0]); return; }
    if (!cpCheck.valid) { Alert.alert("Invalid", cpCheck.errors[0]); return; }
    setSaving(true);
    const ok = await onAdd({
      address: address || null,
      sale_price: salePrice!,
      commission_pct: pct!,
      gci_override: null,
      team_split_pct: null,
      side,
      status: "closed",
      client_name: null,
      notes: null,
      date: new Date().toISOString().split("T")[0],
    });
    setSaving(false);
    if (ok) {
      setAddress("");
      setPrice("");
      setCommPct("2.5");
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("addDeal.title")}>
      <View style={{ gap: Space.lg }}>
        <Input
          label={t("addDeal.addressLabel")}
          value={address}
          onChange={setAddress}
          placeholder={t("addDeal.addressPlaceholder")}
        />
        <Input
          label={t("addDeal.priceLabel")}
          value={price}
          onChange={setPrice}
          placeholder={t("addDeal.pricePlaceholder")}
          keyboardType="numeric"
        />
        <Input
          label={t("addDeal.commissionLabel")}
          value={commPct}
          onChange={setCommPct}
          placeholder={t("addDeal.commissionPlaceholder")}
          keyboardType="numeric"
        />

        <View>
          <Text style={{ ...Type.caption, color: c.textMuted, marginLeft: Space.xs, marginBottom: Space.xs }}>
            {t("addDeal.typeLabel")}
          </Text>
          <View style={{ flexDirection: "row", gap: Space.sm }}>
            {(["buyer", "seller"] as const).map((s) => {
              const isActive = side === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSide(s)}
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
                  <Text
                    style={{
                      ...Type.bodyBold,
                      color: isActive ? "#fff" : c.textMuted,
                    }}
                  >
                    {s === "buyer" ? t("addDeal.buy") : t("addDeal.sell")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          label={saving ? t("addDeal.saving") : t("addDeal.save")}
          onPress={handleSubmit}
          loading={saving}
          variant="primary"
          icon="checkmark"
        />
      </View>
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
