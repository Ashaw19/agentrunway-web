import { InviteContent } from "./invite-content";
import { getInvitationByToken } from "@/lib/actions/org-actions";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Fetch invitation details (uses admin client — no auth needed)
  const { data: invitation, error } = await getInvitationByToken(token);

  if (error || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Invalid Invitation</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "This invitation link is invalid or has expired."}
          </p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return <InviteContent invitation={invitation} token={token} />;
}
