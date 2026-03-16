import { useEffect } from "react";
import { Redirect, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import "react-native-reanimated";

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();

  // Hide splash screen as soon as auth state is known
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Show spinner while auth state is being resolved —
  // this blocks any route from rendering until we know the session status
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0A0A0F",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  // Not authenticated and not already in auth group → go to login
  // Using <Redirect> (not router.replace) so it fires synchronously
  // during render, with no frame where the wrong screen is shown.
  if (!session && segments[0] !== "(auth)") {
    return <Redirect href="/(auth)/login" />;
  }

  // Authenticated but still on an auth screen → go to app
  if (session && segments[0] === "(auth)") {
    return <Redirect href="/(app)" />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
