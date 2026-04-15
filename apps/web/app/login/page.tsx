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

type Mode = "signin" | "signup" | "reset" | "reset-sent";

// Minimum password length — kept in sync with supabase/config.toml and the
// Supabase dashboard's Authentication → Policies → Password Security setting.
const MIN_PASSWORD_LENGTH = 10;

function friendlyAuthError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Incorrect email or password.";
  if (msg.includes("User already registered")) return "An account with this email already exists.";
  if (msg.includes("Email not confirmed")) return "Please check your email to confirm your account.";
  if (msg.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (msg.includes("at least") && msg.includes("characters")) return msg;
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Read redirect param from URL (e.g. /login?redirect=/invite/TOKEN)
  const redirectTo = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("redirect") ?? "/dashboard"
    : "/dashboard";
  // Sanitize: must start with / and not // (prevent open redirect)
  const safeRedirect = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard";

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
      // Pass redirect through email confirmation link so the user returns
      // to the right page (e.g. /invite/TOKEN) after confirming their email.
      const origin = window.location.origin;
      const confirmRedirect = safeRedirect !== "/dashboard"
        ? `${origin}/auth/callback?next=${encodeURIComponent(safeRedirect)}`
        : `${origin}/auth/callback`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: confirmRedirect },
      });
      if (error) {
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
