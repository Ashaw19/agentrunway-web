import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{ authorization_id?: string }>;
}

export const metadata = {
  title: "Authorize Access",
};

export default async function OAuthConsentPage({ searchParams }: PageProps) {
  const { authorization_id } = await searchParams;

  // Must have an authorization_id to proceed
  if (!authorization_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold">Invalid Authorization Request</h1>
          <p className="text-sm text-muted-foreground">
            This link is missing required parameters. Please try connecting again from your AI
            assistant.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in — redirect to login, preserving the full consent URL
  if (!user) {
    redirect(
      `/login?redirect=/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`,
    );
  }

  // Fetch authorization details from Supabase OAuth Server
  let appName = "An external application";
  let scopes: string[] = ["openid", "profile", "email"];
  let fetchError = false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authClient = supabase.auth as any;
    if (typeof authClient.oauth?.getAuthorizationDetails === "function") {
      const { data, error } = await authClient.oauth.getAuthorizationDetails(authorization_id);
      if (!error && data) {
        appName = data.client?.name ?? appName;
        scopes = data.scope ? data.scope.split(" ").filter(Boolean) : scopes;
      } else {
        fetchError = true;
      }
    }
  } catch {
    fetchError = true;
  }

  const scopeLabels: Record<string, string> = {
    openid: "Verify your identity",
    profile: "Read your display name",
    email: "Read your email address",
    phone: "Read your phone number",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#070E30] px-8 py-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-[#64AAFF] uppercase mb-1">
            Agent Runway
          </p>
          <h1 className="text-lg font-bold text-white">Authorization Request</h1>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {fetchError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              Could not load request details. This link may have expired — please try connecting
              again from your AI assistant.
            </div>
          )}

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{appName}</span> is requesting access
              to your Agent Runway account.
            </p>
          </div>

          {/* Scope list */}
          <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              This will allow it to:
            </p>
            <ul className="space-y-1">
              {scopes.map((scope) => (
                <li key={scope} className="flex items-center gap-2 text-sm">
                  <span className="text-[#1A6EF0]">✓</span>
                  <span>{scopeLabels[scope] ?? scope}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm">
                <span className="text-[#1A6EF0]">✓</span>
                <span>Read your Agent Runway business data (read-only)</span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Your data is never stored by the connecting application. You can revoke access at any
            time in your Agent Runway settings.
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex gap-3">
          {/* Deny */}
          <form action="/api/oauth/decision" method="POST" className="flex-1">
            <input type="hidden" name="authorization_id" value={authorization_id} />
            <input type="hidden" name="decision" value="deny" />
            <button
              type="submit"
              className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Deny
            </button>
          </form>

          {/* Allow */}
          <form action="/api/oauth/decision" method="POST" className="flex-1">
            <input type="hidden" name="authorization_id" value={authorization_id} />
            <input type="hidden" name="decision" value="allow" />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#1A6EF0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1A6EF0]/90"
            >
              Allow Access
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
