import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect,
} from "react-native-svg";
import { TrendingUp, Plus, X } from "lucide-react-native";
import { useDataStore, type Transaction, type PipelineDeal } from "@/stores/data-store";
import { C, STAGE_COLORS, fmtCurrency } from "@/lib/theme";

type Tab = "pipeline" | "closed" | "pending";

const STAGE_ORDER = ["lead", "showing", "offer", "conditional", "firm"];

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function DealsScreen() {
  const { transactions, pipeline, fetchAll, addTransaction, isLoading } = useDataStore();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Loading overlay — shown only on initial load when no cached data */}
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
            Loading deals…
          </Text>
        </View>
      )}
      {/* ── Header ── */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={S.screenTitle}>Deals</Text>
          <Pressable onPress={() => setShowAdd(true)} style={S.addBtn}>
            <Plus size={16} color="#fff" strokeWidth={2.5} />
            <Text style={S.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {/* Summary stats */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <StatPill
            label="GCI Closed"
            value={fmtCurrency(totalGci)}
            color={C.success}
          />
          <StatPill
            label="Pipeline"
            value={fmtCurrency(pipelineValue)}
            color={C.primary}
          />
          <StatPill
            label="Pending"
            value={String(pending.length)}
            color={C.warning}
          />
        </View>

        {/* Tabs */}
        <View style={S.tabs}>
          {(
            [
              { key: "pipeline", label: "Pipeline", count: pipeline.length },
              { key: "closed", label: "Closed", count: closed.length },
              { key: "pending", label: "Pending", count: pending.length },
            ] as { key: Tab; label: string; count: number }[]
          ).map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[S.tab, tab === t.key && S.tabActive]}
            >
              <Text
                style={[S.tabText, tab === t.key && S.tabTextActive]}
              >
                {t.label}
              </Text>
              {t.count > 0 && (
                <View
                  style={[
                    S.tabBadge,
                    {
                      backgroundColor:
                        tab === t.key ? C.primary : C.textFaint,
                    },
                  ]}
                >
                  <Text style={S.tabBadgeText}>{t.count}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
      >
        {tab === "pipeline" ? (
          pipeline.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={32} color={C.primary} />}
              title="No pipeline deals"
              subtitle="Add deals to track your upcoming commissions"
            />
          ) : (
            <>
              {/* Stage summary bar */}
              <View style={[S.card, { padding: 16, marginBottom: 4 }]}>
                <Text style={S.cardLabel}>STAGE BREAKDOWN</Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {STAGE_ORDER.map((stage) => {
                    const count = pipeline.filter(
                      (d) => d.stage === stage
                    ).length;
                    if (count === 0) return null;
                    const c = STAGE_COLORS[stage] ?? C.textDim;
                    return (
                      <View
                        key={stage}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          backgroundColor: c + "18",
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 20,
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: c,
                          }}
                        />
                        <Text
                          style={{
                            color: c,
                            fontSize: 12,
                            fontWeight: "600",
                            textTransform: "capitalize",
                          }}
                        >
                          {stage} · {count}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {pipeline.map((d) => (
                <PipelineCard key={d.id} deal={d} />
              ))}
            </>
          )
        ) : tab === "closed" ? (
          closed.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={32} color={C.success} />}
              title="No closed deals this year"
              subtitle="Closed transactions will appear here"
            />
          ) : (
            closed.map((tx) => <TransactionCard key={tx.id} tx={tx} />)
          )
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={32} color={C.warning} />}
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
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color + "14",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: color + "30",
      }}
    >
      <Text
        style={{
          color: C.textDim,
          fontSize: 9,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color,
          fontSize: 15,
          fontWeight: "800",
          marginTop: 2,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function PipelineCard({ deal }: { deal: PipelineDeal }) {
  const sc = STAGE_COLORS[deal.stage] ?? C.textDim;
  const defaultProb = { lead: 10, showing: 25, offer: 50, conditional: 75, firm: 90 }[deal.stage] ?? 50;
  const prob = deal.probability_override != null
    ? Math.round(deal.probability_override * 100)
    : defaultProb;
  return (
    <View style={S.card}>
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{ color: C.text, fontSize: 15, fontWeight: "700" }}
              numberOfLines={1}
            >
              {deal.address ?? deal.client_name ?? "Untitled Deal"}
            </Text>
            {deal.client_name && deal.address && (
              <Text
                style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {deal.client_name}
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text
              style={{ color: C.success, fontSize: 16, fontWeight: "800" }}
            >
              {fmtCurrency(deal.estimated_price)}
            </Text>
            <View
              style={{
                backgroundColor: sc + "22",
                paddingHorizontal: 8,
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
                  letterSpacing: 0.5,
                }}
              >
                {deal.stage}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 14,
            marginTop: 12,
            alignItems: "center",
          }}
        >
          {deal.expected_close_date && (
            <Text style={{ color: C.textDim, fontSize: 12 }}>
              Close:{" "}
              {new Date(deal.expected_close_date).toLocaleDateString("en-CA", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          )}
          <Text style={{ color: sc, fontSize: 12, fontWeight: "600" }}>
            {prob}% probability
          </Text>
        </View>

        {/* Probability bar */}
        <View style={[S.progressTrack, { marginTop: 10 }]}>
          <View
            style={[
              S.progressFill,
              { width: `${prob}%` as any, backgroundColor: sc },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function TransactionCard({ tx }: { tx: Transaction }) {
  const gci = tx.gci_override ?? tx.sale_price * tx.commission_pct;
  const isPending = tx.status === "pending";
  return (
    <View style={[S.card, { overflow: "hidden" }]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGrad id={`txGrad${tx.id}`} x1="0" y1="0" x2="1" y2="0">
            <Stop
              offset="0"
              stopColor={isPending ? C.warning : C.success}
              stopOpacity="0.06"
            />
            <Stop offset="1" stopColor={C.bg} stopOpacity="0" />
          </SvgGrad>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#txGrad${tx.id})`} />
      </Svg>
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{ color: C.text, fontSize: 15, fontWeight: "700" }}
              numberOfLines={1}
            >
              {tx.address ?? tx.client_name ?? "Transaction"}
            </Text>
            {tx.client_name && tx.address && (
              <Text style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>
                {tx.client_name}
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text
              style={{
                color: isPending ? C.warning : C.success,
                fontSize: 17,
                fontWeight: "800",
              }}
            >
              {fmtCurrency(gci)}
            </Text>
            <Text style={{ color: C.textDim, fontSize: 11 }}>
              GCI · {tx.side}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 14,
            marginTop: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.textDim, fontSize: 12 }}>
            Sale: {fmtCurrency(tx.sale_price)}
          </Text>
          <Text style={{ color: C.textDim, fontSize: 12 }}>
            {(tx.commission_pct * 100).toFixed(1)}% commission
          </Text>
          <Text style={{ color: C.textDim, fontSize: 12 }}>
            {new Date(tx.date).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
            })}
          </Text>
        </View>
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, gap: 12 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.cardBorder,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>
        {title}
      </Text>
      <Text
        style={{
          color: C.textDim,
          fontSize: 13,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {subtitle}
      </Text>
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
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={S.sheetTitle}>Log Transaction</Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: C.cardBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} color={C.textMuted} />
            </Pressable>
          </View>

          <Field
            label="Address"
            value={address}
            onChange={setAddress}
            placeholder="123 Main St"
          />
          <Field
            label="Sale Price"
            value={price}
            onChange={setPrice}
            placeholder="650,000"
            keyboardType="numeric"
          />
          <Field
            label="Commission %"
            value={commPct}
            onChange={setCommPct}
            placeholder="2.5"
            keyboardType="numeric"
          />

          <Text style={[S.fieldLabel, { marginBottom: 8 }]}>Side</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {(["buyer", "seller"] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSide(s)}
                style={[
                  S.segmentBtn,
                  side === s && {
                    backgroundColor: C.primary,
                    borderColor: C.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    S.segmentText,
                    side === s && { color: "#fff" },
                  ]}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={saving}
            style={[S.primaryBtn, { opacity: saving ? 0.7 : 1 }]}
          >
            <Text style={S.primaryBtnText}>
              {saving ? "Saving…" : "Save Transaction"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "numeric" | "default";
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={S.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        keyboardType={keyboardType ?? "default"}
        style={S.input}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.8,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  tabActive: {
    backgroundColor: C.primaryDim,
    borderColor: C.primaryBorder,
  },
  tabText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: "700",
  },
  tabTextActive: {
    color: C.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.textFaint,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  sheet: {
    backgroundColor: "#13131E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.cardBorder,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.textFaint,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.3,
  },
  fieldLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: "center",
  },
  segmentText: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: C.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
