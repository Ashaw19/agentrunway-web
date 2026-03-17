"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ShortcutMap {
  key: string;
  handler: () => void;
  description: string;
}

/**
 * Global keyboard shortcut listener for the app.
 * Ignores shortcuts when focus is on an input/textarea/select.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if focus is in a form element or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore modifier combinations (we only care about bare keys)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const shortcut = shortcuts.find(
        (s) => s.key.toLowerCase() === e.key.toLowerCase()
      );
      if (shortcut) {
        e.preventDefault();
        shortcut.handler();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * App-wide navigation shortcuts.
 * Usage: call `useAppShortcuts(openQuickAdd)` in a root client component.
 */
export function useAppShortcuts(openQuickAdd: () => void) {
  const router = useRouter();

  useKeyboardShortcuts([
    {
      key: "d",
      handler: () => router.push("/dashboard"),
      description: "Go to Dashboard",
    },
    {
      key: "t",
      handler: () => router.push("/transactions"),
      description: "Go to Transactions",
    },
    {
      key: "p",
      handler: () => router.push("/transactions?tab=pipeline"),
      description: "Go to Pipeline",
    },
    {
      key: "f",
      handler: () => router.push("/forecast"),
      description: "Go to Forecast",
    },
    {
      key: "e",
      handler: () => router.push("/expenses"),
      description: "Go to Expenses",
    },
    {
      key: "r",
      handler: () => router.push("/reports"),
      description: "Go to Reports",
    },
    {
      key: "n",
      handler: openQuickAdd,
      description: "New Transaction",
    },
  ]);
}
