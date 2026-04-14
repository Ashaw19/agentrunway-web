"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  ExternalLink,
  RefreshCw,
  HardDrive,
  Sparkles,
  Tag,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriveDocument {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  last_modified: string | null;
  web_view_link: string | null;
  indexed_at: string | null;
  summary: string | null;
  tags: string[];
}

interface Props {
  isDriveConnected: boolean;
  connectedEmail: string | null;
  documents: DriveDocument[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes("document"))     return <FileText className="h-5 w-5 text-blue-500" />;
  if (mimeType.includes("spreadsheet"))  return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (mimeType.includes("presentation")) return <Presentation className="h-5 w-5 text-orange-500" />;
  if (mimeType.includes("pdf"))          return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DriveContent({ isDriveConnected, connectedEmail, documents }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [indexing, startIndexing] = useTransition();
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const filtered = documents.filter(
    (d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleIndexDrive = () => {
    startIndexing(async () => {
      try {
        const res = await fetch("/api/ai/drive-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "index_all" }),
        });
        if (!res.ok) throw new Error(await res.text());
        router.refresh();
      } catch {
        toast.error("Failed to index Drive documents. Please try again.");
      }
    });
  };

  const handleAnalyzeDocument = async (docId: string) => {
    setAnalyzing(docId);
    try {
      const res = await fetch("/api/ai/drive-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", document_id: docId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      toast.error("Failed to analyze document. Please try again.");
    } finally {
      setAnalyzing(null);
    }
  };

  // ── Not connected state ───────────────────────────────────────────────────

  if (!isDriveConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Google Drive</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered document analysis for your real estate files
          </p>
        </div>

        <Card className="border-border/40">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Google Drive</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Google Drive integration is coming soon. We&apos;ll notify you when it&apos;s available.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mt-2">
              {[
                { icon: FileText, label: "Listing Agreements", desc: "Summarize key terms" },
                { icon: Sparkles, label: "Marketing Copy", desc: "AI-refine descriptions" },
                { icon: FileSpreadsheet, label: "Training Docs", desc: "Extract action items" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 border border-border/40 opacity-50"
                >
                  <item.icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-semibold">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground">{item.desc}</span>
                </div>
              ))}
            </div>
            <Badge variant="secondary" className="mt-2 text-xs">
              Coming Soon
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Connected state ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Google Drive</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {connectedEmail} · {documents.length} document{documents.length !== 1 ? "s" : ""} indexed
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleIndexDrive}
          disabled={indexing}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${indexing ? "animate-spin" : ""}`} />
          {indexing ? "Indexing…" : "Re-index Drive"}
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by name or tag…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Documents list */}
      {filtered.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <HardDrive className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {search ? "No documents match your search" : "No documents indexed yet"}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground">
                Click &ldquo;Re-index Drive&rdquo; to scan your Google Drive for documents.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <Card key={doc.id} className="border-border/40 hover:border-border transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    <FileIcon mimeType={doc.mime_type} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-tight truncate">{doc.name}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {doc.web_view_link && (
                          <a
                            href={doc.web_view_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleAnalyzeDocument(doc.id)}
                          disabled={analyzing === doc.id}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {analyzing === doc.id ? "Analyzing…" : "Analyze"}
                        </Button>
                      </div>
                    </div>

                    {/* Summary */}
                    {doc.summary && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {doc.summary}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center flex-wrap gap-3 mt-2">
                      {/* Size */}
                      <span className="text-[10px] text-muted-foreground/60">
                        {fmtBytes(doc.size_bytes)}
                      </span>

                      {/* Last modified */}
                      {doc.last_modified && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                          <Clock className="h-2.5 w-2.5" />
                          {fmtDate(doc.last_modified)}
                        </span>
                      )}

                      {/* Indexed indicator */}
                      {doc.indexed_at && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-600">
                          Indexed
                        </Badge>
                      )}

                      {/* Tags */}
                      {doc.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <Tag className="h-2.5 w-2.5 text-muted-foreground/40" />
                          {doc.tags.slice(0, 4).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5">
                              {t}
                            </Badge>
                          ))}
                          {doc.tags.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{doc.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[10px] text-center text-muted-foreground/40 pt-2">
        Documents are analyzed locally and stored in your Agent Runway account. Files are never shared externally.
      </p>
    </div>
  );
}
