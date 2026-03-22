import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
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
  LogOut,
  Receipt,
  Target,
  Settings,
  HelpCircle,
  Zap,
} from "lucide-react-native";
import { C, fmtCurrency, getInitials } from "@/lib/theme";

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const store = useDataStore();
  const settings = store.settings;
  const router = useRouter();

  const displayName =
    settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";
  const initials = getInitials(displayName);

  const ytdGci = store.ytdGci();
  const ytdDeals = store.ytdDealCount();
  const goalGci = settings?.goal_gci ?? 0;
  const goalPct = goalGci > 0 ? Math.round((ytdGci / goalGci) * 100) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[S.screenTitle, { paddingTop: 20 }]}>More</Text>

        {/* ── User Card ── */}
        <View style={[S.card, { marginTop: 20, overflow: "hidden" }]}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="profileGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#1C1C3E" stopOpacity="1" />
                <Stop offset="1" stopColor="#0D0D1A" stopOpacity="1" />
              </SvgGrad>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#profileGrad)" rx="16" />
          </Svg>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              padding: 20,
            }}
          >
            <View style={S.avatar}>
              <Text style={S.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: C.text, fontSize: 18, fontWeight: "800" }}
              >
                {displayName}
              </Text>
              <Text
                style={{ color: C.textDim, fontSize: 13, marginTop: 3 }}
              >
                {user?.email ?? ""}
              </Text>
              {settings?.province && (
                <Text
                  style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}
                >
                  {settings.province} · {settings.experience_years ?? "?"} yrs exp
                </Text>
              )}
            </View>
          </View>

          {/* Stats row */}
          <View
            style={{
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: C.cardBorder,
            }}
          >
            <StatCell
              label="YTD GCI"
              value={fmtCurrency(ytdGci)}
              color={C.success}
            />
            <View style={{ width: 1, backgroundColor: C.cardBorder }} />
            <StatCell
              label="Deals Closed"
              value={String(ytdDeals)}
              color={C.text}
            />
            <View style={{ width: 1, backgroundColor: C.cardBorder }} />
            <StatCell
              label="Goal"
              value={goalPct !== null ? `${goalPct}%` : "—"}
              color={
                goalPct === null
                  ? C.textDim
                  : goalPct >= 100
                  ? C.success
                  : goalPct >= 50
                  ? C.primary
                  : C.warning
              }
            />
          </View>
        </View>

        {/* ── Tools Section ── */}
        <View style={{ marginTop: 28 }}>
          <Text style={S.sectionLabel}>TOOLS</Text>
          <View style={[S.card, { marginTop: 8 }]}>
            <MenuItem
              icon={<Plane size={18} color={C.primary} />}
              iconBg={C.primaryDim}
              label="Flight Control"
              description="Review and send AI-drafted outreach"
              onPress={() => router.push("/outreach")}
            />
            <Divider />
            <MenuItem
              icon={<TrendingUp size={18} color={C.cyan} />}
              iconBg={C.cyanDim}
              label="Income Forecast"
              description="Year-end projections and pacing"
              onPress={() => router.push("/forecast")}
            />
            <Divider />
            <MenuItem
              icon={<Receipt size={18} color={C.success} />}
              iconBg={C.successDim}
              label="Scan Receipt"
              description="Capture and log business expenses"
              onPress={() => router.push("/expenses")}
            />
          </View>
        </View>

        {/* ── Account Section ── */}
        <View style={{ marginTop: 28 }}>
          <Text style={S.sectionLabel}>ACCOUNT</Text>
          <View style={[S.card, { marginTop: 8 }]}>
            <MenuItem
              icon={<Zap size={18} color={C.warning} />}
              iconBg={C.warningDim}
              label="Subscription"
              description={
                settings?.subscription_tier === "professional"
                  ? "Professional · Active"
                  : "Free plan"
              }
              onPress={() => {}}
            />
            <Divider />
            <MenuItem
              icon={<Target size={18} color={C.purple} />}
              iconBg={C.purpleDim}
              label="Goals & Settings"
              description={
                goalGci > 0
                  ? `GCI goal: ${fmtCurrency(goalGci)}`
                  : "Set your annual targets"
              }
              onPress={() => {}}
            />
          </View>
        </View>

        {/* ── Sign Out ── */}
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            S.signOutBtn,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <LogOut size={17} color={C.danger} />
          <Text style={S.signOutText}>Sign Out</Text>
        </Pressable>

        {/* Version */}
        <Text
          style={{
            color: C.textFaint,
            fontSize: 11,
            textAlign: "center",
            marginTop: 24,
          }}
        >
          Agent Runway · v1.0
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
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 17, fontWeight: "800" }}>{value}</Text>
      <Text
        style={{
          color: C.textDim,
          fontSize: 10,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 3,
        }}
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
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          gap: 14,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        <Text style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>
          {description}
        </Text>
      </View>
      <ChevronRight size={16} color={C.textFaint} />
    </Pressable>
  );
}

function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: C.cardBorder, marginLeft: 68 }}
    />
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
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primaryDim,
    borderWidth: 2,
    borderColor: C.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: C.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionLabel: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.dangerDim,
    borderRadius: 12,
    padding: 15,
    marginTop: 28,
    borderWidth: 1,
    borderColor: C.danger + "30",
  },
  signOutText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: "700",
  },
});
