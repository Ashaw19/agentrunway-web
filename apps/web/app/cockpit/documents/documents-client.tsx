"use client";

import { useState, useRef, useCallback } from "react";
import {
  Download,
  Upload,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorpDocument, CorpDocumentType } from "@agent-runway/core/types/database";

const DOC_TYPE_LABELS: Record<CorpDocumentType, string> = {
  minutes:        "Minutes",
  resolution:     "Resolution",
  contract:       "Contract",
  correspondence: "Correspondence",
  other:          "Other",
};

const DOC_TYPE_COLORS: Record<CorpDocumentType, string> = {
  minutes:        "bg-blue-500/10 text-blue-300 border-blue-500/20",
  resolution:     "bg-violet-500/10 text-violet-300 border-violet-500/20",
  contract:       "bg-amber-500/10 text-amber-300 border-amber-500/20",
  correspondence: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  other:          "bg-muted/40 text-muted-foreground border-muted/40",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Upload form ───────────────────────────────────────────────────────────────

interface UploadFormProps {
  onUploaded: (doc: CorpDocument) => void;
}

function UploadForm({ onUploaded }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<CorpDocumentType>("minutes");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file || !title.trim() || !docDate) return;
      setUploading(true);
      setError(null);
      setSuccess(false);

      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      fd.append("document_type", docType);
      fd.append("document_date", docDate);
      if (description.trim()) fd.append("description", description.trim());

      try {
        const res = await fetch("/api/cockpit/documents/upload", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json()) as { ok?: boolean; document?: CorpDocument; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed");
        setSuccess(true);
        setFile(null);
        setTitle("");
        setDescription("");
        if (fileRef.current) fileRef.current.value = "";
        onUploaded(json.document!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [file, title, docType, docDate, description, onUploaded],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* File picker */}
        <div className="sm:col-span-2">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            File <span className="text-red-400">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.txt,.md"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-blue-500/20 file:px-3 file:py-1 file:text-xs file:font-medium file:text-blue-300 hover:bg-white/[0.07]"
          />
          {file && (
            <p className="text-muted-foreground mt-1 text-xs">
              {file.name} — {formatBytes(file.size)}
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Inaugural Meeting Minutes"
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
          />
        </div>

        {/* Document type */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Type <span className="text-red-400">*</span>
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as CorpDocumentType)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
          >
            {(Object.keys(DOC_TYPE_LABELS) as CorpDocumentType[]).map((t) => (
              <option key={t} value={t} className="bg-[oklch(0.235_0.055_262)]">
                {DOC_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Document date */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Document date <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none [color-scheme:dark]"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief note for accountant"
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Document uploaded successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={uploading || !file}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? "Uploading…" : "Upload document"}
      </button>
    </form>
  );
}

// ── Document list ─────────────────────────────────────────────────────────────

interface DocumentListProps {
  documents: CorpDocument[];
  onDeleted: (id: string) => void;
}

function DocumentList({ documents, onDeleted }: DocumentListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (id: string, title: string) => {
      if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
      setDeleting(id);
      try {
        const res = await fetch(`/api/cockpit/documents?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        onDeleted(id);
      } catch {
        alert("Failed to delete document. Try again.");
      } finally {
        setDeleting(null);
      }
    },
    [onDeleted],
  );

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FolderOpen className="text-muted-foreground/40 mb-3 h-10 w-10" />
        <p className="text-muted-foreground text-sm">No documents uploaded yet.</p>
        <p className="text-muted-foreground/60 mt-1 text-xs">
          Upload minute-book entries, resolutions, and contracts above.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-border/30 divide-y">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center gap-4 py-3">
          <FileText className="text-muted-foreground/60 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{doc.title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {doc.document_date} · {formatBytes(doc.file_size_bytes)} ·{" "}
              <span className="text-muted-foreground/70">{doc.file_name}</span>
            </p>
            {doc.description && (
              <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">{doc.description}</p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              DOC_TYPE_COLORS[doc.document_type],
            )}
          >
            {DOC_TYPE_LABELS[doc.document_type]}
          </span>
          <button
            onClick={() => handleDelete(doc.id, doc.title)}
            disabled={deleting === doc.id}
            className="text-muted-foreground/50 shrink-0 transition hover:text-red-400 disabled:opacity-40"
            aria-label={`Delete ${doc.title}`}
          >
            {deleting === doc.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Export panel ──────────────────────────────────────────────────────────────

function ExportPanel() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const year = new Date().getFullYear();

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/cockpit/export-bundle?year=${year}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = url;
      a.download = match?.[1] ?? `AR-Inc-FY${year}-export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(new Date().toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [year]);

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-sm">
        <p>
          Generates a <strong className="text-white">ZIP bundle</strong> for FY{year} containing:
        </p>
        <ul className="mt-2 ml-4 list-disc space-y-0.5 text-xs">
          <li>5 reporting-view CSVs (P&L, HST, SR&ED, shareholder loan, pre-incorp register)</li>
          <li>Full transaction ledger CSV</li>
          <li>All receipt images attached to cockpit transactions</li>
          <li>Governance documents uploaded above</li>
          <li>README.txt with accountant instructions</li>
        </ul>
        <p className="mt-2 text-xs">
          Also provide your SR&ED Daily Log separately (not in the bundle — it lives locally).
        </p>
      </div>

      {exportError && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {exportError}
        </p>
      )}
      {lastExport && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Last exported: {lastExport}
        </p>
      )}

      <button
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Generating bundle…" : `Download FY${year} bundle`}
      </button>
    </div>
  );
}

// ── Root client component ─────────────────────────────────────────────────────

interface DocumentsClientProps {
  initialDocuments: CorpDocument[];
}

export function DocumentsClient({ initialDocuments }: DocumentsClientProps) {
  const [documents, setDocuments] = useState<CorpDocument[]>(initialDocuments);

  const handleUploaded = useCallback((doc: CorpDocument) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return (
    <div className="space-y-8">
      {/* Export bundle */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-white">Year-end export bundle</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          One-click accountant handoff — replaces the QuickBooks export.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <ExportPanel />
        </div>
      </section>

      {/* Upload documents */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-white">Upload governance documents</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          Minute-book entries, board resolutions, contracts, and correspondence. These are included
          in the next export bundle.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <UploadForm onUploaded={handleUploaded} />
        </div>
      </section>

      {/* Document list */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-white">
          Documents
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            ({documents.length})
          </span>
        </h2>
        <p className="text-muted-foreground mb-4 text-xs">
          All uploaded governance documents across all fiscal years.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-5">
          <DocumentList documents={documents} onDeleted={handleDeleted} />
        </div>
      </section>
    </div>
  );
}
