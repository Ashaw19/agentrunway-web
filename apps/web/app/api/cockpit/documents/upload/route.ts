/**
 * POST /api/cockpit/documents/upload
 *
 * Accepts multipart/form-data with:
 *   file         — the document file
 *   title        — display title
 *   document_type — 'minutes' | 'resolution' | 'contract' | 'correspondence' | 'other'
 *   document_date — YYYY-MM-DD
 *   description  — optional
 *
 * Uploads to corp-documents/{user_id}/{document_type}/{date}_{filename}
 * then inserts a corp_documents row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);
const MAX_SIZE_BYTES = 52_428_800; // 50 MB

const VALID_TYPES = new Set([
  "minutes", "resolution", "contract", "correspondence", "other",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string | null)?.trim();
  const documentType = (formData.get("document_type") as string | null)?.trim() ?? "other";
  const documentDate = (formData.get("document_date") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!documentDate || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    return NextResponse.json({ error: "document_date required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!VALID_TYPES.has(documentType)) {
    return NextResponse.json({ error: "invalid document_type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "file exceeds 50 MB limit" }, { status: 413 });
  }

  // Derive fiscal year from document_date
  const fiscalYear = Number(documentDate.slice(0, 4));

  // Build a safe storage path
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const storagePath = `${user.id}/${documentType}/${documentDate}_${safeFilename}`;

  // Upload via admin client (bypasses RLS; storage policies still apply in prod)
  const admin = createAdminClient();
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from("corp-documents")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  // Insert corp_documents row
  const { data: inserted, error: insertErr } = await supabase
    .from("corp_documents")
    .insert({
      user_id:         user.id,
      document_type:   documentType,
      title,
      description,
      document_date:   documentDate,
      fiscal_year:     fiscalYear,
      storage_path:    storagePath,
      file_name:       file.name,
      file_size_bytes: file.size,
      mime_type:       file.type || null,
    })
    .select("id, document_type, title, document_date, fiscal_year, file_name, file_size_bytes, created_at")
    .single();

  if (insertErr) {
    // Clean up the orphaned storage object
    await admin.storage.from("corp-documents").remove([storagePath]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: inserted });
}
