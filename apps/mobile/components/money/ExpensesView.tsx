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
  Modal,
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
  FileText,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useDataStore, type ReceiptExpense } from "@/stores/data-store";
import { useMileageStore } from "@/stores/mileage-store";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import { supabase } from "@/lib/supabase";
import { validateExpenseAmount } from "@agent-runway/core/validation/input-guards";
import { expenseTaxContext, receiptTotalsToDate } from "@agent-runway/core/engines/expense-totals-engine";
import { receiptSections, toFilingFrequency, type ReceiptSection } from "@agent-runway/core/lib/receipt-sections";
import type { FilingFrequency } from "@agent-runway/core/types/database";
import { storage } from "@/lib/mmkv";
import { useT } from "@/lib/useT";
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
import { ADD_CLEARANCE } from "@/components/add/AddButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Config ─────────────────────────────────────────────────────────────────────

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

// Item labels: lib/expense-categories.ts (shared with the voice capture card).
const CATEGORIES = EXPENSE_CATEGORY_LABELS;

/** Receipt cards shown under "Recent Receipts". The totals use every receipt dated this year. */
const RECENT_RECEIPTS_SHOWN = 50;

/**
 * The agent's GST/HST filing frequency (`user_settings.filing_frequency`),
 * kept so the list's period headings are right offline. The data store does
 * not load the column, so this screen reads it.
 */
const FILING_FREQUENCY_KEY = "expenses_filing_frequency";

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

/**
 * Expenses, the first view of the Money tab (app/(app)/(tabs)/money.tsx).
 * `autoScan` opens the receipt camera once on arrival (the "+" sheet's
 * Receipt); the host clears it through `onAutoScanHandled`. It never
 * replaces a receipt being reviewed or saved. `keyboardOffset`: the height
 * of the Money header above, so the keyboard clears the form.
 */
export default function ExpensesView({
  autoScan = false,
  onAutoScanHandled,
  keyboardOffset = 0,
}: { autoScan?: boolean; onAutoScanHandled?: () => void; keyboardOffset?: number } = {}) {
  const { receipts, fetchReceipts, settings } = useDataStore();
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

  // The three cards are RECEIPT totals: this year's, this month's and how
  // many. The store loads receipts only, not expense_items or
  // recurring_expenses, so this screen has no year-to-date expenses to show
  // (`ytdExpenseTotals`, on the web) and never labels a card as one.
  // `year.total` is the receipts part of that figure, net of the GST/HST a
  // registrant claims back as input tax credits. Each receipt card below
  // still shows what was paid. The store also holds last year's receipts and
  // undated ones; the engine leaves both out, as the web does.
  //
  // The vehicle share in that ITC split is the logbook's when it covers the
  // year (vehicleBusinessUseFor), the same figure as the web. Until the rows
  // load, or when they fail to, it is the declared setting, as on the web
  // pages that use loadLogbookRowsOrNull.
  const { logbook, logbookYear, fetchLogbook } = useMileageStore();
  // The tax year and the logbook's "today": the Atlantic calendar, as on the web.
  const today = atlanticISODate();
  const taxYear = Number(today.slice(0, 4));
  const logbookRows = logbook && logbookYear === taxYear ? logbook : null;
  const expenseTaxCtx = useMemo(
    () => expenseTaxContext(settings, { rows: logbookRows, year: taxYear, today }),
    [settings, logbookRows, taxYear, today],
  );

  const summaryMetrics = useMemo(
    () => receiptTotalsToDate(receipts, expenseTaxCtx, new Date()),
    [receipts, expenseTaxCtx],
  );

  // Statement imports (Expenses → Imports on the web): the phone shows only
  // how many charges wait for review. Review happens on the web (mobile
  // scope: capture, glance, respond). A count, so nothing is cached.
  const [importReviewCount, setImportReviewCount] = useState(0);
  const fetchImportReviewCount = useCallback(async () => {
    const { count, error } = await supabase
      .from("statement_lines")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("direction", "out");
    if (!error) setImportReviewCount(count ?? 0);
  }, []);

  // The list's headings follow the agent's filing periods (quarters for a
  // quarterly filer). Until the setting is read, the saved one, else
  // quarterly (the column's default).
  const [filingFrequency, setFilingFrequency] = useState<FilingFrequency>(() => {
    try {
      return toFilingFrequency(storage.getString(FILING_FREQUENCY_KEY));
    } catch {
      return "quarterly";
    }
  });
  const fetchFilingFrequency = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("user_settings")
      .select("filing_frequency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return;
    const freq = toFilingFrequency(data.filing_frequency);
    setFilingFrequency(freq);
    try {
      storage.set(FILING_FREQUENCY_KEY, freq);
    } catch {}
  }, []);

  // The list: undated receipts first (they count in no total until dated),
  // then receipt date order, newest first, with a heading at each filing
  // period (core receiptSections, the same as the web). The store holds
  // receipts in upload order; the order here is the receipt's own date.
  // Display only: the cards above are computed from `receipts`.
  const receiptLog = useMemo(
    () => receiptSections(receipts, filingFrequency, RECENT_RECEIPTS_SHOWN),
    [receipts, filingFrequency],
  );

  useEffect(() => {
    fetchReceipts();
    fetchLogbook();
    fetchImportReviewCount();
    fetchFilingFrequency();
  }, [fetchReceipts, fetchLogbook, fetchImportReviewCount, fetchFilingFrequency]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchReceipts(), fetchLogbook(), fetchImportReviewCount(), fetchFilingFrequency()]);
    setRefreshing(false);
  }, [fetchReceipts, fetchLogbook, fetchImportReviewCount, fetchFilingFrequency]);

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

  // The "+" sheet's Receipt: straight to the camera, once.
  useEffect(() => {
    if (!autoScan) return;
    onAutoScanHandled?.();
    if (state === "idle") void openCamera();
  }, [autoScan, onAutoScanHandled, openCamera, state]);

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
  // Full screen over the tabs: the view sits under the Money header, the
  // camera doesn't.

  if (state === "camera") {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setState("idle")}>
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
      </Modal>
    );
  }

  // ── Review / Uploading View ───────────────────────────────────────────────

  if (state === "review" || state === "uploading") {
    const isUploading = state === "uploading";

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: Space.xl, paddingBottom: ADD_CLEARANCE, gap: Space.lg }}
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
        contentContainerStyle={{ paddingHorizontal: Space.xl, paddingBottom: ADD_CLEARANCE }}
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
            label="Receipts YTD"
            value={fmtCompact(summaryMetrics.year.total)}
            valueColor={c.text}
          />
          <SummaryCard
            icon={<TrendingDown size={18} color={c.warning} />}
            iconBg={c.warningDim}
            label="This Month"
            value={fmtCompact(summaryMetrics.month.total)}
            valueColor={c.text}
          />
          <SummaryCard
            icon={<Hash size={18} color={c.primary} />}
            iconBg={c.primaryDim}
            label="Receipts"
            value={String(summaryMetrics.yearCount)}
            valueColor={c.text}
          />
        </View>
        <Text style={{ ...Type.caption, color: c.textDim, marginTop: -Space.md, marginBottom: Space.xl }}>
          Receipts dated this year. Recurring expenses and monthly figures are counted in YTD Expenses on the web.
          {expenseTaxCtx.gstHstRegistered ? " Totals are net of the GST/HST claimed as input tax credits." : ""}
        </Text>

        {/* ── Statement lines waiting for review (review is on the web) ── */}
        {importReviewCount > 0 && (
          <Card style={{ marginBottom: Space.xl, flexDirection: "row", alignItems: "center", gap: Space.md }}>
            <FileText size={18} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.bodyBold, color: c.text }}>
                {importReviewCount} imported {importReviewCount === 1 ? "charge is" : "charges are"} waiting for review
              </Text>
              <Text style={{ ...Type.caption, color: c.textDim, marginTop: 2 }}>
                From your bank and card statements. Review happens on the web: Expenses, Imports.
              </Text>
            </View>
          </Card>
        )}

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
            <>
              {receiptLog.sections.map((section, i) => (
                <View key={section.key} style={{ gap: Space.md, marginTop: i === 0 ? 0 : Space.lg }}>
                  <ReceiptSectionHeader section={section} />
                  {section.rows.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
                </View>
              ))}
              {receiptLog.shown < receiptLog.total && (
                <Text style={{ ...Type.caption, color: c.textDim, textAlign: "center" }}>
                  Showing your {RECENT_RECEIPTS_SHOWN} most recent receipts. The totals above count every receipt dated this year. See the full list on the web.
                </Text>
              )}
            </>
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

// ── Receipt Section Header ───────────────────────────────────────────────────

/**
 * The break above each filing period in the list: "Q4 2026 · Oct to Dec" on
 * the left, how many receipts of that period the list holds on the right.
 * Month names are the short English ones, as on the receipt cards' dates.
 */
function ReceiptSectionHeader({ section }: { section: ReceiptSection<ReceiptExpense> }) {
  const c = useColors();
  const { t } = useT("profile");

  const title = !section.period
    ? t("receiptLog.noDate")
    : section.months
      ? t("receiptLog.periodRange", { period: section.period.label, from: section.months.from, to: section.months.to })
      : section.period.label;
  const count =
    section.rows.length < section.count
      ? t("receiptLog.receiptCountPartial", { count: section.rows.length, total: section.count })
      : t("receiptLog.receiptCount", { count: section.count });

  return (
    <View
      accessibilityRole="header"
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: Space.md,
        paddingBottom: Space.xs,
        borderBottomWidth: 1,
        borderBottomColor: c.cardBorder,
      }}
    >
      <Text style={{ ...Type.bodyBold, color: c.text, flexShrink: 1 }} numberOfLines={1}>
        {title}
      </Text>
      <Text style={{ ...Type.caption, color: c.textDim }}>{count}</Text>
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
