import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ForecastScreen() {
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
          Forecast
        </Text>
        <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
          Goal tracking and projections coming in Phase 5.5
        </Text>
      </View>
    </SafeAreaView>
  );
}
