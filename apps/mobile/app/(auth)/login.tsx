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

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      Alert.alert("Sign In Error", error.message);
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
            Agent Runway
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: "#9CA3AF",
              marginTop: 8,
            }}
          >
            Real estate analytics, simplified
          </Text>
        </View>

        {/* Email Input */}
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

        {/* Password Input */}
        <View>
          <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 6 }}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
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

        {/* Sign In Button */}
        <TouchableOpacity
          onPress={handleSignIn}
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
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Sign In
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign Up Link */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
            Don't have an account?{" "}
          </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text
                style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
