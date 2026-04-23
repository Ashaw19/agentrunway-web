/**
 * Sheet — Bottom sheet modal with handle bar, title, and close button.
 * Theme-aware, keyboard-avoiding.
 */

import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors, Space, Radius, Type } from "@/lib/theme";

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  maxHeight?: number | `${number}%`;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, maxHeight, children }: SheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        {/* Tap backdrop to close */}
        <Pressable style={styles.backdropPress} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kavWrapper}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: c.bgElevated,
                borderTopLeftRadius: Radius.xxl,
                borderTopRightRadius: Radius.xxl,
                paddingBottom: Math.max(insets.bottom, Space.xxxl),
                ...(maxHeight ? { maxHeight } : {}),
              },
            ]}
          >
            {/* Handle bar */}
            <View style={styles.handleRow}>
              <View
                style={[
                  styles.handle,
                  { backgroundColor: c.textFaint },
                ]}
              />
            </View>

            {/* Header */}
            {title && (
              <View style={styles.header}>
                <Text
                  style={[Type.h3, { color: c.text, flex: 1 }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={Space.sm}
                  style={[
                    styles.closeBtn,
                    { backgroundColor: c.divider },
                  ]}
                >
                  <Ionicons name="close" size={18} color={c.textMuted} />
                </Pressable>
              </View>
            )}

            {/* Content — scrollable to prevent overflow on smaller screens */}
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropPress: {
    flex: 1,
  },
  kavWrapper: {
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
  },
  handleRow: {
    alignItems: "center",
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Space.xl,
  },
});

export default Sheet;
