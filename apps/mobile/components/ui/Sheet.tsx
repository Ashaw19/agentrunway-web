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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { sheetMaxHeight } from "@/lib/sheet-height";

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called once the sheet has finished closing (React Native calls it on iOS
   * only). Lets another sheet open after this one: iOS shows one modal at a
   * time (lib/score-sheets.ts).
   */
  onDismiss?: () => void;
  title?: string;
  maxHeight?: number | `${number}%`;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, onDismiss, title, maxHeight, children }: SheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // In points, from the window: a percentage here resolved against a wrapper
  // with no height and cut short sheets off (lib/sheet-height.ts).
  const { height: windowHeight } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
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
              {
                backgroundColor: c.bgElevated,
                borderTopLeftRadius: Radius.xxl,
                borderTopRightRadius: Radius.xxl,
                paddingBottom: Math.max(insets.bottom, Space.xxxl),
                maxHeight: sheetMaxHeight(windowHeight, maxHeight),
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
