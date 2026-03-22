"use client";
// Logo concepts page — internal review only
// Navigate to /logo-concepts to view

export default function LogoConcepts() {
  return (
    <div style={{ background: "#010D1F", minHeight: "100vh", padding: "60px 40px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Internal — Logo Review</p>
      <h1 style={{ color: "white", fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Agent Runway — Logo Concepts</h1>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "60px" }}>Eight directions. Each shown at icon size (48px), medium (96px), and large (192px) with the wordmark.</p>

      {/* ── CONCEPT 1: THE ASCENT ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 1 — &ldquo;The Ascent&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            A bold ascending flight path breaking away from a runway baseline. The horizontal line anchors the mark
            (ground / financial baseline), the diagonal suggests trajectory and growth. Uses the Runway Blue → Violet
            gradient. The geometry subtly forms &ldquo;AR&rdquo; — the diagonal is the A-lean, the vertical is the R-stem.
            Confident, directional, unambiguous.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {/* 48px */}
          <div style={{ textAlign: "center" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="url(#a1_grad)"/>
              <line x1="9" y1="38" x2="39" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <line x1="9" y1="38" x2="9" y2="32" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <path d="M12 35 L36 13" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M28 13 L36 13 L36 21" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <defs>
                <linearGradient id="a1_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#6D28D9"/>
                </linearGradient>
              </defs>
            </svg>
            <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>48px</p>
          </div>

          {/* 96px */}
          <div style={{ textAlign: "center" }}>
            <svg width="96" height="96" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="url(#a2_grad)"/>
              <line x1="9" y1="38" x2="39" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <line x1="9" y1="38" x2="9" y2="32" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <path d="M12 35 L36 13" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M28 13 L36 13 L36 21" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <defs>
                <linearGradient id="a2_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#6D28D9"/>
                </linearGradient>
              </defs>
            </svg>
            <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>96px</p>
          </div>

          {/* 192px */}
          <div style={{ textAlign: "center" }}>
            <svg width="192" height="192" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="url(#a3_grad)"/>
              <line x1="9" y1="38" x2="39" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <line x1="9" y1="38" x2="9" y2="32" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <path d="M12 35 L36 13" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M28 13 L36 13 L36 21" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <defs>
                <linearGradient id="a3_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#6D28D9"/>
                </linearGradient>
              </defs>
            </svg>
            <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>192px</p>
          </div>

          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="url(#a4_grad)"/>
              <line x1="9" y1="38" x2="39" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <line x1="9" y1="38" x2="9" y2="32" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.35"/>
              <path d="M12 35 L36 13" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M28 13 L36 13 L36 21" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <defs>
                <linearGradient id="a4_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#6D28D9"/>
                </linearGradient>
              </defs>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 2: THE ALTIMETER ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 2 — &ldquo;The Altimeter&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            A gauge/altimeter dial — the instrument that tells you how high you&apos;re flying. An arc (270°) with a bold
            needle pointing to the upper-right climbing position. The Commission Gold needle on a deep navy field.
            References both the product name (&ldquo;Altimeter&rdquo; page) and the core metaphor. Sophisticated, premium,
            immediately aviation. The arc doubles as a &ldquo;C&rdquo; for Canada.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="11" fill="#060F1E"/>
                <rect width="48" height="48" rx="11" fill="url(#b_border)" opacity="0.6"/>
                {/* Gauge arc — 225° sweep from bottom-left to bottom-right */}
                <circle cx="24" cy="26" r="13" stroke="#1E3A5F" strokeWidth="2" fill="none"/>
                <path
                  d="M 9.8 37 A 15 15 0 1 1 38.2 37"
                  stroke="url(#b_arc_grad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Needle — pointing to ~1 o'clock (climbing) */}
                <line x1="24" y1="26" x2="33" y2="13" stroke="url(#b_needle_grad)" strokeWidth="2.5" strokeLinecap="round"/>
                {/* Centre dot */}
                <circle cx="24" cy="26" r="2.5" fill="#F0A800"/>
                <circle cx="24" cy="26" r="1" fill="white"/>
                {/* Tick marks at key positions */}
                <line x1="11" y1="26" x2="13.5" y2="26" stroke="#1E3A5F" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="37" y1="26" x2="34.5" y2="26" stroke="#1E3A5F" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="24" y1="11" x2="24" y2="13.5" stroke="#1E3A5F" strokeWidth="1.5" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="b_border" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E40AF" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#6D28D9" stopOpacity="0.2"/>
                  </linearGradient>
                  <linearGradient id="b_arc_grad" x1="9" y1="37" x2="38" y2="11" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E40AF"/>
                    <stop offset="60%" stopColor="#3B82F6"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                  <linearGradient id="b_needle_grad" x1="24" y1="26" x2="33" y2="13" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#F0A800" stopOpacity="0.6"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                </defs>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}

          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="#060F1E"/>
              <circle cx="24" cy="26" r="13" stroke="#1E3A5F" strokeWidth="2" fill="none"/>
              <path d="M 9.8 37 A 15 15 0 1 1 38.2 37" stroke="url(#bw_arc)" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <line x1="24" y1="26" x2="33" y2="13" stroke="url(#bw_needle)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="24" cy="26" r="2.5" fill="#F0A800"/>
              <circle cx="24" cy="26" r="1" fill="white"/>
              <defs>
                <linearGradient id="bw_arc" x1="9" y1="37" x2="38" y2="11" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="60%" stopColor="#3B82F6"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
                <linearGradient id="bw_needle" x1="24" y1="26" x2="33" y2="13" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#F0A800" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
              </defs>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 3: THE WINGMARK ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 3 — &ldquo;The Wingmark&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            Two bold angular strokes in a banking configuration — one in Runway Blue, one in Commission Gold.
            Together they suggest a banking aircraft turn, momentum, and forward motion. The gold stroke
            is above (the wing catching light), the blue is the shadow/body below. More abstract than the others
            but the most dynamic and premium-feeling at small sizes. The two-colour split also represents the
            two core audiences: the agent (gold = achievement) and the business (blue = structure).
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="11" fill="url(#c_bg)"/>
                {/* Gold wing — upper */}
                <path
                  d="M8 20 L24 11 L40 17 L28 22 Z"
                  fill="url(#c_gold)"
                />
                {/* Blue wing — lower / body */}
                <path
                  d="M8 28 L24 19 L40 25 L28 30 Z"
                  fill="url(#c_blue)"
                  opacity="0.85"
                />
                <defs>
                  <linearGradient id="c_bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#0D1B3E"/>
                    <stop offset="100%" stopColor="#0A1628"/>
                  </linearGradient>
                  <linearGradient id="c_gold" x1="8" y1="15" x2="40" y2="15" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                  <linearGradient id="c_blue" x1="8" y1="24" x2="40" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E40AF"/>
                    <stop offset="100%" stopColor="#3B82F6"/>
                  </linearGradient>
                </defs>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}

          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="url(#cw_bg)"/>
              <path d="M8 20 L24 11 L40 17 L28 22 Z" fill="url(#cw_gold)"/>
              <path d="M8 28 L24 19 L40 25 L28 30 Z" fill="url(#cw_blue)" opacity="0.85"/>
              <defs>
                <linearGradient id="cw_bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0D1B3E"/>
                  <stop offset="100%" stopColor="#0A1628"/>
                </linearGradient>
                <linearGradient id="cw_gold" x1="8" y1="15" x2="40" y2="15" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
                <linearGradient id="cw_blue" x1="8" y1="24" x2="40" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#3B82F6"/>
                </linearGradient>
              </defs>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 4: THE RUNWAY ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 4 — &ldquo;The Runway&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            Two tapered bands — Commission Gold above, Runway Blue below — converging to a single point on the right.
            It&apos;s the pilot&apos;s view at the moment of takeoff: runway edges stretching to the vanishing point.
            Wide and open on the left (here, now), collapsing to a single point on the right (the horizon, the goal).
            At favicon size it reads as two bold stripes. At large sizes the taper tells the whole story. The dark gap
            between the bands is the runway itself.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id={`f_gold_${size}`} x1="6" y1="13" x2="42" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                  <linearGradient id={`f_blue_${size}`} x1="6" y1="35" x2="42" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#2563EB"/>
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="11" fill="#0A1628"/>
                {/* Gold upper band — wide on left, tapers to a point on right */}
                <path d="M6 8 L42 20 L42 24 L6 18 Z" fill={`url(#f_gold_${size})`}/>
                {/* Blue lower band — wide on left, converges to same point on right */}
                <path d="M6 30 L42 24 L42 28 L6 40 Z" fill={`url(#f_blue_${size})`}/>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="fw_gold" x1="6" y1="13" x2="42" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
                <linearGradient id="fw_blue" x1="6" y1="35" x2="42" y2="26" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="11" fill="#0A1628"/>
              <path d="M6 8 L42 20 L42 24 L6 18 Z" fill="url(#fw_gold)"/>
              <path d="M6 30 L42 24 L42 28 L6 40 Z" fill="url(#fw_blue)"/>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 5: THE APEX ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 5 — &ldquo;The Apex&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            A single bold arrowhead — one unified silhouette, two colours. Commission Gold takes the upper portion
            (the dominant face, the lit surface), Runway Blue anchors below. The divide is asymmetric: gold is the
            larger piece, blue the counterweight. Together they form one aggressive directional mark. The outer
            silhouette is unambiguous at any size — a pointed form moving forward. The internal colour story
            adds the brand depth.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id={`g_gold_${size}`} x1="6" y1="19" x2="42" y2="19" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                  <linearGradient id={`g_blue_${size}`} x1="6" y1="32" x2="42" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#2563EB"/>
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="11" fill="#0A1628"/>
                {/* Gold — upper, larger portion */}
                <path d="M6 12 L6 27 L42 24 Z" fill={`url(#g_gold_${size})`}/>
                {/* Blue — lower, smaller portion */}
                <path d="M6 27 L6 36 L42 24 Z" fill={`url(#g_blue_${size})`}/>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="gw_gold" x1="6" y1="19" x2="42" y2="19" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
                <linearGradient id="gw_blue" x1="6" y1="32" x2="42" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="11" fill="#0A1628"/>
              <path d="M6 12 L6 27 L42 24 Z" fill="url(#gw_gold)"/>
              <path d="M6 27 L6 36 L42 24 Z" fill="url(#gw_blue)"/>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 6: THE THREE BARS ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 6 — &ldquo;The Three Bars&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            Three ascending parallelogram bars — deep blue, mid blue, gold — stepping up from bottom-left to
            top-right like flight data going vertical. Each bar is slightly inset on the left, creating a
            staircase of momentum. The gold bar is the highest: the achievement marker. At 16px it collapses
            to a bold triple-stripe. The colour trajectory (foundation → growth → achievement) tells the brand
            story in three beats.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id={`h_b1_${size}`} x1="6" y1="39" x2="42" y2="35" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#1E40AF"/>
                  </linearGradient>
                  <linearGradient id={`h_b2_${size}`} x1="10" y1="29" x2="42" y2="25" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E40AF"/>
                    <stop offset="100%" stopColor="#3B82F6"/>
                  </linearGradient>
                  <linearGradient id={`h_b3_${size}`} x1="14" y1="17" x2="42" y2="13" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="11" fill="#0A1628"/>
                {/* Bar 1 — deep blue, bottom */}
                <path d="M6 36 L42 32 L42 38 L6 42 Z" fill={`url(#h_b1_${size})`}/>
                {/* Bar 2 — mid blue, middle */}
                <path d="M10 26 L42 22 L42 28 L10 32 Z" fill={`url(#h_b2_${size})`}/>
                {/* Bar 3 — gold, top */}
                <path d="M14 14 L42 10 L42 16 L14 20 Z" fill={`url(#h_b3_${size})`}/>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hw_b1" x1="6" y1="39" x2="42" y2="35" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#1E40AF"/>
                </linearGradient>
                <linearGradient id="hw_b2" x1="10" y1="29" x2="42" y2="25" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E40AF"/>
                  <stop offset="100%" stopColor="#3B82F6"/>
                </linearGradient>
                <linearGradient id="hw_b3" x1="14" y1="17" x2="42" y2="13" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="11" fill="#0A1628"/>
              <path d="M6 36 L42 32 L42 38 L6 42 Z" fill="url(#hw_b1)"/>
              <path d="M10 26 L42 22 L42 28 L10 32 Z" fill="url(#hw_b2)"/>
              <path d="M14 14 L42 10 L42 16 L14 20 Z" fill="url(#hw_b3)"/>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 7: THE DOUBLE SLASH ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 7 — &ldquo;The Double Slash&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            Two bold parallel diagonal strokes — Runway Blue on the left, Commission Gold on the right — rising
            steeply from bottom to top. No background geometry: just the two shapes. The slashes read as
            velocity markers, rate-of-climb, or a pilot&apos;s shorthand for speed. At 16px it collapses to a
            single bold angled mark. At 192px the two strokes are clearly distinct — the gold stroke leading,
            the blue in pursuit. Each stroke graduates dark-to-bright from base to tip: ascending.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id={`i_blue_${size}`} x1="8" y1="44" x2="18" y2="4" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#3B82F6"/>
                  </linearGradient>
                  <linearGradient id={`i_gold_${size}`} x1="26" y1="44" x2="36" y2="4" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="11" fill="#0A1628"/>
                {/* Blue slash — left */}
                <path d="M4 44 L12 44 L22 4 L14 4 Z" fill={`url(#i_blue_${size})`}/>
                {/* Gold slash — right */}
                <path d="M22 44 L30 44 L40 4 L32 4 Z" fill={`url(#i_gold_${size})`}/>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="iw_blue" x1="8" y1="44" x2="18" y2="4" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#3B82F6"/>
                </linearGradient>
                <linearGradient id="iw_gold" x1="26" y1="44" x2="36" y2="4" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="11" fill="#0A1628"/>
              <path d="M4 44 L12 44 L22 4 L14 4 Z" fill="url(#iw_blue)"/>
              <path d="M22 44 L30 44 L40 4 L32 4 Z" fill="url(#iw_gold)"/>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONCEPT 8: THE LOZENGE ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 8 — &ldquo;The Lozenge&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            A horizontal pointed oval — the aerofoil cross-section, seen head-on. Split at the chord line:
            Commission Gold takes the upper surface (lit, ascending), Runway Blue takes the lower (shadow,
            structure). The only curved mark in this collection — everything else is angular. At small sizes
            it reads as a confident oval. At large sizes the two distinct curved surfaces and the precise
            geometry become the story. The shape is timeless: lens, wing profile, eye — always in motion.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id={`j_gold_${size}`} x1="6" y1="16" x2="42" y2="16" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#F0A800"/>
                  </linearGradient>
                  <linearGradient id={`j_blue_${size}`} x1="6" y1="32" x2="42" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#2563EB"/>
                  </linearGradient>
                </defs>
                <rect width="48" height="48" rx="11" fill="#0A1628"/>
                {/* Gold — upper surface of aerofoil */}
                <path d="M6 24 Q24 8 42 24 Z" fill={`url(#j_gold_${size})`}/>
                {/* Blue — lower surface of aerofoil */}
                <path d="M6 24 L42 24 Q24 40 6 24 Z" fill={`url(#j_blue_${size})`}/>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="jw_gold" x1="6" y1="16" x2="42" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#F0A800"/>
                </linearGradient>
                <linearGradient id="jw_blue" x1="6" y1="32" x2="42" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="11" fill="#0A1628"/>
              <path d="M6 24 Q24 8 42 24 Z" fill="url(#jw_gold)"/>
              <path d="M6 24 L42 24 Q24 40 6 24 Z" fill="url(#jw_blue)"/>
            </svg>
            <div>
              <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
              <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Flight Operations</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current mark for comparison */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "40px" }}>
        <p style={{ color: "#475569", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>Current mark — for comparison</p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "20px 28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Current logo" style={{ width: 48, height: 48 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div>
            <p style={{ color: "white", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Agent Runway</p>
            <p style={{ color: "#64748b", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", margin: "2px 0 0 0" }}>Business Analytics</p>
          </div>
        </div>
      </div>
    </div>
  );
}
