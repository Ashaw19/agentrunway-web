import { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  DollarSign,
  TrendingDown,
  Hash,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useDataStore, type ReceiptExpense } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import { validateExpenseAmount } from "@agent-runway/core/validation/input-guards";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
  fmtCurrency,
  fmtCompact,
} from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Config ─────────────────────────────────────────────────────────────────────

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

const CATEGORIES: Record<string, string> = {
  vehicle_fuel:          "Fuel / Gas",
  vehicle_service:       "Service & Repairs",
  vehicle_insurance:     "Vehicle Insurance",
  vehicle_payment:       "Vehicle Payment",
  marketing_ads:         "Ads (Meta/Google)",
  marketing_photography: "Photography & Video",
  marketing_print:       "Print (Signs, Flyers)",
  marketing_gifts:       "Client Gifts",
  office_supplies:       "Office Supplies",
  office_software:       "Software Subscriptions",
  office_phone:          "Phone & Internet",
  office_hardware:       "Hardware & Equipment",
  prof_board_mls:        "Board / MLS Dues",
  prof_licensing:        "Licensing & Renewals",
  prof_eo:               "E&O Insurance",
  prof_accounting:       "Accounting & Bookkeeping",
  edu_courses:           "Courses & Coaching",
  edu_conferences:       "Conferences",
  edu_books:             "Books & Materials",
  meals_client:          "Client Meals",
  meals_team:            "Team Meals",
  ent_client:            "Client Entertainment",
  ent_events:            "Events & Tickets",
  other_misc:            "Miscellaneous",
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

function todayFormatted(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Category color mapping for badges
function categoryColor(key: string | null): string {
  const map: Record<string, string> = {
    vehicle: "#3B82F6",
    marketing: "#8B5CF6",
    office: "#06B6D4",
    meals: "#F59E0B",
    professional: "#10B981",
    insurance: "#EF4444",
    software: "#6366F1",
    education: "#EC4899",
    clothing: "#F97316",
    home_office: "#14B8A6",
    phone: "#6366F1",
    travel: "#3B82F6",
    gifts: "#EC4899",
    photography: "#8B5CF6",
    staging: "#F59E0B",
    signage: "#06B6D4",
    other: "#6B7280",
  };
  const prefix = key ? key.split("_")[0] : null;
  return prefix ? (map[prefix] ?? "#6366F1") : "#6366F1";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const { receipts, fetchReceipts } = useDataStore();
  const [state, setState] = useState<ScreenState>("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

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
  const [uploadedReceiptId, setUploadedReceiptId] = useState<string | null>(null);

  // ── Expense Summary Metrics ──────────────────────────────────────────────

  const summaryMetrics = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let ytdTotal = 0;
    let monthTotal = 0;
    const totalCount = receipts.length;

    receipts.forEach((r) => {
      const amt = r.total_amount ?? 0;
      if (r.expense_date) {
        const d = new Date(r.expense_date + "T00:00:00");
        if (d.getFullYear() === currentYear) {
          ytdTotal += amt;
          if (d.getMonth() === currentMonth) {
            monthTotal += amt;
          }
        }
      } else {
        // If no date, count towards YTD based on created_at
        const created = new Date(r.created_at);
        if (created.getFullYear() === currentYear) {
          ytdTotal += amt;
          if (created.getMonth() === currentMonth) {
            monthTotal += amt;
          }
        }
      }
    });

    return { ytdTotal, monthTotal, totalCount };
  }, [receipts]);

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
      setUploadedReceiptId(receipt.id ?? null);
      setVendor(receipt.vendor ?? "");
      setAmount(receipt.total_amount?.toString() ?? "");
      setTaxAmount(receipt.tax_amount?.toString() ?? "");
      setExpenseDate(receipt.expense_date ?? todayFormatted());
      setCategory(receipt.category_key ?? "");
      setOcrConfidence(receipt.ocr_confidence ?? 0);
      setState("review");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Upload/OCR failed:", err);
      // Still show review with empty fields so user can fill manually
      setUploadedReceiptId(null);
      setVendor("");
      setAmount("");
      setTaxAmount("");
      setExpenseDate(todayFormatted());
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

      // Validate expense amount
      const amountCheck = validateExpenseAmount(parsedAmount);
      if (!amountCheck.valid) {
        Alert.alert("Invalid Amount", amountCheck.errors[0]);
        return;
      }

      if (!uploadedReceiptId) {
        Alert.alert("Save Failed", "No receipt ID found. Please re-scan the receipt.");
        return;
      }

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
        .eq("id", uploadedReceiptId);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetState();
      await fetchReceipts();
    } catch (err) {
      console.error("Save failed:", err);
      Alert.alert("Save Failed", "Please try again.");
    }
  }, [vendor, amount, taxAmount, expenseDate, category, notes, fetchReceipts, uploadedReceiptId]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setState("idle");
    setImageUri(null);
    setUploadedReceiptId(null);
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
                padding: Space.xl,
              }}
            >
              <Pressable
                onPress={resetState}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <X size={22} color="#FFF" />
              </Pressable>
            </View>

            {/* Bottom bar */}
            <View
              style={{
                alignItems: "center",
                paddingBottom: Space.section,
                gap: Space.lg,
              }}
            >
              <Text style={{ ...Type.caption, color: "rgba(255,255,255,0.7)" }}>
                Position the receipt within the frame
              </Text>

              {/* Capture button */}
              <Pressable
                onPress={capturePhoto}
                style={({ pressed }) => ({
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  borderWidth: 4,
                  borderColor: "#FFF",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
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
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space.sm,
                  paddingVertical: Space.sm,
                  paddingHorizontal: Space.lg,
                  borderRadius: Radius.pill,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <ImagePlus size={16} color="#FFF" />
                <Text style={{ ...Type.caption, color: "#FFF" }}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: Space.xl, paddingBottom: 120, gap: Space.lg }}
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
              <Text style={{ ...Type.h1, color: c.text }}>
                {isUploading ? "Processing..." : "Review Receipt"}
              </Text>
              <Pressable
                onPress={resetState}
                hitSlop={Space.sm}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <X size={20} color={c.textMuted} />
              </Pressable>
            </View>

            {/* Image preview */}
            {imageUri && (
              <View
                style={{
                  borderRadius: Radius.lg,
                  overflow: "hidden",
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  ...sh.card,
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
                  paddingVertical: Space.section,
                  gap: Space.md,
                }}
              >
                <ActivityIndicator size="large" color={c.primary} />
                <Text style={{ ...Type.body, color: c.textMuted }}>
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
                      gap: Space.sm,
                      padding: Space.md,
                      borderRadius: Radius.md,
                      backgroundColor:
                        ocrConfidence >= 0.8
                          ? c.successDim
                          : ocrConfidence >= 0.5
                            ? c.warningDim
                            : c.dangerDim,
                    }}
                  >
                    <Check
                      size={16}
                      color={
                        ocrConfidence >= 0.8
                          ? c.success
                          : ocrConfidence >= 0.5
                            ? c.warning
                            : c.danger
                      }
                    />
                    <Text
                      style={{
                        ...Type.caption,
                        fontWeight: "600",
                        color:
                          ocrConfidence >= 0.8
                            ? c.success
                            : ocrConfidence >= 0.5
                              ? c.warning
                              : c.danger,
                      }}
                    >
                      {Math.round(ocrConfidence * 100)}% confidence
                    </Text>
                    <Text style={{ ...Type.caption, color: c.textDim }}>
                      — verify the details below
                    </Text>
                  </View>
                )}

                {/* Form fields */}
                <View style={{ gap: Space.md }}>
                  <ThemedFormField
                    label="Vendor"
                    value={vendor}
                    onChangeText={setVendor}
                    placeholder="e.g. Staples, Shell, Tim Hortons"
                  />
                  <View style={{ flexDirection: "row", gap: Space.md }}>
                    <View style={{ flex: 1 }}>
                      <ThemedFormField
                        label="Total"
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        prefix="$"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedFormField
                        label="Tax (HST/GST)"
                        value={taxAmount}
                        onChangeText={setTaxAmount}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        prefix="$"
                      />
                    </View>
                  </View>
                  <ThemedFormField
                    label="Date"
                    value={expenseDate}
                    onChangeText={setExpenseDate}
                    placeholder={todayFormatted()}
                  />

                  {/* Category picker */}
                  <CategoryPicker
                    category={category}
                    setCategory={setCategory}
                    showCategories={showCategories}
                    setShowCategories={setShowCategories}
                  />

                  <ThemedFormField
                    label="Notes (optional)"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Add a note..."
                    multiline
                  />
                </View>

                {/* Action buttons */}
                <View style={{ flexDirection: "row", gap: Space.md, marginTop: Space.sm }}>
                  <Pressable
                    onPress={() => {
                      resetState();
                      openCamera();
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: Space.sm,
                      minHeight: 48,
                      paddingVertical: Space.lg,
                      borderRadius: Radius.md,
                      backgroundColor: c.card,
                      borderWidth: 1,
                      borderColor: c.cardBorder,
                      opacity: pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <RotateCcw size={18} color={c.textMuted} />
                    <Text style={{ ...Type.bodyBold, color: c.textMuted }}>
                      Retake
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={saveReceipt}
                    style={({ pressed }) => ({
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: Space.sm,
                      minHeight: 48,
                      paddingVertical: Space.lg,
                      borderRadius: Radius.md,
                      backgroundColor: c.primary,
                      opacity: pressed ? 0.9 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    })}
                  >
                    <Check size={18} color="#FFF" />
                    <Text style={{ ...Type.bodyBold, color: "#FFF" }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: Space.lg, paddingBottom: Space.xxl }}>
          <Text style={{ ...Type.hero, color: c.text }}>
            Expenses
          </Text>
        </View>

        {/* ── Summary Metrics ── */}
        <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.xl }}>
          <SummaryCard
            icon={<DollarSign size={18} color={c.danger} />}
            iconBg={c.dangerDim}
            label="YTD Total"
            value={fmtCompact(summaryMetrics.ytdTotal)}
            valueColor={c.text}
          />
          <SummaryCard
            icon={<TrendingDown size={18} color={c.warning} />}
            iconBg={c.warningDim}
            label="This Month"
            value={fmtCompact(summaryMetrics.monthTotal)}
            valueColor={c.text}
          />
          <SummaryCard
            icon={<Hash size={18} color={c.primary} />}
            iconBg={c.primaryDim}
            label="Receipts"
            value={String(summaryMetrics.totalCount)}
            valueColor={c.text}
          />
        </View>

        {/* ── Scan Buttons ── */}
        <View style={{ flexDirection: "row", gap: Space.md, marginBottom: Space.xxl }}>
          <Pressable
            onPress={openCamera}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: Space.sm,
              paddingVertical: Space.lg,
              minHeight: 48,
              borderRadius: Radius.lg,
              backgroundColor: c.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              ...sh.glow(c.primary),
            })}
          >
            <Camera size={20} color="#FFF" />
            <Text style={{ ...Type.bodyBold, color: "#FFF" }}>
              Scan Receipt
            </Text>
          </Pressable>

          <Pressable
            onPress={pickFromGallery}
            style={({ pressed }) => ({
              paddingVertical: Space.lg,
              minHeight: 48,
              paddingHorizontal: Space.xl,
              borderRadius: Radius.lg,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardBorder,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              ...sh.card,
            })}
          >
            <ImagePlus size={20} color={c.textMuted} />
          </Pressable>
        </View>

        {/* ── Recent Receipts ── */}
        <View style={{ gap: Space.md }}>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.xs }}>
            RECENT RECEIPTS
          </Text>

          {receipts.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No Receipts Yet"
              subtitle="Scan your first receipt to start tracking your business expenses."
              actionLabel="Scan Receipt"
              onAction={openCamera}
            />
          ) : (
            receipts.map((r) => <ReceiptCard key={r.id} receipt={r} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor: string;
}) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: c.cardBorder,
        padding: Space.md,
        gap: Space.sm,
        overflow: "hidden",
        ...sh.card,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: Radius.sm,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <Text style={{ ...Type.h3, color: valueColor }} numberOfLines={1}>
        {value}
      </Text>
      <Text style={{ ...Type.micro, color: c.textDim }}>
        {label}
      </Text>
    </View>
  );
}

// ── Receipt Card ─────────────────────────────────────────────────────────────

function ReceiptCard({ receipt }: { receipt: ReceiptExpense }) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

  return (
    <View
      style={{
        padding: Space.lg,
        borderRadius: Radius.lg,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.cardBorder,
        gap: Space.sm,
        overflow: "hidden",
        ...sh.card,
      }}
    >
      {/* Top row: vendor + prominent amount */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1, marginRight: Space.md }}>
          <Text
            style={{ ...Type.bodyBold, color: c.text }}
            numberOfLines={1}
          >
            {receipt.vendor ?? "Unknown Vendor"}
          </Text>
          <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}>
            {fmtDate(receipt.expense_date)}
          </Text>
        </View>
        <Text
          style={{
            ...Type.h2,
            color: c.primary,
          }}
        >
          {fmtCurrency(receipt.total_amount ?? 0)}
        </Text>
      </View>

      {/* Bottom row: category badge + tax info */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Badge
          label={categoryLabel(receipt.category_key)}
          color={categoryColor(receipt.category_key)}
          size="sm"
        />
        {receipt.tax_amount != null && receipt.tax_amount > 0 && (
          <Text style={{ ...Type.micro, color: c.textDim }}>
            Tax: {fmtCurrency(receipt.tax_amount)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Category Picker ──────────────────────────────────────────────────────────

function CategoryPicker({
  category,
  setCategory,
  showCategories,
  setShowCategories,
}: {
  category: string;
  setCategory: (v: string) => void;
  showCategories: boolean;
  setShowCategories: (v: boolean) => void;
}) {
  const c = useColors();

  return (
    <View>
      <Text
        style={{
          ...Type.caption,
          color: c.textMuted,
          marginBottom: Space.xs,
          marginLeft: Space.xs,
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
          paddingHorizontal: Space.lg,
          paddingVertical: Space.md,
          borderRadius: Radius.md,
          backgroundColor: c.card,
          borderWidth: 1.5,
          borderColor: showCategories ? c.primary : c.cardBorder,
          minHeight: 48,
        }}
      >
        <Text
          style={{
            ...Type.body,
            color: category ? c.text : c.textDim,
          }}
        >
          {category
            ? categoryLabel(category)
            : "Select category"}
        </Text>
        <ChevronDown size={18} color={c.textDim} />
      </Pressable>

      {showCategories && (
        <View
          style={{
            marginTop: Space.xs,
            borderRadius: Radius.md,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardBorder,
            maxHeight: 200,
            overflow: "hidden",
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
                style={({ pressed }) => ({
                  paddingHorizontal: Space.lg,
                  paddingVertical: Space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: c.divider,
                  backgroundColor:
                    category === key
                      ? c.primaryDim
                      : pressed
                        ? c.primaryDim
                        : "transparent",
                })}
              >
                <Text
                  style={{
                    ...Type.body,
                    color:
                      category === key
                        ? c.primaryLight
                        : c.textSecondary,
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
  );
}

// ── Themed Form Field ────────────────────────────────────────────────────────

function ThemedFormField({
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
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: Space.xs }}>
      <Text
        style={{
          ...Type.caption,
          color: c.textMuted,
          marginLeft: Space.xs,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: Radius.md,
          backgroundColor: c.card,
          borderWidth: 1.5,
          borderColor: focused ? c.primary : c.cardBorder,
          paddingHorizontal: Space.lg,
        }}
      >
        {prefix && (
          <Text style={{ ...Type.body, color: c.textDim, marginRight: Space.xs }}>
            {prefix}
          </Text>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textDim}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            ...Type.body,
            color: c.text,
            paddingVertical: Space.md,
            minHeight: multiline ? 60 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
    </View>
  );
}
