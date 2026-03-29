/**
 * Button — Themed button with variants, loading state, and press animation.
 */

import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useColors, Space, Radius, Type } from "@/lib/theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  variant?: ButtonVariant;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Button({
  variant = "primary",
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
}: ButtonProps) {
  const c = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    if (isDisabled) return;
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const variantStyles = {
    primary: {
      bg: c.primary,
      text: "#FFFFFF",
      border: "transparent",
    },
    secondary: {
      bg: "transparent",
      text: c.primary,
      border: c.primaryBorder,
    },
    ghost: {
      bg: "transparent",
      text: c.primary,
      border: "transparent",
    },
    danger: {
      bg: c.danger,
      text: "#FFFFFF",
      border: "transparent",
    },
  };

  const vs = variantStyles[variant];

  const handlePress = () => {
    try {
      if (variant === "primary") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (variant === "danger") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        Haptics.selectionAsync();
      }
    } catch {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: vs.bg,
            borderColor: vs.border,
            borderWidth: variant === "secondary" ? 1.5 : 0,
            opacity: isDisabled ? 0.5 : 1,
            transform: [{ scale }],
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={vs.text} />
        ) : (
          <View style={styles.inner}>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={vs.text}
                style={{ marginRight: Space.sm }}
              />
            )}
            <Text style={[Type.bodyBold, { color: vs.text }]}>{label}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.xl,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default Button;
