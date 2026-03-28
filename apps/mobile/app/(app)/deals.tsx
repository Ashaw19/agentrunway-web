/**
 * Deals Screen — Premium, theme-aware pipeline & transaction tracker.
 * Uses shared UI components, design tokens, and subtle animations.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
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
import { TrendingUp, Plus } from "lucide-react-native";
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
} from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Tab = "pipeline" | "closed" | "pending";

const STAGE_ORDER = ["lead", "showing", "offer", "conditional", "firm"];

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function DealsScreen() {
  const { transactions, pipeline, fetchAll, addTransaction, isLoading } = useDataStore();
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const g = gradients(mode);

  const [tab, setTab] = useState<Tab>("pipeline");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // Initial load
  useEffect(() => {
    if (transactions.length === 0 && pipeline.length === 0) fetchAll();
  }, []);

  // Re-fetch on focus (e.g. after adding a deal)
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

  const closed = transactions.filter((t) => t.status === "closed");
  const pending = transactions.filter((t) => t.status === "pending");
  const totalGci = closed.reduce((s, t) => {
    return s + (t.gci_override ?? t.sale_price * t.commission_pct);
  }, 0);
  const pipelineValue = pipeline.reduce((s, d) => s + d.estimated_price, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading overlay — shown only on initial load when no cached data */}
      {isLoading && transactions.length === 0 && pipeline.length === 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.bg,
            },
          ]}
        >
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={{ color: c.textDim, marginTop: Space.md, ...Type.caption }}>
            Loading deals...
          </Text>
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
          <Text style={{ ...Type.hero, color: c.text }}>Deals</Text>
          <Button
            label="Add"
            icon="add"
            variant="primary"
            onPress={() => setShowAdd(true)}
          />
        </View>

        {/* Summary stats */}
        <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg }}>
          <StatPill label="GCI Closed" value={fmtCurrency(totalGci)} color={c.success} />
          <StatPill label="Pipeline" value={fmtCurrency(pipelineValue)} color={c.primary} />
          <StatPill label="Pending" value={String(pending.length)} color={c.warning} />
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg, marginBottom: Space.xs }}>
          {(
            [
              { key: "pipeline", label: "Pipeline", count: pipeline.length },
              { key: "closed", label: "Closed", count: closed.length },
              { key: "pending", label: "Pending", count: pending.length },
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

      <ScrollView
        contentContainerStyle={{
          padding: Space.xl,
          paddingTop: Space.md,
          gap: Space.sm,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        {tab === "pipeline" ? (
          pipeline.length === 0 ? (
            <EmptyState
              icon="trending-up-outline"
              title="No pipeline deals"
              subtitle="Add deals to track your upcoming commissions"
              actionLabel="Add Deal"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <>
              {/* Stage summary bar */}
              <Card variant="default">
                <Text style={{ ...Type.label, color: c.textDim }}>STAGE BREAKDOWN</Text>
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
                        label={`${stage.charAt(0).toUpperCase() + stage.slice(1)} \u00b7 ${count}`}
                        color={stageColor}
                        size="sm"
                      />
                    );
                  })}
                </View>
              </Card>
              {pipeline.map((d) => (
                <PipelineCard key={d.id} deal={d} />
              ))}
            </>
          )
        ) : tab === "closed" ? (
          closed.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="No closed deals this year"
              subtitle="Closed transactions will appear here"
            />
          ) : (
            closed.map((tx) => <TransactionCard key={tx.id} tx={tx} />)
          )
        ) : pending.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No pending deals"
            subtitle="Deals awaiting close will appear here"
          />
        ) : (
          pending.map((tx) => <TransactionCard key={tx.id} tx={tx} />)
        )}
      </ScrollView>

      <AddTransactionModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={async (tx) => {
          const ok = await addTransaction(tx);
          if (ok) setShowAdd(false);
          return ok;
        }}
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
          borderColor: color + "30",
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

function PipelineCard({ deal }: { deal: PipelineDeal }) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const scale = useRef(new Animated.Value(1)).current;

  const sc = STAGE_COLORS[deal.stage] ?? c.textDim;
  const defaultProb =
    { lead: 10, showing: 25, offer: 50, conditional: 75, firm: 90 }[deal.stage] ?? 50;
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
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
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
                  {deal.address ?? deal.client_name ?? "Untitled Deal"}
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
                  {fmtCurrency(deal.estimated_price)}
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
                  Close:{" "}
                  {new Date(deal.expected_close_date).toLocaleDateString(
                    "en-CA",
                    { month: "short", day: "numeric" }
                  )}
                </Text>
              )}
              <Text style={{ ...Type.caption, color: sc, fontWeight: "600" }}>
                {prob}% probability
              </Text>
            </View>

            {/* Probability bar — 4px with rounded ends */}
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
                  width: `${prob}%` as any,
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

function TransactionCard({ tx }: { tx: Transaction }) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const scale = useRef(new Animated.Value(1)).current;

  const gci = tx.gci_override ?? tx.sale_price * tx.commission_pct;
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
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
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
                  {tx.address ?? tx.client_name ?? "Transaction"}
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
                  GCI \u00b7 {tx.side}
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
                Sale: {fmtCurrency(tx.sale_price)}
              </Text>
              <Text style={{ ...Type.caption, color: c.textDim }}>
                {(tx.commission_pct * 100).toFixed(1)}% commission
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

  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [commPct, setCommPct] = useState("2.5");
  const [side, setSide] = useState<"buyer" | "seller">("buyer");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const salePrice = parseFloat(price.replace(/[^0-9.]/g, ""));
    const pct = parseFloat(commPct);
    if (!salePrice || !pct) return;
    setSaving(true);
    const ok = await onAdd({
      address: address || null,
      sale_price: salePrice,
      commission_pct: pct / 100,
      gci_override: null,
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
    <Sheet visible={visible} onClose={onClose} title="Log Transaction">
      <View style={{ gap: Space.lg }}>
        <Input
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="123 Main St"
        />
        <Input
          label="Sale Price"
          value={price}
          onChange={setPrice}
          placeholder="650,000"
          keyboardType="numeric"
        />
        <Input
          label="Commission %"
          value={commPct}
          onChange={setCommPct}
          placeholder="2.5"
          keyboardType="numeric"
        />

        <View>
          <Text style={{ ...Type.caption, color: c.textMuted, marginLeft: Space.xs, marginBottom: Space.xs }}>
            Side
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
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          label={saving ? "Saving..." : "Save Transaction"}
          onPress={handleSubmit}
          loading={saving}
          variant="primary"
          icon="checkmark"
        />
      </View>
    </Sheet>
  );
}
