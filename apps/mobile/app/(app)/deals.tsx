import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDataStore, type Transaction, type PipelineDeal } from "@/stores/data-store";

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

const STAGE_COLORS: Record<string, string> = {
  lead: "#6B7280",
  showing: "#3B82F6",
  offer: "#F59E0B",
  conditional: "#8B5CF6",
  firm: "#10B981",
};

type Tab = "closed" | "pending" | "pipeline";

export default function DealsScreen() {
  const { transactions, pipeline, fetchAll, addTransaction } = useDataStore();
  const [tab, setTab] = useState<Tab>("closed");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (transactions.length === 0) fetchAll();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const closed = transactions.filter((t) => t.status === "closed");
  const pending = transactions.filter((t) => t.status === "pending");
  const items = tab === "closed" ? closed : tab === "pending" ? pending : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <View style={{ padding: 20, paddingBottom: 0 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 }}>
            Deals
          </Text>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={{ backgroundColor: "#6366F1", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>+ Add</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 4, marginTop: 16 }}>
          {(["closed", "pending", "pipeline"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: tab === t ? "#6366F1" : "#1A1A2E",
                alignItems: "center",
              }}
            >
              <Text style={{ color: tab === t ? "#FFFFFF" : "#9CA3AF", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>
                {t} ({t === "closed" ? closed.length : t === "pending" ? pending.length : pipeline.length})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        {tab !== "pipeline" ? (
          items.length === 0 ? (
            <Text style={{ color: "#6B7280", textAlign: "center", marginTop: 40, fontSize: 14 }}>
              No {tab} deals yet.
            </Text>
          ) : (
            items.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
          )
        ) : pipeline.length === 0 ? (
          <Text style={{ color: "#6B7280", textAlign: "center", marginTop: 40, fontSize: 14 }}>
            No pipeline deals yet.
          </Text>
        ) : (
          pipeline.map((d) => <PipelineRow key={d.id} deal={d} />)
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

function TransactionRow({ tx }: { tx: Transaction }) {
  const gci = tx.gci_override ?? tx.sale_price * (tx.commission_pct / 100);
  return (
    <View style={{ backgroundColor: "#1A1A2E", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#2D2D44" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {tx.address ?? tx.client_name ?? "Deal"}
        </Text>
        <Text style={{ color: "#10B981", fontSize: 14, fontWeight: "700" }}>{fmtCurrency(gci)}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        <Text style={{ color: "#6B7280", fontSize: 11 }}>{tx.side}</Text>
        <Text style={{ color: "#6B7280", fontSize: 11 }}>{new Date(tx.close_date).toLocaleDateString()}</Text>
        {tx.client_name && <Text style={{ color: "#6B7280", fontSize: 11 }}>{tx.client_name}</Text>}
      </View>
    </View>
  );
}

function PipelineRow({ deal }: { deal: PipelineDeal }) {
  const c = STAGE_COLORS[deal.stage] ?? "#6B7280";
  return (
    <View style={{ backgroundColor: "#1A1A2E", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#2D2D44" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {deal.address ?? deal.client_name ?? "Deal"}
        </Text>
        <View style={{ backgroundColor: c + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ color: c, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>{deal.stage}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        <Text style={{ color: "#6B7280", fontSize: 11 }}>{fmtCurrency(deal.estimated_price)}</Text>
        {deal.expected_close_date && (
          <Text style={{ color: "#6B7280", fontSize: 11 }}>Close: {new Date(deal.expected_close_date).toLocaleDateString()}</Text>
        )}
      </View>
    </View>
  );
}

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
      commission_pct: pct,
      gci_override: null,
      side,
      status: "closed",
      client_name: null,
      notes: null,
      close_date: new Date().toISOString().split("T")[0],
    });
    setSaving(false);
    if (ok) { setAddress(""); setPrice(""); setCommPct("2.5"); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#1A1A2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>Add Transaction</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
          <Field label="Address" value={address} onChange={setAddress} placeholder="123 Main St" />
          <Field label="Sale Price" value={price} onChange={setPrice} placeholder="550000" keyboardType="numeric" />
          <Field label="Commission %" value={commPct} onChange={setCommPct} placeholder="2.5" keyboardType="numeric" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["buyer", "seller"] as const).map((s) => (
              <Pressable key={s} onPress={() => setSide(s)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: side === s ? "#6366F1" : "#2D2D44", alignItems: "center" }}>
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>{s}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={handleSubmit} disabled={saving} style={{ backgroundColor: "#6366F1", paddingVertical: 14, borderRadius: 10, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>{saving ? "Saving..." : "Save Transaction"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboardType?: "numeric" | "default" }) {
  return (
    <View>
      <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#4B5563" keyboardType={keyboardType ?? "default"} style={{ backgroundColor: "#0A0A0F", borderRadius: 8, padding: 12, color: "#FFFFFF", fontSize: 15, borderWidth: 1, borderColor: "#2D2D44" }} />
    </View>
  );
}
