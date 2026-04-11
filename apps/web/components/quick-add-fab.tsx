"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, X, ArrowLeftRight, Layers, Receipt, Keyboard, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { VoiceRecordButton, type VoiceState } from "@/components/voice-record-button";
import { useVoiceDraft } from "@/lib/voice/voice-draft-context";
import type { VoiceDraft } from "@/lib/voice/types";
import { toast } from "sonner";

interface QuickAddFabProps {
  /** Whether the AI chat bubble is present (shift position left) */
  hasAiChat?: boolean;
}

/**
 * Floating action button that expands into a quick-action ring.
 * Now includes Voice Input as a 4th action item with smart intent routing.
 * Also registers global keyboard shortcuts.
 */
export function QuickAddFab({ hasAiChat = false }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const router = useRouter();
  const { setDraft } = useVoiceDraft();

  const goTo = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  const openQuickAdd = useCallback(() => {
    setOpen(false);
    router.push("/transactions?new=1");
  }, [router]);

  // Register global shortcuts
  useAppShortcuts(openQuickAdd);

  // When voice is actively recording/processing, show a simplified UI
  const voiceBusy = voiceActive && voiceState !== "idle" && voiceState !== "error";

  // Dismiss overlays on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (open || voiceActive) {
          if (!voiceBusy) {
            setOpen(false);
            setVoiceActive(false);
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showShortcuts, open, voiceActive, voiceBusy]);

  /** Route a completed voice draft to the correct page */
  const handleVoiceDraft = useCallback((draft: VoiceDraft) => {
    setDraft(draft);
    setVoiceActive(false);
    setOpen(false);

    switch (draft.intent) {
      case "new_client":
        router.push("/crm?voice=1");
        break;
      case "new_expense":
        router.push("/expenses?voice=1");
        break;
      case "new_transaction":
        router.push("/transactions?voice=1");
        break;
      case "note":
        router.push("/crm?voice=note");
        break;
      case "unknown":
        toast.info("Couldn't determine what to do", {
          description: draft.transcript_cleaned
            ? `"${draft.transcript_cleaned.slice(0, 120)}${draft.transcript_cleaned.length > 120 ? "..." : ""}"`
            : "Try speaking more clearly.",
        });
        break;
    }
  }, [setDraft, router]);

  const handleVoiceStateChange = useCallback((state: VoiceState) => {
    setVoiceState(state);
    // If voice errored or returned to idle without a draft, exit voice mode
    // (successful draft exits via handleVoiceDraft)
  }, []);

  const actions = [
    {
      label: "New Transaction",
      icon: ArrowLeftRight,
      color: "bg-emerald-600 hover:bg-emerald-500",
      onClick: () => goTo("/transactions?new=1"),
    },
    {
      label: "Add Pipeline Deal",
      icon: Layers,
      color: "bg-violet-600 hover:bg-violet-500",
      onClick: () => goTo("/transactions?tab=pipeline"),
    },
    {
      label: "Log Expense",
      icon: Receipt,
      color: "bg-amber-600 hover:bg-amber-500",
      onClick: () => goTo("/expenses?new=1"),
    },
  ];

  const rightOffset = hasAiChat ? "right-[4.5rem]" : "right-5";

  return (
    <>
      {/* Keyboard shortcut hint sheet */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="relative w-[calc(100vw-2rem)] sm:w-80 max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 text-slate-500 hover:text-white"
              onClick={() => setShowShortcuts(false)}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-4 flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-blue-400" />
              <p className="text-sm font-bold text-white">Keyboard shortcuts</p>
            </div>
            <div className="space-y-2">
              {[
                { key: "N", desc: "New transaction" },
                { key: "D", desc: "Dashboard" },
                { key: "T", desc: "Transactions" },
                { key: "P", desc: "Pipeline" },
                { key: "F", desc: "Forecast" },
                { key: "E", desc: "Expenses" },
                { key: "R", desc: "Reports" },
              ].map(({ key, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5"
                >
                  <span className="text-sm text-slate-400">{desc}</span>
                  <kbd className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono font-semibold text-slate-300 border border-slate-700">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-slate-600 text-center">
              Shortcuts inactive while typing in a field
            </p>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {(open || voiceActive) && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => {
            if (!voiceBusy) {
              setOpen(false);
              setVoiceActive(false);
            }
          }}
        />
      )}

      {/* Action items — fan up from the FAB */}
      <div className={cn("fixed bottom-5 z-40 flex flex-col items-end gap-3", rightOffset)}>
        {/* Voice recording widget (replaces action list when active) */}
        {voiceActive && (
          <div
            className="flex items-center gap-2"
            style={{ animation: "fabItemIn 0.2s ease-out both" }}
          >
            <VoiceRecordButton
              onDraft={handleVoiceDraft}
              onStateChange={handleVoiceStateChange}
            />
          </div>
        )}

        {/* Standard action items (hidden when voice is active) */}
        {open && !voiceActive && actions.map(({ label, icon: Icon, color, onClick }, i) => (
          <div
            key={label}
            className="flex items-center gap-2"
            style={{
              animation: `fabItemIn 0.2s ease-out ${i * 0.05}s both`,
            }}
          >
            <span className="rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg border border-white/10 backdrop-blur-sm whitespace-nowrap">
              {label}
            </span>
            <button
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-150",
                color,
                "text-white"
              )}
              onClick={onClick}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Voice Input action (4th item in the fan) */}
        {open && !voiceActive && (
          <div
            className="flex items-center gap-2"
            style={{ animation: `fabItemIn 0.2s ease-out ${actions.length * 0.05}s both` }}
          >
            <span className="rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg border border-white/10 backdrop-blur-sm whitespace-nowrap">
              Voice Input
            </span>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 hover:bg-rose-500 shadow-lg text-white transition-all duration-150"
              onClick={() => setVoiceActive(true)}
              title="Voice Input"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Keyboard shortcut hint */}
        {open && !voiceActive && (
          <div
            className="flex items-center gap-2"
            style={{ animation: `fabItemIn 0.2s ease-out ${(actions.length + 1) * 0.05}s both` }}
          >
            <span className="rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-slate-400 shadow-lg border border-white/10 backdrop-blur-sm whitespace-nowrap">
              Keyboard shortcuts
            </span>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 shadow-lg text-white transition-all duration-150"
              onClick={() => { setOpen(false); setShowShortcuts(true); }}
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Main FAB */}
        <button
          data-tour="fab"
          onClick={() => {
            if (voiceActive && !voiceBusy) {
              setVoiceActive(false);
            } else if (!voiceBusy) {
              setOpen((v) => !v);
              setVoiceActive(false);
            }
          }}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all duration-200",
            "text-white",
            open || voiceActive
              ? "bg-slate-700 rotate-45"
              : "bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500",
          )}
          style={{
            boxShadow: open || voiceActive
              ? "0 4px 20px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(99,102,241,0.5)",
          }}
          aria-label={open || voiceActive ? "Close quick actions" : "Quick actions"}
        >
          <Plus
            className={cn(
              "h-6 w-6 transition-transform duration-200",
              (open || voiceActive) && "rotate-45"
            )}
          />
        </button>
      </div>
    </>
  );
}
