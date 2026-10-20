import { Stack } from "expo-router";
import { useColors } from "@/lib/theme";
import { useT } from "@/lib/useT";

/** A link straight to a pushed screen still has the tabs under it, so Back works. */
export const unstable_settings = { initialRouteName: "(tabs)" };

/**
 * The signed-in app: the tabs, with every other screen pushed over them.
 * Back returns to the screen you came from (Today, Clients...), not to a
 * "More" tab. `profile/index` is You: settings, opened from your initials.
 */
export default function AppLayout() {
  const c = useColors();
  const { t } = useT("profile");
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.primary,
        headerTitleStyle: { color: c.text, fontWeight: "700", fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/index" options={{ title: t("you.title") }} />
      <Stack.Screen name="profile/outreach" options={{ title: "Flight Control" }} />
      <Stack.Screen name="profile/contacts-fill" options={{ title: "Fill in from Contacts" }} />
      <Stack.Screen name="profile/contacts-import" options={{ title: "Import from Contacts" }} />
      <Stack.Screen name="profile/settings" options={{ title: "Goals & Settings" }} />
      <Stack.Screen name="profile/notification-settings" options={{ title: "Notifications" }} />
      <Stack.Screen name="profile/briefing" options={{ title: "Today's Briefing" }} />
      <Stack.Screen name="profile/checklist" options={{ title: "Checklist" }} />
      <Stack.Screen name="profile/ai-activity" options={{ title: "AI Activity" }} />
      <Stack.Screen name="profile/chat" options={{ title: "Flight Crew" }} />
      <Stack.Screen name="profile/legal" options={{ title: "Legal & Privacy" }} />
      <Stack.Screen name="profile/voice-quiz" options={{ title: "AI Voice Quiz" }} />
      <Stack.Screen name="profile/business-identity" options={{ title: "Business Identity" }} />
    </Stack>
  );
}
