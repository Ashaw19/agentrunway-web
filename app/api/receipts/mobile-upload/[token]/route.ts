/**
 * POST /api/receipts/mobile-upload/[token]
 *
 * Unauthenticated endpoint — the phone POSTs the captured image here.
 *
 * Flow:
 *  1. Validate token exists, is unused, and not expired.
 *  2. Resolve the owning user_id from the token.
 *  3. Upload image to Supabase Storage under the owner's folder.
 *  4. Run Groq OCR extraction.
 *  5. Write receipt_path + extraction_result into the token row (status → 'complete').
 *  6. Return { ok: true } to the phone so it can show a success message.
 *
 * All storage/DB writes use the admin client (service role) — no auth cookie needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { extractReceiptData }        from "@/lib/receipts/extract";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── 1. Validate token ────────────────────────────────────────────────────
  const { data: tokenRow, error: tokenErr } = await admin
    .from("receipt_upload_tokens")
    .select("id, user_id, expires_at, used")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
  }

  if (tokenRow.used) {
    return NextResponse.json({ ok: false, error: "Token already used" }, { status: 409 });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "Token expired" }, { status: 410 });
  }

  // ── 2. Mark token as used immediately (prevents double-submit) ───────────
  await admin
    .from("receipt_upload_tokens")
    .update({ used: true })
    .eq("id", tokenRow.id);

  // ── 3. Parse multipart form data ─────────────────────────────────────────
  let file: File;
  try {
    const form = await req.formData();
    const raw = form.get("file");
    if (!raw || !(raw instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }
    file = raw;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  // ── 4. Validate file ──────────────────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File too large (max 10 MB)" },
      { status: 413 },
    );
  }

  const mimeType = file.type && ALLOWED_MIME.has(file.type) ? file.type : "image/jpeg";

  // ── 5. Read bytes ─────────────────────────────────────────────────────────
  const bytes   = await file.arrayBuffer();
  const buffer  = Buffer.from(bytes);
  const base64  = buffer.toString("base64");

  // ── 6. Upload to Supabase Storage ─────────────────────────────────────────
  const ext         = extForMime(mimeType);
  const filename    = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${tokenRow.user_id}/${filename}`;

  const { error: uploadError } = await admin.storage
    .from("receipts")
    .upload(storagePath, buffer, {
      contentType:  mimeType,
      cacheControl: "3600",
      upsert:       false,
    });

  if (uploadError) {
    console.error("[mobile-upload] Storage upload failed:", uploadError.message);
    // Mark token as error so the desktop can show a message
    await admin
      .from("receipt_upload_tokens")
      .update({ status: "error", error_message: "Failed to store image" })
      .eq("id", tokenRow.id);
    return NextResponse.json(
      { ok: false, error: "Failed to store receipt image" },
      { status: 500 },
    );
  }

  // ── 7. Run OCR ────────────────────────────────────────────────────────────
  let extraction;
  try {
    extraction = await extractReceiptData(base64, mimeType);
  } catch (err) {
    console.error("[mobile-upload] OCR failed:", err);
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

  // ── 8. Write result back to token row ─────────────────────────────────────
  await admin
    .from("receipt_upload_tokens")
    .update({
      status:            "complete",
      receipt_path:      storagePath,
      extraction_result: extraction,
    })
    .eq("id", tokenRow.id);

  return NextResponse.json({ ok: true });
}
