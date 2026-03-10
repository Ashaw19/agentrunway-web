/**
 * /api/social/slide
 *
 * Generates a 1080×1080 PNG carousel slide for the Social Media Studio.
 * Uses next/og (satori) for edge-compatible image rendering.
 *
 * Query params:
 *   type        'cover' | 'property' | 'closer'
 *   style       'classic' | 'bold' | 'minimal'
 *   agentName   agent display name
 *   brokerage   brokerage / business name
 *   month       e.g. "June"
 *   year        e.g. "2025"
 *   count       number of closings (cover slide)
 *   totalGci    formatted total GCI string (cover slide)
 *   address     property address (property slide)
 *   role        'buyer' | 'seller' | 'both' (property slide)
 *   gci         formatted GCI string (property slide)
 *   price       formatted sale price string (property slide)
 *   slideNum    current slide number
 *   slideTotal  total slide count
 *   photoUrl    optional property photo URL
 */

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Style = "classic" | "bold" | "minimal";

const P: Record<Style, { bg: string; text: string; accent: string; muted: string; highlight: string; softBg: string }> = {
  classic: {
    bg:        "#FFFFFF",
    text:      "#0B1728",
    accent:    "#1E72F2",
    muted:     "#64748B",
    highlight: "#10B981",
    softBg:    "#EFF6FF",
  },
  bold: {
    bg:        "#0B1728",
    text:      "#FFFFFF",
    accent:    "#F0A800",
    muted:     "#94A3B8",
    highlight: "#10B981",
    softBg:    "#1E3A5F",
  },
  minimal: {
    bg:        "#F8FAFC",
    text:      "#1E293B",
    accent:    "#1E293B",
    muted:     "#64748B",
    highlight: "#0B1728",
    softBg:    "#E2E8F0",
  },
};

const SIZE = 1080;

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const type      = (sp.get("type")      ?? "cover")   as "cover" | "property" | "closer";
  const style     = (sp.get("style")     ?? "classic") as Style;
  const agentName = sp.get("agentName")  ?? "Your Agent";
  const brokerage = sp.get("brokerage")  ?? "";
  const month     = sp.get("month")      ?? "January";
  const year      = sp.get("year")       ?? String(new Date().getFullYear());
  const count     = sp.get("count")      ?? "1";
  const totalGci  = sp.get("totalGci")   ?? "";
  const address   = sp.get("address")    ?? "";
  const role      = sp.get("role")       ?? "seller";
  const gci       = sp.get("gci")        ?? "";
  const price     = sp.get("price")      ?? "";
  const slideNum  = sp.get("slideNum")   ?? "1";
  const slideTotal = sp.get("slideTotal") ?? "1";
  const photoUrl  = sp.get("photoUrl")   ?? "";

  const p = P[style] ?? P.classic;

  // ── Shared fragment helpers ─────────────────────────────────────────────────

  const brandBadge = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: p.accent,
        }}
      />
      <span
        style={{
          fontSize: 16,
          color: p.accent,
          fontWeight: 700,
          letterSpacing: "0.22em",
          fontFamily: "sans-serif",
        }}
      >
        AGENT RUNWAY
      </span>
    </div>
  );

  // ── Cover slide ─────────────────────────────────────────────────────────────

  if (type === "cover") {
    const coverBg =
      style === "bold"
        ? "linear-gradient(145deg, #0B1728 0%, #1E3A5F 55%, #0B1728 100%)"
        : p.bg;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: coverBg,
            padding: "80px",
            justifyContent: "space-between",
            fontFamily: "sans-serif",
          }}
        >
          {/* Top — brand */}
          {brandBadge}

          {/* Center — headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                width: 64,
                height: 5,
                borderRadius: 3,
                background: style === "minimal" ? p.text : p.accent,
              }}
            />
            <div
              style={{
                fontSize: 100,
                fontWeight: 900,
                color: p.text,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {count}
            </div>
            <div
              style={{
                fontSize: 52,
                fontWeight: 800,
                color: p.text,
                lineHeight: 1,
                marginTop: -8,
              }}
            >
              {Number(count) === 1 ? "Closing" : "Closings"}
            </div>
            <div
              style={{
                fontSize: 30,
                color: p.muted,
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              {month} · {year}
            </div>
            {!!totalGci && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: p.highlight,
                  color: "#fff",
                  borderRadius: 999,
                  padding: "10px 28px",
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 8,
                  width: "fit-content",
                }}
              >
                {totalGci} total GCI
              </div>
            )}
          </div>

          {/* Bottom — agent identity + swipe hint */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: p.text }}>
                {agentName}
              </div>
              {!!brokerage && (
                <div style={{ fontSize: 17, color: p.muted }}>{brokerage}</div>
              )}
            </div>
            <div
              style={{
                fontSize: 15,
                color: p.muted,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              swipe for details →
            </div>
          </div>
        </div>
      ),
      { width: SIZE, height: SIZE },
    );
  }

  // ── Property slide ──────────────────────────────────────────────────────────

  if (type === "property") {
    const roleColor =
      role === "buyer" ? "#1E72F2" : role === "seller" ? "#10B981" : "#8B5CF6";
    const roleLabel =
      role === "buyer" ? "Buyer Side" : role === "seller" ? "Seller Side" : "Both Sides";

    const photoH = 560; // top 52% of 1080

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            fontFamily: "sans-serif",
            background: style === "bold" ? "#0B1728" : p.bg,
            overflow: "hidden",
          }}
        >
          {/* Photo / hero area */}
          <div
            style={{
              display: "flex",
              position: "relative",
              width: "100%",
              height: photoH,
              background:
                style === "bold"
                  ? "linear-gradient(135deg, #1E3A5F 0%, #0B1728 100%)"
                  : p.softBg,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 96 }}>🏡</div>
                <div
                  style={{
                    fontSize: 20,
                    color: p.muted,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  ADD PROPERTY PHOTO
                </div>
              </div>
            )}

            {/* Gradient overlay at bottom of photo */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 120,
                background:
                  style === "bold"
                    ? "linear-gradient(to bottom, transparent, #0B1728)"
                    : "linear-gradient(to bottom, transparent, rgba(0,0,0,0.35))",
              }}
            />

            {/* Slide counter pill */}
            <div
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                borderRadius: 999,
                padding: "8px 20px",
                fontSize: 18,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
              }}
            >
              {slideNum} / {slideTotal}
            </div>

            {/* Role badge */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 24,
                background: roleColor,
                color: "#fff",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.08em",
                display: "flex",
                alignItems: "center",
              }}
            >
              {roleLabel.toUpperCase()}
            </div>
          </div>

          {/* Info area */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "36px 64px",
              justifyContent: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 15,
                color: p.accent,
                fontWeight: 700,
                letterSpacing: "0.18em",
              }}
            >
              JUST CLOSED
            </div>
            <div
              style={{
                fontSize: address.length > 45 ? 28 : 36,
                fontWeight: 800,
                color: style === "bold" ? "#fff" : p.text,
                lineHeight: 1.2,
              }}
            >
              {address || "123 Main Street"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 40,
                marginTop: 6,
              }}
            >
              {!!price && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: p.muted,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                    }}
                  >
                    SALE PRICE
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: style === "bold" ? "#fff" : p.text,
                    }}
                  >
                    {price}
                  </div>
                </div>
              )}
              {!!gci && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: p.muted,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                    }}
                  >
                    COMMISSION
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      color: p.highlight,
                    }}
                  >
                    {gci}
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 15, color: p.muted, marginTop: 4 }}>
              {agentName}
              {brokerage ? ` · ${brokerage}` : ""}
            </div>
          </div>
        </div>
      ),
      { width: SIZE, height: SIZE },
    );
  }

  // ── Closer / CTA slide ──────────────────────────────────────────────────────

  const closerBg =
    style === "bold"
      ? "linear-gradient(145deg, #0B1728 0%, #1E3A5F 50%, #0B1728 100%)"
      : "#0B1728";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: closerBg,
          padding: "80px",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {brandBadge}
          <div
            style={{
              width: 64,
              height: 3,
              background: p.accent,
              borderRadius: 2,
            }}
          />
        </div>

        {/* Center CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: p.accent,
              fontWeight: 700,
              letterSpacing: "0.15em",
            }}
          >
            YOUR NEXT MOVE STARTS HERE
          </div>
          <div
            style={{
              fontSize: 62,
              fontWeight: 900,
              color: "#FFFFFF",
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            Let&apos;s find your perfect home.
          </div>
          <div style={{ fontSize: 24, color: "#94A3B8", marginTop: 4 }}>
            Reach out today — I&apos;d love to help.
          </div>
        </div>

        {/* Bottom — agent info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              width: 48,
              height: 4,
              background: p.accent,
              borderRadius: 2,
              marginBottom: 8,
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 900, color: "#FFFFFF" }}>
            {agentName}
          </div>
          {!!brokerage && (
            <div style={{ fontSize: 20, color: "#94A3B8" }}>{brokerage}</div>
          )}
          <div
            style={{
              fontSize: 14,
              color: "#475569",
              marginTop: 10,
            }}
          >
            Powered by Agent Runway · agentrunway.ca
          </div>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
