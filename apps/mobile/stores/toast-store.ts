/**
 * Toast notification store.
 * Tiny Zustand store for global toast messages (success / error / info).
 */

import { create } from "zustand";

export interface ToastState {
  message: string | null;
  variant: "success" | "error" | "info";
  onRetry?: () => void;
  show: (
    message: string,
    variant?: "success" | "error" | "info",
    onRetry?: () => void,
  ) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "success",
  onRetry: undefined,

  show: (message, variant = "success", onRetry) =>
    set({ message, variant, onRetry }),

  hide: () => set({ message: null, onRetry: undefined }),
}));
