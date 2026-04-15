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

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const { t } = useT("auth");
  const { i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  const currentLocale = i18n.language as SupportedLocale;
  const currentLanguageName = getLocaleName(currentLocale);

  const handleSignUp = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError(t("signup.errors.emptyFields"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("signup.errors.passwordMismatch"));
      return;
    }
    // Minimum password length — kept in sync with supabase/config.toml and
    // the web app's auth/update-password/page.tsx + login/page.tsx.
    if (password.length < 10) {
      setError(t("signup.errors.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      const { error: signUpError } = await signUp(email.trim(), password);
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setSuccess(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("signup.errors.unexpected"));
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
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "800",
              color: "#FFFFFF",
              letterSpacing: -0.5,
            }}
          >
            {t("signup.title")}
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#9CA3AF",
              marginTop: 8,
            }}
          >
            {t("signup.subtitle")}
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

        {/* Success Message */}
        {success ? (
          <View
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(34, 197, 94, 0.3)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ color: "#4ADE80", fontSize: 14, textAlign: "center" }}>
              {t("signup.success.message")}
            </Text>
          </View>
        ) : null}

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

        {/* Email */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            {t("signup.emailLabel")}
          </Text>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
            placeholder={t("signup.emailPlaceholder")}
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

        {/* Password */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            {t("signup.passwordLabel")}
          </Text>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            placeholder={t("signup.passwordPlaceholder")}
            placeholderTextColor="#4B5563"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
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

        {/* Confirm Password */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            {t("signup.confirmPasswordLabel")}
          </Text>
          <TextInput
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (error) setError(null);
            }}
            placeholder={t("signup.confirmPasswordPlaceholder")}
            placeholderTextColor="#4B5563"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
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

        {/* Sign Up Button */}
        <Pressable
          onPress={handleSignUp}
          disabled={loading || success}
          accessibilityRole="button"
          accessibilityLabel={t("signup.signUp")}
          style={({ pressed }) => ({
            backgroundColor: "#6366F1",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            marginTop: 8,
            opacity: loading || success ? 0.7 : pressed ? 0.85 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}
            >
              {t("signup.signUp")}
            </Text>
          )}
        </Pressable>

        {/* Sign In Link */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
            {t("signup.hasAccount")}{" "}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable accessibilityRole="link">
              <Text
                style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}
              >
                {t("signup.signInLink")}
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
