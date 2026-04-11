"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Copy, Mail, Paperclip, Inbox as InboxIcon, Link2, Check } from "lucide-react";
import type { InboxEmailRow } from "./page";

interface InboxContentProps {
  forwardingAddress: string | null;
  emails: InboxEmailRow[];
}

export function InboxContent({ forwardingAddress, emails }: InboxContentProps) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | "linked" | "unresolved">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((e) => {
      if (filter === "linked" && e.status !== "linked") return false;
      if (filter === "unresolved" && e.status !== "unresolved") return false;
      if (!q) return true;
      return (
        e.from_address.toLowerCase().includes(q) ||
        (e.from_name?.toLowerCase().includes(q) ?? false) ||
        (e.subject?.toLowerCase().includes(q) ?? false) ||
        (e.preview?.toLowerCase().includes(q) ?? false) ||
        (e.clients?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [emails, filter, query]);

  const unresolvedCount = emails.filter((e) => e.status === "unresolved").length;
  const linkedCount = emails.filter((e) => e.status === "linked").length;

  const copyAddress = () => {
    if (!forwardingAddress) return;
    navigator.clipboard.writeText(forwardingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Client replies forwarded to your Agent Runway address. Replies
          auto-link to contacts, boost engagement scores, and pause any active
          nurture sequences.
        </p>
      </div>

      {/* ── Forwarding address card ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Your forwarding address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {forwardingAddress ? (
            <>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm font-mono">
                  {forwardingAddress}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyAddress}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set up a Gmail filter that forwards replies to this address.{" "}
                <Link
                  href="/guide/email-forwarding"
                  className="underline underline-offset-2"
                >
                  60-second setup guide →
                </Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your forwarding address is being generated. Refresh in a moment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Stats + filter strip ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All {emails.length > 0 && `(${emails.length})`}
        </Button>
        <Button
          size="sm"
          variant={filter === "linked" ? "default" : "outline"}
          onClick={() => setFilter("linked")}
        >
          Linked {linkedCount > 0 && `(${linkedCount})`}
        </Button>
        <Button
          size="sm"
          variant={filter === "unresolved" ? "default" : "outline"}
          onClick={() => setFilter("unresolved")}
        >
          Unresolved {unresolvedCount > 0 && `(${unresolvedCount})`}
        </Button>
        <div className="ml-auto w-full max-w-xs">
          <Input
            placeholder="Search subject, sender, contact..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* ── Message list ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <InboxIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground max-w-md">
                No messages yet. Once you set up Gmail forwarding to your inbound address,
                client replies will land here automatically.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex-1 space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {e.from_name || e.from_address}
                      </span>
                      {e.status === "linked" && e.clients ? (
                        <Badge variant="secondary" className="gap-1">
                          <Link2 className="h-3 w-3" />
                          {e.clients.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Unresolved</Badge>
                      )}
                      {e.has_attachments && (
                        <Badge variant="outline" className="gap-1">
                          <Paperclip className="h-3 w-3" />
                          {e.attachment_count}
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-sm">
                      {e.subject || <span className="italic text-muted-foreground">(no subject)</span>}
                    </div>
                    {e.preview && (
                      <div className="truncate text-xs text-muted-foreground">
                        {e.preview}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    {formatRelativeDate(e.received_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-center text-xs text-muted-foreground">
        Showing up to 200 most recent messages. Archived and spam messages are hidden.
      </p>
    </div>
  );
}

/** Compact relative date formatter: "2h ago", "3d ago", "Mar 14". */
function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
