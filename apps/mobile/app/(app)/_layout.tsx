import { useMemo } from "react";
import { Tabs } from "expo-router";
import { Platform, View, Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  LayoutDashboard,
  Handshake,
  Users,
  Search,
  Menu,
} from "lucide-react-native";
import { useColors, Radius, useTheme, gradients, shadows } from "@/lib/theme";
import { useDataStore } from "@/stores/data-store";
import { useT } from "@/lib/useT";

const ICON_SIZE = 21;

export default function AppLayout() {
  const c = useColors();
  const { mode } = useTheme();
  const g = gradients(mode);
  const sh = shadows(mode);
  const { t } = useT("common");

  const { tasks, transactions, clients, pipeline, smartListCounts } = useDataStore();

  // Badge counts — smart list counts give more meaningful numbers
  const counts = useMemo(() => smartListCounts(), [clients, pipeline]);

  const overdueCount = useMemo(() => {
    const today = new Date(new Date().toDateString());
    return tasks.filter(t => t.due_date && new Date(t.due_date) < today && !t.completed_at).length;
  }, [tasks]);

  const pendingCount = useMemo(() => {
    const pending = transactions.filter(t => t.status === "pending").length;
    return pending + counts.hotPipeline;
  }, [transactions, counts.hotPipeline]);

  const followUpCount = counts.overdueFollowups + counts.uncontactedLeads;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textDim,
        tabBarStyle: {
          backgroundColor: c.tabBg,
          borderTopColor: c.tabBorder,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 26 : 8,
          paddingTop: 8,
          height: Platform.OS === "ios" ? 88 : 64,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.4,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
      screenListeners={{
        tabPress: () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.dashboard"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <LayoutDashboard size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
              {overdueCount > 0 && <Badge count={overdueCount} color={c.danger} />}
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: t("tabs.deals"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Handshake size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
              {pendingCount > 0 && <Badge count={pendingCount} color={c.warning} />}
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View
              style={{
                position: "absolute",
                top: -16,
                width: 56,
                height: 56,
                borderRadius: 28,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  overflow: "hidden",
                  ...sh.cardLg,
                  ...(sh.glow("#6366F1")),
                }}
              >
                <LinearGradient
                  colors={g.mic as [string, string, ...string[]]}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Search size={24} color="#FFFFFF" strokeWidth={2.5} />
                </LinearGradient>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("tabs.clients"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Users size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
              {followUpCount > 0 && <Badge count={followUpCount} color={c.cyan} />}
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.more"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Menu size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  focused,
  mode,
  children,
}: {
  focused: boolean;
  mode: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: 42,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.md,
        backgroundColor: focused
          ? mode === "dark"
            ? "rgba(99,102,241,0.15)"
            : "rgba(99,102,241,0.10)"
          : "transparent",
      }}
    >
      {children}
    </View>
  );
}

function Badge({ count, color }: { count: number; color: string }) {
  return (
    <View
      style={{
        position: "absolute",
        top: -4,
        right: -8,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 9,
          fontWeight: "700",
          lineHeight: 11,
        }}
      >
        {count > 99 ? "99" : count}
      </Text>
    </View>
  );
}
