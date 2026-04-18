/**
 * Payment Failed Email
 *
 * Sent when a Stripe invoice.payment_failed event occurs.
 * Content escalates across three attempts (Day 1, Day 3, Day 7).
 */

interface PaymentFailedOptions {
  /** First name for personalized greeting — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Which retry attempt this is: 1, 2, or 3 */
  attemptNumber: number;
  /** Formatted date string for the next automatic retry */
  nextRetryDate?: string;
  /** URL to update payment method — defaults to billing portal */
  updatePaymentUrl?: string;
  /** Dashboard URL */
  dashboardUrl?: string;
}

export function paymentFailedEmail({
  firstName,
  attemptNumber,
  nextRetryDate,
  updatePaymentUrl = "https://agentrunway.ca/dashboard/billing",
  dashboardUrl = "https://agentrunway.ca/dashboard",
}: PaymentFailedOptions): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  // --- Content that varies by attempt ---

  const subjects: Record<number, string> = {
    1: "Heads up — we had trouble processing your payment",
    2: "Action needed — your payment still couldn't be processed",
    3: "Final notice — please update your payment method",
  };

  const headlines: Record<number, string> = {
    1: `${greeting}, we had trouble with your payment`,
    2: `${greeting}, your payment still couldn't be processed`,
    3: `${greeting}, this is our final payment attempt`,
  };

  const bodyParagraphs: Record<number, string> = {
    1: `We had trouble processing your latest Agent Runway payment. This happens sometimes — your card may have expired or your bank flagged the charge.${
      nextRetryDate
        ? ` We'll try again automatically on <strong>${nextRetryDate}</strong>.`
        : " We'll retry automatically in a few days."
    }`,
    2: `We've now tried twice to process your payment, but it still didn't go through. To avoid any interruption to your Professional features, please update your payment method.${
      nextRetryDate
        ? ` Our next — and final — retry will be on <strong>${nextRetryDate}</strong>.`
        : ""
    }`,
    3: "This was our final attempt to process your payment. If we're unable to collect payment, your account will lose access to Professional features. Please update your payment method now.",
  };

  const calloutMessages: Record<number, string> = {
    1: "Your data is safe and your account remains fully active during this time. No features have been affected.",
    2: "Your data is safe and your account remains active, but please act soon to avoid losing access to Professional features.",
    3: "Your data is safe regardless of what happens — your transactions, pipeline, and expense history will remain accessible.",
  };

  const subject = subjects[attemptNumber] ?? subjects[1];
  const headline = headlines[attemptNumber] ?? headlines[1];
  const bodyParagraph = bodyParagraphs[attemptNumber] ?? bodyParagraphs[1];
  const calloutMessage = calloutMessages[attemptNumber] ?? calloutMessages[1];

  const buttonLabel =
    attemptNumber === 3
      ? "Update Payment Method Now"
      : "Update Payment Method";

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
                ${headline}
              </h1>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">
                ${bodyParagraph}
              </p>

              <!-- Warning callout (amber) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;background-color:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="display:flex;align-items:flex-start;gap:10px;">
                      <span style="font-size:18px;">&#9888;&#65039;</span>
                      <div>
                        <div style="font-size:14px;font-weight:600;color:#92400e;margin-bottom:4px;">Your data is safe</div>
                        <div style="font-size:13px;color:#a16207;line-height:1.5;">
                          ${calloutMessage}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding-bottom:10px;">
                    <a href="${updatePaymentUrl}"
                       style="display:inline-block;background-color:#F97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px;letter-spacing:0.01em;">
                      ${buttonLabel}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="font-size:13.5px;color:#1E72F2;text-decoration:none;">
                      Go to my dashboard &#8594;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13.5px;line-height:1.6;color:#64748b;">
                If you believe this is an error, or need help updating your payment method, just reply to this email — we're happy to help.
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
                Agent Runway &middot; Built for Canadian real estate agents
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

  // --- Plain text version ---

  const textBodies: Record<number, string> = {
    1: `We had trouble processing your latest Agent Runway payment. This happens sometimes — your card may have expired or your bank flagged the charge.${
      nextRetryDate
        ? ` We'll try again automatically on ${nextRetryDate}.`
        : " We'll retry automatically in a few days."
    }`,
    2: `We've now tried twice to process your payment, but it still didn't go through. To avoid any interruption to your Professional features, please update your payment method.${
      nextRetryDate
        ? ` Our next — and final — retry will be on ${nextRetryDate}.`
        : ""
    }`,
    3: "This was our final attempt to process your payment. If we're unable to collect payment, your account will lose access to Professional features. Please update your payment method now.",
  };

  const textCallouts: Record<number, string> = {
    1: "Your data is safe and your account remains fully active during this time.",
    2: "Your data is safe and your account remains active, but please act soon.",
    3: "Your data is safe regardless — your transactions, pipeline, and expense history will remain accessible.",
  };

  const textBody = textBodies[attemptNumber] ?? textBodies[1];
  const textCallout = textCallouts[attemptNumber] ?? textCallouts[1];

  const text = `${greeting},

${textBody}

${textCallout}

Update your payment method: ${updatePaymentUrl}
Go to your dashboard: ${dashboardUrl}

If you believe this is an error or need help, just reply to this email.

— The Agent Runway team
https://agentrunway.ca

(c) 2026 Agent Runway Inc. - Canada Corporation No. 1786542-2`;

  return { subject, html, text };
}
