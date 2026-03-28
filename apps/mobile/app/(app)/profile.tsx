/**
 * Profile / More Screen
 * Premium, theme-aware with light/dark toggle.
 */

import { View, Text, Pressable, ScrollView, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect,
} from "react-native-svg";
import {
  Plane,
  TrendingUp,
  ChevronRight,
  Receipt,
  Target,
  Zap,
  Sun,
  Moon,
} from "lucide-react-native";
import {
  useColors,
  useTheme,
  shadows,
  fmtCurrency,
  getInitials,
  Space,
  Radius,
  Type,
} from "@/lib/theme";
import { Card, Badge, Button, Avatar } from "@/components/ui";

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const store = useDataStore();
  const settings = store.settings;
  const router = useRouter();

  const { mode, toggle } = useTheme();
  const c = useColors();
  const sh = shadows(mode);

  const displayName =
    settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const initials = getInitials(displayName);

  const ytdGci = store.ytdGci();
  const ytdDeals = store.ytdDealCount();
  const goalGci = settings?.goal_gci ?? 0;
  const goalPct = goalGci > 0 ? Math.round((ytdGci / goalGci) * 100) : null;

  const isDark = mode === "dark";

  // SVG gradient stops — theme-aware
  const gradStart = isDark ? "#1C1C3E" : "#E8E6FF";
  const gradEnd = isDark ? "#0D0D1A" : "#F4F3FF";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Screen Title ── */}
        <Text
          style={{
            ...Type.hero,
            color: c.text,
            paddingTop: Space.xl,
            paddingBottom: Space.sm,
          }}
        >
          More
        </Text>

        {/* ── User Card (SVG gradient) ── */}
        <View
          style={[
            {
              borderRadius: Radius.xl,
              overflow: "hidden",
              marginTop: Space.lg,
              borderWidth: 1,
              borderColor: c.cardBorder,
            },
            sh.cardLg,
          ]}
        >
          {/* SVG background — sized to fill container */}
          <Svg
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <Defs>
              <SvgGrad id="profileGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={gradStart} stopOpacity="1" />
                <Stop offset="1" stopColor={gradEnd} stopOpacity="1" />
              </SvgGrad>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#profileGrad)" />
          </Svg>

          {/* User info row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Space.lg,
              padding: Space.xl,
            }}
          >
            <Avatar name={displayName} size="lg" color={c.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ ...Type.h2, color: c.text }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                style={{
                  ...Type.caption,
                  color: c.textMuted,
                  marginTop: Space.xs,
                }}
                numberOfLines={1}
              >
                {user?.email ?? ""}
              </Text>
              {settings?.province && (
                <Text
                  style={{
                    ...Type.micro,
                    color: c.textDim,
                    marginTop: Space.xs,
                  }}
                  numberOfLines={1}
                >
                  {settings.province} · {settings.experience_years ?? "?"} yrs
                  exp
                </Text>
              )}
            </View>
            {settings?.subscription_tier && (
              <Badge
                label={
                  settings.subscription_tier === "professional"
                    ? "Pro"
                    : "Free"
                }
                color={
                  settings.subscription_tier === "professional"
                    ? c.gold
                    : c.textDim
                }
                size="sm"
              />
            )}
          </View>

          {/* Stats row */}
          <View
            style={{
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: c.cardBorder,
            }}
          >
            <StatCell
              label="YTD GCI"
              value={fmtCurrency(ytdGci)}
              color={c.success}
              textDim={c.textDim}
            />
            <View style={{ width: 1, backgroundColor: c.cardBorder }} />
            <StatCell
              label="Deals Closed"
              value={String(ytdDeals)}
              color={c.text}
              textDim={c.textDim}
            />
            <View style={{ width: 1, backgroundColor: c.cardBorder }} />
            <StatCell
              label="Goal"
              value={goalPct !== null ? `${goalPct}%` : "\u2014"}
              color={
                goalPct === null
                  ? c.textDim
                  : goalPct >= 100
                    ? c.success
                    : goalPct >= 50
                      ? c.primary
                      : c.warning
              }
              textDim={c.textDim}
            />
          </View>
        </View>

        {/* ── Tools Section ── */}
        <View style={{ marginTop: Space.section }}>
          <Text
            style={{
              ...Type.h3,
              color: c.text,
              marginBottom: Space.md,
            }}
          >
            Tools
          </Text>
          <Card style={{ padding: 0, marginHorizontal: 0 }}>
            <MenuItem
              icon={<Plane size={18} color={c.primary} />}
              iconBg={c.primaryDim}
              label="Flight Control"
              description="Review and send AI-drafted outreach"
              onPress={() => router.push("/outreach")}
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<TrendingUp size={18} color={c.cyan} />}
              iconBg={c.cyanDim}
              label="Income Forecast"
              description="Year-end projections and pacing"
              onPress={() => router.push("/forecast")}
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Receipt size={18} color={c.success} />}
              iconBg={c.successDim}
              label="Scan Receipt"
              description="Capture and log business expenses"
              onPress={() => router.push("/expenses")}
              c={c}
            />
          </Card>
        </View>

        {/* ── Account Section ── */}
        <View style={{ marginTop: Space.section }}>
          <Text
            style={{
              ...Type.h3,
              color: c.text,
              marginBottom: Space.md,
            }}
          >
            Account
          </Text>
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
                  Appearance
                </Text>
                <Text
                  style={{
                    ...Type.caption,
                    color: c.textDim,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {isDark ? "Dark" : "Light"} mode
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
              icon={<Zap size={18} color={c.warning} />}
              iconBg={c.warningDim}
              label="Subscription"
              description={
                settings?.subscription_tier === "professional"
                  ? "Professional \u00B7 Active"
                  : "Free plan"
              }
              onPress={() =>
                Alert.alert(
                  "Subscription",
                  "Manage your subscription on the web dashboard."
                )
              }
              c={c}
            />
            <Divider c={c} />
            <MenuItem
              icon={<Target size={18} color={c.purple} />}
              iconBg={c.purpleDim}
              label="Goals & Settings"
              description={
                goalGci > 0
                  ? `GCI goal: ${fmtCurrency(goalGci)}`
                  : "Set your annual targets"
              }
              onPress={() =>
                Alert.alert(
                  "Coming Soon",
                  "Goals & Settings will be available in the next update."
                )
              }
              c={c}
            />
          </Card>
        </View>

        {/* ── Sign Out ── */}
        <View style={{ marginTop: Space.section }}>
          <Button
            variant="danger"
            label="Sign Out"
            onPress={signOut}
            icon="log-out-outline"
          />
        </View>

        {/* ── Version ── */}
        <Text
          style={{
            ...Type.micro,
            color: c.textFaint,
            textAlign: "center",
            marginTop: Space.xxl,
          }}
        >
          Agent Runway · v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  color,
  textDim,
}: {
  label: string;
  value: string;
  color: string;
  textDim: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: Space.lg,
        overflow: "hidden",
      }}
    >
      <Text
        style={{
          ...Type.h3,
          color,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={{
          ...Type.label,
          color: textDim,
          marginTop: Space.xs,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

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
