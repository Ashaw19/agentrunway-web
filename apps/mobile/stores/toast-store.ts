/**
 * Toast notification store.
 * Tiny Zustand store for global toast messages (success / error / info).
 *
 * A toast can carry one action button (Undo on the dashboard's Next up). It
 * stays up longer than a plain one, so there is time to tap it.
 */

import { create } from "zustand";

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

export interface ToastState {
  message: string | null;
  variant: "success" | "error" | "info";
  onRetry?: () => void;
  action?: ToastAction;
  show: (
    message: string,
    variant?: "success" | "error" | "info",
    onRetry?: () => void,
    action?: ToastAction,
  ) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "success",
  onRetry: undefined,
  action: undefined,

  show: (message, variant = "success", onRetry, action) =>
    set({ message, variant, onRetry, action }),

  hide: () => set({ message: null, onRetry: undefined, action: undefined }),
}));
