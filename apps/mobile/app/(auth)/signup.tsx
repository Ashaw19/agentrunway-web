import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords don't match");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);

    if (error) {
      Alert.alert("Sign Up Error", error.message);
    } else {
      Alert.alert(
        "Check Your Email",
        "We sent you a confirmation link. Please check your email to verify your account."
      );
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

        {/* Email */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#4B5563"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
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
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#4B5563"
            secureTextEntry
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
            onChangeText={setConfirmPassword}
            placeholder="Confirm your password"
            placeholderTextColor="#4B5563"
            secureTextEntry
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
        <TouchableOpacity
          onPress={handleSignUp}
          disabled={loading}
          style={{
            backgroundColor: "#6366F1",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            marginTop: 8,
            opacity: loading ? 0.7 : 1,
          }}
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
        </TouchableOpacity>

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
            <TouchableOpacity>
              <Text
                style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
