/**
 * Goals & Settings Screen
 *
 * Mobile parity for the Goal + Province + Commission Split + Runway-input
 * (cash reserve) sections of the web Settings page
 * (`apps/web/app/(app)/settings/settings-content.tsx`). Editable here:
 *   - GCI goal           → `goal_gci`           (web `saveGoal`)
 *   - Transaction goal   → `goal_transactions`  (mobile-only convenience;
 *                          web does not surface a transaction-goal editor,
 *                          but the column is canonical and mobile already
 *                          shipped this editor — kept as-is)
 *   - Province           → `province`           (web `saveProvince`)
 *   - Commission split   → `split_preset`       (web `saveSplit`)
 *   - Cash reserve       → `cash_reserve`       (web `saveRunway`)
 *
 * Each field writes the SAME `user_settings` column with the SAME write
 * shape as the corresponding web handler. Province/split selection uses a
 * bottom Sheet over the canonical option lists from
 * `@agent-runway/core/types/database` (`PROVINCE_LABELS`, `SplitPreset`,
 * `SPLIT_PRESET_AGENT_PCT`) — no duplicated label maps. Direct supabase
 * client writes, RLS-scoped to the authed user.
 *
 * Cash reserve borders on financial framing, so its helper copy uses the
 * info-not-advice baseline (safe verbs only: "may", "is not a target").
 * Monthly brokerage fee and other advanced tax settings stay view-only /
 * web-managed per the mobile-vs-web scope policy.
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
  DollarSign,
  Handshake,
  BarChart3,
  Wallet,
  MapPin,
  Award,
  Check,
  ChevronRight,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  PROVINCE_LABELS,
  SPLIT_PRESET_AGENT_PCT,
  type Province,
  type SplitPreset,
} from "@agent-runway/core/types/database";
import { useDataStore } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/useT";
import { Sheet } from "@/components/ui";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
  fmtCurrency,
} from "@/lib/theme";

// ── Option ordering (canonical values from core) ───────────────────────────
// Provinces in the same alphabetical order the web <Select> renders them
// (Object.entries(PROVINCE_LABELS)). Splits in the same order as the web
// preset buttons (highest brokerage take → highest agent take).

const PROVINCE_VALUES = Object.keys(PROVINCE_LABELS) as Province[];

const SPLIT_VALUES: SplitPreset[] = [
  "p70_30",
  "p75_25",
  "p80_20",
  "p85_15",
  "p90_10",
  "p95_5",
  "p100_0",
];

/** Human "75/25" label derived from the canonical agent-pct map. */
function splitLabel(preset: SplitPreset): string {
  const agentPct = Math.round(SPLIT_PRESET_AGENT_PCT[preset] * 100);
  return `${agentPct}/${100 - agentPct}`;
}

export default function SettingsScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useT("profile");
  const store = useDataStore();
  const settings = store.settings;

  const [editingGci, setEditingGci] = useState(false);
  const [editingTx, setEditingTx] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [gciValue, setGciValue] = useState(String(settings?.goal_gci ?? ""));
  const [txValue, setTxValue] = useState(
    String(settings?.goal_transactions ?? ""),
  );
  const [cashValue, setCashValue] = useState(
    String(settings?.cash_reserve ?? ""),
  );
  const [provinceSheet, setProvinceSheet] = useState(false);
  const [splitSheet, setSplitSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Write handlers — each mirrors a web Settings handler exactly ──────────

  async function updateColumn(
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("user_settings")
        .update(patch)
        .eq("user_id", user.id);
      if (error) throw error;
      await store.fetchAll();
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      return true;
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      Alert.alert(t("settings.errorTitle"), t("settings.errorBody"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const saveGci = async () => {
    // Mirror web `saveGoal`: update({ goal_gci: parseFloat(goalGCI) || 0 }).
    const num = parseInt(gciValue.replace(/[^0-9]/g, ""), 10);
    if (!num || num < 1000) {
      Alert.alert(t("settings.invalidTitle"), t("settings.invalidGci"));
      return;
    }
    if (await updateColumn({ goal_gci: num })) setEditingGci(false);
  };

  const saveTx = async () => {
    const num = parseInt(txValue.replace(/[^0-9]/g, ""), 10);
    if (!num || num < 1) {
      Alert.alert(t("settings.invalidTitle"), t("settings.invalidTx"));
      return;
    }
    if (await updateColumn({ goal_transactions: num })) setEditingTx(false);
  };

  const saveCash = async () => {
    // Mirror web `saveRunway`: update({ cash_reserve: parseFloat(...) || 0 }).
    // Web allows 0 and has no minimum, so mobile rejects only non-numeric.
    const raw = cashValue.replace(/[^0-9.]/g, "");
    const num = parseFloat(raw);
    if (cashValue.trim() !== "" && Number.isNaN(num)) {
      Alert.alert(t("settings.invalidTitle"), t("settings.invalidCash"));
      return;
    }
    if (await updateColumn({ cash_reserve: num || 0 })) setEditingCash(false);
  };

  const saveProvince = async (province: Province) => {
    // Mirror web `saveProvince`: update({ province }).
    setProvinceSheet(false);
    await updateColumn({ province });
  };

  const saveSplit = async (split_preset: SplitPreset) => {
    // Mirror web `saveSplit`: update({ split_preset }).
    setSplitSheet(false);
    await updateColumn({ split_preset });
  };

  // ── Derived display values ────────────────────────────────────────────────
  const goalGci = settings?.goal_gci ?? 0;
  const goalTx = settings?.goal_transactions ?? 0;
  const cashReserve = settings?.cash_reserve ?? 0;
  const monthlyFee = settings?.monthly_brokerage_fee ?? 0;
  const provinceRaw = settings?.province as Province | undefined;
  const provinceLabel = provinceRaw
    ? PROVINCE_LABELS[provinceRaw]
    : t("settings.notSet");
  const experience = settings?.experience_years;
  const splitRaw = settings?.split_preset as SplitPreset | undefined;
  const splitText = splitRaw ? splitLabel(splitRaw) : t("settings.notSet");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingBottom: 100,
          paddingTop: Space.md,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Annual Goals ── */}
        <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.md }}>
          {t("settings.annualGoals")}
        </Text>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
            },
            sh.card,
          ]}
        >
          {/* GCI Goal */}
          <EditableRow
            icon={<DollarSign size={20} color={c.gold} />}
            iconBg={c.goldDim}
            label={t("settings.gciTarget")}
            editing={editingGci}
            value={
              goalGci > 0 ? fmtCurrency(goalGci) : t("settings.tapToSet")
            }
            valueColor={goalGci > 0 ? c.gold : c.textDim}
            inputValue={gciValue}
            onChangeText={setGciValue}
            placeholder={t("settings.gciPlaceholder")}
            onBeginEdit={() => {
              setGciValue(String(goalGci || ""));
              setEditingGci(true);
            }}
            onSave={saveGci}
            saving={saving}
            c={c}
          />
          <RowDivider c={c} />
          {/* Transaction Goal */}
          <EditableRow
            icon={<Handshake size={20} color={c.success} />}
            iconBg={c.successDim}
            label={t("settings.transactionTarget")}
            editing={editingTx}
            value={
              goalTx > 0
                ? t("settings.deals", { count: goalTx })
                : t("settings.tapToSet")
            }
            valueColor={goalTx > 0 ? c.success : c.textDim}
            inputValue={txValue}
            onChangeText={setTxValue}
            placeholder={t("settings.txPlaceholder")}
            onBeginEdit={() => {
              setTxValue(String(goalTx || ""));
              setEditingTx(true);
            }}
            onSave={saveTx}
            saving={saving}
            c={c}
          />
        </View>

        {/* ── Business Profile ── */}
        <Text
          style={{
            ...Type.label,
            color: c.textMuted,
            marginTop: Space.section,
            marginBottom: Space.md,
          }}
        >
          {t("settings.businessProfile")}
        </Text>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
            },
            sh.card,
          ]}
        >
          {/* Province — now editable via Sheet */}
          <SelectRow
            icon={<MapPin size={18} color={c.cyan} />}
            iconBg={c.cyanDim}
            label={t("settings.province")}
            value={provinceLabel}
            onPress={() => setProvinceSheet(true)}
            c={c}
          />
          <RowDivider c={c} />
          {/* Experience — view-only (edited via web/onboarding) */}
          <SelectRow
            icon={<Award size={18} color={c.purple} />}
            iconBg={c.purpleDim}
            label={t("settings.experience")}
            value={
              experience != null
                ? t("settings.years", { count: experience })
                : t("settings.notSet")
            }
            c={c}
          />
          <RowDivider c={c} />
          {/* Commission Split — now editable via Sheet */}
          <SelectRow
            icon={<BarChart3 size={18} color={c.primary} />}
            iconBg={c.primaryDim}
            label={t("settings.commissionSplit")}
            value={splitText}
            onPress={() => setSplitSheet(true)}
            c={c}
          />
        </View>

        {/* ── Financial ── */}
        <Text
          style={{
            ...Type.label,
            color: c.textMuted,
            marginTop: Space.section,
            marginBottom: Space.md,
          }}
        >
          {t("settings.financial")}
        </Text>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
            },
            sh.card,
          ]}
        >
          {/* Cash Reserve — now editable inline */}
          <EditableRow
            icon={<Wallet size={20} color={c.success} />}
            iconBg={c.successDim}
            label={t("settings.cashReserve")}
            editing={editingCash}
            value={
              cashReserve > 0
                ? fmtCurrency(cashReserve)
                : t("settings.tapToSet")
            }
            valueColor={cashReserve > 0 ? c.success : c.textDim}
            inputValue={cashValue}
            onChangeText={setCashValue}
            placeholder={t("settings.cashPlaceholder")}
            onBeginEdit={() => {
              setCashValue(String(cashReserve || ""));
              setEditingCash(true);
            }}
            onSave={saveCash}
            saving={saving}
            c={c}
          />
          <RowDivider c={c} />
          {/* Monthly Brokerage Fee — view-only (web-managed) */}
          <SelectRow
            icon={<DollarSign size={18} color={c.warning} />}
            iconBg={c.warningDim}
            label={t("settings.monthlyBrokerageFee")}
            value={monthlyFee > 0 ? fmtCurrency(monthlyFee) : t("settings.notSet")}
            c={c}
          />
        </View>

        {/* Cash-reserve note — info-not-advice framing (safe verbs only) */}
        <Text
          style={{
            ...Type.micro,
            color: c.textDim,
            marginTop: Space.md,
            paddingHorizontal: Space.xs,
          }}
        >
          {t("settings.cashReserveNote")}
        </Text>

        {/* ── Info Banner ── */}
        <View
          style={{
            marginTop: Space.xxl,
            backgroundColor: c.primaryDim,
            borderRadius: Radius.lg,
            padding: Space.lg,
            borderWidth: 1,
            borderColor: c.primaryBorder,
          }}
        >
          <Text style={{ ...Type.caption, color: c.primaryLight, textAlign: "center" }}>
            {t("settings.infoBanner")}
          </Text>
        </View>
      </ScrollView>

      {/* ── Province picker Sheet ── */}
      <Sheet
        visible={provinceSheet}
        onClose={() => setProvinceSheet(false)}
        title={t("settings.selectProvince")}
      >
        {PROVINCE_VALUES.map((val) => (
          <OptionRow
            key={val}
            label={PROVINCE_LABELS[val]}
            selected={provinceRaw === val}
            onPress={() => saveProvince(val)}
            disabled={saving}
            c={c}
          />
        ))}
      </Sheet>

      {/* ── Commission split picker Sheet ── */}
      <Sheet
        visible={splitSheet}
        onClose={() => setSplitSheet(false)}
        title={t("settings.selectSplit")}
      >
        {SPLIT_VALUES.map((val) => (
          <OptionRow
            key={val}
            label={splitLabel(val)}
            selected={splitRaw === val}
            onPress={() => saveSplit(val)}
            disabled={saving}
            c={c}
          />
        ))}
      </Sheet>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function RowDivider({ c }: { c: ReturnType<typeof useColors> }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: c.cardBorder,
        marginLeft: 40 + Space.md + Space.lg,
      }}
    />
  );
}

/** A row with a tap-to-edit inline TextInput (GCI / transaction / cash). */
function EditableRow({
  icon,
  iconBg,
  label,
  editing,
  value,
  valueColor,
  inputValue,
  onChangeText,
  placeholder,
  onBeginEdit,
  onSave,
  saving,
  c,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  editing: boolean;
  value: string;
  valueColor: string;
  inputValue: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  onBeginEdit: () => void;
  onSave: () => void;
  saving: boolean;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: Space.lg,
        gap: Space.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: Radius.md,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Type.caption, color: c.textDim }}>{label}</Text>
        {editing ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Space.sm,
              marginTop: 4,
            }}
          >
            <TextInput
              value={inputValue}
              onChangeText={onChangeText}
              keyboardType="number-pad"
              autoFocus
              style={{
                flex: 1,
                ...Type.bodyBold,
                color: c.text,
                borderBottomWidth: 1,
                borderBottomColor: c.primary,
                paddingVertical: 4,
              }}
              placeholder={placeholder}
              placeholderTextColor={c.textDim}
            />
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: c.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Check size={16} color="#FFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onBeginEdit}>
            <Text style={{ ...Type.bodyBold, color: valueColor, marginTop: 2 }}>
              {value}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * A row that either opens a picker Sheet (when `onPress` is provided) or is
 * read-only (no `onPress`). Read-only rows omit the chevron.
 */
function SelectRow({
  icon,
  iconBg,
  label,
  value,
  onPress,
  c,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  onPress?: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: Space.lg,
        gap: Space.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: Radius.md,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Type.caption, color: c.textDim }}>{label}</Text>
        <Text style={{ ...Type.bodyBold, color: c.text, marginTop: 2 }}>
          {value}
        </Text>
      </View>
      {onPress && <ChevronRight size={16} color={c.textFaint} />}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/** A selectable option row inside a picker Sheet. */
function OptionRow({
  label,
  selected,
  onPress,
  disabled,
  c,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: Space.md,
        paddingHorizontal: Space.xs,
        opacity: pressed ? 0.6 : 1,
        borderBottomWidth: 1,
        borderBottomColor: c.divider,
      })}
    >
      <Text
        style={{
          ...Type.body,
          color: selected ? c.primary : c.text,
          fontWeight: selected ? "700" : "500",
        }}
      >
        {label}
      </Text>
      {selected && <Check size={18} color={c.primary} />}
    </Pressable>
  );
}
