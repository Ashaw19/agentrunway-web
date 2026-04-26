import { redirect } from "next/navigation";

// Inbox is currently unavailable. Email-related features are paused while
// we revisit the Canada Anti-Spam Legislation (CASL) compliance approach.
// See memory/project_google_integrations.md.
//
// The original Inbox implementation is retained in version control and may
// be revived once a compliant sending path is in place.
export default function InboxPage() {
  redirect("/dashboard");
}
