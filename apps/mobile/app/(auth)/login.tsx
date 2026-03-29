import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Link } from "expo-router";
import { Globe, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getLocaleName, type SupportedLocale } from "@agent-runway/i18n";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/useT";
import { LanguagePicker } from "@/components/LanguagePicker";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t } = useT("auth");
  const { i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  const currentLocale = i18n.language as SupportedLocale;
  const currentLanguageName = getLocaleName(currentLocale);

  const handleSignIn = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError(t("login.errors.emptyFields"));
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        setError(signInError.message);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("login.errors.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#0A0A0F" }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          gap: 16,
        }}
      >
        {/* Logo / Brand */}
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "800",
              color: "#FFFFFF",
              letterSpacing: -0.5,
            }}
          >
            {t("login.title")}
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#9CA3AF",
              marginTop: 8,
            }}
          >
            {t("login.subtitle")}
          </Text>
        </View>

        {/* Language Selector */}
        <Pressable
          onPress={() => setLanguagePickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("language.chooseLanguage")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#1A1A2E",
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: "#2D2D44",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Globe size={18} color="#6366F1" style={{ marginRight: 10 }} />
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginRight: 4 }}>
            {t("language.chooseLanguage")}:
          </Text>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {currentLanguageName}
          </Text>
          <ChevronRight size={16} color="#9CA3AF" />
        </Pressable>

        {/* Inline Error Message */}
        {error ? (
          <View
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(239, 68, 68, 0.3)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ color: "#F87171", fontSize: 14, textAlign: "center" }}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* Email Input */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            {t("login.emailLabel")}
          </Text>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
            placeholder={t("login.emailPlaceholder")}
            placeholderTextColor="#4B5563"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            style={{
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              color: "#FFFFFF",
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#2D2D44",
            }}
          />
        </View>

        {/* Password Input */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            {t("login.passwordLabel")}
          </Text>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            placeholder={t("login.passwordPlaceholder")}
            placeholderTextColor="#4B5563"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            style={{
              backgroundColor: "#1A1A2E",
              borderRadius: 12,
              padding: 16,
              color: "#FFFFFF",
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#2D2D44",
            }}
          />
        </View>

        {/* Sign In Button */}
        <Pressable
          onPress={handleSignIn}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t("login.signIn")}
          style={({ pressed }) => ({
            backgroundColor: "#6366F1",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            marginTop: 8,
            opacity: loading ? 0.7 : pressed ? 0.85 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {t("login.signIn")}
            </Text>
          )}
        </Pressable>

        {/* Sign Up Link */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
            {t("login.noAccount")}{" "}
          </Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable accessibilityRole="link">
              <Text
                style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}
              >
                {t("login.signUpLink")}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Language Picker Bottom Sheet */}
      <LanguagePicker
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
