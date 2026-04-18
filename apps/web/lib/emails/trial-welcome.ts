/**
 * Trial Welcome Email
 *
 * Sent when a user starts their 14-day free Professional trial via Stripe
 * checkout (checkout.session.completed with payment_status "no_payment_required").
 *
 * Returns plain-text and HTML versions to pass to Resend.
 */

interface TrialWelcomeOptions {
  /** Display name shown in the greeting — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Dashboard URL for the primary CTA */
  dashboardUrl?: string;
  /** Trial end date in a human-readable format, e.g. "March 21, 2026" */
  trialEndsOn?: string;
}

export function trialWelcomeEmail({
  firstName,
  dashboardUrl = "https://agentrunway.ca/dashboard",
  trialEndsOn,
}: TrialWelcomeOptions = {}): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";
  const trialLine = trialEndsOn
    ? `Your free trial runs until <strong>${trialEndsOn}</strong> — no credit card required and no charges until the trial ends.`
    : `Your 14-day free trial has started — no credit card required and no charges until the trial ends.`;

  const subject = "Your Agent Runway Professional trial has started 🚀";

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
            <td height="4" style="background:linear-gradient(90deg,#F97316 0%,#1E72F2 40%,#7C3AED 70%,#10B981 100%);line-height:4px;font-size:4px;">&nbsp;</td>
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
              <div style="color:#8ba8d4;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">Business Analytics</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px;">

              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${greeting}, your Professional trial is live! 🎉
              </h1>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
                ${trialLine}
              </p>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
                Here's what's now unlocked for you:
              </p>

              <!-- Feature list -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                ${[
                  ["🏆", "Runway Score", "A-to-F health grade across 5 business dimensions"],
                  ["🤖", "AI Business Assistant", "GPT-powered Q&A about your specific numbers"],
                  ["📊", "Probability Forecast", "P10–P90 income bands for the months ahead"],
                  ["💰", "Tax Estimates", "Quarterly instalment targets + per-deal set-aside"],
                  ["📈", "5-Year Growth Plan", "Long-range projections with widening uncertainty bands"],
                  ["🎯", "Business Insights", "Ranked action items with evidence and impact scores"],
                ].map(([icon, title, desc]) => `
                <tr>
                  <td style="padding:7px 0;vertical-align:top;width:28px;font-size:16px;">${icon}</td>
                  <td style="padding:7px 0;vertical-align:top;">
                    <span style="font-size:14px;font-weight:600;color:#1e3a5f;">${title}</span>
                    <span style="font-size:13px;color:#64748b;"> — ${desc}</span>
                  </td>
                </tr>`).join("")}
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;background-color:#1E72F2;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.01em;">
                      Open My Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#64748b;">
                If you have any questions or feedback, just reply to this email — we read every message.
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
                You're receiving this because you started a trial at
                <a href="https://agentrunway.ca" style="color:#1E72F2;text-decoration:none;">agentrunway.ca</a>.
                &nbsp;·&nbsp;
                <a href="https://agentrunway.ca/settings" style="color:#1E72F2;text-decoration:none;">Manage subscription</a>
              </p>
              <p style="margin:0;font-size:10.5px;color:#cbd5e1;line-height:1.5;">
                &copy; 2026 Agent Runway Inc. &middot; Canada Corporation No. 1786542-2
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `${greeting},

Your Agent Runway Professional trial is now live!

${trialEndsOn ? `Your free trial runs until ${trialEndsOn}` : "Your 14-day free trial has started"} — no credit card required.

What's unlocked:
• Runway Score — A-to-F health grade across 5 business dimensions
• AI Business Assistant — GPT-powered Q&A about your specific numbers
• Probability Forecast — P10–P90 income bands for the months ahead
• Tax Estimates — Quarterly instalment targets + per-deal set-aside
• 5-Year Growth Plan — Long-range projections with widening uncertainty bands
• Business Insights — Ranked action items with evidence and impact scores

Open your dashboard: ${dashboardUrl}

If you have any questions, just reply to this email.

— The Agent Runway team
https://agentrunway.ca

(c) 2026 Agent Runway Inc. - Canada Corporation No. 1786542-2`;

  return { subject, html, text };
}

/**
 * Format a Unix timestamp (seconds) as a human-readable date string.
 * e.g. 1742000000 → "March 10, 2025"
 */
export function formatTrialEndDate(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
