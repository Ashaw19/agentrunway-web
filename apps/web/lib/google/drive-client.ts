/**
 * Google Drive API client — list, read, export, create, and update files.
 *
 * Uses the Drive REST API v3 with the authenticated user's access token.
 * Follows the same pattern as gmail-client.ts and calendar-client.ts.
 */

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;           // bytes, as string
  modifiedTime?: string;   // ISO 8601
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
}

export interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

// ── Google Workspace MIME types ─────────────────────────────────────────────

const GOOGLE_DOC_MIME   = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDE_MIME = "application/vnd.google-apps.presentation";

/** Map of Google Workspace types to their text export MIME */
const EXPORT_MIME_MAP: Record<string, string> = {
  [GOOGLE_DOC_MIME]:   "text/plain",
  [GOOGLE_SHEET_MIME]: "text/csv",
  [GOOGLE_SLIDE_MIME]: "text/plain",
};

// ── List Files ─────────────────────────────────────────────────────────────────

/**
 * List files from the user's Drive.
 * Supports search queries using Drive's `q` parameter syntax.
 */
export async function listFiles(
  accessToken: string,
  options: {
    query?: string;      // Drive search query (e.g., "name contains 'listing'")
    pageToken?: string;
    pageSize?: number;
    orderBy?: string;    // e.g., "modifiedTime desc"
  } = {}
): Promise<DriveListResponse> {
  const url = new URL(DRIVE_FILES_URL);

  const fields = "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,parents),nextPageToken";
  url.searchParams.set("fields", fields);
  url.searchParams.set("pageSize", String(options.pageSize ?? 50));

  if (options.query) {
    url.searchParams.set("q", options.query);
  }
  if (options.pageToken) {
    url.searchParams.set("pageToken", options.pageToken);
  }
  if (options.orderBy) {
    url.searchParams.set("orderBy", options.orderBy);
  }

  // Exclude trashed files
  const existingQ = url.searchParams.get("q");
  url.searchParams.set(
    "q",
    existingQ ? `(${existingQ}) and trashed=false` : "trashed=false"
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive list failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as DriveListResponse;
}

// ── Get File Content ───────────────────────────────────────────────────────────

/**
 * Download a file's content (for non-Google-Workspace files like PDFs, text).
 * Returns raw text content.
 */
export async function getFileContent(
  accessToken: string,
  fileId: string
): Promise<string> {
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive download failed: ${res.status} — ${errText}`);
  }

  return res.text();
}

// ── Export Google Workspace Files ───────────────────────────────────────────────

/**
 * Export a Google Docs/Sheets/Slides file to plain text.
 * Required for Google Workspace files (they can't be downloaded directly).
 */
export async function exportGoogleDoc(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  const exportMime = EXPORT_MIME_MAP[mimeType];
  if (!exportMime) {
    throw new Error(`Unsupported Google Workspace type: ${mimeType}`);
  }

  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive export failed: ${res.status} — ${errText}`);
  }

  return res.text();
}

// ── Get File Metadata ──────────────────────────────────────────────────────────

/**
 * Fetch metadata for a single file.
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink,parents`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive metadata failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as DriveFile;
}

// ── Read File Text (auto-detects Google vs regular) ────────────────────────────

/**
 * Reads a file's text content, automatically handling Google Workspace files
 * (export) vs regular files (download).
 */
export async function readFileText(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  if (EXPORT_MIME_MAP[mimeType]) {
    return exportGoogleDoc(accessToken, fileId, mimeType);
  }
  return getFileContent(accessToken, fileId);
}

/**
 * Whether a MIME type is a Google Workspace type that needs export.
 */
export function isGoogleWorkspaceType(mimeType: string): boolean {
  return mimeType in EXPORT_MIME_MAP;
}

/**
 * Whether a file type can be read as text for Groq analysis.
 */
export function isAnalyzable(mimeType: string): boolean {
  if (EXPORT_MIME_MAP[mimeType]) return true;
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType === "application/json") return true;
  if (mimeType === "application/rtf") return true;
  if (mimeType.includes("word") || mimeType.includes("opendocument")) return true;
  return false;
}

// ── Create File ────────────────────────────────────────────────────────────────

/**
 * Create a new file in Drive with text content.
 */
export async function createFile(
  accessToken: string,
  name: string,
  content: string,
  mimeType: string = "text/plain",
  folderId?: string
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name, mimeType };
  if (folderId) metadata.parents = [folderId];

  const boundary = "----DriveUploadBoundary";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive create failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as DriveFile;
}

// ── Update File Content ────────────────────────────────────────────────────────

/**
 * Update an existing file's content.
 */
export async function updateFileContent(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType: string = "text/plain"
): Promise<DriveFile> {
  const res = await fetch(
    `${DRIVE_UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
      },
      body: content,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive update failed: ${res.status} — ${errText}`);
  }

  return (await res.json()) as DriveFile;
}
