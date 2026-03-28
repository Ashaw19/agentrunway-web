import { useEffect } from "react";
import { Redirect, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useTheme, useColors } from "@/lib/theme";
import "react-native-reanimated";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const { mode } = useTheme();
  const c = useColors();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
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
    <>
      <StatusBar style={c.statusBarStyle} />
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
