/**
 * GET /r/[token]
 *
 * Serves a completely self-contained plain HTML upload page for the phone.
 * No React, no Next.js runtime, no external CSS/JS files — one HTTP response
 * with everything inlined. Works in any browser including iOS Camera's
 * restricted WKWebView in-app preview.
 *
 * Token validation happens in the mobile-upload API route when the file
 * is submitted, not here.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const uploadUrl = `/api/receipts/mobile-upload/${encodeURIComponent(token)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Capture Receipt – Agent Runway</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #111827;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }

    .card {
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .header {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .icon-ring {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: #eff6ff;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }

    h1 { font-size: 20px; font-weight: 600; color: #111827; }

    .subtitle { font-size: 14px; color: #6b7280; }

    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .btn-mode {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 24px 16px;
      border-radius: 16px;
      border: 2px dashed #d1d5db;
      background: #f9fafb;
      cursor: pointer;
      font-family: inherit;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.15s;
    }

    .btn-mode:active { background: #e5e7eb; }

    .btn-mode span.label { font-size: 14px; font-weight: 500; color: #111827; }
    .btn-mode span.sub   { font-size: 11px; color: #9ca3af; }

    .uploading {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 32px 0;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #1e72f2;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .uploading p { font-size: 15px; font-weight: 500; color: #111827; }
    .uploading small { font-size: 13px; color: #6b7280; }

    .result {
      display: none;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .result.success { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .result.error   { background: #fef2f2; border: 1px solid #fecaca; }

    .result-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .result.success .result-icon { background: #dcfce7; }
    .result.error   .result-icon { background: #fee2e2; }

    .result strong { font-size: 15px; color: #111827; }
    .result p { font-size: 13px; }
    .result.success p { color: #166534; }
    .result.error   p { color: #991b1b; }

    .btn-retry {
      margin-top: 8px;
      padding: 12px 24px;
      border-radius: 12px;
      background: #1e72f2;
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      font-family: inherit;
    }

    .btn-retry:active { opacity: 0.85; }

    footer { font-size: 11px; color: #d1d5db; text-align: center; }

    input[type="file"] { display: none; }
  </style>
</head>
<body>
  <div class="card">

    <!-- Header -->
    <div class="header">
      <div class="icon-ring">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
             fill="none" stroke="#1e72f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
          <path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>
        </svg>
      </div>
      <h1>Capture Receipt</h1>
      <p class="subtitle">Take a photo or choose an image from your library.</p>
    </div>

    <!-- Mode buttons -->
    <div class="buttons" id="buttons">
      <button class="btn-mode" onclick="cameraInput.click()">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
             fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        <span class="label">Take Photo</span>
        <span class="sub">Opens camera</span>
      </button>

      <button class="btn-mode" onclick="fileInput.click()">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
             fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span class="label">Choose Photo</span>
        <span class="sub">Image or PDF</span>
      </button>
    </div>

    <!-- Uploading state -->
    <div class="uploading" id="uploading">
      <div class="spinner"></div>
      <div>
        <p>Uploading &amp; reading receipt…</p>
        <small>This takes a few seconds</small>
      </div>
    </div>

    <!-- Success state -->
    <div class="result success" id="success">
      <div class="result-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
             fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>
      <strong>Upload successful!</strong>
      <p>Your receipt has been sent. Return to your computer.</p>
    </div>

    <!-- Error state -->
    <div class="result error" id="errorBox">
      <div class="result-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
             fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <strong>Upload failed</strong>
      <p id="errorMsg">Something went wrong. Please try again.</p>
      <button class="btn-retry" onclick="reset()">Try again</button>
    </div>

    <footer>Agent Runway · Secure one-time upload</footer>
  </div>

  <!-- Hidden file inputs -->
  <input type="file" id="cameraInput" accept="image/*" capture="environment" onchange="handleFile(this)" />
  <input type="file" id="fileInput"   accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" onchange="handleFile(this)" />

  <script>
    const UPLOAD_URL = ${JSON.stringify(uploadUrl)};

    function show(id) {
      ["buttons","uploading","success","errorBox"].forEach(function(i) {
        var el = document.getElementById(i);
        if (el) el.style.display = (i === id) ? (i === "buttons" ? "grid" : "flex") : "none";
      });
    }

    function reset() {
      document.getElementById("cameraInput").value = "";
      document.getElementById("fileInput").value   = "";
      show("buttons");
    }

    function handleFile(input) {
      var file = input.files && input.files[0];
      if (!file) return;
      show("uploading");

      // Compress via canvas (images only — including HEIC, which Safari on iOS
      // can decode inside <img>; the canvas re-encodes the result as JPEG so
      // Groq Vision OCR can process it server-side).
      if (file.type && file.type.startsWith("image/")) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function() {
          var maxW = 1600;
          var scale = Math.min(1, maxW / Math.max(img.width, img.height));
          var w = Math.round(img.width  * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement("canvas");
          canvas.width  = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); upload(file); return; }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob(function(blob) {
            if (!blob) { upload(file); return; }
            upload(new File([blob], "receipt.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.85);
        };
        img.onerror = function() { URL.revokeObjectURL(url); upload(file); };
        img.src = url;
      } else {
        upload(file);
      }
    }

    function upload(file) {
      var form = new FormData();
      form.append("file", file);
      fetch(UPLOAD_URL, { method: "POST", body: form })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.ok) {
            show("success");
          } else {
            document.getElementById("errorMsg").textContent = data.error || "Upload failed. Try again.";
            show("errorBox");
          }
        })
        .catch(function(err) {
          document.getElementById("errorMsg").textContent = "Network error. Try again.";
          show("errorBox");
        });
    }
  </script>
</body>
</html>`;

  // Tight per-page CSP — this page uses only inline CSS/JS and a single
  // same-origin fetch. No Plaid, Stripe, Supabase, or external assets needed.
  // This overrides the broader global CSP from next.config.ts for this route.
  const pageCsp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "connect-src 'self'",     // fetch to /api/receipts/mobile-upload/[token]
    "img-src blob: data:",    // canvas toBlob() URL for image compression
    "frame-ancestors 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": pageCsp,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
