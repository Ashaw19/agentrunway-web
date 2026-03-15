import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";

export default function DashboardScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            letterSpacing: -0.5,
          }}
        >
          Dashboard
        </Text>
        <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
          Welcome back{user?.email ? `, ${user.email}` : ""}
        </Text>

        {/* Runway Score Hero Placeholder */}
        <View
          style={{
            backgroundColor: "#1A1A2E",
            borderRadius: 16,
            padding: 24,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#2D2D44",
          }}
        >
          <Text style={{ color: "#6366F1", fontSize: 48, fontWeight: "800" }}>
            --
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 4 }}>
            Runway Score
          </Text>
        </View>

        {/* KPI Cards Placeholder */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {["YTD GCI", "Deals", "Volume"].map((label) => (
            <View
              key={label}
              style={{
                flex: 1,
                backgroundColor: "#1A1A2E",
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: "#2D2D44",
              }}
            >
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{label}</Text>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 20,
                  fontWeight: "700",
                  marginTop: 4,
                }}
              >
                --
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
