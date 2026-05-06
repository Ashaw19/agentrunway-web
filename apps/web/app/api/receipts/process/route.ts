/**
 * POST /api/receipts/process
 *
 * Accepts a multipart/form-data request with a single "file" field.
 * 1. Authenticates the request via the user's session cookie.
 * 2. Uploads the image to Supabase Storage (service-role, bypasses RLS).
 * 3. Runs Groq vision OCR extraction.
 * 4. Returns { ok: true, path, extraction } or { ok: false, error }.
 *
 * Storage path convention: receipts/{userId}/{uuid}.{ext}
 * RLS on the storage bucket uses foldername(path)[1] = auth.uid()::text
 * so the user can later fetch signed URLs for their own images.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { requirePro }                from "@/lib/require-pro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractReceiptData }        from "@/lib/receipts/extract";
import type {
  ProcessReceiptResponse,
  ProcessReceiptError,
} from "@/lib/types/receipt";

// Allow up to 30 seconds for Groq vision OCR extraction
export const maxDuration = 30;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// HEIC/HEIF removed — Groq vision can't process them and most browsers can't decode them
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function extForMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg":  "jpg",
    "image/png":  "png",
    "image/webp": "webp",
  };
  return map[mime] ?? "jpg";
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ProcessReceiptResponse | ProcessReceiptError>> {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) {
    return proCheck.response! as NextResponse<ProcessReceiptError>;
  }

  const rl = await checkRateLimit(user.id, "receipt_process", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── 2. Parse multipart form data ───────────────────────────────────────────
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

  // ── 3. Validate ────────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File too large (max 10 MB)" },
      { status: 413 },
    );
  }

  // Reject anything outside the image allowlist. PDFs are converted to JPEG
  // client-side before reaching this endpoint, so a PDF arriving here is a
  // direct caller (curl/script) — also reject.
  if (!file.type || !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported file type${file.type ? `: ${file.type}` : ""}. Allowed: JPEG, PNG, WebP.`,
      },
      { status: 400 },
    );
  }
  const mimeType = file.type;

  // ── 4. Read file bytes ─────────────────────────────────────────────────────
  const bytes   = await file.arrayBuffer();
  const buffer  = Buffer.from(bytes);
  const base64  = buffer.toString("base64");

  // ── 5. Upload to Supabase Storage (admin client — bypasses storage RLS) ────
  const admin       = createAdminClient();
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
    console.error("[receipts/process] Storage upload failed:", uploadError.message);
    return NextResponse.json(
      { ok: false, error: "Failed to store receipt image" },
      { status: 500 },
    );
  }

  // ── 6. Run OCR extraction ──────────────────────────────────────────────────
  let extraction;
  let ocrError: string | undefined;
  try {
    extraction = await extractReceiptData(base64, mimeType);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[receipts/process] OCR extraction failed:", errMsg);
    ocrError = errMsg;
    // Return a zero-confidence blank extraction — the user will fill in manually.
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

  // ── 7. Return ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:         true,
    path:       storagePath,
    extraction,
    ...(ocrError ? { ocrError } : {}),
  });
}
