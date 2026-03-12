/**
 * /api/social/slide
 *
 * Generates a 1080×1080 PNG carousel slide for the Social Media Studio.
 * Uses next/og (Satori) on the Edge runtime.
 *
 * Slide types:
 *   cover    — "N Homes Sold" hero + month/year + optional branding
 *   property — Address → SOLD wording → large image → brand signature
 *   closer   — Gratitude + CTA + agent/logo
 *
 * Key params:
 *   type           'cover' | 'property' | 'closer'
 *   templateFamily 'classic-luxury' | 'bold-modern' | 'minimal-clean'
 *   agentName      agent display name
 *   businessName   team/brokerage name
 *   month          e.g. "March"
 *   year           e.g. "2026"
 *   slideNum       current slide index
 *   slideTotal     total slide count
 *   showLogo       "1" | "0"
 *   showHeadshot   "1" | "0"
 *   logoUrl        optional — public URL to business logo
 *   headshotUrl    optional — public URL to agent headshot
 *   count          number of properties (cover only)
 *   address        property address (property only)
 *   soldWording    "SOLD" | "JUST SOLD" | "CLOSED" (property only)
 *   showSalePrice  "1" | "0" (property only)
 *   price          formatted sale price string (property only)
 *   ctaLine        custom CTA text (closer only)
 *
 * Fonts (loaded per-family from Google Fonts at request time):
 *   classic-luxury → Playfair Display 700 + 900  (serif, editorial)
 *   bold-modern    → Oswald 700                  (condensed, impact)
 *   minimal-clean  → DM Sans 700                 (geometric, clean)
 *
 * Each template family has a consistent visual signature across all slide types:
 *   classic-luxury → 20px left vertical accent bar (blue)
 *   bold-modern    → 8px gold horizontal top bar
 *   minimal-clean  → 8px dark top stripe + 8px accent bottom stripe
 *
 * Satori constraints enforced throughout:
 *   - Every div with multiple children has display: "flex"
 *   - No inline-flex or fit-content
 *   - All interpolated text wrapped in template literals (single child)
 *   - Font weights in JSX match loaded weights exactly
 */

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateFamily = "classic-luxury" | "bold-modern" | "minimal-clean";

type FontEntry = {
  name: string;
  data: ArrayBuffer;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal";
};

// ── Palette ───────────────────────────────────────────────────────────────────

interface Palette {
  bg:        string;
  text:      string;
  accent:    string;
  muted:     string;
  softBg:    string;
  brandBg:   string;
}

const PALETTES: Record<TemplateFamily, Palette> = {
  "classic-luxury": {
    bg:      "#FFFFFF",
    text:    "#0B1728",
    accent:  "#1E72F2",
    muted:   "#64748B",
    softBg:  "#EFF6FF",
    brandBg: "#F8FAFF",
  },
  "bold-modern": {
    bg:      "#0B1728",
    text:    "#FFFFFF",
    accent:  "#F0A800",
    muted:   "#94A3B8",
    softBg:  "#1E3A5F",
    brandBg: "#0F1F38",
  },
  "minimal-clean": {
    bg:      "#F8FAFC",
    text:    "#1E293B",
    accent:  "#475569",
    muted:   "#94A3B8",
    softBg:  "#E2E8F0",
    brandBg: "#F1F5F9",
  },
};

// ── Backward-compat mapping for old ?style= param ─────────────────────────────
const STYLE_COMPAT: Record<string, TemplateFamily> = {
  classic: "classic-luxury",
  bold:    "bold-modern",
  minimal: "minimal-clean",
};

const SIZE = 1080;

// ── Google Fonts loader ───────────────────────────────────────────────────────
// Fetches the CSS from Google Fonts API → extracts TTF URL → returns the font binary.
//
// IMPORTANT: Satori (via @vercel/og) uses OpenType.js which does NOT support
// WOFF2 decompression — "Unsupported OpenType signature wOF2". We must request
// TTF format. Google Fonts returns TTF when no User-Agent is sent (or when a
// non-browser UA is used). The bundled Noto Sans fallback is also .ttf.

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  // No User-Agent → Google Fonts returns .ttf (TrueType) instead of .woff2
  const css = await fetch(cssUrl).then((r) => r.text());

  // Extract the .ttf URL from the @font-face src
  const match = css.match(/src:\s*url\(([^)]+\.ttf)\)/);
  if (!match?.[1]) throw new Error(`TTF URL not found for ${family} ${weight}`);
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

// ── Property photo loader ─────────────────────────────────────────────────────
// Fetches the photo server-side and returns a base64 data URL.
// Satori's internal image fetcher can silently fail for remote URLs on the edge
// runtime — embedding the image directly guarantees it renders every time.

async function fetchAsDataUrl(url: string, timeoutMs = 5000): Promise<string> {
  if (!url) return "";
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res   = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return "";
    const buf   = await res.arrayBuffer();
    const mime  = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(buf);
    // Convert binary to base64 in 32 KB chunks to avoid call-stack limits
    let binary = "";
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return "";
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const sp = new URL(req.url).searchParams;

  const rawFamily  = sp.get("templateFamily") ?? sp.get("style") ?? "classic-luxury";
  const family     = (STYLE_COMPAT[rawFamily] ?? rawFamily) as TemplateFamily;
  const p          = PALETTES[family] ?? PALETTES["classic-luxury"];

  const type         = (sp.get("type") ?? "cover") as "cover" | "property" | "closer";
  const agentName    = sp.get("agentName")    ?? "Your Agent";
  const businessName = sp.get("businessName") ?? sp.get("brokerage") ?? "";
  const month        = sp.get("month")        ?? "January";
  const year         = sp.get("year")         ?? String(new Date().getFullYear());
  const slideNum     = sp.get("slideNum")     ?? "1";
  const slideTotal   = sp.get("slideTotal")   ?? "1";
  const showLogo     = sp.get("showLogo")     === "1";
  const showHeadshot = sp.get("showHeadshot") === "1";
  const logoUrl      = sp.get("logoUrl")      ?? "";
  const headshotUrl  = sp.get("headshotUrl")  ?? "";

  const address      = sp.get("address")      ?? "";
  const soldWording  = sp.get("soldWording")  ?? "SOLD";
  const showSalePrice = sp.get("showSalePrice") === "1";
  const price        = sp.get("price")        ?? "";

  const ctaLine     = sp.get("ctaLine") || "Ready to make your move?";
  const count       = sp.get("count")   ?? "1";
  // Parse photoUrl here so we can prefetch it in parallel with font loading
  const rawPhotoUrl = type === "property" ? (sp.get("photoUrl") ?? "") : "";

  // ── Load display font + prefetch property photo in parallel ───────────────
  // Font loading and image fetching are both network-bound; running them in
  // parallel keeps total latency ≈ max(fontTime, photoTime) instead of the sum.
  // fetchAsDataUrl embeds the image as a data URL so Satori never makes its own
  // outbound fetch (which can fail silently on the edge runtime).

  const fontLoader = (async (): Promise<FontEntry[]> => {
    const configs: FontEntry[] = [];
    try {
      if (family === "classic-luxury") {
        const [d700, d900] = await Promise.all([
          loadGoogleFont("Playfair Display", 700),
          loadGoogleFont("Playfair Display", 900),
        ]);
        configs.push(
          { name: "Display", data: d700, weight: 700, style: "normal" },
          { name: "Display", data: d900, weight: 900, style: "normal" },
        );
      } else if (family === "bold-modern") {
        const d700 = await loadGoogleFont("Oswald", 700);
        configs.push({ name: "Display", data: d700, weight: 700, style: "normal" });
      } else {
        const d700 = await loadGoogleFont("DM Sans", 700);
        configs.push({ name: "Display", data: d700, weight: 700, style: "normal" });
      }
    } catch {
      // Fallback: system sans-serif used automatically
    }
    return configs;
  })();

  // Pre-resolve logo and headshot as data URLs alongside the font/photo fetch.
  // Satori's internal fetcher silently drops remote image URLs on the Edge runtime —
  // embedding every asset as a base64 data URL guarantees reliable rendering.
  const rawLogoUrl     = showLogo     && logoUrl     ? logoUrl     : "";
  const rawHeadshotUrl = showHeadshot && headshotUrl ? headshotUrl : "";

  const [fontConfigs, embeddedPhotoSrc, embeddedLogoSrc, embeddedHeadshotSrc] = await Promise.all([
    fontLoader,
    fetchAsDataUrl(rawPhotoUrl),
    fetchAsDataUrl(rawLogoUrl),
    fetchAsDataUrl(rawHeadshotUrl),
  ]);

  // IMPORTANT: Only set `fonts` when we loaded custom display fonts.
  // @vercel/og bundles Noto Sans as a fallback, but its render() logic is:
  //   fonts: options.fonts || defaultFonts
  // An empty array [] is truthy, so passing `fonts: []` overrides the fallback
  // and leaves Satori with zero fonts → crash on every text node.
  const imgOptions = {
    width: SIZE,
    height: SIZE,
    ...(fontConfigs.length > 0 ? { fonts: fontConfigs } : {}),
  };

  // df = display font reference string; applied to all hero / heading elements
  const df = fontConfigs.length > 0 ? "Display, sans-serif" : "sans-serif";

  // ── Shared elements ────────────────────────────────────────────────────────

  // AGENT RUNWAY wordmark — always in plain sans-serif (brand mark, not display font)
  const wordmark = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: p.accent }} />
      <span style={{ fontSize: 16, color: p.accent, fontWeight: 700, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
        AGENT RUNWAY
      </span>
    </div>
  );

  // Headshot circle — use the pre-fetched data URL; raw remote URLs can silently fail in Satori
  const headshotCircle = showHeadshot && embeddedHeadshotSrc ? (
    <div style={{ width: 72, height: 72, borderRadius: 36, overflow: "hidden", display: "flex", flexShrink: 0, background: p.softBg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={embeddedHeadshotSrc} alt="" style={{ width: 72, height: 72, objectFit: "cover" }} />
    </div>
  ) : null;

  // Logo — use the pre-fetched data URL
  const logoImg = showLogo && embeddedLogoSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={embeddedLogoSrc} alt="" style={{ height: 80, maxWidth: 240, objectFit: "contain" }} />
  ) : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // ── COVER SLIDE ────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (type === "cover") {
    const countNum  = Number(count);
    const homesText = countNum === 1 ? "Home Sold" : "Homes Sold";

    // ── Classic Luxury: editorial left-bar layout ─────────────────────────
    if (family === "classic-luxury") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", background: "#FFFFFF", fontFamily: "sans-serif" }}>

            {/* Left accent bar */}
            <div style={{ width: 20, background: p.accent, flexShrink: 0 }} />

            {/* Main content column */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

              {/* Top: wordmark + month/year */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {wordmark}
                <div style={{ fontSize: 22, color: p.muted, fontWeight: 600, letterSpacing: "0.12em", fontFamily: "sans-serif" }}>
                  {`${month.toUpperCase()} ${year}`}
                </div>
              </div>

              {/* Center hero */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Accent rule */}
                <div style={{ width: 80, height: 3, background: p.accent, marginBottom: 40 }} />

                {/* Count number */}
                <div style={{ fontSize: 220, fontWeight: 900, color: p.text, lineHeight: 0.85, letterSpacing: "-0.04em", fontFamily: df }}>
                  {count}
                </div>

                {/* "HOMES SOLD" */}
                <div style={{ fontSize: 60, fontWeight: 700, color: p.text, letterSpacing: "0.06em", marginTop: 16, fontFamily: df }}>
                  {homesText.toUpperCase()}
                </div>

                {/* Subtitle */}
                <div style={{ fontSize: 24, color: p.muted, fontWeight: 400, marginTop: 24, letterSpacing: "0.03em", fontFamily: "sans-serif" }}>
                  {`${month} ${year}  ·  Monthly Market Recap`}
                </div>
              </div>

              {/* Bottom: headshot + agent name + logo */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  {headshotCircle}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: p.text, fontFamily: df }}>
                      {agentName}
                    </div>
                    {!!businessName && (
                      <div style={{ fontSize: 20, color: p.muted, fontFamily: "sans-serif" }}>
                        {businessName}
                      </div>
                    )}
                  </div>
                </div>
                {logoImg ?? <div style={{ width: 1, height: 1 }} />}
              </div>
            </div>
          </div>
        ),
        imgOptions,
      );
    }

    // ── Bold Modern: dark + gold impact layout ────────────────────────────
    if (family === "bold-modern") {
      const coverBg = "linear-gradient(145deg, #0B1728 0%, #1E2D44 55%, #0B1728 100%)";
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: coverBg, fontFamily: "sans-serif" }}>

            {/* Gold top bar */}
            <div style={{ height: 8, background: p.accent, flexShrink: 0 }} />

            {/* Main content */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "68px 80px", justifyContent: "space-between" }}>

              {/* Top: wordmark + date */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {wordmark}
                <div style={{ fontSize: 20, color: p.muted, letterSpacing: "0.14em", fontWeight: 500, fontFamily: "sans-serif" }}>
                  {`${month.toUpperCase()} ${year}`}
                </div>
              </div>

              {/* Center: hero number + label */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 18, color: p.accent, fontWeight: 600, letterSpacing: "0.22em", marginBottom: 18, fontFamily: "sans-serif" }}>
                  MONTHLY RECAP
                </div>
                <div style={{ fontSize: 210, fontWeight: 700, color: p.accent, lineHeight: 0.85, letterSpacing: "-0.02em", fontFamily: df }}>
                  {count}
                </div>
                <div style={{ fontSize: 72, fontWeight: 700, color: "#FFFFFF", lineHeight: 1, marginTop: 12, letterSpacing: "0.03em", fontFamily: df }}>
                  {homesText.toUpperCase()}
                </div>
              </div>

              {/* Bottom: thin rule + agent row */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.15)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    {headshotCircle}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ fontSize: 32, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                        {agentName}
                      </div>
                      {!!businessName && (
                        <div style={{ fontSize: 20, color: p.muted, fontFamily: "sans-serif" }}>
                          {businessName}
                        </div>
                      )}
                    </div>
                  </div>
                  {logoImg ?? <div style={{ width: 1, height: 1 }} />}
                </div>
              </div>
            </div>
          </div>
        ),
        imgOptions,
      );
    }

    // ── Minimal Clean: Swiss grid layout ──────────────────────────────────
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#F8FAFC", fontFamily: "sans-serif" }}>

          {/* Dark top stripe */}
          <div style={{ height: 8, background: p.text, flexShrink: 0 }} />

          {/* Content */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "68px 80px", justifyContent: "space-between" }}>

            {/* Top: wordmark + month */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {wordmark}
              <div style={{ fontSize: 22, color: p.muted, fontWeight: 500, letterSpacing: "0.08em", fontFamily: "sans-serif" }}>
                {`${month} ${year}`}
              </div>
            </div>

            {/* Center: number → rule → label → subtitle */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 210, fontWeight: 700, color: p.text, lineHeight: 0.85, letterSpacing: "-0.04em", fontFamily: df }}>
                {count}
              </div>
              <div style={{ width: "100%", height: 2, background: p.text, marginTop: 28, marginBottom: 24 }} />
              <div style={{ fontSize: 64, fontWeight: 700, color: p.text, letterSpacing: "0.01em", fontFamily: df }}>
                {homesText}
              </div>
              <div style={{ fontSize: 24, color: p.muted, fontWeight: 400, marginTop: 16, fontFamily: "sans-serif" }}>
                {`${month} ${year} · Monthly Recap`}
              </div>
            </div>

            {/* Bottom: headshot + name + logo */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {headshotCircle}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: p.text, fontFamily: df }}>
                    {agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 20, color: p.muted, fontFamily: "sans-serif" }}>
                      {businessName}
                    </div>
                  )}
                </div>
              </div>
              {logoImg ?? <div style={{ width: 1, height: 1 }} />}
            </div>
          </div>

          {/* Accent bottom stripe */}
          <div style={{ height: 8, background: p.accent, flexShrink: 0 }} />
        </div>
      ),
      imgOptions,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PROPERTY SLIDE ─────────────────────────────────────────────────────────
  // Layout (top → bottom within the main column):
  //   Info zone  240px — address + sold wording
  //   Image zone flex 1 — photo or placeholder + slide counter pill
  //   Brand zone 160px — business name, agent name, logo
  // ═══════════════════════════════════════════════════════════════════════════

  if (type === "property") {
    // embeddedPhotoSrc is either a base64 data URL (pre-fetched above) or ""
    const photoUrl        = embeddedPhotoSrc;
    const addressFontSize = address.length > 50 ? 44 : address.length > 35 ? 56 : 66;

    // ── Classic Luxury: left bar wrapper ───────────────────────────────────
    if (family === "classic-luxury") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", fontFamily: "sans-serif", background: p.bg }}>
            {/* Left accent bar */}
            <div style={{ width: 20, background: p.accent, flexShrink: 0 }} />

            {/* Main column */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* Info zone */}
              <div style={{ display: "flex", flexDirection: "column", height: 240, padding: "36px 60px 24px", justifyContent: "center", gap: 14 }}>
                <div style={{ fontSize: addressFontSize, fontWeight: 900, color: p.text, lineHeight: 1.1, fontFamily: df }}>
                  {address || "123 Main Street"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 40, height: 3, background: p.accent, borderRadius: 2 }} />
                  <div style={{ fontSize: 28, fontWeight: 700, color: p.accent, letterSpacing: "0.22em", fontFamily: df }}>
                    {soldWording}
                  </div>
                </div>
              </div>

              {/* Image zone */}
              <div style={{ display: "flex", position: "relative", flex: 1, background: p.softBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    <div style={{ fontSize: 80 }}>🏡</div>
                    <div style={{ fontSize: 20, color: p.muted, fontWeight: 600, letterSpacing: "0.08em", fontFamily: "sans-serif" }}>ADD PROPERTY PHOTO</div>
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.25))" }} />
                <div style={{ position: "absolute", top: 20, right: 20, background: "rgba(0,0,0,0.58)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif" }}>
                  {`${slideNum} / ${slideTotal}`}
                </div>
              </div>

              {/* Brand zone */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 160, padding: "0 60px", background: p.brandBg }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 38, fontWeight: 700, color: p.text, fontFamily: df }}>
                    {businessName || agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 24, color: p.muted, fontFamily: "sans-serif" }}>
                      {agentName}
                    </div>
                  )}
                  {showSalePrice && !!price && (
                    <div style={{ fontSize: 20, color: p.muted, marginTop: 2, fontFamily: "sans-serif" }}>
                      {`Listed at ${price}`}
                    </div>
                  )}
                </div>
                {logoImg ?? <div style={{ width: 1, height: 1 }} />}
              </div>
            </div>
          </div>
        ),
        imgOptions,
      );
    }

    // ── Bold Modern: gold top bar ──────────────────────────────────────────
    if (family === "bold-modern") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: "#0B1728" }}>
            {/* Gold top bar */}
            <div style={{ height: 8, background: p.accent, flexShrink: 0 }} />

            {/* Info zone */}
            <div style={{ display: "flex", flexDirection: "column", height: 232, padding: "30px 64px 20px", justifyContent: "center", gap: 14 }}>
              <div style={{ fontSize: addressFontSize, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.1, fontFamily: df }}>
                {address || "123 Main Street"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 40, height: 4, background: p.accent, borderRadius: 2 }} />
                <div style={{ fontSize: 28, fontWeight: 700, color: p.accent, letterSpacing: "0.20em", fontFamily: df }}>
                  {soldWording}
                </div>
              </div>
            </div>

            {/* Image zone */}
            <div style={{ display: "flex", position: "relative", flex: 1, background: "linear-gradient(135deg, #1E3A5F 0%, #0B1728 100%)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  <div style={{ fontSize: 80 }}>🏡</div>
                  <div style={{ fontSize: 20, color: p.muted, fontWeight: 600, letterSpacing: "0.08em", fontFamily: "sans-serif" }}>ADD PROPERTY PHOTO</div>
                </div>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(to bottom, transparent, #0B1728)" }} />
              <div style={{ position: "absolute", top: 20, right: 20, background: "rgba(0,0,0,0.58)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif" }}>
                {`${slideNum} / ${slideTotal}`}
              </div>
            </div>

            {/* Brand zone */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 160, padding: "0 64px", background: "#0F1F38" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 38, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                  {businessName || agentName}
                </div>
                {!!businessName && (
                  <div style={{ fontSize: 24, color: p.muted, fontFamily: "sans-serif" }}>
                    {agentName}
                  </div>
                )}
                {showSalePrice && !!price && (
                  <div style={{ fontSize: 20, color: p.muted, marginTop: 2, fontFamily: "sans-serif" }}>
                    {`Listed at ${price}`}
                  </div>
                )}
              </div>
              {logoImg ?? <div style={{ width: 1, height: 1 }} />}
            </div>
          </div>
        ),
        imgOptions,
      );
    }

    // ── Minimal Clean: dark top stripe ─────────────────────────────────────
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: p.bg }}>
          {/* Dark top stripe */}
          <div style={{ height: 8, background: p.text, flexShrink: 0 }} />

          {/* Info zone */}
          <div style={{ display: "flex", flexDirection: "column", height: 232, padding: "30px 64px 20px", justifyContent: "center", gap: 14 }}>
            <div style={{ fontSize: addressFontSize, fontWeight: 700, color: p.text, lineHeight: 1.1, fontFamily: df }}>
              {address || "123 Main Street"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 40, height: 3, background: p.accent, borderRadius: 2 }} />
              <div style={{ fontSize: 28, fontWeight: 700, color: p.accent, letterSpacing: "0.20em", fontFamily: df }}>
                {soldWording}
              </div>
            </div>
          </div>

          {/* Image zone */}
          <div style={{ display: "flex", position: "relative", flex: 1, background: p.softBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 80 }}>🏡</div>
                <div style={{ fontSize: 20, color: p.muted, fontWeight: 600, letterSpacing: "0.08em", fontFamily: "sans-serif" }}>ADD PROPERTY PHOTO</div>
              </div>
            )}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.25))" }} />
            <div style={{ position: "absolute", top: 20, right: 20, background: "rgba(0,0,0,0.58)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif" }}>
              {`${slideNum} / ${slideTotal}`}
            </div>
          </div>

          {/* Brand zone */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 160, padding: "0 64px", background: p.brandBg }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 38, fontWeight: 700, color: p.text, fontFamily: df }}>
                {businessName || agentName}
              </div>
              {!!businessName && (
                <div style={{ fontSize: 24, color: p.muted, fontFamily: "sans-serif" }}>
                  {agentName}
                </div>
              )}
              {showSalePrice && !!price && (
                <div style={{ fontSize: 20, color: p.muted, marginTop: 2, fontFamily: "sans-serif" }}>
                  {`Listed at ${price}`}
                </div>
              )}
            </div>
            {logoImg ?? <div style={{ width: 1, height: 1 }} />}
          </div>
        </div>
      ),
      imgOptions,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── CLOSER SLIDE ───────────────────────────────────────────────────────────
  // Always dark — strong visual close to the carousel.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Classic Luxury: editorial dark with left accent bar ───────────────────
  if (family === "classic-luxury") {
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", background: "#0B1728", fontFamily: "sans-serif" }}>
          {/* Left accent bar */}
          <div style={{ width: 20, background: p.accent, flexShrink: 0 }} />

          {/* Main content */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "80px", justifyContent: "space-between" }}>

            {/* Top: logo or wordmark + double rule */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {logoImg ?? wordmark}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ width: 60, height: 2, background: p.accent }} />
                <div style={{ width: 40, height: 2, background: p.accent, opacity: 0.4 }} />
              </div>
            </div>

            {/* Center: THANK YOU + CTA + sub */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 18, color: p.accent, fontWeight: 700, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
                THANK YOU
              </div>
              <div style={{ fontSize: 72, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: "-0.01em", fontFamily: df }}>
                {ctaLine}
              </div>
              <div style={{ width: 80, height: 2, background: p.accent }} />
              <div style={{ fontSize: 28, color: "#94A3B8", fontFamily: "sans-serif" }}>
                {"Let's connect — I'd love to help."}
              </div>
            </div>

            {/* Bottom: agent + logo */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {headshotCircle}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 40, fontWeight: 900, color: "#FFFFFF", fontFamily: df }}>
                    {agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 24, color: "#94A3B8", fontFamily: "sans-serif" }}>
                      {businessName}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 16, color: "#334155", fontFamily: "sans-serif" }}>
                Powered by Agent Runway
              </div>
            </div>
          </div>
        </div>
      ),
      imgOptions,
    );
  }

  // ── Bold Modern: dark gradient with gold top bar ───────────────────────────
  if (family === "bold-modern") {
    const closerBg = "linear-gradient(145deg, #0B1728 0%, #1E3A5F 50%, #0B1728 100%)";
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: closerBg, fontFamily: "sans-serif" }}>
          {/* Gold top bar */}
          <div style={{ height: 8, background: p.accent, flexShrink: 0 }} />

          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

            {/* Top: logo or wordmark + gold rule */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {logoImg ?? wordmark}
              <div style={{ width: 60, height: 4, background: p.accent, borderRadius: 2 }} />
            </div>

            {/* Center: THANK YOU + CTA + sub */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 20, color: p.accent, fontWeight: 600, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
                THANK YOU
              </div>
              <div style={{ fontSize: 72, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.05, fontFamily: df }}>
                {ctaLine}
              </div>
              <div style={{ fontSize: 30, color: "#94A3B8", fontFamily: "sans-serif" }}>
                {"Let's connect — I'd love to help."}
              </div>
            </div>

            {/* Bottom: thin rule + agent row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.15)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  {headshotCircle}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 40, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                      {agentName}
                    </div>
                    {!!businessName && (
                      <div style={{ fontSize: 24, color: "#94A3B8", fontFamily: "sans-serif" }}>
                        {businessName}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 16, color: "#334155", fontFamily: "sans-serif" }}>
                  Powered by Agent Runway
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      imgOptions,
    );
  }

  // ── Minimal Clean: dark with top + bottom stripes ─────────────────────────
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#1E293B", fontFamily: "sans-serif" }}>
        {/* Dark top stripe */}
        <div style={{ height: 8, background: "#334155", flexShrink: 0 }} />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "68px 80px", justifyContent: "space-between" }}>

          {/* Top: logo or wordmark + thin rule */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {logoImg ?? wordmark}
            <div style={{ width: 48, height: 2, background: "#475569" }} />
          </div>

          {/* Center: THANK YOU + CTA + rule + sub */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 18, color: "#64748B", fontWeight: 600, letterSpacing: "0.20em", fontFamily: "sans-serif" }}>
              THANK YOU
            </div>
            <div style={{ fontSize: 68, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.05, fontFamily: df }}>
              {ctaLine}
            </div>
            <div style={{ width: 60, height: 2, background: "#475569" }} />
            <div style={{ fontSize: 28, color: "#94A3B8", fontFamily: "sans-serif" }}>
              {"Let's connect — I'd love to help."}
            </div>
          </div>

          {/* Bottom: thin rule + agent row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ width: "100%", height: 1, background: "#334155" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                {headshotCircle}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                    {agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 22, color: "#94A3B8", fontFamily: "sans-serif" }}>
                      {businessName}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 16, color: "#334155", fontFamily: "sans-serif" }}>
                Powered by Agent Runway
              </div>
            </div>
          </div>
        </div>

        {/* Accent bottom stripe */}
        <div style={{ height: 8, background: "#475569", flexShrink: 0 }} />
      </div>
    ),
    imgOptions,
  );

  } catch (err: unknown) {
    console.error("[social/slide] generation failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown slide error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
