/**
 * Canadian Realtor Tax Cheat Sheet — Delivery Email
 *
 * Sent once when an agent submits the email form on
 * /tools/canadian-realtor-tax-cheat-sheet (or any inline `cheat_sheet_*`
 * source on the tax-domain articles).
 *
 * Returns plain-text and HTML versions to pass to Resend.
 */

interface CheatSheetDeliveryOptions {
  /** First name — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Public URL of the static PDF asset. Dated filename is intentional so
   *  the artifact + email body remain in sync at the year level. When 2026
   *  rates land, ship a new dated file and update this constant. */
  pdfUrl?: string;
  /** Estimator URL surfaced as a related-tool nudge */
  estimatorUrl?: string;
}

export function cheatSheetDeliveryEmail({
  firstName,
  pdfUrl = "https://agentrunway.ca/canadian-realtor-tax-cheat-sheet-2025.pdf",
  estimatorUrl = "https://agentrunway.ca/tools/realtor-tax-estimator",
}: CheatSheetDeliveryOptions = {}): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  const subject = "Your Canadian Realtor Tax Cheat Sheet (2025)";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f8;padding:40px 16px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Brand accent strip -->
          <tr>
            <td height="4" style="background:linear-gradient(90deg,#F0A800 0%,#D97706 50%,#a85c00 100%);line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#0d1f44;">
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">Agent Runway</div>
              <div style="color:#8ba8d4;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">Canadian Realtor Tax Cheat Sheet — 2025</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${greeting}, here it is.
              </h1>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
                Your one-page Canadian Realtor Tax Cheat Sheet for the 2025 tax year. Print it, pin it above your desk, hand a copy to your accountant.
              </p>

              <!-- Primary CTA -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="border-radius:10px;background:linear-gradient(135deg,#F0A800 0%,#D97706 100%);">
                    <a href="${pdfUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#15110A;text-decoration:none;border-radius:10px;">
                      Download the cheat sheet (PDF)
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">
                What&rsquo;s on it:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    2025 federal + provincial tax brackets
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    Self-employed CPP1 + CPP2 figures
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    GST/HST registration threshold + provincial rates
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    2026 deadlines for the 2025 tax year
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;line-height:1.5;color:#334155;">
                    <span style="color:#10b981;font-weight:700;margin-right:8px;">&#10003;</span>
                    T2125 categories + 10 commonly-deducted lines
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b;font-style:italic;">
                Every figure is sourced to a primary CRA URL. The card is information, not advice — verify with your accountant before any filing decision.
              </p>

              <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#334155;">
                Want to see what your own numbers look like?
              </p>
              <p style="margin:0;font-size:14px;line-height:1.65;color:#334155;">
                <a href="${estimatorUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">Try the live tax estimator &rarr;</a>
              </p>

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
              <p style="margin:0 0 8px;font-size:10px;color:#cbd5e1;line-height:1.5;">
                You&rsquo;re receiving this because you requested the cheat sheet at agentrunway.ca.
              </p>
              <p style="margin:0;font-size:10px;color:#cbd5e1;line-height:1.5;">
                Agent Runway Inc. &middot; Saint John, NB, Canada &middot; &copy; 2026 &middot; Canada Corporation No. 1786542-2
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `${greeting}, here it is.

Your one-page Canadian Realtor Tax Cheat Sheet for the 2025 tax year.

Download (PDF): ${pdfUrl}

What's on it:
- 2025 federal + provincial tax brackets
- Self-employed CPP1 + CPP2 figures
- GST/HST registration threshold + provincial rates
- 2026 deadlines for the 2025 tax year
- T2125 categories + 10 commonly-deducted lines

Every figure is sourced to a primary CRA URL. The card is information,
not advice - verify with your accountant before any filing decision.

Want to see what your own numbers look like?
Live tax estimator: ${estimatorUrl}

---
Agent Runway - built for Canadian real estate agents.
https://agentrunway.ca

You're receiving this because you requested the cheat sheet at agentrunway.ca.
Agent Runway Inc. - Saint John, NB, Canada - (c) 2026 - Canada Corporation No. 1786542-2`;

  return { subject, html, text };
}
