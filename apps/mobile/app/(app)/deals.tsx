import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DealsScreen() {
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
          Deals
        </Text>
        <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
          Transaction and pipeline management coming in Phase 5.4
        </Text>
      </View>
    </SafeAreaView>
  );
}
