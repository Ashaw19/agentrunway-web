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
 * Satori constraints enforced throughout:
 *   - Every div with multiple children has display: "flex"
 *   - No inline-flex or fit-content
 *   - All interpolated text wrapped in template literals (single child)
 */

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type TemplateFamily = "classic-luxury" | "bold-modern" | "minimal-clean";

// ── Palette ───────────────────────────────────────────────────────────────────

interface Palette {
  bg:        string;
  text:      string;
  accent:    string;
  muted:     string;
  softBg:    string;
  brandBg:   string;
  darkBg:    string;    // for closer slides
  darkText:  string;    // text on darkBg
  darkMuted: string;    // muted text on darkBg
}

const PALETTES: Record<TemplateFamily, Palette> = {
  "classic-luxury": {
    bg:        "#FFFFFF",
    text:      "#0B1728",
    accent:    "#1E72F2",
    muted:     "#64748B",
    softBg:    "#EFF6FF",
    brandBg:   "#F8FAFF",
    darkBg:    "#0B1728",
    darkText:  "#FFFFFF",
    darkMuted: "#94A3B8",
  },
  "bold-modern": {
    bg:        "#0B1728",
    text:      "#FFFFFF",
    accent:    "#F0A800",
    muted:     "#94A3B8",
    softBg:    "#1E3A5F",
    brandBg:   "#0F1F38",
    darkBg:    "linear-gradient(145deg, #0B1728 0%, #1E3A5F 50%, #0B1728 100%)",
    darkText:  "#FFFFFF",
    darkMuted: "#94A3B8",
  },
  "minimal-clean": {
    bg:        "#F8FAFC",
    text:      "#1E293B",
    accent:    "#475569",
    muted:     "#94A3B8",
    softBg:    "#E2E8F0",
    brandBg:   "#F1F5F9",
    darkBg:    "#1E293B",
    darkText:  "#FFFFFF",
    darkMuted: "#94A3B8",
  },
};

// ── Backward-compat mapping for old ?style= param ─────────────────────────────
const STYLE_COMPAT: Record<string, TemplateFamily> = {
  classic: "classic-luxury",
  bold:    "bold-modern",
  minimal: "minimal-clean",
};

const SIZE = 1080;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  // Resolve template family (new param or legacy style param)
  const rawFamily  = sp.get("templateFamily") ?? sp.get("style") ?? "classic-luxury";
  const family     = (STYLE_COMPAT[rawFamily] ?? rawFamily) as TemplateFamily;
  const p          = PALETTES[family] ?? PALETTES["classic-luxury"];

  const type         = (sp.get("type") ?? "cover") as "cover" | "property" | "closer";
  const agentName    = sp.get("agentName")   ?? "Your Agent";
  const businessName = sp.get("businessName") ?? sp.get("brokerage") ?? "";
  const month        = sp.get("month")       ?? "January";
  const year         = sp.get("year")        ?? String(new Date().getFullYear());
  const slideNum     = sp.get("slideNum")    ?? "1";
  const slideTotal   = sp.get("slideTotal")  ?? "1";
  const showLogo     = sp.get("showLogo")    === "1";
  const showHeadshot = sp.get("showHeadshot") === "1";
  const logoUrl      = sp.get("logoUrl")     ?? "";
  const headshotUrl  = sp.get("headshotUrl") ?? "";

  // Property-specific
  const address      = sp.get("address")     ?? "";
  const soldWording  = sp.get("soldWording") ?? "SOLD";
  const showSalePrice = sp.get("showSalePrice") === "1";
  const price        = sp.get("price")       ?? "";

  // Closer-specific
  const ctaLine = sp.get("ctaLine") || "Ready to make your move?";

  // Cover-specific
  const count = sp.get("count") ?? "1";

  // ── Shared elements ──────────────────────────────────────────────────────────

  // AGENT RUNWAY wordmark — used on all slides
  const wordmark = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: p.accent }} />
      <span style={{ fontSize: 16, color: p.accent, fontWeight: 700, letterSpacing: "0.22em", fontFamily: "sans-serif" }}>
        AGENT RUNWAY
      </span>
    </div>
  );

  // Headshot circle — used on cover + closer
  const headshotCircle = showHeadshot && headshotUrl ? (
    <div style={{ width: 72, height: 72, borderRadius: 36, overflow: "hidden", display: "flex", flexShrink: 0, background: p.softBg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={headshotUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover" }} />
    </div>
  ) : null;

  // Logo image — used on cover + closer + property bottom
  const logoImg = showLogo && logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" style={{ height: 80, maxWidth: 240, objectFit: "contain" }} />
  ) : null;

  // ── Cover slide ──────────────────────────────────────────────────────────────

  if (type === "cover") {
    const coverBg = family === "bold-modern"
      ? "linear-gradient(145deg, #0B1728 0%, #1E3A5F 55%, #0B1728 100%)"
      : p.bg;

    const countNum  = Number(count);
    const homesText = countNum === 1 ? "Home Sold" : "Homes Sold";

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: coverBg, padding: "80px", justifyContent: "space-between", fontFamily: "sans-serif" }}>

          {/* Top row: wordmark + month/year */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {wordmark}
            <div style={{ fontSize: 28, color: p.muted, fontWeight: 600 }}>
              {`${month} ${year}`}
            </div>
          </div>

          {/* Center: count hero + label */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ width: 64, height: 5, borderRadius: 3, background: family === "minimal-clean" ? p.text : p.accent, marginBottom: 20 }} />
            <div style={{ fontSize: 180, fontWeight: 900, color: family === "bold-modern" ? p.accent : p.text, lineHeight: 0.85, letterSpacing: "-0.03em" }}>
              {count}
            </div>
            <div style={{ fontSize: 72, fontWeight: 800, color: family === "bold-modern" ? "#FFFFFF" : p.text, lineHeight: 1, marginTop: 8 }}>
              {homesText}
            </div>
            <div style={{ fontSize: 30, color: p.muted, fontWeight: 500, marginTop: 20 }}>
              {`${month} ${year} Monthly Recap`}
            </div>
          </div>

          {/* Bottom row: headshot + name stack + logo */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              {headshotCircle}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: family === "bold-modern" ? "#FFFFFF" : p.text }}>
                  {agentName}
                </div>
                {!!businessName && (
                  <div style={{ fontSize: 24, color: p.muted }}>
                    {businessName}
                  </div>
                )}
              </div>
            </div>
            {logoImg ?? <div style={{ width: 1, height: 1 }} />}
          </div>
        </div>
      ),
      { width: SIZE, height: SIZE },
    );
  }

  // ── Property slide ────────────────────────────────────────────────────────────
  //
  // Layout (top → bottom):
  //   Info zone   220px — address + sold wording
  //   Image zone  flex 1 (~700px) — photo or placeholder + slide counter pill
  //   Brand zone  160px — business name, agent name, logo

  if (type === "property") {
    const photoUrl   = sp.get("photoUrl") ?? "";
    const propertyBg = family === "bold-modern" ? "#0B1728" : p.bg;

    const addressFontSize = address.length > 50 ? 44 : address.length > 35 ? 56 : 66;

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: "sans-serif", background: propertyBg }}>

          {/* ── Info zone ─────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", height: 220, padding: "40px 64px 28px", justifyContent: "center", gap: 16 }}>
            {/* Address */}
            <div style={{ fontSize: addressFontSize, fontWeight: 900, color: family === "bold-modern" ? "#FFFFFF" : p.text, lineHeight: 1.1 }}>
              {address || "123 Main Street"}
            </div>
            {/* Sold wording row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 36, height: 4, background: p.accent, borderRadius: 2 }} />
              <div style={{ fontSize: 28, fontWeight: 800, color: p.accent, letterSpacing: "0.18em" }}>
                {soldWording}
              </div>
            </div>
          </div>

          {/* ── Image zone ────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", position: "relative", flex: 1, background: family === "bold-modern" ? "linear-gradient(135deg, #1E3A5F 0%, #0B1728 100%)" : p.softBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>

            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 80 }}>🏡</div>
                <div style={{ fontSize: 18, color: p.muted, fontWeight: 600, letterSpacing: "0.06em" }}>
                  ADD PROPERTY PHOTO
                </div>
              </div>
            )}

            {/* Gradient overlay at bottom of image */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: family === "bold-modern" ? "linear-gradient(to bottom, transparent, #0B1728)" : "linear-gradient(to bottom, transparent, rgba(0,0,0,0.25))" }} />

            {/* Slide counter pill — top right */}
            <div style={{ position: "absolute", top: 20, right: 20, background: "rgba(0,0,0,0.58)", color: "#fff", borderRadius: 999, padding: "8px 20px", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center" }}>
              {`${slideNum} / ${slideTotal}`}
            </div>
          </div>

          {/* ── Brand zone ────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 160, padding: "0 64px", background: family === "bold-modern" ? "#0F1F38" : p.brandBg }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: family === "bold-modern" ? "#FFFFFF" : p.text }}>
                {businessName || agentName}
              </div>
              {!!businessName && (
                <div style={{ fontSize: 26, color: p.muted }}>
                  {agentName}
                </div>
              )}
              {showSalePrice && !!price && (
                <div style={{ fontSize: 22, color: p.muted, marginTop: 2 }}>
                  {`Listed at ${price}`}
                </div>
              )}
            </div>
            {logoImg ?? <div style={{ width: 1, height: 1 }} />}
          </div>
        </div>
      ),
      { width: SIZE, height: SIZE },
    );
  }

  // ── Closer / End card ─────────────────────────────────────────────────────────
  //
  // Always dark — strong visual close to the carousel.

  const closerBg = family === "bold-modern"
    ? "linear-gradient(145deg, #0B1728 0%, #1E3A5F 50%, #0B1728 100%)"
    : "#0B1728";

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: closerBg, padding: "80px", justifyContent: "space-between", fontFamily: "sans-serif" }}>

        {/* Top: logo or wordmark */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {logoImg ?? wordmark}
          <div style={{ width: 60, height: 3, background: p.accent, borderRadius: 2 }} />
        </div>

        {/* Center: gratitude + CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 24, color: p.accent, fontWeight: 700, letterSpacing: "0.15em" }}>
            THANK YOU
          </div>
          <div style={{ fontSize: 68, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, letterSpacing: "-0.01em" }}>
            {ctaLine}
          </div>
          <div style={{ fontSize: 32, color: "#94A3B8", marginTop: 4 }}>
            {"Let's connect — I'd love to help."}
          </div>
        </div>

        {/* Bottom: headshot + agent info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 48, height: 4, background: p.accent, borderRadius: 2, marginBottom: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {headshotCircle}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#FFFFFF" }}>
                {agentName}
              </div>
              {!!businessName && (
                <div style={{ fontSize: 28, color: "#94A3B8" }}>
                  {businessName}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 18, color: "#475569", marginTop: 8 }}>
            Powered by Agent Runway · agentrunway.ca
          </div>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
