/**
 * /receipt-upload/[token]
 *
 * Public, unauthenticated page — opened on the user's phone via QR code.
 * The server validates the token before rendering the upload UI.
 * No auth required: the token itself is the proof of authorization.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { UploadForm }        from "./upload-form";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ReceiptUploadPage({ params }: Props) {
  const { token } = await params;

  // ── Validate token server-side ─────────────────────────────────────────────
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("receipt_upload_tokens")
    .select("id, expires_at, used, status")
    .eq("token", token)
    .single();

  // ── Invalid / expired / already used ──────────────────────────────────────
  if (!tokenRow) {
    return <ErrorPage message="This upload link is invalid or has expired." />;
  }

  if (tokenRow.used || tokenRow.status !== "pending") {
    return <ErrorPage message="This upload link has already been used." />;
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return <ErrorPage message="This upload link has expired. Please generate a new QR code from your computer." />;
  }

  // ── Valid — render upload form ─────────────────────────────────────────────
  return (
    <main className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            {/* Receipt icon inline SVG — no import needed */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M14 8H8" />
              <path d="M16 12H8" />
              <path d="M13 16H8" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Capture Receipt</h1>
          <p className="text-sm text-muted-foreground">
            Take a photo or upload an image of your receipt.
          </p>
        </div>

        {/* Upload form (client component) */}
        <UploadForm token={token} />

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground">
          Agent Runway · Secure one-time upload
        </p>
      </div>
    </main>
  );
}

// ── Error state component ──────────────────────────────────────────────────────

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-500"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-foreground">Link Unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
