/**
 * POST /api/mobile/receipts/scan
 *
 * Mobile-native receipt scanning endpoint.
 * Accepts Bearer token auth (Supabase access token) instead of cookies.
 *
 * Flow:
 *  1. Validate Bearer token via admin client
 *  2. Parse multipart form data (single "file" field)
 *  3. Upload to Supabase Storage under user's folder
 *  4. Run Groq Vision OCR extraction
 *  5. Insert into receipt_expenses table
 *  6. Return the saved record
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { requirePro }                from "@/lib/require-pro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractReceiptData }        from "@/lib/receipts/extract";

// Allow up to 30 seconds for Groq vision OCR extraction
export const maxDuration = 30;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// HEIC/HEIF kept here (unlike the web upload routes) because the Expo native
// app's ImagePicker on iOS returns HEIC by default and there is no client-side
// canvas conversion in React Native. If/when the Expo client adds JPEG
// conversion (`expo-image-manipulator`), tighten this allowlist to match the
// web routes and drop HEIC. Currently Groq Vision OCR may fail for HEIC inputs
// here — known gap.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg":  "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[mime] ?? "jpg";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate via Bearer token ──────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const accessToken = authHeader.slice(7);
    const admin = createAdminClient();

    const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    const proCheck = await requirePro(admin, user.id);
    if (!proCheck.allowed) return proCheck.response!;

    const rl = await checkRateLimit(user.id, "receipt_scan", 20, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // ── 2. Parse multipart form data ──────────────────────────────────────
    let file: File;
    try {
      const form = await req.formData();
      const raw = form.get("file");
      if (!raw || !(raw instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "No file provided" },
          { status: 400 },
        );
      }
      file = raw;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid multipart form data" },
        { status: 400 },
      );
    }

    // ── 3. Validate file ──────────────────────────────────────────────────
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 10 MB)" },
        { status: 413 },
      );
    }

    const mimeType = file.type && ALLOWED_MIME.has(file.type)
      ? file.type
      : "image/jpeg";

    // ── 4. Read file bytes ────────────────────────────────────────────────
    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    // ── 5. Upload to Supabase Storage ─────────────────────────────────────
    const ext         = extForMime(mimeType);
    const filename    = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${user.id}/${filename}`;

    const { error: uploadError } = await admin.storage
      .from("receipts")
      .upload(storagePath, buffer, {
        contentType:  mimeType,
        cacheControl: "3600",
        upsert:       false,
      });

    if (uploadError) {
      console.error("[mobile/receipts/scan] Storage upload failed:", uploadError.message);
      return NextResponse.json(
        { ok: false, error: "Failed to store receipt image" },
        { status: 500 },
      );
    }

    // ── 6. Run OCR extraction ─────────────────────────────────────────────
    let extraction: {
      vendor: string | null;
      expense_date: string | null;
      total_amount: number | null;
      tax_amount: number | null;
      subtotal: number | null;
      currency: string;
      suggested_category: string | null;
      confidence: number;
    };

    try {
      extraction = await extractReceiptData(base64, mimeType);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[mobile/receipts/scan] OCR failed:", errMsg);
      extraction = {
        vendor:             null,
        expense_date:       null,
        total_amount:       null,
        tax_amount:         null,
        subtotal:           null,
        currency:           "CAD",
        suggested_category: null,
        confidence:         0,
      };
    }

    // ── 7. Insert into receipt_expenses ────────────────────────────────────
    const { data: saved, error: insertError } = await admin
      .from("receipt_expenses")
      .insert({
        user_id:        user.id,
        vendor:         extraction.vendor,
        expense_date:   extraction.expense_date,
        total_amount:   extraction.total_amount,
        tax_amount:     extraction.tax_amount,
        subtotal:       extraction.subtotal,
        currency:       extraction.currency,
        category_key:   extraction.suggested_category,
        receipt_path:   storagePath,
        ocr_confidence: extraction.confidence,
        ocr_raw:        extraction,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[mobile/receipts/scan] Insert failed:", insertError.message);
      return NextResponse.json(
        { ok: false, error: "Failed to save receipt" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, receipt: saved });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[mobile/receipts/scan] Unhandled error:", msg);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
