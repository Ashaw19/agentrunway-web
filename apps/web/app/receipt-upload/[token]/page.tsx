/**
 * /receipt-upload/[token]
 *
 * Public, unauthenticated page — opened on the user's phone via QR code.
 *
 * Token validation is intentionally deferred to the mobile-upload API route
 * (which runs when the user actually submits a file). This keeps the page a
 * pure static shell with ZERO server-side async work, so it renders and
 * paints instantly even on slow connections or restricted in-app browsers.
 *
 * If the token is invalid/expired the mobile-upload route returns a clear
 * error that the UploadForm displays to the user.
 */
import { UploadForm } from "./upload-form";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ReceiptUploadPage({ params }: Props) {
  const { token } = await params;

  return (
    <main
      className="min-h-dvh bg-background flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#ffffff", color: "#111827" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10" style={{ backgroundColor: "#eff6ff" }}>
            {/* Receipt icon inline SVG — no import needed */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1e72f2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M14 8H8" />
              <path d="M16 12H8" />
              <path d="M13 16H8" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "#111827" }}>Capture Receipt</h1>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Take a photo or upload an image of your receipt.
          </p>
        </div>

        {/* Upload form (client component) */}
        <UploadForm token={token} />

        {/* Footer */}
        <p className="text-center text-[11px]" style={{ color: "#9ca3af" }}>
          Agent Runway · Secure one-time upload
        </p>
      </div>
    </main>
  );
}
