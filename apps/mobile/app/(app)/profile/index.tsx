/**
 * You: settings only, opened from your initials at the top of Today
 * (2026-10-20 navigation cleanup; it was the "More" tab, with 19 rows under
 * a second copy of the stats and the Runway Score). The tools that lived
 * here moved to where they're used: Briefing, Checklist and Flight Control
 * on Today; Expenses, Mileage and Forecast on Money; AI activity on Flight
 * Crew; the Contacts tools on Clients' menu.
 */

import { useState } from "react";
import { View, Text, Pressable, ScrollView, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import {
  ChevronRight,
  Target,
  Zap,
  Sun,
  Moon,
  Bell,
  Globe,
  Shield,
  Sparkles,
  Briefcase,
} from "lucide-react-native";
import { getLocaleName, type SupportedLocale } from "@agent-runway/i18n";
import { useT } from "@/lib/useT";
import { NAV } from "@/lib/app-nav";
import { LanguagePicker } from "@/components/LanguagePicker";
import { useColors, useTheme, fmtCurrency, Space, Radius, Type } from "@/lib/theme";
import { Card, Button, Avatar } from "@/components/ui";

// ── Rows ─────────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  iconBg,
  label,
  description,
  onPress,
  c,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          padding: Space.lg,
          gap: Space.lg,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: Radius.md,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ ...Type.bodyBold, color: c.text }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={{
            ...Type.caption,
            color: c.textDim,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {description}
        </Text>
      </View>
      <ChevronRight size={16} color={c.textFaint} />
    </Pressable>
  );
}

function Divider({ c }: { c: ReturnType<typeof useColors> }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: c.cardBorder,
        marginLeft: 38 + Space.lg * 2,
      }}
    />
  );
}


// ── Screen ───────────────────────────────────────────────────────────────────

export default function YouScreen() {
  const { user, signOut } = useAuth();
  const settings = useDataStore((s) => s.settings);
  const router = useRouter();

  const { mode, toggle } = useTheme();
  const c = useColors();
  const { t, locale } = useT("profile");
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  const displayName = settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const goalGci = settings?.goal_gci ?? 0;
  const isDark = mode === "dark";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: Space.section }} showsVerticalScrollIndicator={false}>
        {/* ── Who's signed in ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space.md, marginTop: Space.lg }}>
          <Avatar name={displayName} size="md" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ ...Type.h3, color: c.text }} numberOfLines={1}>{displayName}</Text>
            {user?.email ? (
              <Text style={{ ...Type.caption, color: c.textMuted }} numberOfLines={1}>{user.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: Space.xl }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }}>{t("you.business")}</Text>
          <Card style={{ padding: 0, marginHorizontal: 0 }}>
            <MenuItem
              icon={<Target size={18} color={c.purple} />}
              iconBg={c.purpleDim}
              label={t("account.goals")}
              description={
                goalGci > 0
                  ? t("account.goalsWithValue", { value: fmtCurrency(goalGci) })
                  : t("account.goalsDesc")
              }
              onPress={() => router.push(NAV.goals)}
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Briefcase size={18} color={c.purple} />}
              iconBg={c.purpleDim}
              label={t("account.businessIdentity")}
              description={
                settings?.business_identity?.completed
                  ? t("account.businessIdentityCompleted")
                  : t("account.businessIdentityDesc")
              }
              onPress={() => router.push(NAV.businessIdentity)}
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Sparkles size={18} color={c.purple} />}
              iconBg={c.purpleDim}
              label={t("account.voiceQuiz")}
              description={
                settings?.communication_profile?.completed
                  ? t("account.voiceQuizCompleted")
                  : t("account.voiceQuizDesc")
              }
              onPress={() => router.push(NAV.voiceQuiz)}
              c={c}
            />
          </Card>
        </View>

        <View style={{ marginTop: Space.xxl }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }}>{t("you.app")}</Text>
          <Card style={{ padding: 0, marginHorizontal: 0 }}>
            {/* Theme Toggle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: Space.lg,
                gap: Space.lg,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: Radius.md,
                  backgroundColor: isDark ? c.purpleDim : c.warningDim,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {isDark ? (
                  <Moon size={18} color={c.purple} />
                ) : (
                  <Sun size={18} color={c.warning} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ ...Type.bodyBold, color: c.text }}
                  numberOfLines={1}
                >
                  {t("account.appearance")}
                </Text>
                <Text
                  style={{
                    ...Type.caption,
                    color: c.textDim,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {isDark ? t("account.darkMode") : t("account.lightMode")}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggle}
                trackColor={{
                  false: c.textFaint,
                  true: c.primary,
                }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={c.textFaint}
              />
            </View>

            <Divider c={c} />
            <MenuItem
              icon={<Bell size={18} color={c.warning} />}
              iconBg={c.warningDim}
              label={t("account.notifications")}
              description={t("account.notificationsDesc")}
              onPress={() => router.push(NAV.notifications)}
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Globe size={18} color={c.cyan} />}
              iconBg={c.cyanDim}
              label={t("account.language")}
              description={getLocaleName(locale as SupportedLocale)}
              onPress={() => setShowLanguagePicker(true)}
              c={c}
            />
          </Card>
        </View>

        <View style={{ marginTop: Space.xxl }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }}>{t("account.title")}</Text>
          <Card style={{ padding: 0, marginHorizontal: 0 }}>
            <MenuItem
              icon={<Zap size={18} color={c.warning} />}
              iconBg={c.warningDim}
              label={t("account.subscription")}
              description={
                settings?.subscription_tier === "professional"
                  ? t("account.subscriptionPro")
                  : t("account.subscriptionFree")
              }
              onPress={() =>
                Alert.alert(
                  t("account.subscription"),
                  t("account.subscriptionManage")
                )
              }
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Shield size={18} color={c.textSecondary} />}
              iconBg={c.cardBorder}
              label={t("account.legal")}
              description={t("account.legalDesc")}
              onPress={() => router.push(NAV.legal)}
              c={c}
            />
          </Card>
        </View>

        {/* ── Sign Out ── */}
        <View style={{ marginTop: Space.xxl }}>
          <Button variant="danger" label={t("signOut")} onPress={signOut} icon="log-out-outline" />
        </View>

        <Text style={{ ...Type.micro, color: c.textFaint, textAlign: "center", marginTop: Space.xxl }}>
          {t("version", { version: "1.0.0" })}
        </Text>
      </ScrollView>

      <LanguagePicker visible={showLanguagePicker} onClose={() => setShowLanguagePicker(false)} />
    </SafeAreaView>
  );
}
