import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useDataStore } from "@/stores/data-store";
import {
  Plane,
  TrendingUp,
  ChevronRight,
  LogOut,
  User,
} from "lucide-react-native";

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onPress: () => void;
}

function MenuItem({ icon, label, description, onPress }: MenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderRadius: 12,
        backgroundColor: pressed ? "#22223A" : "#1A1A2E",
        borderWidth: 1,
        borderColor: "#2D2D44",
        gap: 14,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: "rgba(99,102,241,0.1)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 2 }}>
          {description}
        </Text>
      </View>
      <ChevronRight size={18} color="#4B5563" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const settings = useDataStore((s) => s.settings);
  const router = useRouter();
  const displayName =
    settings?.display_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            letterSpacing: -0.5,
          }}
        >
          More
        </Text>

        {/* User card */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 16,
            borderRadius: 14,
            backgroundColor: "#1A1A2E",
            borderWidth: 1,
            borderColor: "#2D2D44",
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: "rgba(99,102,241,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <User size={24} color="#6366F1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: "#FFF", fontSize: 17, fontWeight: "700" }}
            >
              {displayName}
            </Text>
            <Text style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>
              {user?.email ?? "Not signed in"}
            </Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 12,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 2,
            }}
          >
            Tools
          </Text>

          <MenuItem
            icon={<Plane size={20} color="#6366F1" />}
            label="Flight Control"
            description="Review and send AI-drafted outreach emails"
            onPress={() => router.push("/outreach")}
          />

          <MenuItem
            icon={<TrendingUp size={20} color="#6366F1" />}
            label="Forecast"
            description="Income projections and goal tracking"
            onPress={() => router.push("/forecast")}
          />
        </View>

        {/* Sign out */}
        <View style={{ marginTop: 12 }}>
          <Pressable
            onPress={signOut}
            accessibilityRole="button"
            accessibilityLabel="Sign Out"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: pressed ? "#EF4444" : "#2D2D44",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <LogOut size={18} color="#EF4444" />
            <Text
              style={{ color: "#EF4444", fontSize: 16, fontWeight: "600" }}
            >
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
