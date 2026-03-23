import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DriveContent } from "./drive-content";

export default async function DrivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check Google Drive connection
  const { data: googleConn } = await supabase
    .from("google_connections")
    .select("id, email_address, drive_read_enabled, connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isDriveConnected = !!googleConn?.drive_read_enabled;

  // Fetch indexed documents
  const { data: documents } = isDriveConnected
    ? await supabase
        .from("drive_documents")
        .select("id, name, mime_type, size_bytes, last_modified, web_view_link, indexed_at, summary, tags")
        .eq("user_id", user.id)
        .order("last_modified", { ascending: false })
        .limit(50)
    : { data: null };

  return (
    <DriveContent
      isDriveConnected={isDriveConnected}
      connectedEmail={googleConn?.email_address ?? null}
      documents={documents ?? []}
    />
  );
}
