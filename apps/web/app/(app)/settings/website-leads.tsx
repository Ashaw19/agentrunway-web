"use client";

/**
 * Settings → Website leads (00173). Connects the agent's own website so its
 * sign-ups, messages and unsubscribes land in the CRM as they happen.
 *
 * The key is shown once, right after it is made. Making a new one replaces
 * the old one; Disconnect revokes it.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Globe, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ENDPOINT = "https://agentrunway.ca/api/inbound/website";

interface Status {
  connected:    boolean;
  keyPrefix:    string | null;
  createdAt:    string | null;
  lastUsedAt:   string | null;
  eventsLast7d: number;
  lastEventAt:  string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function WebsiteLeadsCard() {
  const [status, setStatus]   = useState<Status | null>(null);
  const [newKey, setNewKey]   = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const [busy, setBusy]       = useState<null | "make" | "disconnect">(null);

  async function load() {
    try {
      const res = await fetch("/api/inbound/keys");
      if (res.ok) setStatus(await res.json());
    } catch { /* the card shows "Not connected" until it loads */ }
  }
  useEffect(() => { void load(); }, []);

  async function makeKey() {
    if (status?.connected && !confirm("Make a new key? Your website stops sending until you paste the new one in.")) return;
    setBusy("make");
    try {
      const res = await fetch("/api/inbound/keys", { method: "POST" });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? "Couldn't make a key."); return; }
      setNewKey(body.key as string);
      setCopied(false);
      await load();
    } finally { setBusy(null); }
  }

  async function disconnect() {
    if (!confirm("Disconnect your website? New sign-ups stop arriving here until you make a new key.")) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/inbound/keys", { method: "DELETE" });
      if (!res.ok) { toast.error("Couldn't disconnect. Try again."); return; }
      setNewKey(null);
      toast.success("Website disconnected.");
      await load();
    } finally { setBusy(null); }
  }

  async function copy() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the key and copy it by hand.");
    }
  }

  return (
    <Card className="rounded-xl border-l-4 border-l-sky-500 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-sky-600" aria-hidden />
          Website leads
        </CardTitle>
        <CardDescription>
          Send sign-ups and messages from your own website straight into your CRM. New people arrive as
          clients tagged Website, what they did lands on their Activity tab, and the ones worth a call go
          on your Checklist. If someone unsubscribes from all your website emails, Agent Runway stops
          drafting emails to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm">
          {status === null ? (
            <span className="text-muted-foreground">Checking…</span>
          ) : status.connected ? (
            <>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected</span>
              <span className="text-muted-foreground">
                {" "}· key {status.keyPrefix}… · last event {ago(status.lastEventAt)} · {status.eventsLast7d} in the last 7 days
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Not connected.</span>
          )}
        </p>

        {newKey && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 dark:bg-amber-950/30">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
              Copy this key now. It won&apos;t be shown again.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={newKey} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Your website key" />
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
              Add it to your website&apos;s settings as <code className="font-mono">AGENT_RUNWAY_INBOUND_KEY</code>.
              Events go to <code className="font-mono">{ENDPOINT}</code>.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={makeKey} disabled={busy !== null} className="gap-1.5">
            {busy === "make" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {status?.connected ? "Make a new key" : "Connect my website"}
          </Button>
          {status?.connected && (
            <Button type="button" size="sm" variant="ghost" onClick={disconnect} disabled={busy !== null} className="gap-1.5">
              {busy === "disconnect" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
