"use client";
// Logo concepts page — internal review only
// Navigate to /logo-concepts to view

export default function LogoConcepts() {
  return (
    <div style={{ background: "#010D1F", minHeight: "100vh", padding: "60px 40px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Internal — Logo Review</p>
      <h1 style={{ color: "white", fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Agent Runway — Logo Concepts</h1>
      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "60px" }}>Three directions. Each shown at icon size (48px), medium (96px), and large (192px) with the wordmark.</p>

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
                {/* Thin separator line — fuselage */}
                <line x1="24" y1="11" x2="24" y2="37" stroke="white" strokeWidth="1" strokeOpacity="0.15" strokeLinecap="round"/>
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

      {/* ── CONCEPT 4: THE VECTORS ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 4 — &ldquo;The Vectors&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            Two nested right-pointing chevrons — blue outer, gold inner. Abstract and directional without any literal
            aviation reference. Could read as velocity markers, radar returns, or a double-arrow forward. The
            gold sits inside the blue like a prize inside a journey. Scales beautifully to favicon size — at 16px
            it reads as a single bold wedge.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="11" fill="#080F20"/>
                {/* Blue outer chevron */}
                <path d="M9 11 L39 24 L9 37 L14 24 Z" fill="url(#d_blue)"/>
                {/* Gold inner chevron */}
                <path d="M17 17 L33 24 L17 31 L21 24 Z" fill="url(#d_gold)"/>
                <defs>
                  <linearGradient id="d_blue" x1="9" y1="24" x2="39" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#3B82F6"/>
                  </linearGradient>
                  <linearGradient id="d_gold" x1="17" y1="24" x2="33" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#D97706"/>
                    <stop offset="100%" stopColor="#FBB800"/>
                  </linearGradient>
                </defs>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="11" fill="#080F20"/>
              <path d="M9 11 L39 24 L9 37 L14 24 Z" fill="url(#dw_blue)"/>
              <path d="M17 17 L33 24 L17 31 L21 24 Z" fill="url(#dw_gold)"/>
              <defs>
                <linearGradient id="dw_blue" x1="9" y1="24" x2="39" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#3B82F6"/>
                </linearGradient>
                <linearGradient id="dw_gold" x1="17" y1="24" x2="33" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#D97706"/>
                  <stop offset="100%" stopColor="#FBB800"/>
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

      {/* ── CONCEPT 5: THE SPLIT ── */}
      <div style={{ marginBottom: "80px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "white", fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Concept 5 — &ldquo;The Split&rdquo;</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "520px", lineHeight: 1.6 }}>
            A single geometric form bisected diagonally — gold in the upper-right, blue in the lower-left. The
            diagonal IS the runway: the trajectory cutting across the form. Gold ascends upper-right (the goal,
            the achievement). Blue grounds lower-left (structure, reliability). From a distance it reads as one
            unified mark. The most minimal and Swiss of the group — no decorative elements, just two colours
            and one line doing all the work.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "40px", flexWrap: "wrap" }}>
          {[48, 96, 192].map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <clipPath id={`e_clip_${size}`}>
                    <rect width="48" height="48" rx="11"/>
                  </clipPath>
                  <linearGradient id={`e_gold_${size}`} x1="48" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FBB800"/>
                    <stop offset="100%" stopColor="#D97706"/>
                  </linearGradient>
                  <linearGradient id={`e_blue_${size}`} x1="0" y1="48" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1E3A8A"/>
                    <stop offset="100%" stopColor="#2563EB"/>
                  </linearGradient>
                </defs>
                <g clipPath={`url(#e_clip_${size})`}>
                  {/* Blue — lower-left triangle */}
                  <polygon points="0,0 0,48 48,48" fill={`url(#e_blue_${size})`}/>
                  {/* Gold — upper-right triangle */}
                  <polygon points="0,0 48,0 48,48" fill={`url(#e_gold_${size})`}/>
                  {/* Runway centerline — thin white diagonal */}
                  <line x1="0" y1="0" x2="48" y2="48" stroke="white" strokeWidth="0.75" strokeOpacity="0.25"/>
                </g>
              </svg>
              <p style={{ color: "#475569", fontSize: "11px", marginTop: "8px" }}>{size}px</p>
            </div>
          ))}
          {/* Wordmark lockup */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px 28px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="ew_clip">
                  <rect width="48" height="48" rx="11"/>
                </clipPath>
                <linearGradient id="ew_gold" x1="48" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FBB800"/>
                  <stop offset="100%" stopColor="#D97706"/>
                </linearGradient>
                <linearGradient id="ew_blue" x1="0" y1="48" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1E3A8A"/>
                  <stop offset="100%" stopColor="#2563EB"/>
                </linearGradient>
              </defs>
              <g clipPath="url(#ew_clip)">
                <polygon points="0,0 0,48 48,48" fill="url(#ew_blue)"/>
                <polygon points="0,0 48,0 48,48" fill="url(#ew_gold)"/>
                <line x1="0" y1="0" x2="48" y2="48" stroke="white" strokeWidth="0.75" strokeOpacity="0.25"/>
              </g>
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
