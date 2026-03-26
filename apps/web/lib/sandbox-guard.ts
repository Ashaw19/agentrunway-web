// ============================================================================
// Agent Runway — Sandbox Write Guard (Client-Side)
//
// Provides a pre-flight check for all mutation handlers in client components.
// When sandbox mode is active, blocks the write and shows a friendly toast.
//
// Usage in any component:
//   import { guardSandboxWrite } from "@/lib/sandbox-guard";
//   import { useSandboxMode } from "@/lib/sandbox-mode-context";
//
//   const sandbox = useSandboxMode();
//   const handleSave = async () => {
//     if (guardSandboxWrite(sandbox.sandboxMode)) return;
//     // ... proceed with real mutation
//   };
//
// The RLS restrictive policies are the true safety net at the database level.
// This client-side guard exists purely for UX — to give users clear feedback
// instead of cryptic database errors.
// ============================================================================

import { toast } from "sonner";

const SANDBOX_TOAST_ID = "sandbox-write-blocked";

/**
 * Returns `true` if the write should be blocked (sandbox is active).
 * Shows a toast notification explaining why.
 * Returns `false` if the write is safe to proceed.
 */
export function guardSandboxWrite(
  sandboxMode: boolean,
  customMessage?: string,
): boolean {
  if (!sandboxMode) return false;

  toast.warning(
    customMessage ?? "Sandbox Mode — changes are not saved to your real account.",
    {
      id: SANDBOX_TOAST_ID,
      description: "Exit Sandbox to make real changes.",
      duration: 4000,
    },
  );
  return true;
}

/**
 * Variant for external service actions (sending emails, publishing posts).
 * More emphatic messaging since these actions would be visible to third parties.
 */
export function guardSandboxExternalAction(
  sandboxMode: boolean,
  actionName: string,
): boolean {
  if (!sandboxMode) return false;

  toast.error(
    `Sandbox Mode — ${actionName} is disabled.`,
    {
      id: SANDBOX_TOAST_ID,
      description: "External actions are blocked in Sandbox to protect your real accounts.",
      duration: 5000,
    },
  );
  return true;
}

/**
 * Server-side sandbox check for API routes.
 * Checks if the authenticated user has sandbox_mode enabled.
 * Used in API routes that call external services (Gmail, Instagram, Plaid).
 */
export async function isUserInSandbox(
  supabase: { from: (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => { single: () => Promise<{ data: { sandbox_mode: boolean } | null }> } } } },
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", userId)
    .single();
  return data?.sandbox_mode === true;
}
