/**
 * Global toast notification component.
 *
 * Renders a small bar at the top of the screen (below safe-area inset).
 * Variants: success (green checkmark), error (red X), info (blue info).
 * Auto-dismisses success/info after 2.5 s. Error stays until tapped.
 */

import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToastStore } from "@/stores/toast-store";
import { useColors, Radius, Space, Type } from "@/lib/theme";

// ── Icon glyphs (plain text so we avoid native-only deps) ──────────────────

const ICON: Record<string, string> = {
  success: "\u2713",  // checkmark
  error: "\u2715",    // X
  info: "i",
};

export default function Toast() {
  const { message, variant, onRetry, hide } = useToastStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate in/out whenever message changes
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (message) {
      // Slide in
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();

      // Auto-dismiss for non-error variants
      if (variant !== "error") {
        timerRef.current = setTimeout(() => {
          dismiss();
        }, 2500);
      }
    } else {
      // Slide out instantly (already hidden)
      translateY.setValue(-100);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message]);

  function dismiss() {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      hide();
    });
  }

  if (!message) return null;

  const bg =
    variant === "success"
      ? c.success
      : variant === "error"
        ? c.danger
        : c.blue;

  const bgDim =
    variant === "success"
      ? c.successDim
      : variant === "error"
        ? c.dangerDim
        : c.blueDim;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: insets.top + Space.xs,
        left: Space.xl,
        right: Space.xl,
        zIndex: 9999,
        transform: [{ translateY }],
      }}
    >
      <Pressable
        onPress={() => {
          if (variant === "error" && onRetry) {
            onRetry();
          }
          dismiss();
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Space.sm,
          backgroundColor: c.card,
          borderRadius: Radius.md,
          paddingVertical: Space.md,
          paddingHorizontal: Space.lg,
          borderWidth: 1,
          borderColor: bg + "33",
          // Shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        {/* Icon circle */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: bgDim,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: bg,
              fontSize: 13,
              fontWeight: "800",
              lineHeight: 16,
            }}
          >
            {ICON[variant] ?? "i"}
          </Text>
        </View>

        {/* Message */}
        <Text
          style={{
            ...Type.caption,
            color: c.text,
            flex: 1,
          }}
          numberOfLines={2}
        >
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
