/**
 * SectionHeader — Section title with optional "See All" action link.
 */

import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors, Space, Type } from "@/lib/theme";

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const c = useColors();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
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

  return (
    <View style={styles.row}>
      <Text style={[Type.h3, { color: c.text, flex: 1 }]}>{title}</Text>
      {onSeeAll && (
        <Pressable
          onPress={onSeeAll}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={Space.sm}
        >
          <Animated.Text
            style={[Type.caption, { color: c.primary, transform: [{ scale }] }]}
          >
            See All
          </Animated.Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
});

export default SectionHeader;
