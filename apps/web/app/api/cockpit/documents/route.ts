/**
 * GET  /api/cockpit/documents  — list corp_documents (newest first)
 * DELETE /api/cockpit/documents?id=<uuid> — delete record + storage object
 *
 * Allowlisted to Andrew's account. Uses admin client for storage deletion.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

async function authenticate(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return { user: null, supabase };
  }
  return { user, supabase };
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const year = req.nextUrl.searchParams.get("year");
  const docType = req.nextUrl.searchParams.get("type");

  let query = supabase
    .from("corp_documents")
    .select(
      "id, document_type, title, description, document_date, fiscal_year, file_name, file_size_bytes, mime_type, created_at",
    )
    .order("document_date", { ascending: false });

  if (year) query = query.eq("fiscal_year", Number(year));
  if (docType) query = query.eq("document_type", docType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const { user, supabase } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch storage path before deleting the row
  const { data: doc, error: fetchErr } = await supabase
    .from("corp_documents")
    .select("id, storage_path")
    .eq("id", id)
    .single();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Delete storage object first (admin client bypasses RLS)
  const admin = createAdminClient();
  const { error: storageErr } = await admin.storage
    .from("corp-documents")
    .remove([doc.storage_path as string]);

  if (storageErr) {
    // Log but don't block — still delete the DB record
    console.error("[cockpit/documents] Storage delete error:", storageErr.message);
  }

  const { error: deleteErr } = await supabase
    .from("corp_documents")
    .delete()
    .eq("id", id);

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
