import { Tabs } from "expo-router";
import { Platform } from "react-native";
import {
  LayoutDashboard,
  Handshake,
  Users,
  Camera,
  Menu,
} from "lucide-react-native";

const ACTIVE_COLOR = "#6366F1";
const INACTIVE_COLOR = "#6B7280";
const TAB_BAR_BG = "#0A0A0F";
const ICON_SIZE = 24;

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopColor: "#1F1F2E",
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          height: Platform.OS === "ios" ? 88 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: "Deals",
          tabBarIcon: ({ color }) => (
            <Handshake size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color }) => (
            <Users size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => (
            <Camera size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => (
            <Menu size={ICON_SIZE} color={color} />
          ),
        }}
      />
      {/* Hidden routes — accessible via navigation, not tab bar */}
      <Tabs.Screen
        name="forecast"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="outreach"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
