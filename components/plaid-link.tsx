"use client";

/**
 * PlaidLinkButton
 *
 * Loads the Plaid Link JS SDK on demand (no extra npm package required).
 * 1. Calls our /api/plaid/create-link-token → link_token
 * 2. Injects <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js">
 * 3. Opens the Plaid Link modal
 * 4. On success, calls our /api/plaid/exchange-token → item_id
 * 5. Calls onSuccess({ item_id, institution_name }) so the parent can refresh
 */
import { useCallback, useState } from "react";
import { Button }                from "@/components/ui/button";
import { Landmark, Loader2 }     from "lucide-react";

interface PlaidMetadata {
  institution?: { name: string; institution_id: string };
}

interface PlaidLinkSuccessResult {
  item_id:          string;
  institution_name: string;
}

interface Props {
  onSuccess: (result: PlaidLinkSuccessResult) => void;
  onError?:  (message: string) => void;
  /** Button label — defaults to "Connect Bank Account" */
  label?: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plaid?: any;
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const existing = document.getElementById("plaid-link-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id   = "plaid-link-script";
    script.src  = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Plaid Link"));
    document.head.appendChild(script);
  });
}

export function PlaidLinkButton({
  onSuccess,
  onError,
  label = "Connect Bank Account",
  variant = "default",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      // Step 1 — get link token from our API
      const tokenRes = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.link_token) {
        throw new Error(tokenData.error ?? "Failed to create link token");
      }

      // Step 2 — ensure Plaid Link JS is loaded
      await loadPlaidScript();

      // Step 3 — open Plaid Link modal
      const handler = window.Plaid!.create({
        token: tokenData.link_token,

        onSuccess: async (public_token: string, metadata: PlaidMetadata) => {
          try {
            const exchangeRes = await fetch("/api/plaid/exchange-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                public_token,
                institution_id:   metadata.institution?.institution_id ?? null,
                institution_name: metadata.institution?.name           ?? null,
              }),
            });
            const exchangeData = await exchangeRes.json();
            if (!exchangeRes.ok || !exchangeData.item_id) {
              throw new Error(exchangeData.error ?? "Failed to link account");
            }
            onSuccess({
              item_id:          exchangeData.item_id,
              institution_name: metadata.institution?.name ?? "Bank Account",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Exchange failed";
            onError?.(msg);
          } finally {
            setLoading(false);
          }
        },

        onExit: () => setLoading(false),
      });

      handler.open();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Plaid Link error";
      console.error("[PlaidLinkButton]", msg);
      onError?.(msg);
      setLoading(false);
    }
  }, [onSuccess, onError]);

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      disabled={loading}
      className={className}
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
        : <Landmark className="h-4 w-4 mr-2" />}
      {loading ? "Connecting…" : label}
    </Button>
  );
}
