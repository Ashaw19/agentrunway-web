import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Returns true if an error is a stored-refresh-token-not-valid case.
 * These fire on first launch (no stored token) or after a server-side
 * token rotation. They are not user-visible problems — the app should
 * silently treat the user as logged out and route them to login.
 *
 * Includes Auth-API "Refresh Token Not Found" / "Invalid Refresh Token"
 * and the network "AuthSessionMissingError" / "AuthRetryableFetchError"
 * shapes Supabase JS surfaces from getSession() / refreshSession() /
 * getUser() / auto-refresh ticks.
 */
export function isExpectedAuthBootstrapError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const name = err instanceof Error ? err.name : "";
  const lower = message.toLowerCase();
  if (name === "AuthSessionMissingError") return true;
  if (lower.includes("refresh token not found")) return true;
  if (lower.includes("invalid refresh token")) return true;
  if (lower.includes("auth session missing")) return true;
  if (name === "AuthApiError" && lower.includes("refresh token")) return true;
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Get initial session. If a stale/invalid refresh token is stored,
    // supabase-js will reject the promise with AuthApiError("Refresh Token
    // Not Found") or similar — silently treat as logged-out instead of
    // surfacing a scary toast / red box on first launch.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error && !isExpectedAuthBootstrapError(error)) {
          console.warn("[auth] getSession returned error:", error);
        }
        setSession(data.session ?? null);
      } catch (err) {
        if (cancelled) return;
        if (!isExpectedAuthBootstrapError(err)) {
          console.warn("[auth] getSession threw:", err);
        }
        // Clear any stale local token so subsequent autoRefresh ticks
        // don't keep re-throwing the same error.
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // signOut without a session also throws — swallow.
        }
        setSession(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    // Listen for auth changes. Errors propagate via the SDK's own pipeline.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
