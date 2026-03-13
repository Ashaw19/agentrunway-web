/**
 * /api/social/slide
 *
 * Generates a 1080x1080 PNG carousel slide for the Social Media Studio.
 * Uses next/og (Satori) on the Edge runtime.
 *
 * Slide types:
 *   cover    — "N Homes Sold" hero + month/year + optional branding
 *   property — Address + SOLD wording + large image + brand signature
 *   closer   — Gratitude + CTA + agent/logo
 *
 * Template families:
 *   classic-luxury — Playfair Display serif, warm ivory/gold/navy editorial
 *   bold-modern    — Oswald condensed, true black with electric gold
 *   minimal-clean  — DM Sans geometric, pure white Swiss precision
 *
 * Satori constraints enforced throughout:
 *   - Every div with multiple children has display: "flex"
 *   - No inline-flex, fit-content, or display: "grid"
 *   - All interpolated text wrapped in template literals (single child)
 *   - Font weights in JSX match loaded weights exactly
 *   - position: "absolute" children have position: "relative" parent
 *   - DOM order determines stacking (no z-index)
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
    bg:      "#FAF7F2",
    text:    "#0A1628",
    accent:  "#C9A96E",
    muted:   "#8C7E6A",
    softBg:  "#F0EBE3",
    brandBg: "#0A1628",
  },
  "bold-modern": {
    bg:      "#000000",
    text:    "#FFFFFF",
    accent:  "#D4A843",
    muted:   "#737373",
    softBg:  "#111111",
    brandBg: "#0A0A0A",
  },
  "minimal-clean": {
    bg:      "#FFFFFF",
    text:    "#111827",
    accent:  "#64748B",
    muted:   "#9CA3AF",
    softBg:  "#F3F4F6",
    brandBg: "#F9FAFB",
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
// Fetches the CSS from Google Fonts API -> extracts TTF URL -> returns the font binary.
//
// IMPORTANT: Satori (via @vercel/og) uses OpenType.js which does NOT support
// WOFF2 decompression. We must request TTF format. Google Fonts returns TTF
// when no User-Agent is sent.

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  // No User-Agent -> Google Fonts returns .ttf (TrueType) instead of .woff2
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

// ── Decorative helpers ────────────────────────────────────────────────────────

/** Four L-shaped corner brackets, absolutely positioned within a relative parent. */
function cornerFrame(color: string, armLength = 60, thickness = 1.5, inset = 40) {
  const abs = (extra: Record<string, unknown>) => ({
    position: "absolute" as const,
    background: color,
    ...extra,
  });
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Top-left */}
      <div style={abs({ top: inset, left: inset, width: armLength, height: thickness })} />
      <div style={abs({ top: inset, left: inset, width: thickness, height: armLength })} />
      {/* Top-right */}
      <div style={abs({ top: inset, right: inset, width: armLength, height: thickness })} />
      <div style={abs({ top: inset, right: inset, width: thickness, height: armLength })} />
      {/* Bottom-left */}
      <div style={abs({ bottom: inset, left: inset, width: armLength, height: thickness })} />
      <div style={abs({ bottom: inset, left: inset, width: thickness, height: armLength })} />
      {/* Bottom-right */}
      <div style={abs({ bottom: inset, right: inset, width: armLength, height: thickness })} />
      <div style={abs({ bottom: inset, right: inset, width: thickness, height: armLength })} />
    </div>
  );
}

/** Small rotated diamond flanked by thin horizontal lines. */
function diamondDivider(color: string, lineWidth = 40) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: lineWidth, height: 1, background: color }} />
      <div style={{ width: 10, height: 10, background: color, transform: "rotate(45deg)" }} />
      <div style={{ width: lineWidth, height: 1, background: color }} />
    </div>
  );
}

/** Three small gold squares — geometric divider for Bold Modern. */
function goldSquares(color: string) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 8, height: 8, background: color }} />
      <div style={{ width: 8, height: 8, background: color }} />
      <div style={{ width: 8, height: 8, background: color }} />
    </div>
  );
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
  const showCutout   = sp.get("showCutout")   === "1";
  const logoUrl      = sp.get("logoUrl")      ?? "";
  const headshotUrl  = sp.get("headshotUrl")  ?? "";
  const cutoutUrl    = sp.get("cutoutUrl")    ?? "";

  const address      = sp.get("address")      ?? "";
  const soldWording  = sp.get("soldWording")  ?? "SOLD";
  const showSalePrice = sp.get("showSalePrice") === "1";
  const price        = sp.get("price")        ?? "";

  const ctaLine     = sp.get("ctaLine") || "Ready to make your move?";
  const count       = sp.get("count")   ?? "1";
  // Parse photoUrl here so we can prefetch it in parallel with font loading
  const rawPhotoUrl = type === "property" ? (sp.get("photoUrl") ?? "") : "";

  // ── Load display font + prefetch property photo in parallel ───────────────
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

  const rawLogoUrl     = showLogo     && logoUrl     ? logoUrl     : "";
  const rawHeadshotUrl = showHeadshot && headshotUrl ? headshotUrl : "";
  const rawCutoutUrl   = showCutout   && cutoutUrl   ? cutoutUrl   : "";

  const [fontConfigs, embeddedPhotoSrc, embeddedLogoSrc, embeddedHeadshotSrc, embeddedCutoutSrc] = await Promise.all([
    fontLoader,
    fetchAsDataUrl(rawPhotoUrl),
    fetchAsDataUrl(rawLogoUrl),
    fetchAsDataUrl(rawHeadshotUrl),
    fetchAsDataUrl(rawCutoutUrl),
  ]);

  // IMPORTANT: Only set `fonts` when we loaded custom display fonts.
  // @vercel/og bundles Noto Sans as a fallback — empty [] is truthy and overrides it.
  const imgOptions = {
    width: SIZE,
    height: SIZE,
    // Prevent browsers from caching incomplete/empty responses that cause
    // <img> onError to fire on subsequent visits. Edge functions can return
    // 200 with an empty body on timeout — the browser caches that permanently.
    headers: { "Cache-Control": "no-store, must-revalidate" },
    ...(fontConfigs.length > 0 ? { fonts: fontConfigs } : {}),
  };

  // df = display font reference string
  const df = fontConfigs.length > 0 ? "Display, sans-serif" : "sans-serif";

  // ── Family-specific wordmark ─────────────────────────────────────────────
  const wmColor = family === "bold-modern" ? "#FFFFFF" : p.accent;
  const wmDotColor = p.accent;
  const wordmark = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: wmDotColor }} />
      <span style={{ fontSize: 16, color: wmColor, fontWeight: 700, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
        AGENT RUNWAY
      </span>
    </div>
  );

  // ── Family-specific headshot circle ──────────────────────────────────────
  const headshotCircle = showHeadshot && embeddedHeadshotSrc ? (
    <div style={{
      width: 72, height: 72, borderRadius: 36, overflow: "hidden", display: "flex", flexShrink: 0,
      background: p.softBg,
      ...(family === "classic-luxury" ? { border: `2px solid ${p.accent}`, boxShadow: `0 2px 16px rgba(201,169,110,0.25)` } : {}),
      ...(family === "bold-modern"    ? { border: `2px solid ${p.accent}` } : {}),
      ...(family === "minimal-clean"  ? { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } : {}),
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={embeddedHeadshotSrc} alt="" style={{ width: 72, height: 72, objectFit: "cover" }} />
    </div>
  ) : null;

  // Logo
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

    // ── Classic Luxury: warm ivory + gold corner frames ─────────────────
    if (family === "classic-luxury") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "linear-gradient(180deg, #FFFDF8 0%, #FAF7F2 100%)", fontFamily: "sans-serif", position: "relative" }}>

            {/* Decorative corner frame */}
            {cornerFrame(p.accent, 60, 1.5, 40)}

            {/* Main content */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

              {/* Top: wordmark + month/year */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {wordmark}
                <div style={{ fontSize: 18, color: p.accent, fontWeight: 700, letterSpacing: "0.18em", fontFamily: "sans-serif" }}>
                  {`${month.toUpperCase()} ${year}`}
                </div>
              </div>

              {/* Center hero */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Diamond divider */}
                {diamondDivider(p.accent)}

                {/* Count number */}
                <div style={{ fontSize: 180, fontWeight: 900, color: p.text, lineHeight: 0.85, letterSpacing: "-0.04em", fontFamily: df, marginTop: 24, textShadow: "0 2px 8px rgba(10,22,40,0.08)" }}>
                  {count}
                </div>

                {/* "HOMES SOLD" */}
                <div style={{ fontSize: 48, fontWeight: 700, color: p.text, letterSpacing: "0.18em", marginTop: 16, fontFamily: df }}>
                  {homesText.toUpperCase()}
                </div>

                {/* Gold hairline */}
                <div style={{ width: 120, height: 1, background: p.accent, marginTop: 28 }} />

                {/* Subtitle */}
                <div style={{ fontSize: 22, color: p.muted, fontWeight: 400, marginTop: 20, letterSpacing: "0.04em", fontFamily: "sans-serif" }}>
                  {`${month} ${year}  ·  Monthly Recap`}
                </div>
              </div>

              {/* Bottom: navy brand bar */}
            </div>

            {/* Navy brand footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 140, padding: "0 80px", background: p.brandBg, borderTopLeftRadius: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {headshotCircle}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", fontFamily: df }}>
                    {agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 18, color: p.accent, fontFamily: "sans-serif" }}>
                      {businessName}
                    </div>
                  )}
                </div>
              </div>
              {logoImg ?? <div style={{ width: 1, height: 1 }} />}
            </div>
          </div>
        ),
        imgOptions,
      );
    }

    // ── Bold Modern: true black + gold glow ─────────────────────────────
    if (family === "bold-modern") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", background: "linear-gradient(160deg, #000000 0%, #0D0D0D 40%, #1A1200 100%)", fontFamily: "sans-serif" }}>

            {/* Gold left accent bar with gradient */}
            <div style={{ width: 8, background: "linear-gradient(to bottom, #D4A843 0%, #8B6914 100%)", flexShrink: 0 }} />

            {/* Main content */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "68px 80px", justifyContent: "space-between" }}>

              {/* Top: wordmark + date */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {wordmark}
                <div style={{ fontSize: 18, color: "#FFFFFF", letterSpacing: "0.18em", fontWeight: 700, fontFamily: "sans-serif" }}>
                  {`${month.toUpperCase()} ${year}`}
                </div>
              </div>

              {/* Center: hero */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 16, color: p.accent, fontWeight: 700, letterSpacing: "0.3em", marginBottom: 20, fontFamily: "sans-serif" }}>
                  MONTHLY RECAP
                </div>
                <div style={{ fontSize: 240, fontWeight: 700, color: p.accent, lineHeight: 0.85, letterSpacing: "-0.02em", fontFamily: df, textShadow: "0 0 80px rgba(212,168,67,0.3)" }}>
                  {count}
                </div>
                <div style={{ fontSize: 72, fontWeight: 700, color: "#FFFFFF", lineHeight: 1, marginTop: 12, letterSpacing: "0.04em", fontFamily: df }}>
                  {homesText.toUpperCase()}
                </div>
                {/* Gold squares divider */}
                <div style={{ display: "flex", marginTop: 28 }}>
                  {goldSquares(p.accent)}
                </div>
              </div>

              {/* Bottom: thin gold line + agent row */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ width: "100%", height: 1, background: "rgba(212,168,67,0.2)" }} />
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

    // ── Minimal Clean: pure white Swiss layout ──────────────────────────
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#FFFFFF", fontFamily: "sans-serif" }}>

          {/* Content */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

            {/* Top: wordmark + month */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {wordmark}
              <div style={{ fontSize: 18, color: p.muted, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "sans-serif" }}>
                {`${month} ${year}`}
              </div>
            </div>

            {/* Center: number + rule + label + subtitle */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 220, fontWeight: 700, color: p.text, lineHeight: 0.85, letterSpacing: "-0.04em", fontFamily: df }}>
                {count}
              </div>
              <div style={{ width: "100%", height: 1, background: "#E5E7EB", marginTop: 28, marginBottom: 24 }} />
              <div style={{ fontSize: 52, fontWeight: 700, color: p.text, letterSpacing: "0.01em", fontFamily: df }}>
                {homesText}
              </div>
              <div style={{ fontSize: 22, color: p.muted, fontWeight: 400, marginTop: 16, fontFamily: "sans-serif" }}>
                {`${month} ${year} · Monthly Recap`}
              </div>
            </div>

            {/* Bottom: thin border + headshot + name + logo */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ width: "100%", height: 1, background: "#E5E7EB" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  {headshotCircle}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: p.text, fontFamily: df }}>
                      {agentName}
                    </div>
                    {!!businessName && (
                      <div style={{ fontSize: 18, color: p.muted, fontFamily: "sans-serif" }}>
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ── PROPERTY SLIDE ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (type === "property") {
    const photoUrl        = embeddedPhotoSrc;
    const addressFontSize = address.length > 50 ? 40 : address.length > 35 ? 52 : 60;

    // ── Classic Luxury: ivory + gold + navy footer ──────────────────────
    if (family === "classic-luxury") {
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: p.bg }}>

            {/* Info zone */}
            <div style={{ display: "flex", flexDirection: "column", height: 200, padding: "36px 72px 20px", justifyContent: "center", gap: 12 }}>
              <div style={{ fontSize: addressFontSize, fontWeight: 900, color: p.text, lineHeight: 1.1, fontFamily: df }}>
                {address || "123 Main Street"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 50, height: 2, background: p.accent, borderRadius: 1 }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: p.accent, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
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
              {/* Gold corner brackets on photo */}
              {cornerFrame(p.accent, 48, 1.5, 16)}
              {/* Bottom gradient */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120, background: "linear-gradient(to bottom, transparent, rgba(10,22,40,0.5))" }} />
              {/* Price overlay — shift right when cutout present */}
              {showSalePrice && !!price && (
                <div style={{ position: "absolute", bottom: 20, left: showCutout && embeddedCutoutSrc ? 260 : 24, fontSize: 32, fontWeight: 700, color: "#FFFFFF", fontFamily: df, textShadow: "0 2px 8px rgba(0,0,0,0.4)", display: "flex" }}>
                  {price}
                </div>
              )}
              {/* Slide counter */}
              <div style={{ position: "absolute", top: 16, right: 16, background: p.accent, color: p.brandBg, borderRadius: 999, padding: "6px 18px", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif" }}>
                {`${slideNum} / ${slideTotal}`}
              </div>
              {/* Agent cutout overlay — clipping wrapper prevents Satori overflow into footer */}
              {showCutout && embeddedCutoutSrc && (
                <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", alignItems: "flex-end" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={embeddedCutoutSrc} alt="" style={{ height: 360, objectFit: "contain", objectPosition: "bottom left", marginLeft: 24 }} />
                </div>
              )}
            </div>

            {/* Navy brand footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 140, padding: "0 72px", background: p.brandBg }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: "#FFFFFF", fontFamily: df }}>
                  {businessName || agentName}
                </div>
                {!!businessName && (
                  <div style={{ fontSize: 20, color: p.accent, fontFamily: "sans-serif" }}>
                    {agentName}
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

    // ── Bold Modern: photo-forward, address overlaid ────────────────────
    if (family === "bold-modern") {
      const boldAddrSize = address.length > 50 ? 36 : address.length > 35 ? 44 : 52;
      return new ImageResponse(
        (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: "#000000" }}>
            {/* Gold top bar */}
            <div style={{ height: 6, background: "linear-gradient(to right, #D4A843 0%, #8B6914 100%)", flexShrink: 0 }} />

            {/* Photo zone — fills most of slide */}
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

              {/* SOLD badge — top-left */}
              <div style={{ position: "absolute", top: 24, left: 24, background: p.accent, color: "#000000", borderRadius: 4, padding: "8px 20px", fontSize: 18, fontWeight: 700, letterSpacing: "0.16em", display: "flex", fontFamily: "sans-serif" }}>
                {soldWording}
              </div>

              {/* Slide counter — top-right */}
              <div style={{ position: "absolute", top: 24, right: 24, background: "rgba(0,0,0,0.7)", color: p.accent, borderRadius: 999, padding: "6px 18px", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif" }}>
                {`${slideNum} / ${slideTotal}`}
              </div>

              {/* Bottom gradient with address overlaid — push text right when cutout present */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 280, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingTop: 0, paddingRight: 64, paddingBottom: 28, paddingLeft: showCutout && embeddedCutoutSrc ? 300 : 64, background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.85))" }}>
                <div style={{ fontSize: boldAddrSize, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.1, fontFamily: df, textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
                  {address || "123 Main Street"}
                </div>
                {showSalePrice && !!price && (
                  <div style={{ fontSize: 32, fontWeight: 700, color: p.accent, marginTop: 8, fontFamily: df, display: "flex" }}>
                    {price}
                  </div>
                )}
              </div>
              {/* Agent cutout overlay — clipping wrapper prevents Satori overflow into footer */}
              {showCutout && embeddedCutoutSrc && (
                <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", alignItems: "flex-end" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={embeddedCutoutSrc} alt="" style={{ height: 380, objectFit: "contain", objectPosition: "bottom left", marginLeft: 40 }} />
                </div>
              )}
            </div>

            {/* Thin gold divider */}
            <div style={{ height: 2, background: "linear-gradient(to right, #D4A843 0%, transparent 100%)", flexShrink: 0 }} />

            {/* Brand footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 130, padding: "0 64px", background: p.brandBg }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                  {businessName || agentName}
                </div>
                {!!businessName && (
                  <div style={{ fontSize: 20, color: p.muted, fontFamily: "sans-serif" }}>
                    {agentName}
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

    // ── Minimal Clean: white + thin borders ─────────────────────────────
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: "#FFFFFF" }}>

          {/* Info zone */}
          <div style={{ display: "flex", flexDirection: "column", height: 180, padding: "32px 72px 16px", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: addressFontSize, fontWeight: 700, color: p.text, lineHeight: 1.1, fontFamily: df }}>
              {address || "123 Main Street"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 1.5, background: p.accent, borderRadius: 1 }} />
              <div style={{ fontSize: 22, fontWeight: 700, color: p.accent, letterSpacing: "0.2em", fontFamily: "sans-serif" }}>
                {soldWording}
              </div>
            </div>
          </div>

          {/* Image zone with thin border frame */}
          <div style={{ display: "flex", position: "relative", flex: 1, margin: "0 24px", border: "1px solid #E5E7EB", background: p.softBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 80 }}>🏡</div>
                <div style={{ fontSize: 20, color: p.muted, fontWeight: 600, letterSpacing: "0.08em", fontFamily: "sans-serif" }}>ADD PROPERTY PHOTO</div>
              </div>
            )}
            {/* Slide counter */}
            <div style={{ position: "absolute", top: 16, right: 16, background: "#FFFFFF", color: p.muted, borderRadius: 999, padding: "6px 16px", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", fontFamily: "sans-serif", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              {`${slideNum} / ${slideTotal}`}
            </div>
            {/* Agent cutout overlay — clipping wrapper prevents Satori overflow into footer */}
            {showCutout && embeddedCutoutSrc && (
              <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", alignItems: "flex-end" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={embeddedCutoutSrc} alt="" style={{ height: 340, objectFit: "contain", objectPosition: "bottom left", marginLeft: 24 }} />
              </div>
            )}
          </div>

          {/* Brand footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 130, padding: "0 72px", background: p.brandBg, borderTop: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: p.text, fontFamily: df }}>
                {businessName || agentName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {!!businessName && (
                  <div style={{ fontSize: 18, color: p.muted, fontFamily: "sans-serif" }}>
                    {agentName}
                  </div>
                )}
                {showSalePrice && !!price && (
                  <div style={{ fontSize: 18, color: p.muted, fontFamily: "sans-serif", display: "flex" }}>
                    {businessName ? `· ${price}` : price}
                  </div>
                )}
              </div>
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
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Classic Luxury: dark navy with gold corners ────────────────────────────
  if (family === "classic-luxury") {
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "linear-gradient(180deg, #12213A 0%, #0A1628 100%)", fontFamily: "sans-serif", position: "relative" }}>

          {/* Gold corner frame */}
          {cornerFrame(p.accent, 80, 1.5, 50)}

          {/* Main content */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "80px", justifyContent: "space-between" }}>

            {/* Top: logo or wordmark + double gold hairlines */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {logoImg ?? wordmark}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ width: 60, height: 1.5, background: p.accent }} />
                <div style={{ width: 40, height: 1.5, background: p.accent, opacity: 0.4 }} />
              </div>
            </div>

            {/* Center: THANK YOU + CTA + diamond + sub */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{ fontSize: 16, color: p.accent, fontWeight: 700, letterSpacing: "0.3em", fontFamily: "sans-serif" }}>
                THANK YOU
              </div>
              <div style={{ fontSize: 64, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: "-0.01em", fontFamily: df, textAlign: "center", textShadow: "0 2px 16px rgba(0,0,0,0.3)" }}>
                {ctaLine}
              </div>
              {diamondDivider(p.accent)}
              <div style={{ fontSize: 26, color: p.muted, fontFamily: "sans-serif" }}>
                {"Let's connect \u2014 I'd love to help."}
              </div>
            </div>

            {/* Bottom: gold hairline + agent row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ width: "100%", height: 1, background: "rgba(201,169,110,0.3)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  {headshotCircle}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", fontFamily: df }}>
                      {agentName}
                    </div>
                    {!!businessName && (
                      <div style={{ fontSize: 20, color: p.accent, fontFamily: "sans-serif" }}>
                        {businessName}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "rgba(201,169,110,0.4)", fontFamily: "sans-serif" }}>
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

  // ── Bold Modern: black + gold geometric ────────────────────────────────────
  if (family === "bold-modern") {
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", background: "linear-gradient(160deg, #000000 0%, #0D0D0D 50%, #1A1200 100%)", fontFamily: "sans-serif" }}>

          {/* Gold left bar */}
          <div style={{ width: 8, background: "linear-gradient(to bottom, #D4A843 0%, #8B6914 100%)", flexShrink: 0 }} />

          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

            {/* Top: logo or wordmark + gold short line */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {logoImg ?? wordmark}
              <div style={{ width: 60, height: 3, background: p.accent, borderRadius: 2 }} />
            </div>

            {/* Center: THANK YOU + CTA + squares + sub */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 18, color: p.accent, fontWeight: 700, letterSpacing: "0.3em", fontFamily: "sans-serif" }}>
                THANK YOU
              </div>
              <div style={{ fontSize: 72, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.05, fontFamily: df }}>
                {ctaLine}
              </div>
              {goldSquares(p.accent)}
              <div style={{ fontSize: 28, color: p.muted, fontFamily: "sans-serif" }}>
                {"Let's connect \u2014 I'd love to help."}
              </div>
            </div>

            {/* Bottom: gold line + agent row */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ width: "100%", height: 1, background: "rgba(212,168,67,0.3)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  {headshotCircle}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 40, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                      {agentName}
                    </div>
                    {!!businessName && (
                      <div style={{ fontSize: 24, color: p.muted, fontFamily: "sans-serif" }}>
                        {businessName}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "rgba(212,168,67,0.3)", fontFamily: "sans-serif" }}>
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

  // ── Minimal Clean: dark slate ──────────────────────────────────────────────
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#111827", fontFamily: "sans-serif" }}>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "72px 80px", justifyContent: "space-between" }}>

          {/* Top: logo or wordmark + thin slate line */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {logoImg ?? wordmark}
            <div style={{ width: 48, height: 1.5, background: "#374151" }} />
          </div>

          {/* Center: Thank you + CTA + rule + sub */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 16, color: p.muted, fontWeight: 700, letterSpacing: "0.2em", fontFamily: "sans-serif" }}>
              Thank you
            </div>
            <div style={{ fontSize: 60, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.05, fontFamily: df }}>
              {ctaLine}
            </div>
            <div style={{ width: 80, height: 1.5, background: "#374151" }} />
            <div style={{ fontSize: 26, color: p.muted, fontFamily: "sans-serif" }}>
              {"Let's connect \u2014 I'd love to help."}
            </div>
          </div>

          {/* Bottom: thin rule + agent row */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ width: "100%", height: 1, background: "#374151" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                {headshotCircle}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: "#FFFFFF", fontFamily: df }}>
                    {agentName}
                  </div>
                  {!!businessName && (
                    <div style={{ fontSize: 20, color: p.muted, fontFamily: "sans-serif" }}>
                      {businessName}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 14, color: "#374151", fontFamily: "sans-serif" }}>
                Powered by Agent Runway
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    imgOptions,
  );

  } catch (err: unknown) {
    console.error("[social/slide] generation failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown slide error" }),
      { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );
  }
}
