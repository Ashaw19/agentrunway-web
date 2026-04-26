import { redirect } from "next/navigation";

// The email-forwarding guide accompanied the Inbox feature, which is
// currently unavailable while we revisit the CASA compliance approach for
// any messaging surface. See memory/project_google_integrations.md.
//
// The original guide and the EmailForwardingSteps component remain in
// version control and can be revived alongside Inbox in a future,
// compliant rollout.
export default function EmailForwardingGuidePage() {
  redirect("/guide");
}
