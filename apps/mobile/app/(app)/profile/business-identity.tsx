/**
 * Business Identity — mobile screen.
 *
 * Mobile parity for the "Part B — Business Identity" section in the web
 * Settings page (`apps/web/app/(app)/settings/settings-content.tsx`).
 * Both surfaces consume the same canonical option lists + completion
 * derivation from `@agent-runway/core/business-identity`.
 *
 * Flow:
 *   1. Single scrollable form with 6 sections (specialty, market type,
 *      business model, lead sources, years experience, price range).
 *   2. Multi-select chips for the three list fields; single-select chips
 *      for the three scalar fields.
 *   3. Save persists `business_identity` (JSONB) on `user_settings`.
 *      Direct supabase client write — same pattern as
 *      `apps/mobile/app/(app)/profile/voice-quiz.tsx` (`handleSave`),
 *      RLS-scoped to the authed user. No new `/api/mobile/business-identity`
 *      route — JSONB writes from mobile already flow direct.
 *
 * UX choice — chip-toggle vs. picker for `lead_sources`:
 *   The web settings surface uses chip-toggles for all six fields, so
 *   mobile mirrors that to keep the interaction model consistent. With
 *   only 5 lead-source options the chip set comfortably fits a single
 *   small-screen row-wrap; a picker would feel heavier than the data
 *   warrants. Flag this in the PR body for Andrew to revisit in Expo Go
 *   if the wrap feels cramped on smaller devices.
 *
 * Business Identity is brand-affinity / market intake — not tax — so
 * the screen skips `TaxBoundary` intentionally per the mobile parity
 * dispatch (2026-05-28).
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  SPECIALTY_OPTIONS,
  MARKET_TYPE_OPTIONS,
  BUSINESS_MODEL_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  YEARS_EXPERIENCE_OPTIONS,
  PRICE_RANGE_OPTIONS,
  EMPTY_BUSINESS_IDENTITY,
  computeBusinessIdentityCompleted,
  type BusinessIdentity,
} from "@agent-runway/core/business-identity";
import { useDataStore } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/useT";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
} from "@/lib/theme";
import { Briefcase, Check, ChevronLeft } from "lucide-react-native";

// ── Helpers ────────────────────────────────────────────────────────────────

function toggleMulti<T extends string>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function BusinessIdentityScreen() {
  const router = useRouter();
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useT("profile");
  const store = useDataStore();
  const existing = store.settings?.business_identity ?? EMPTY_BUSINESS_IDENTITY;

  const [bi, setBi] = useState<BusinessIdentity>(existing);
  const [saving, setSaving] = useState(false);

  // Section count for the progress label. Mirrors the inline progress
  // count on web (Sparkles card header) but counts ALL six sections, not
  // just the three that drive the `completed` flag. Pure UX feedback.
  const sectionsSet = [
    bi.specialty.length > 0,
    bi.market_type.length > 0,
    !!bi.business_model,
    bi.lead_sources.length > 0,
    !!bi.years_experience,
    !!bi.avg_price_range,
  ].filter(Boolean).length;

  function toggleChip<K extends keyof BusinessIdentity>(
    key: K,
    value: string,
    kind: "multi" | "single",
  ) {
    Haptics.selectionAsync().catch(() => {
      /* haptics is best-effort */
    });
    if (kind === "multi") {
      setBi((prev) => ({
        ...prev,
        [key]: toggleMulti(prev[key] as string[], value),
      }));
    } else {
      setBi((prev) => ({
        ...prev,
        [key]: prev[key] === value ? "" : value,
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated: BusinessIdentity = {
        ...bi,
        completed: computeBusinessIdentityCompleted(bi),
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Mirror of web `saveAiProfile` in
      // `apps/web/app/(app)/settings/settings-content.tsx`. Web writes
      // both `business_identity` and `agent_goals` in one update; mobile
      // only writes BI here because `agent_goals` lives on the next
      // dispatch (Signature Phrases / Hard No-Gos / On My Mind).
      const { error } = await supabase
        .from("user_settings")
        .update({
          business_identity: updated as unknown as Record<string, unknown>,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await store.fetchAll();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {
          /* haptics is best-effort */
        },
      );
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {
          /* haptics is best-effort */
        },
      );
      Alert.alert(
        t("businessIdentity.saveErrorTitle"),
        t("businessIdentity.saveErrorBody"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingTop: Space.md,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Space.sm,
            marginBottom: Space.xs,
          }}
        >
          <Briefcase size={18} color={c.purple} />
          <Text style={{ ...Type.h2, color: c.text }}>
            {t("businessIdentity.title")}
          </Text>
        </View>
        <Text
          style={{
            ...Type.caption,
            color: c.textDim,
            marginBottom: Space.md,
          }}
        >
          {t("businessIdentity.subtitle")}
        </Text>

        {/* ── Progress chip ── */}
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: c.purpleDim,
            paddingHorizontal: Space.md,
            paddingVertical: 4,
            borderRadius: Radius.pill,
            marginBottom: Space.xl,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: c.purple,
            }}
          >
            {t("businessIdentity.completionLabel", { count: sectionsSet })}
          </Text>
        </View>

        {/* ── Sections ── */}
        <Section
          label={t("businessIdentity.specialtyLabel")}
          hint={t("businessIdentity.specialtyHint")}
          c={c}
          sh={sh}
        >
          {SPECIALTY_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.specialtyOptions.${val}`)}
              selected={bi.specialty.includes(val)}
              accent={c.purple}
              accentDim={c.purpleDim}
              c={c}
              onPress={() => toggleChip("specialty", val, "multi")}
            />
          ))}
        </Section>

        <Section
          label={t("businessIdentity.marketTypeLabel")}
          hint={t("businessIdentity.marketTypeHint")}
          c={c}
          sh={sh}
        >
          {MARKET_TYPE_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.marketTypeOptions.${val}`)}
              selected={bi.market_type.includes(val)}
              accent={c.purple}
              accentDim={c.purpleDim}
              c={c}
              onPress={() => toggleChip("market_type", val, "multi")}
            />
          ))}
        </Section>

        <Section
          label={t("businessIdentity.businessModelLabel")}
          hint={t("businessIdentity.businessModelHint")}
          c={c}
          sh={sh}
        >
          {BUSINESS_MODEL_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.businessModelOptions.${val}`)}
              selected={bi.business_model === val}
              accent={c.purple}
              accentDim={c.purpleDim}
              c={c}
              onPress={() => toggleChip("business_model", val, "single")}
            />
          ))}
        </Section>

        <Section
          label={t("businessIdentity.leadSourcesLabel")}
          hint={t("businessIdentity.leadSourcesHint")}
          c={c}
          sh={sh}
        >
          {LEAD_SOURCE_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.leadSourcesOptions.${val}`)}
              selected={bi.lead_sources.includes(val)}
              accent={c.gold}
              accentDim={c.goldDim}
              c={c}
              onPress={() => toggleChip("lead_sources", val, "multi")}
            />
          ))}
        </Section>

        <Section
          label={t("businessIdentity.yearsExperienceLabel")}
          hint={t("businessIdentity.yearsExperienceHint")}
          c={c}
          sh={sh}
        >
          {YEARS_EXPERIENCE_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.yearsExperienceOptions.${val}`)}
              selected={bi.years_experience === val}
              accent={c.purple}
              accentDim={c.purpleDim}
              c={c}
              onPress={() => toggleChip("years_experience", val, "single")}
            />
          ))}
        </Section>

        <Section
          label={t("businessIdentity.priceRangeLabel")}
          hint={t("businessIdentity.priceRangeHint")}
          c={c}
          sh={sh}
        >
          {PRICE_RANGE_OPTIONS.map(({ val }) => (
            <Chip
              key={val}
              label={t(`businessIdentity.priceRangeOptions.${val}`)}
              selected={bi.avg_price_range === val}
              accent={c.purple}
              accentDim={c.purpleDim}
              c={c}
              onPress={() => toggleChip("avg_price_range", val, "single")}
            />
          ))}
        </Section>

        {/* ── Actions ── */}
        <View
          style={{
            flexDirection: "row",
            gap: Space.md,
            marginTop: Space.xl,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            disabled={saving}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: Space.xs,
              paddingVertical: Space.md,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: c.cardBorder,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ChevronLeft size={16} color={c.textMuted} />
            <Text style={{ ...Type.bodyBold, color: c.textMuted }}>
              {t("voiceQuiz.back")}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => ({
              flex: 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: Space.xs,
              paddingVertical: Space.md,
              borderRadius: Radius.lg,
              backgroundColor: c.purple,
              opacity: pressed ? 0.85 : saving ? 0.6 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Check size={16} color="#FFFFFF" />
            )}
            <Text style={{ ...Type.bodyBold, color: "#FFFFFF" }}>
              {saving
                ? t("businessIdentity.saving")
                : t("businessIdentity.save")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  c,
  sh,
  children,
}: {
  label: string;
  hint: string;
  c: ReturnType<typeof useColors>;
  sh: ReturnType<typeof shadows>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: Radius.xl,
          borderWidth: 1,
          borderColor: c.cardBorder,
          padding: Space.lg,
          marginBottom: Space.lg,
        },
        sh.card,
      ]}
    >
      <Text
        style={{
          ...Type.label,
          color: c.text,
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          ...Type.micro,
          color: c.textDim,
          marginBottom: Space.md,
        }}
      >
        {hint}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: Space.sm,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  accent,
  accentDim,
  c,
  onPress,
}: {
  label: string;
  selected: boolean;
  accent: string;
  accentDim: string;
  c: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: selected ? accent : c.cardBorder,
        backgroundColor: selected ? accentDim : c.card,
        paddingHorizontal: Space.md,
        paddingVertical: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: selected ? "700" : "500",
          color: selected ? accent : c.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
