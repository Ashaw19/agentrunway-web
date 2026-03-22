import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import {
  LayoutDashboard,
  Handshake,
  Users,
  Camera,
  MoreHorizontal,
} from "lucide-react-native";
import { C } from "@/lib/theme";

const ICON_SIZE = 22;

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textDim,
        tabBarStyle: {
          backgroundColor: "#0D0D18",
          borderTopColor: C.cardBorder,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === "ios" ? 26 : 8,
          paddingTop: 10,
          height: Platform.OS === "ios" ? 90 : 66,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <LayoutDashboard size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.8} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: "Deals",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Handshake size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.8} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Users size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.8} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <Camera size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.8} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused} color={color}>
              <MoreHorizontal size={ICON_SIZE} color={color} strokeWidth={focused ? 2.5 : 1.8} />
            </TabIcon>
          ),
        }}
      />
      {/* Hidden routes */}
      <Tabs.Screen name="forecast" options={{ href: null }} />
      <Tabs.Screen name="outreach" options={{ href: null }} />
    </Tabs>
  );
}

function TabIcon({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: 40,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: focused ? C.primaryDim : "transparent",
      }}
    >
      {children}
    </View>
  );
}
