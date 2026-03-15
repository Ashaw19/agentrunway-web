import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <View style={{ padding: 20, gap: 16 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            letterSpacing: -0.5,
          }}
        >
          Profile
        </Text>
        <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
          {user?.email ?? "Not signed in"}
        </Text>

        <View style={{ marginTop: 24 }}>
          <TouchableOpacity
            onPress={signOut}
            style={{
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#2D2D44",
            }}
          >
            <Text style={{ color: "#EF4444", fontSize: 16, fontWeight: "600" }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
