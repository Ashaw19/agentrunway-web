import { Tabs } from "expo-router";
import { Platform, View, Pressable } from "react-native";
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

const ICON_SIZE = 21;

export default function AppLayout() {
  const c = useColors();
  const { mode } = useTheme();
  const g = gradients(mode);
  const sh = shadows(mode);

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
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <LayoutDashboard size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: "Deals",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Handshake size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
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
                  colors={g.mic as unknown as string[]}
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
          title: "Clients",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Users size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} mode={mode}>
              <Menu size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.6} />
            </TabIcon>
          ),
        }}
      />
      {/* Hidden routes — accessible via navigation but not shown in tab bar */}
      <Tabs.Screen name="expenses" options={{ href: null }} />
      <Tabs.Screen name="forecast" options={{ href: null }} />
      <Tabs.Screen name="outreach" options={{ href: null }} />
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
