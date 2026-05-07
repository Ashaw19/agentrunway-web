/**
 * Charter Welcome Email
 *
 * Sent once when someone joins the waitlist via /waitlist.
 * Confirms their spot, reinforces charter benefits, sets expectations.
 *
 * Returns plain-text and HTML versions to pass to Resend.
 */

interface CharterWelcomeOptions {
  /** First name — falls back to "there" if unavailable */
  firstName?: string | null;
  /** URL to the charter/waitlist page */
  waitlistUrl?: string;
  /** Per-recipient marketing-list unsubscribe URL (CASL §11). Required for
   *  CASL compliance — the unsubscribe mechanism must be set out clearly in
   *  the message body, not just the SMTP List-Unsubscribe header. */
  unsubscribeUrl: string;
}

export function charterWelcomeEmail({
  firstName,
  waitlistUrl = "https://agentrunway.ca/waitlist",
  unsubscribeUrl,
}: CharterWelcomeOptions): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  const subject = "You're on the runway";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f8;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Brand accent strip -->
          <tr>
            <td height="4" style="background:linear-gradient(90deg,#F0A800 0%,#D97706 50%,#a85c00 100%);line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#0d1f44;">

              <!-- Logo mark (inline SVG) -->
              <div style="display:inline-block;margin-bottom:12px;">
                <svg width="44" height="44" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="e-bg" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#1e2f5e"/>
                      <stop offset="100%" stop-color="#0d1526"/>
                    </linearGradient>
                    <linearGradient id="e-l" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                    <linearGradient id="e-r" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                  </defs>
                  <rect width="40" height="40" rx="9" fill="url(#e-bg)"/>
                  <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#e-l)"/>
                  <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#e-r)"/>
                  <rect x="15" y="9" width="10" height="22" fill="#0a1020" fill-opacity="0.5"/>
                  <circle cx="20" cy="14" r="5" fill="#F97316" fill-opacity="0.35"/>
                  <circle cx="20" cy="14" r="1.8" fill="#F97316"/>
                </svg>
              </div>

              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">Agent Runway</div>
              <div style="color:#8ba8d4;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">Charter Member</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${greeting}, you're in.
              </h1>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">
                Your Charter Member spot is confirmed. When we launch, you'll be among the first agents on the platform.
              </p>

              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">
                What that means for you:
              </p>

              <!-- Benefits list -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:8px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    3 months free on any paid plan
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    Your price locked at launch rate while your subscription stays active
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    3 extra free months for every referral
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    Direct line to the founder
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#334155;">
                We'll reach out with more details before launch. No action needed on your end right now.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:10px;background:linear-gradient(135deg,#F0A800 0%,#D97706 100%);">
                    <a href="${waitlistUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#15110A;text-decoration:none;border-radius:10px;">
                      View Charter Details
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">
                Agent Runway &mdash; built for Canadian real estate agents.
              </p>
              <p style="margin:0 0 6px;font-size:11px;color:#cbd5e1;">
                <a href="https://agentrunway.ca" style="color:#64748b;text-decoration:underline;">agentrunway.ca</a>
              </p>
              <p style="margin:0 0 8px;font-size:10px;color:#94a3b8;line-height:1.5;">
                Agent Runway Inc. &middot; Saint John, NB, Canada &middot; &copy; 2026 &middot; Canada Corporation No. 1786542-2
              </p>
              <p style="margin:0;font-size:11px;line-height:1.6;">
                <a href="${unsubscribeUrl}" style="color:#475569;text-decoration:underline;font-weight:600;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `${greeting}, you're in.

Your Charter Member spot is confirmed. When we launch, you'll be among the first agents on the platform.

What that means for you:

- 3 months free on any paid plan
- Your price locked at launch rate while your subscription stays active
- 3 extra free months for every referral
- Direct line to the founder

We'll reach out with more details before launch. No action needed on your end right now.

View charter details: ${waitlistUrl}

---
Agent Runway - built for Canadian real estate agents.
https://agentrunway.ca

Agent Runway Inc. - Saint John, NB, Canada - (c) 2026 - Canada Corporation No. 1786542-2

Unsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
