"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plane, CheckCircle2 } from "lucide-react";
import { sanitizeRedirect } from "@/lib/security/safe-redirect";
import { POLICY_VERSIONS } from "@/lib/policy-versions";

type Mode = "signin" | "signup" | "reset" | "reset-sent";

// Minimum password length — kept in sync with supabase/config.toml and the
// Supabase dashboard's Authentication → Policies → Password Security setting.
const MIN_PASSWORD_LENGTH = 10;

function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  // Supabase has shipped multiple variants of these over the years; keep all.
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid_credentials") ||
    m.includes("invalid email or password")
  ) {
    return "Incorrect email or password.";
  }
  if (m.includes("user already registered") || m.includes("user_already_exists")) {
    return "An account with this email already exists.";
  }
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "Please check your email to confirm your account.";
  }
  if (
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("over_request_rate_limit") ||
    m.includes("over_email_send_rate_limit")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("at least") && m.includes("characters")) return msg;
  if (m.includes("network") || m.includes("failed to fetch")) {
    return "Connection issue — check your internet and try again.";
  }
  // Unmatched: surface the actual Supabase message so the user / Andrew /
  // Sentry can diagnose. Strip any auth tokens before display.
  const sanitized = msg
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token]")
    .slice(0, 200);
  return `Sign-in failed: ${sanitized}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Just-in-time policy acknowledgement (Cox & Palmer review 2026-04-25,
  // satisfies Alberta PIPA notice-of-collection at the point of sign-up).
  // The acceptance is captured in auth.users.raw_user_meta_data and backfilled
  // into the policy_acceptances table by /auth/callback after email confirm.
  const [policiesAccepted, setPoliciesAccepted] = useState(false);

  // Read and sanitize redirect param (e.g. /login?redirect=/invite/TOKEN).
  // sanitizeRedirect() uses new URL() parsing to prevent open-redirect bypass.
  const safeRedirect = typeof window !== "undefined"
    ? sanitizeRedirect(
        new URLSearchParams(window.location.search).get("redirect"),
        window.location.origin,
      )
    : "/dashboard";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    if (mode === "signup") {
      // Client-side guard: match the server-side Supabase minimum so users
      // see a friendly message instead of a raw "Password should be at least
      // X characters" error from Supabase.
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        setLoading(false);
        return;
      }
      // Lawyer-required just-in-time consent. The acceptance must be captured
      // BEFORE personal information is collected — block submission if the box
      // isn't checked. (Alberta PIPA notice-of-collection requirement.)
      if (!policiesAccepted) {
        setError("You must read and agree to the Privacy Policy and Terms of Service to create an account.");
        setLoading(false);
        return;
      }
      // Pass redirect through email confirmation link so the user returns
      // to the right page (e.g. /invite/TOKEN) after confirming their email.
      const origin = window.location.origin;
      const confirmRedirect = safeRedirect !== "/dashboard"
        ? `${origin}/auth/callback?next=${encodeURIComponent(safeRedirect)}`
        : `${origin}/auth/callback`;
      // Stash the accepted versions in auth metadata so /auth/callback can
      // backfill the policy_acceptances table once the user confirms their
      // email and lands in a session. The acceptance moment is the click of
      // "Create Account", not the email confirmation.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmRedirect,
          data: {
            policies_accepted_at: new Date().toISOString(),
            policies_accepted_versions: POLICY_VERSIONS,
          },
        },
      });
      if (error) {
        // Log the full error to console so dev tools can show the raw shape
        // when friendlyAuthError falls through to the surfaced-message branch.
        console.error("[auth]", error);
        setError(friendlyAuthError(error.message));
      } else {
        switchMode("signin");
        // Show inline confirmation instead of alert()
        setError("");
        // Repurpose error slot for a success message via a separate flag
        setLoading(false);
        setMode("signup-success" as Mode);
        return;
      }
    } else if (mode === "reset") {
      const origin = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
      });
      if (error) {
        // Log the full error to console so dev tools can show the raw shape
        // when friendlyAuthError falls through to the surfaced-message branch.
        console.error("[auth]", error);
        setError(friendlyAuthError(error.message));
      } else {
        switchMode("reset-sent");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Log the full error to console so dev tools can show the raw shape
        // when friendlyAuthError falls through to the surfaced-message branch.
        console.error("[auth]", error);
        setError(friendlyAuthError(error.message));
      } else {
        router.push(safeRedirect);
        return;
      }
    }

    setLoading(false);
  }

  // ── Titles & descriptions per mode ────────────────────────────────────────
  const titles: Record<string, string> = {
    signin:         "Sign in to your account",
    signup:         "Create your account",
    "signup-success": "Check your email",
    reset:          "Reset your password",
    "reset-sent":   "Check your email",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Agent Runway</CardTitle>
          <CardDescription>{titles[mode]}</CardDescription>
        </CardHeader>

        <CardContent>

          {/* ── Email-confirmed success state ─────────────────────────────── */}
          {(mode as string) === "signup-success" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-muted-foreground">
                Account created. Check your inbox to confirm your email, then
                sign in.
              </p>
              <Button
                className="mt-2 w-full"
                onClick={() => { setEmail(""); setPassword(""); switchMode("signin"); }}
              >
                Go to sign in
              </Button>
            </div>
          )}

          {/* ── Reset-sent confirmation ────────────────────────────────────── */}
          {mode === "reset-sent" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-muted-foreground">
                Password reset link sent to <strong>{email}</strong>. Check
                your inbox.
              </p>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => { setEmail(""); switchMode("signin"); }}
              >
                Back to sign in
              </Button>
            </div>
          )}

          {/* ── Sign-in / Sign-up / Reset forms ───────────────────────────── */}
          {(mode === "signin" || mode === "signup" || mode === "reset") && (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {(mode === "signin" || mode === "signup") && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        onClick={() => switchMode("reset")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    // Only constrain length on signup — existing accounts may
                    // have shorter passwords from the previous policy; sign-in
                    // still needs to accept them and prompt for a reset later.
                    minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                    placeholder={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {/* Policy acceptance checkbox (signup only) — Alberta PIPA
                  notice-of-collection requirement per Cox & Palmer review. */}
              {mode === "signup" && (
                <label className="flex items-start gap-2 rounded-md border border-input/60 bg-muted/30 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policiesAccepted}
                    onChange={(e) => setPoliciesAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
                    aria-required="true"
                  />
                  <span className="text-xs leading-snug text-muted-foreground">
                    I have read and agree to the{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary hover:text-primary/80">
                      Privacy Policy
                    </a>
                    ,{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary hover:text-primary/80">
                      Terms of Service
                    </a>
                    ,{" "}
                    <a href="/acceptable-use" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary hover:text-primary/80">
                      Acceptable Use Policy
                    </a>
                    , and{" "}
                    <a href="/cookie-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-primary hover:text-primary/80">
                      Cookie Policy
                    </a>
                    . I understand that personal information I enter (mine and
                    my clients&apos;) will be collected, used, and disclosed as
                    described in those policies, including processing by
                    service providers located outside Canada.
                  </span>
                </label>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : mode === "signup"
                    ? "Create Account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign In"}
              </Button>
            </form>
          )}

          {/* ── Data processing disclosure (signup) ────────────────────── */}
          {mode === "signup" && (
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70 text-center">
              By creating an account, you acknowledge that your data may be
              processed by service providers located in the United States. See
              our{" "}
              <a href="/subprocessors" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Sub-Processors list
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy Policy
              </a>{" "}
              for details.
            </p>
          )}

          {/* ── Mode switcher links ────────────────────────────────────────── */}
          {(mode === "signin" || mode === "signup") && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  Need an account?{" "}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => switchMode("signup")}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => switchMode("signin")}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}

          {mode === "reset" && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
