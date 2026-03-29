/**
 * Goals & Settings Screen
 * View-only display of settings configured on the web dashboard.
 * Allows light editing of GCI goal and transaction goal.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Target,
  DollarSign,
  Handshake,
  BarChart3,
  Wallet,
  MapPin,
  Award,
  Check,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useDataStore } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
  fmtCurrency,
} from "@/lib/theme";

// ── Display formatters (DB values → human-readable) ────────────────────────

const PROVINCE_LABELS: Record<string, string> = {
  alberta: "Alberta",
  britishColumbia: "British Columbia",
  manitoba: "Manitoba",
  newBrunswick: "New Brunswick",
  newfoundland: "Newfoundland & Labrador",
  northwestTerritories: "Northwest Territories",
  novaScotia: "Nova Scotia",
  nunavut: "Nunavut",
  ontario: "Ontario",
  princeEdwardIsland: "Prince Edward Island",
  quebec: "Quebec",
  saskatchewan: "Saskatchewan",
  yukon: "Yukon",
};

const SPLIT_LABELS: Record<string, string> = {
  p70_30: "70/30",
  p75_25: "75/25",
  p80_20: "80/20",
  p85_15: "85/15",
  p90_10: "90/10",
  p95_5: "95/5",
  p100_0: "100/0",
};

function formatProvince(raw: string | null | undefined): string {
  if (!raw) return "Not set";
  return PROVINCE_LABELS[raw] ?? raw.replace(/([A-Z])/g, " $1").trim();
}

function formatSplit(raw: string | null | undefined): string {
  if (!raw) return "Not set";
  return SPLIT_LABELS[raw] ?? raw.replace(/_/g, "/").replace(/^p/, "");
}

export default function SettingsScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const store = useDataStore();
  const settings = store.settings;

  const [editingGci, setEditingGci] = useState(false);
  const [editingTx, setEditingTx] = useState(false);
  const [gciValue, setGciValue] = useState(String(settings?.goal_gci ?? ""));
  const [txValue, setTxValue] = useState(String(settings?.goal_transactions ?? ""));
  const [saving, setSaving] = useState(false);

  const saveGci = async () => {
    const num = parseInt(gciValue.replace(/[^0-9]/g, ""), 10);
    if (!num || num < 1000) {
      Alert.alert("Invalid", "Enter a valid GCI goal (min $1,000).");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("user_settings").update({ goal_gci: num }).eq("user_id", user.id);
      await store.fetchAll();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", "Failed to update goal. Try again.");
    } finally {
      setSaving(false);
      setEditingGci(false);
    }
  };

  const saveTx = async () => {
    const num = parseInt(txValue.replace(/[^0-9]/g, ""), 10);
    if (!num || num < 1) {
      Alert.alert("Invalid", "Enter a valid transaction goal.");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("user_settings").update({ goal_transactions: num }).eq("user_id", user.id);
      await store.fetchAll();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", "Failed to update goal. Try again.");
    } finally {
      setSaving(false);
      setEditingTx(false);
    }
  };

  const goalGci = settings?.goal_gci ?? 0;
  const goalTx = settings?.goal_transactions ?? 0;
  const cashReserve = settings?.cash_reserve ?? 0;
  const monthlyFee = settings?.monthly_brokerage_fee ?? 0;
  const province = formatProvince(settings?.province);
  const experience = settings?.experience_years;
  const splitPreset = formatSplit(settings?.split_preset);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 100, paddingTop: Space.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Annual Goals ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.md }}>ANNUAL GOALS</Text>
        <View style={[{ backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" }, sh.card]}>
          {/* GCI Goal */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: Space.lg, gap: Space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.goldDim, alignItems: "center", justifyContent: "center" }}>
              <DollarSign size={20} color={c.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.caption, color: c.textDim }}>GCI Target</Text>
              {editingGci ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: 4 }}>
                  <TextInput
                    value={gciValue}
                    onChangeText={setGciValue}
                    keyboardType="number-pad"
                    autoFocus
                    style={{ flex: 1, ...Type.bodyBold, color: c.text, borderBottomWidth: 1, borderBottomColor: c.primary, paddingVertical: 4 }}
                    placeholder="e.g. 200000"
                    placeholderTextColor={c.textDim}
                  />
                  <Pressable onPress={saveGci} disabled={saving} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                    <Check size={16} color="#FFF" />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => { setGciValue(String(goalGci || "")); setEditingGci(true); }}>
                  <Text style={{ ...Type.bodyBold, color: goalGci > 0 ? c.gold : c.textDim, marginTop: 2 }}>
                    {goalGci > 0 ? fmtCurrency(goalGci) : "Tap to set"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 40 + Space.md + Space.lg }} />

          {/* Transaction Goal */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: Space.lg, gap: Space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: c.successDim, alignItems: "center", justifyContent: "center" }}>
              <Handshake size={20} color={c.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.caption, color: c.textDim }}>Transaction Target</Text>
              {editingTx ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, marginTop: 4 }}>
                  <TextInput
                    value={txValue}
                    onChangeText={setTxValue}
                    keyboardType="number-pad"
                    autoFocus
                    style={{ flex: 1, ...Type.bodyBold, color: c.text, borderBottomWidth: 1, borderBottomColor: c.primary, paddingVertical: 4 }}
                    placeholder="e.g. 20"
                    placeholderTextColor={c.textDim}
                  />
                  <Pressable onPress={saveTx} disabled={saving} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
                    <Check size={16} color="#FFF" />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => { setTxValue(String(goalTx || "")); setEditingTx(true); }}>
                  <Text style={{ ...Type.bodyBold, color: goalTx > 0 ? c.success : c.textDim, marginTop: 2 }}>
                    {goalTx > 0 ? `${goalTx} deals` : "Tap to set"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Business Profile ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginTop: Space.section, marginBottom: Space.md }}>BUSINESS PROFILE</Text>
        <View style={[{ backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" }, sh.card]}>
          <SettingRow icon={<MapPin size={18} color={c.cyan} />} iconBg={c.cyanDim} label="Province" value={province} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 40 + Space.md + Space.lg }} />
          <SettingRow icon={<Award size={18} color={c.purple} />} iconBg={c.purpleDim} label="Experience" value={experience != null ? `${experience} years` : "Not set"} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 40 + Space.md + Space.lg }} />
          <SettingRow icon={<BarChart3 size={18} color={c.primary} />} iconBg={c.primaryDim} label="Commission Split" value={splitPreset ?? "Not set"} c={c} />
        </View>

        {/* ── Financial ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginTop: Space.section, marginBottom: Space.md }}>FINANCIAL</Text>
        <View style={[{ backgroundColor: c.card, borderRadius: Radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: "hidden" }, sh.card]}>
          <SettingRow icon={<Wallet size={18} color={c.success} />} iconBg={c.successDim} label="Cash Reserve" value={cashReserve > 0 ? fmtCurrency(cashReserve) : "Not set"} c={c} />
          <View style={{ height: 1, backgroundColor: c.cardBorder, marginLeft: 40 + Space.md + Space.lg }} />
          <SettingRow icon={<DollarSign size={18} color={c.warning} />} iconBg={c.warningDim} label="Monthly Brokerage Fee" value={monthlyFee > 0 ? fmtCurrency(monthlyFee) : "Not set"} c={c} />
        </View>

        {/* ── Info Banner ── */}
        <View style={{ marginTop: Space.xxl, backgroundColor: c.primaryDim, borderRadius: Radius.lg, padding: Space.lg, borderWidth: 1, borderColor: c.primaryBorder }}>
          <Text style={{ ...Type.caption, color: c.primaryLight, textAlign: "center" }}>
            Advanced settings like commission splits, seasonal weights, and tax configuration are managed on the web dashboard.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ icon, iconBg, label, value, c }: { icon: React.ReactNode; iconBg: string; label: string; value: string; c: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", padding: Space.lg, gap: Space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Type.caption, color: c.textDim }}>{label}</Text>
        <Text style={{ ...Type.bodyBold, color: c.text, marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}
