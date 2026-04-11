"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { SandboxDataset, SandboxTier } from "@/lib/types/database";

// ============================================================================
// Sandbox Mode Context
// Provides global sandbox state to all dashboard components.
// Server component loads initial state; client manages toggle + expiry.
// ============================================================================

interface SandboxModeCtx {
  /** Whether sandbox data is currently being displayed */
  sandboxMode: boolean;
  /** The full fictional dataset (null if never activated) */
  sandboxData: SandboxDataset | null;
  /** Days remaining in the 90-day interactive window */
  daysRemaining: number;
  /** Whether the sandbox window has expired (read-only archive mode) */
  isExpired: boolean;
  /** Whether the sandbox has ever been activated */
  isActivated: boolean;
  /** Toggle sandbox on/off (does NOT regenerate data) */
  toggle: () => Promise<void>;
  /** First-time activation — generates the dataset and starts the 90-day clock */
  activate: (tier: SandboxTier) => Promise<void>;
  /** Regenerate sandbox data with a different tier */
  regenerate: (tier: SandboxTier) => Promise<void>;
  /** Loading state for async operations */
  loading: boolean;
}

const Ctx = createContext<SandboxModeCtx>({
  sandboxMode: false,
  sandboxData: null,
  daysRemaining: 0,
  isExpired: false,
  isActivated: false,
  toggle: async () => {},
  activate: async () => {},
  regenerate: async () => {},
  loading: false,
});

interface SandboxModeProviderProps {
  children: ReactNode;
  /** Initial sandbox_mode from server-loaded user_settings */
  initialMode: boolean;
  /** Initial sandbox_data from server-loaded user_settings */
  initialData: SandboxDataset | null;
  /** ISO timestamp of when sandbox was first activated */
  activatedAt: string | null;
  /** ISO timestamp of when sandbox expires */
  expiresAt: string | null;
}

function computeDaysRemaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function SandboxModeProvider({
  children,
  initialMode,
  initialData,
  activatedAt,
  expiresAt,
}: SandboxModeProviderProps) {
  const [sandboxMode, setSandboxMode] = useState(initialMode);
  const [sandboxData, _setSandboxData] = useState<SandboxDataset | null>(initialData);
  const [loading, setLoading] = useState(false);

  const isActivated = activatedAt !== null;
  const daysRemaining = computeDaysRemaining(expiresAt);
  const isExpired = isActivated && daysRemaining <= 0;

  // ── Auto-expire on mount if window has passed ───────────────────────────
  useEffect(() => {
    if (isExpired && sandboxMode) {
      fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire" }),
      }).then(() => setSandboxMode(false));
    }
  }, [isExpired, sandboxMode]);

  // ── Auto-regenerate old datasets missing full-app data ─────────────────
  // Datasets generated before the full-app expansion lack clients, tasks, etc.
  // Detect this and silently regenerate with the same tier.
  useEffect(() => {
    if (
      sandboxMode &&
      isActivated &&
      !isExpired &&
      sandboxData &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !Array.isArray((sandboxData as any).clients)
    ) {
      const tier = sandboxData.meta?.tier;
      if (tier) {
        fetch("/api/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "regenerate", tier }),
        }).then((res) => {
          if (res.ok) window.location.reload();
        });
      }
    }
  }, [sandboxMode, isActivated, isExpired, sandboxData]);

  // ── Toggle ──────────────────────────────────────────────────────────────
  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      if (res.ok) {
        // Full page reload so server components re-resolve sandbox vs real data
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Activate ────────────────────────────────────────────────────────────
  const activate = useCallback(async (tier: SandboxTier) => {
    setLoading(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", tier }),
      });
      if (res.ok) {
        // Reload the page to get fresh server data (including the generated sandbox_data)
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Regenerate ──────────────────────────────────────────────────────────
  const regenerate = useCallback(async (tier: SandboxTier) => {
    setLoading(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", tier }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Ctx
      value={{
        sandboxMode,
        sandboxData,
        daysRemaining,
        isExpired,
        isActivated,
        toggle,
        activate,
        regenerate,
        loading,
      }}
    >
      {children}
    </Ctx>
  );
}

export const useSandboxMode = () => useContext(Ctx);
