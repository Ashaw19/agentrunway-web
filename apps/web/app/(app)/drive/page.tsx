import { redirect } from "next/navigation";

// The Drive document workspace has been removed from the user-facing
// surface. Third-party document integrations are not currently offered.
// See memory/project_google_integrations.md.
//
// The original Drive implementation is retained in version control and may
// be revived in a future, compliant form.
export default function DrivePage() {
  redirect("/dashboard");
}
