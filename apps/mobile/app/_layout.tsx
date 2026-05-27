import { useEffect } from "react";
import { Redirect, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTheme, useColors } from "@/lib/theme";
import Toast from "@/components/Toast";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import "react-native-reanimated";
import "@/lib/i18n"; // Initialize i18next before app renders

// Keep the native splash up until React has mounted and we know whether
// the user is signed in. preventAutoHideAsync rejects if the splash has
// already been hidden — safe to ignore. setOptions adds a 200 ms fade so
// the transition into the login / app screen isn't a hard cut and the
// splash image fully disappears (rather than appearing to "bleed through"
// the first frame of the next screen).
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — fine.
});
SplashScreen.setOptions({
  duration: 200,
  fade: true,
});

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const { mode } = useTheme();
  const c = useColors();

  // Mount global network connectivity listener
  useNetworkStatus();

  useEffect(() => {
    if (!isLoading) {
      // Wrap in try/catch — hideAsync rejects if the splash has already
      // been hidden (e.g. fast-refresh in dev) and we don't want that
      // surfacing as an unhandled rejection / red-box.
      SplashScreen.hideAsync().catch(() => {
        // Already hidden — fine.
      });
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (!session && segments[0] !== "(auth)") {
    return <Redirect href="/(auth)/login" />;
  }

  if (session && segments[0] === "(auth)") {
    return <Redirect href="/(app)" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.statusBarStyle} />
      <Slot />
      <Toast />
      {/* First-launch cookie/consent disclosure — shown only when authed so
          the login flow stays clean. No behavior change today (no trackers
          wired); the surface exists for App Store privacy nutrition label
          compliance + future-proofing. */}
      {session && <CookieConsentBanner />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
