/**
 * Card — Reusable card component with variant styles.
 * Uses theme tokens for all spacing, radius, and colors.
 */

import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors, useTheme, shadows, gradients, Space, Radius } from "@/lib/theme";

type CardVariant = "default" | "elevated" | "gradient";

interface CardProps {
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onPress?: () => void;
}

export function Card({
  variant = "default",
  style,
  children,
  onPress,
}: CardProps) {
  const c = useColors();
  const { mode } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.98,
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

  const s = shadows(mode);

  const baseStyle: ViewStyle = {
    borderRadius: Radius.lg,
    padding: Space.lg,
    overflow: "hidden",
  };

  const variantStyle: ViewStyle =
    variant === "elevated"
      ? {
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.cardHighBorder,
          ...s.cardLg,
        }
      : variant === "gradient"
        ? {
            borderWidth: 1,
            borderColor: c.cardBorder,
            ...s.card,
          }
        : {
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardBorder,
            ...s.card,
          };

  const content =
    variant === "gradient" ? (
      <LinearGradient
        colors={gradients(mode).heroCard as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[baseStyle, variantStyle, style]}
      >
        {children}
      </LinearGradient>
    ) : (
      <View style={[baseStyle, variantStyle, style]}>{children}</View>
    );

  if (!onPress) return content;

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
      <Animated.View style={{ transform: [{ scale }] }}>{content}</Animated.View>
    </Pressable>
  );
}

export default Card;
