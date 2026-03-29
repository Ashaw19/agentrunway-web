/**
 * LanguagePicker — Bottom sheet for selecting the app language.
 *
 * Shows all 10 supported locales with native language names.
 * Persists selection to MMKV and updates i18next on the fly.
 * Warns RTL users that an app restart may be needed.
 */

import { View, Text, Pressable, Alert } from "react-native";
import { Check, Globe } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  SUPPORTED_LOCALES,
  isRTL,
  getLocaleName,
  type SupportedLocale,
} from "@agent-runway/i18n";
import { saveLanguagePreference } from "@/lib/i18n";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";

interface LanguagePickerProps {
  visible: boolean;
  onClose: () => void;
}

export function LanguagePicker({ visible, onClose }: LanguagePickerProps) {
  const { i18n } = useTranslation();
  const c = useColors();
  const currentLocale = i18n.language as SupportedLocale;

  const handleSelect = (locale: SupportedLocale) => {
    if (locale === currentLocale) {
      onClose();
      return;
    }

    // Save preference to MMKV
    saveLanguagePreference(locale);

    // Change language immediately
    i18n.changeLanguage(locale);

    // If switching to/from an RTL language, warn about restart
    const wasRTL = isRTL(currentLocale);
    const willBeRTL = isRTL(locale);

    if (wasRTL !== willBeRTL) {
      onClose();
      setTimeout(() => {
        Alert.alert(
          willBeRTL ? "Restart Required" : "Restart Required",
          "Please restart the app to apply the right-to-left layout changes.",
          [{ text: "OK" }],
        );
      }, 300);
    } else {
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Language">
      <View style={{ gap: 2, paddingBottom: Space.lg }}>
        {SUPPORTED_LOCALES.map((locale) => {
          const isSelected = locale === currentLocale;
          const nativeName = getLocaleName(locale);
          const rtl = isRTL(locale);

          return (
            <Pressable
              key={locale}
              onPress={() => handleSelect(locale)}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: Space.md,
                  paddingHorizontal: Space.lg,
                  borderRadius: Radius.md,
                  gap: Space.lg,
                  backgroundColor: isSelected
                    ? c.primaryDim
                    : pressed
                      ? c.primaryDim
                      : "transparent",
                },
              ]}
            >
              {/* Language icon */}
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: Radius.md,
                  backgroundColor: isSelected ? c.primary : c.cardBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Globe
                  size={16}
                  color={isSelected ? "#FFFFFF" : c.textMuted}
                />
              </View>

              {/* Name and locale code */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    ...Type.bodyBold,
                    color: isSelected ? c.primary : c.text,
                  }}
                  numberOfLines={1}
                >
                  {nativeName}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.sm,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      ...Type.caption,
                      color: c.textDim,
                    }}
                  >
                    {locale}
                  </Text>
                  {rtl && (
                    <View
                      style={{
                        backgroundColor: c.warningDim,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: Radius.sm,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "700",
                          color: c.warning,
                          letterSpacing: 0.5,
                        }}
                      >
                        RTL
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Checkmark */}
              {isSelected && <Check size={18} color={c.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
