import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InboxContent } from "./inbox-content";

export const dynamic = "force-dynamic";

export interface InboxEmailRow {
  id: string;
  resend_email_id: string;
  from_address: string;
  from_name: string | null;
  to_address: string;
  subject: string | null;
  preview: string | null;
  has_attachments: boolean;
  attachment_count: number;
  status: "unresolved" | "linked" | "archived" | "spam";
  client_id: string | null;
  matched_outreach_id: string | null;
  received_at: string;
  clients: { id: string; name: string } | null;
}

/**
 * Inbox — shows inbound replies received via the user's unique forwarding
 * alias ({alias}@inbox.agentrunway.ca). Replies that were auto-linked to a
 * client display the client name; unresolved messages let the agent link
 * them manually.
 */
export default async function InboxPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the user's inbound alias so we can display the forwarding address.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("inbound_alias")
    .eq("user_id", user.id)
    .maybeSingle();

  const inboundAlias = (settings?.inbound_alias as string | null) ?? null;
  const forwardingAddress = inboundAlias
    ? `${inboundAlias}@inbox.agentrunway.ca`
    : null;

  // Load the 200 most recent inbound emails (not archived/spam) with linked
  // client names joined in.
  const { data: emails } = await supabase
    .from("inbound_emails")
    .select(
      "id, resend_email_id, from_address, from_name, to_address, subject, preview, has_attachments, attachment_count, status, client_id, matched_outreach_id, received_at, clients(id, name)",
    )
    .eq("user_id", user.id)
    .in("status", ["unresolved", "linked"])
    .order("received_at", { ascending: false })
    .limit(200);

  return (
    <InboxContent
      forwardingAddress={forwardingAddress}
      emails={(emails ?? []) as unknown as InboxEmailRow[]}
    />
  );
}
