"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Settings → Privacy & Your Data
// ─────────────────────────────────────────────────────────────────────────────
// Renders the "Download my data" card. Hits POST /api/account/export, which
// streams a ZIP back; we surface it to the browser as a normal download.
//
// MVP scope: button → ZIP. Future enhancements (selectable categories, async
// generation with email link, full storage/AI history) plug in here.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { toast } from "sonner";
import { Download, ShieldCheck, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DataExportCard() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/account/export", { method: "POST" });

      if (res.status === 429) {
        const reset = res.headers.get("X-RateLimit-Reset");
        const minutes = reset
          ? Math.max(1, Math.ceil((Number(reset) * 1000 - Date.now()) / 60000))
          : 60;
        toast.error(
          `You can only request one export per hour. Try again in ~${minutes} minute${minutes === 1 ? "" : "s"}.`,
        );
        return;
      }

      if (!res.ok) {
        let message = "Couldn't build your export. Please try again in a few minutes.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // body wasn't JSON — fall through with the default message
        }
        toast.error(message);
        return;
      }

      // Stream the ZIP into a Blob and trigger a download via a hidden anchor.
      const blob = await res.blob();
      const filename =
        parseFilename(res.headers.get("Content-Disposition")) ??
        `agentrunway-export-${new Date().toISOString().split("T")[0]}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Your data export is downloading.");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Network error while building your export. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="rounded-xl border-l-4 border-l-emerald-500 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <CardTitle>Privacy &amp; your data</CardTitle>
        </div>
        <CardDescription>
          Download a copy of everything Agent Runway knows about your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          You&apos;ll get a ZIP containing one CSV per table — transactions,
          pipeline, expenses, goals, profile, and more — plus a{" "}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
            manifest.json
          </code>{" "}
          describing what&apos;s inside. OAuth tokens for connected accounts
          are redacted; you can re-issue those from the relevant settings
          card if you ever need to.
        </p>

        <div>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            variant="outline"
            className="gap-2"
          >
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your export…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download my data
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Limit: one export per hour. Need stored documents, AI conversation
          history, or a different format? Email{" "}
          <a
            href="mailto:support@agentrunway.ca"
            className="underline underline-offset-2"
          >
            support@agentrunway.ca
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

/** Pull the filename out of `Content-Disposition: attachment; filename="..."`. */
function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}
