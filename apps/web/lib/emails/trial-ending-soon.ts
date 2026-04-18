/**
 * Trial Ending Soon Email
 *
 * Sent ~3 days before a free trial expires (customer.subscription.trial_will_end).
 * Encourages the user to upgrade before losing access to Pro features.
 */

interface TrialEndingSoonOptions {
  /** First name for personalized greeting — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Human-readable trial end date, e.g. "March 10, 2026" */
  trialEndsOn?: string;
  /** Upgrade / pricing URL */
  upgradeUrl?: string;
}

export function trialEndingSoonEmail({
  firstName,
  trialEndsOn,
  upgradeUrl = "https://agentrunway.ca/pricing",
}: TrialEndingSoonOptions = {}): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";
  const endLine = trialEndsOn
    ? `Your Agent Runway Professional trial ends on <strong>${trialEndsOn}</strong> — that's 3 days away.`
    : "Your Agent Runway Professional trial ends in 3 days.";

  const subject = "Your Agent Runway trial ends soon — upgrade to keep access";

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
                    <linearGradient id="e-bg2" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#1e2f5e"/>
                      <stop offset="100%" stop-color="#0d1526"/>
                    </linearGradient>
                    <linearGradient id="e-l2" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                    <linearGradient id="e-r2" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#6cb4ff"/>
                      <stop offset="55%" stop-color="#2e7be6"/>
                      <stop offset="100%" stop-color="#1452a8"/>
                    </linearGradient>
                  </defs>
                  <rect width="40" height="40" rx="9" fill="url(#e-bg2)"/>
                  <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#e-l2)"/>
                  <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#e-r2)"/>
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

              <!-- Countdown chip -->
              <div style="display:inline-block;background-color:#FEF3C7;border:1px solid #FCD34D;border-radius:20px;padding:6px 14px;margin-bottom:20px;">
                <span style="font-size:12px;font-weight:700;color:#92400E;">⏳ 3 days remaining</span>
              </div>

              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ${greeting}, your trial is almost over
              </h1>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
                ${endLine}
              </p>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
                After your trial ends, you'll lose access to Professional features. Here's what that includes:
              </p>

              <!-- Feature list -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
                <tr><td style="padding:16px 20px;">
                  ${[
                    ["🏆", "Runway Score", "Your A–F business health grade"],
                    ["🤖", "AI Business Assistant", "GPT-powered Q&A about your numbers"],
                    ["📊", "Probability Forecast", "P10–P90 income bands"],
                    ["💰", "Tax Estimates", "Quarterly instalments + per-deal set-aside"],
                    ["📈", "5-Year Growth Plan", "Long-range projections"],
                    ["🎯", "Business Insights", "Ranked action items with impact scores"],
                  ].map(([icon, title, desc]) => `
                  <div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;">
                    <span style="font-size:15px;line-height:1.4;">${icon}</span>
                    <div>
                      <span style="font-size:13.5px;font-weight:600;color:#1e3a5f;">${title}</span>
                      <span style="font-size:12.5px;color:#64748b;"> — ${desc}</span>
                    </div>
                  </div>`).join("")}
                </td></tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${upgradeUrl}"
                       style="display:inline-block;background-color:#1E72F2;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;letter-spacing:0.01em;">
                      Upgrade to Professional →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;text-align:center;">
                No commitment — cancel anytime.
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
                You're receiving this because your trial is ending at
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

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `${greeting},

Your Agent Runway Professional trial ends in 3 days${trialEndsOn ? ` (${trialEndsOn})` : ""}.

After your trial, you'll lose access to:
• Runway Score — A–F health grade
• AI Business Assistant — GPT-powered Q&A
• Probability Forecast — P10–P90 income bands
• Tax Estimates — quarterly instalments + per-deal set-aside
• 5-Year Growth Plan — long-range projections
• Business Insights — ranked action items

Upgrade now to keep access: ${upgradeUrl}

No commitment — cancel anytime.

— The Agent Runway team
https://agentrunway.ca

(c) 2026 Agent Runway Inc. - Canada Corporation No. 1786542-2`;

  return { subject, html, text };
}
