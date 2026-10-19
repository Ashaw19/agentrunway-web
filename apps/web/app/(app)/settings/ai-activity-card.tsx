/**
 * Settings → AI activity: the way in to /ai-activity, where the agent sees
 * what Flight Crew changed (and can undo it) and which AI calls ran.
 */

import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_UNDO_WINDOW_DAYS } from "@agent-runway/core/lib/ai-activity";

export function AiActivityCard() {
  return (
    <Card id="ai-activity" className="rounded-xl shadow-sm">
      <Link href="/ai-activity" className="block rounded-xl hover:bg-muted/40 transition-colors">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle>AI activity</CardTitle>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </div>
          <CardDescription>
            What Flight Crew changed in your records, with Undo for {AI_UNDO_WINDOW_DAYS} days, and every AI call
            Agent Runway made for you: what it was for, whether it worked, and its estimated cost.
          </CardDescription>
        </CardHeader>
      </Link>
    </Card>
  );
}
