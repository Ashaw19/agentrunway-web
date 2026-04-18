/**
 * Win-Back Email
 *
 * Sent when a user's subscription is cancelled (customer.subscription.deleted).
 * Acknowledges the cancellation, confirms their data is safe, and invites them back.
 */

interface WinBackOptions {
  /** First name for personalized greeting — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Pricing / resubscribe URL */
  pricingUrl?: string;
  /** Dashboard URL so they can still access their data */
  dashboardUrl?: string;
}

export function winBackEmail({
  firstName,
  pricingUrl = "https://agentrunway.ca/pricing",
  dashboardUrl = "https://agentrunway.ca/dashboard",
}: WinBackOptions = {}): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  const subject = "Your Agent Runway subscription has ended — your data is safe";

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
            <td height="4" style="background:linear-gradient(90deg,#F97316 0%,#1E72F2 40%,#7C3AED 70%,#10B981 100%);line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#0d1f44;">
              <div style="display:inline-block;margin-bottom:12px;">
                <svg width="44" height="44" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="e-bg3" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#1e2f5e"/>
                      <stop offset="100%" stop-color="#0d1526"/>
                    </linearGradient>
                    <linearGradient id="e-l3" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                    <linearGradient id="e-r3" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                  </defs>
                  <rect width="40" height="40" rx="9" fill="url(#e-bg3)"/>
                  <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#e-l3)"/>
                  <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#e-r3)"/>
                  <rect x="15" y="9" width="10" height="22" fill="#0a1020" fill-opacity="0.5"/>
                  <circle cx="20" cy="14" r="5" fill="#F97316" fill-opacity="0.35"/>
                  <circle cx="20" cy="14" r="1.8" fill="#F97316"/>
                </svg>
              </div>
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">Agent Runway</div>
              <div style="color:#8ba8d4;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">Business Analytics</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${greeting}, your subscription has ended
              </h1>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
                Your Agent Runway Professional subscription has been cancelled. We're sorry to see you go.
              </p>

              <!-- Data safety callout -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;background-color:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="display:flex;align-items:flex-start;gap:10px;">
                      <span style="font-size:18px;">✅</span>
                      <div>
                        <div style="font-size:14px;font-weight:600;color:#166534;margin-bottom:4px;">Your data is safe</div>
                        <div style="font-size:13px;color:#15803d;line-height:1.5;">
                          Your transactions, pipeline, and expense history are all still here. Your data remains accessible in read-only mode.
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">
                You still have access to:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                ${[
                  "Transaction tracking and GCI calculation",
                  "Pipeline management",
                  "Expense tracking",
                  "Basic dashboard and reports",
                ].map((item) => `
                <tr>
                  <td style="padding:4px 0;vertical-align:top;width:20px;font-size:14px;color:#16a34a;">✓</td>
                  <td style="padding:4px 0;font-size:13.5px;color:#334155;">${item}</td>
                </tr>`).join("")}
              </table>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">
                Whenever you're ready to come back, your full Professional feature set — Runway Score, AI Business Assistant, probability forecasting, and tax estimates — is waiting for you.
              </p>

              <!-- Two CTAs -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <a href="${pricingUrl}"
                       style="display:inline-block;background-color:#1E72F2;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;letter-spacing:0.01em;">
                      View Plans &amp; Pricing
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="font-size:13.5px;color:#1E72F2;text-decoration:none;">
                      Go to my dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#64748b;">
                If you cancelled by mistake, or have any feedback we can use to improve, just reply to this email — we read everything.
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;"><div style="height:1px;background-color:#e2e8f0;"></div></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11.5px;color:#94a3b8;">
                Agent Runway · Built for Canadian real estate agents
              </p>
              <p style="margin:0 0 6px;font-size:11.5px;color:#94a3b8;">
                <a href="https://agentrunway.ca" style="color:#1E72F2;text-decoration:none;">agentrunway.ca</a>
              </p>
              <p style="margin:0;font-size:10.5px;color:#cbd5e1;line-height:1.5;">
                &copy; 2026 Agent Runway Inc. &middot; Canada Corporation No. 1786542-2
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `${greeting},

Your Agent Runway Professional subscription has been cancelled.

Your data is safe — your transactions, pipeline, and expense history are all still here.
Your data remains accessible in read-only mode.

You still have access to:
✓ Transaction tracking and GCI calculation
✓ Pipeline management
✓ Expense tracking
✓ Basic dashboard and reports

Whenever you're ready to come back, your full Pro feature set is waiting for you.

View plans and pricing: ${pricingUrl}
Go to your dashboard: ${dashboardUrl}

If you cancelled by mistake or have feedback, just reply to this email.

— The Agent Runway team
https://agentrunway.ca

(c) 2026 Agent Runway Inc. - Canada Corporation No. 1786542-2`;

  return { subject, html, text };
}
