/**
 * Input — Themed text input with label, focus, and error states.
 */

import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { useColors, Space, Radius, Type } from "@/lib/theme";

interface InputProps {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  error,
  secureTextEntry,
  multiline,
}: InputProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? c.danger
    : focused
      ? c.primary
      : c.cardBorder;

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[Type.caption, styles.label, { color: c.textMuted }]}>
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textDim}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          Type.body,
          styles.input,
          {
            color: c.text,
            backgroundColor: c.card,
            borderColor,
            minHeight: multiline ? 100 : 48,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
      {error && (
        <Text style={[Type.caption, styles.error, { color: c.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Space.xs,
  },
  label: {
    marginLeft: Space.xs,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  error: {
    marginLeft: Space.xs,
  },
});

export default Input;
