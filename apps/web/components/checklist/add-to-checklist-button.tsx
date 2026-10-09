"use client";

/**
 * One-tap "Add to checklist" for a client: adds "Contact <name>", due today.
 * Used on Flight Control cards and the client profile. Once the client has an
 * open item it reads "On checklist" and links to the page.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { addContactItem } from "@/lib/checklist/actions";
import type { ContactTask } from "@/lib/types/database";

export function AddToChecklistButton({
  clientId,
  clientName,
  onList: initiallyOnList = false,
  onAdded,
  className,
}: {
  clientId:   string;
  clientName: string;
  /** The client already has an open checklist item. */
  onList?:    boolean;
  onAdded?:   (task: ContactTask) => void;
  className?: string;
}) {
  const router = useRouter();
  const [onList, setOnList] = useState(initiallyOnList);
  const [saving, setSaving] = useState(false);

  if (onList) {
    return (
      <Button asChild variant="ghost" size="sm" className={cn("h-7 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700", className)}>
        <Link href="/checklist">
          <ListChecks className="h-3.5 w-3.5" />
          On checklist
        </Link>
      </Button>
    );
  }

  async function add() {
    setSaving(true);
    const task = await addContactItem(createClient(), clientId, clientName);
    setSaving(false);
    if (!task) {
      toast.error("Couldn't add it to your checklist. Try again.");
      return;
    }
    setOnList(true);
    onAdded?.(task);
    toast.success(`Added "Contact ${clientName}" to today's checklist.`, {
      action: { label: "View", onClick: () => router.push("/checklist") },
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground", className)}
      disabled={saving}
      onClick={add}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
      Add to checklist
    </Button>
  );
}
