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
import { useAuth } from "@/lib/auth-context";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
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
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
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
            Create Account
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#9CA3AF",
              marginTop: 8,
            }}
          >
            Start tracking your real estate business
          </Text>
        </View>

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
              Check your email — we sent you a confirmation link to verify your
              account.
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
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
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
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            placeholder="At least 6 characters"
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
            Confirm Password
          </Text>
          <TextInput
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (error) setError(null);
            }}
            placeholder="Confirm your password"
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
          accessibilityLabel="Create Account"
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
              Create Account
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
            Already have an account?{" "}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable accessibilityRole="link">
              <Text
                style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}
              >
                Sign In
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
