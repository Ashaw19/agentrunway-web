import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentsClient } from "./documents-client";
import type { CorpDocument } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const { data: documents } = await supabase
    .from("corp_documents")
    .select(
      "id, document_type, title, description, document_date, fiscal_year, file_name, file_size_bytes, mime_type, storage_path, created_at, updated_at, user_id",
    )
    .order("document_date", { ascending: false });

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Documents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Year-end accountant export bundle + governance document storage for AR Inc.
        </p>
      </div>
      <DocumentsClient initialDocuments={(documents ?? []) as CorpDocument[]} />
    </div>
  );
}
