"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// ============================================================================
// Sandbox Expiry Modal
// Shown once when the user loads the dashboard and the 90-day window has passed.
// They can dismiss (switch to real data) or view the archived sandbox data.
// ============================================================================

interface SandboxExpiryModalProps {
  open: boolean;
  onDismiss: () => void;
}

export function SandboxExpiryModal({ open, onDismiss }: SandboxExpiryModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Your sandbox window has closed</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            The 90-day interactive sandbox period has ended. Everything you see
            now is your real business data. Your fictional agent data is still
            available as a read-only benchmark in the archive.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" asChild>
            <Link href="/sandbox/archive">View Archive</Link>
          </Button>
          <Button onClick={onDismiss} className="bg-amber-500 hover:bg-amber-600 text-white">
            Got it &mdash; show my real data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
