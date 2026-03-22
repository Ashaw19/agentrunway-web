import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  Receipt,
  ImagePlus,
  Check,
  RotateCcw,
  ChevronDown,
  X,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useDataStore, type ReceiptExpense } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";

// ── Config ─────────────────────────────────────────────────────────────────────

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

const CATEGORIES: Record<string, string> = {
  vehicle:       "Vehicle & Mileage",
  marketing:     "Marketing",
  office:        "Office Supplies",
  meals:         "Meals & Entertainment",
  professional:  "Professional Fees",
  insurance:     "Insurance",
  software:      "Software & Tech",
  education:     "Education & Training",
  clothing:      "Clothing & Branding",
  home_office:   "Home Office",
  phone:         "Phone & Internet",
  travel:        "Travel",
  gifts:         "Client Gifts",
  photography:   "Photography",
  staging:       "Staging",
  signage:       "Signage",
  other:         "Other",
};

// ── Types ──────────────────────────────────────────────────────────────────────

type ScreenState = "idle" | "camera" | "review" | "uploading";

interface OcrResult {
  vendor: string | null;
  expense_date: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  subtotal: number | null;
  currency: string;
  suggested_category: string | null;
  confidence: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null): string {
  if (n == null) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "Unknown date";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function categoryLabel(key: string | null): string {
  if (!key) return "Uncategorized";
  return CATEGORIES[key] ?? key;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const { receipts, fetchReceipts } = useDataStore();
  const [state, setState] = useState<ScreenState>("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Captured image
  const [imageUri, setImageUri] = useState<string | null>(null);

  // OCR results (editable)
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    fetchReceipts();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchReceipts();
    setRefreshing(false);
  }, [fetchReceipts]);

  // ── Camera ─────────────────────────────────────────────────────────────────

  const openCamera = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Enable camera access in your device settings to scan receipts."
        );
        return;
      }
    }
    setState("camera");
  }, [permission, requestPermission]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setImageUri(photo.uri);
        setState("review");
        uploadAndOcr(photo.uri);
      }
    } catch (err) {
      console.error("Capture failed:", err);
      Alert.alert("Capture Failed", "Please try again.");
    }
  }, []);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setImageUri(result.assets[0].uri);
      setState("review");
      uploadAndOcr(result.assets[0].uri);
    }
  }, []);

  // ── Upload + OCR ──────────────────────────────────────────────────────────

  const uploadAndOcr = useCallback(async (uri: string) => {
    setState("uploading");

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        Alert.alert("Not Signed In", "Please sign in to scan receipts.");
        setState("idle");
        return;
      }

      // Build form data
      const formData = new FormData();
      formData.append("file", {
        uri,
        type: "image/jpeg",
        name: "receipt.jpg",
      } as unknown as Blob);

      const res = await fetch(`${API_URL}/api/mobile/receipts/scan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Upload failed");
      }

      // Populate review fields from OCR
      const receipt = json.receipt;
      setVendor(receipt.vendor ?? "");
      setAmount(receipt.total_amount?.toString() ?? "");
      setTaxAmount(receipt.tax_amount?.toString() ?? "");
      setExpenseDate(receipt.expense_date ?? "");
      setCategory(receipt.category_key ?? "");
      setOcrConfidence(receipt.ocr_confidence ?? 0);
      setState("review");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Upload/OCR failed:", err);
      // Still show review with empty fields so user can fill manually
      setVendor("");
      setAmount("");
      setTaxAmount("");
      setExpenseDate("");
      setCategory("");
      setOcrConfidence(0);
      setState("review");

      Alert.alert(
        "OCR Failed",
        "We couldn't read the receipt automatically. You can fill in the details manually."
      );
    }
  }, []);

  // ── Save (update existing record with user edits) ─────────────────────────

  const saveReceipt = useCallback(async () => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;

      // The server already created the record during upload.
      // Update it with user's edits if they changed anything.
      const parsedAmount = parseFloat(amount) || null;
      const parsedTax = parseFloat(taxAmount) || null;

      // Find the most recent receipt (just created by OCR)
      const { data: latest } = await supabase
        .from("receipt_expenses")
        .select("id")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latest) {
        await supabase
          .from("receipt_expenses")
          .update({
            vendor: vendor || null,
            total_amount: parsedAmount,
            tax_amount: parsedTax,
            subtotal: parsedAmount && parsedTax
              ? parsedAmount - parsedTax
              : null,
            expense_date: expenseDate || null,
            category_key: category || null,
            notes: notes || null,
          })
          .eq("id", latest.id);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetState();
      await fetchReceipts();
    } catch (err) {
      console.error("Save failed:", err);
      Alert.alert("Save Failed", "Please try again.");
    }
  }, [vendor, amount, taxAmount, expenseDate, category, notes, fetchReceipts]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setState("idle");
    setImageUri(null);
    setVendor("");
    setAmount("");
    setTaxAmount("");
    setExpenseDate("");
    setCategory("");
    setNotes("");
    setOcrConfidence(0);
    setShowCategories(false);
  }, []);

  // ── Camera View ───────────────────────────────────────────────────────────

  if (state === "camera") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        >
          <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }}>
            {/* Top bar */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                padding: 20,
              }}
            >
              <Pressable
                onPress={resetState}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={22} color="#FFF" />
              </Pressable>
            </View>

            {/* Bottom bar */}
            <View
              style={{
                alignItems: "center",
                paddingBottom: 40,
                gap: 16,
              }}
            >
              <Text style={{ color: "#FFF", fontSize: 14, opacity: 0.7 }}>
                Position the receipt within the frame
              </Text>

              {/* Capture button */}
              <Pressable
                onPress={capturePhoto}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  borderWidth: 4,
                  borderColor: "#FFF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: "#FFF",
                  }}
                />
              </Pressable>

              {/* Gallery option */}
              <Pressable
                onPress={() => {
                  setState("idle");
                  pickFromGallery();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                }}
              >
                <ImagePlus size={16} color="#FFF" />
                <Text style={{ color: "#FFF", fontSize: 13 }}>
                  Choose from Photos
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Review / Uploading View ───────────────────────────────────────────────

  if (state === "review" || state === "uploading") {
    const isUploading = state === "uploading";

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: "#FFF",
                }}
              >
                {isUploading ? "Processing..." : "Review Receipt"}
              </Text>
              <Pressable onPress={resetState}>
                <X size={24} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* Image preview */}
            {imageUri && (
              <View
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "#1A1A2E",
                }}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: "100%", height: 200 }}
                  resizeMode="cover"
                />
              </View>
            )}

            {isUploading ? (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 40,
                  gap: 12,
                }}
              >
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
                  Scanning receipt with AI...
                </Text>
              </View>
            ) : (
              <>
                {/* Confidence indicator */}
                {ocrConfidence > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor:
                        ocrConfidence >= 0.8
                          ? "rgba(34,197,94,0.1)"
                          : ocrConfidence >= 0.5
                            ? "rgba(234,179,8,0.1)"
                            : "rgba(239,68,68,0.1)",
                    }}
                  >
                    <Check
                      size={16}
                      color={
                        ocrConfidence >= 0.8
                          ? "#22C55E"
                          : ocrConfidence >= 0.5
                            ? "#EAB308"
                            : "#EF4444"
                      }
                    />
                    <Text
                      style={{
                        color:
                          ocrConfidence >= 0.8
                            ? "#22C55E"
                            : ocrConfidence >= 0.5
                              ? "#EAB308"
                              : "#EF4444",
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {Math.round(ocrConfidence * 100)}% confidence
                    </Text>
                    <Text style={{ color: "#6B7280", fontSize: 12 }}>
                      — verify the details below
                    </Text>
                  </View>
                )}

                {/* Form fields */}
                <View style={{ gap: 12 }}>
                  <FormField
                    label="Vendor"
                    value={vendor}
                    onChangeText={setVendor}
                    placeholder="e.g. Staples, Shell, Tim Hortons"
                  />
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Total"
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        prefix="$"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Tax (HST/GST)"
                        value={taxAmount}
                        onChangeText={setTaxAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        prefix="$"
                      />
                    </View>
                  </View>
                  <FormField
                    label="Date"
                    value={expenseDate}
                    onChangeText={setExpenseDate}
                    placeholder="YYYY-MM-DD"
                  />

                  {/* Category picker */}
                  <View>
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: 12,
                        fontWeight: "600",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Category
                    </Text>
                    <Pressable
                      onPress={() => setShowCategories(!showCategories)}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: 14,
                        borderRadius: 10,
                        backgroundColor: "#1A1A2E",
                        borderWidth: 1,
                        borderColor: "#2D2D44",
                      }}
                    >
                      <Text
                        style={{
                          color: category ? "#FFF" : "#6B7280",
                          fontSize: 15,
                        }}
                      >
                        {category
                          ? categoryLabel(category)
                          : "Select category"}
                      </Text>
                      <ChevronDown size={18} color="#6B7280" />
                    </Pressable>

                    {showCategories && (
                      <View
                        style={{
                          marginTop: 4,
                          borderRadius: 10,
                          backgroundColor: "#1A1A2E",
                          borderWidth: 1,
                          borderColor: "#2D2D44",
                          maxHeight: 200,
                        }}
                      >
                        <ScrollView nestedScrollEnabled>
                          {Object.entries(CATEGORIES).map(([key, label]) => (
                            <Pressable
                              key={key}
                              onPress={() => {
                                setCategory(key);
                                setShowCategories(false);
                              }}
                              style={{
                                padding: 14,
                                borderBottomWidth: 1,
                                borderBottomColor: "#2D2D44",
                                backgroundColor:
                                  category === key
                                    ? "rgba(99,102,241,0.15)"
                                    : "transparent",
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    category === key
                                      ? "#818CF8"
                                      : "#E5E7EB",
                                  fontSize: 14,
                                }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <FormField
                    label="Notes (optional)"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Add a note..."
                    multiline
                  />
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  <Pressable
                    onPress={() => {
                      resetState();
                      openCamera();
                    }}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 16,
                      borderRadius: 12,
                      backgroundColor: "#1A1A2E",
                      borderWidth: 1,
                      borderColor: "#2D2D44",
                    }}
                  >
                    <RotateCcw size={18} color="#9CA3AF" />
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      Retake
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={saveReceipt}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 16,
                      borderRadius: 12,
                      backgroundColor: "#6366F1",
                    }}
                  >
                    <Check size={18} color="#FFF" />
                    <Text
                      style={{
                        color: "#FFF",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      Save
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Idle View (main screen) ───────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
          />
        }
      >
        {/* Header */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            letterSpacing: -0.5,
          }}
        >
          Expenses
        </Text>

        {/* Scan buttons */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={openCamera}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingVertical: 18,
              borderRadius: 14,
              backgroundColor: "#6366F1",
            }}
          >
            <Camera size={20} color="#FFF" />
            <Text
              style={{
                color: "#FFF",
                fontSize: 16,
                fontWeight: "700",
              }}
            >
              Scan Receipt
            </Text>
          </Pressable>

          <Pressable
            onPress={pickFromGallery}
            style={{
              paddingVertical: 18,
              paddingHorizontal: 18,
              borderRadius: 14,
              backgroundColor: "#1A1A2E",
              borderWidth: 1,
              borderColor: "#2D2D44",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ImagePlus size={20} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* Recent receipts */}
        <View style={{ gap: 12 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: "#9CA3AF",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Recent Receipts
          </Text>

          {receipts.length === 0 ? (
            <View
              style={{
                padding: 32,
                borderRadius: 14,
                backgroundColor: "#1A1A2E",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Receipt size={32} color="#4B5563" />
              <Text
                style={{ color: "#6B7280", fontSize: 14, textAlign: "center" }}
              >
                No receipts yet.{"\n"}Scan your first receipt to get started.
              </Text>
            </View>
          ) : (
            receipts.map((r) => <ReceiptCard key={r.id} receipt={r} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Receipt Card ──────────────────────────────────────────────────────────────

function ReceiptCard({ receipt }: { receipt: ReceiptExpense }) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#1A1A2E",
        borderWidth: 1,
        borderColor: "#2D2D44",
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: "#FFF",
            fontSize: 16,
            fontWeight: "700",
            flex: 1,
          }}
          numberOfLines={1}
        >
          {receipt.vendor ?? "Unknown Vendor"}
        </Text>
        <Text
          style={{
            color: "#6366F1",
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          {fmtCurrency(receipt.total_amount)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#6B7280", fontSize: 13 }}>
          {fmtDate(receipt.expense_date)}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: "rgba(99,102,241,0.1)",
          }}
        >
          <Text
            style={{
              color: "#818CF8",
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {categoryLabel(receipt.category_key)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Reusable Form Field ───────────────────────────────────────────────────────

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  prefix,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "numeric";
  prefix?: string;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 10,
          backgroundColor: "#1A1A2E",
          borderWidth: 1,
          borderColor: "#2D2D44",
          paddingHorizontal: 14,
        }}
      >
        {prefix && (
          <Text style={{ color: "#6B7280", fontSize: 15, marginRight: 4 }}>
            {prefix}
          </Text>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#4B5563"
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          style={{
            flex: 1,
            color: "#FFF",
            fontSize: 15,
            paddingVertical: 14,
            minHeight: multiline ? 60 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
    </View>
  );
}
