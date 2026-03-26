"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSandboxMode } from "@/lib/sandbox-mode-context";
import type { SandboxTier } from "@/lib/types/database";
import { SANDBOX_TIER_LABELS } from "@/lib/types/database";

// ============================================================================
// Sandbox Activation Modal
// Shown on first dashboard visit when sandbox has never been activated.
// User selects a production tier, which drives the fictional dataset generation.
// ============================================================================

const TIER_DETAILS: Record<SandboxTier, { description: string; icon: string }> = {
  building: {
    description:
      "New to real estate or building your business. Fewer deals, tighter margins, learning the ropes.",
    icon: "🌱",
  },
  established: {
    description:
      "Consistent production with a solid client base. Steady pipeline, predictable income, room to grow.",
    icon: "📈",
  },
  high_producer: {
    description:
      "Top-tier volume with a full pipeline. Multiple deals closing every month, team support, strong market position.",
    icon: "🏆",
  },
};

const TIERS: SandboxTier[] = ["building", "established", "high_producer"];

interface SandboxActivationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SandboxActivationModal({ open, onOpenChange }: SandboxActivationModalProps) {
  const { activate, loading } = useSandboxMode();
  const [selectedTier, setSelectedTier] = useState<SandboxTier | null>(null);

  const handleActivate = async () => {
    if (!selectedTier) return;
    await activate(selectedTier);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-xl">Explore Agent Runway</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Before you enter your own data, explore the platform with a realistic
            fictional agent matched to your market. Pick the production level
            that&apos;s closest to yours &mdash; you can change this later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {TIERS.map((tier) => {
            const details = TIER_DETAILS[tier];
            const isSelected = selectedTier === tier;
            return (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                className={`
                  flex items-start gap-3 rounded-lg border p-4 text-left transition-all
                  ${isSelected
                    ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400"
                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
                  }
                `}
              >
                <span className="text-2xl mt-0.5">{details.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{SANDBOX_TIER_LABELS[tier]}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {details.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4 gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip &mdash; I&apos;ll enter my own data
          </button>
          <Button
            onClick={handleActivate}
            disabled={!selectedTier || loading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading ? "Generating..." : "Launch Sandbox"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
