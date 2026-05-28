import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";

export default function ProfileLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.primary,
        headerTitleStyle: { color: c.text, fontWeight: "700", fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="outreach" options={{ title: "Flight Control" }} />
      <Stack.Screen name="forecast" options={{ title: "Income Forecast" }} />
      <Stack.Screen name="expenses" options={{ title: "Expenses" }} />
      <Stack.Screen name="settings" options={{ title: "Goals & Settings" }} />
      <Stack.Screen name="notification-settings" options={{ title: "Notifications" }} />
      <Stack.Screen name="briefing" options={{ title: "Today's Briefing" }} />
      <Stack.Screen name="chat" options={{ title: "Flight Crew" }} />
      <Stack.Screen name="legal" options={{ title: "Legal & Privacy" }} />
      <Stack.Screen name="voice-quiz" options={{ title: "AI Voice Quiz" }} />
      <Stack.Screen name="business-identity" options={{ title: "Business Identity" }} />
    </Stack>
  );
}
