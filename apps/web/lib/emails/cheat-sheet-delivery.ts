/**
 * Canadian Realtor Tax Cheat Sheet — Delivery Email
 *
 * Sent once when an agent submits the email form on
 * /tools/canadian-realtor-tax-cheat-sheet (or any inline `cheat_sheet_*`
 * source on the tax-domain articles).
 *
 * Returns plain-text and HTML versions to pass to Resend.
 */

const LOGO_URL = "https://agentrunway.ca/logo.png";
const BADGE_CLEARED_URL = "https://agentrunway.ca/brand/badges/cleared-for-takeoff.png";

interface CheatSheetDeliveryOptions {
  /** First name — falls back to "there" if unavailable */
  firstName?: string | null;
  /** Public URL of the static PDF asset. Dated filename is intentional so
   *  the artifact + email body remain in sync at the year level. When 2026
   *  rates land, ship a new dated file and update this constant. */
  pdfUrl?: string;
  /** Estimator URL surfaced as a related-tool nudge */
  estimatorUrl?: string;
  /** Per-recipient marketing-list unsubscribe URL (CASL §11). Required for
   *  CASL compliance — the unsubscribe mechanism must be set out clearly in
   *  the message body, not just the SMTP List-Unsubscribe header. */
  unsubscribeUrl: string;
}

export function cheatSheetDeliveryEmail({
  firstName,
  pdfUrl = "https://agentrunway.ca/canadian-realtor-tax-cheat-sheet-2025.pdf",
  estimatorUrl = "https://agentrunway.ca/tools/realtor-tax-estimator",
  unsubscribeUrl,
}: CheatSheetDeliveryOptions): { subject: string; html: string; text: string } {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";
  const subject = "Your Canadian Realtor Tax Cheat Sheet (2025)";

  /* ─── Checklist item helper ────────────────────────────────────────
   * badge: background colour from the brand palette
   * num:   1-based position shown in the badge
   * title: bold line
   * sub:   secondary descriptor
   * bg:    row background (#f8fafc alternating with #fff) */
  const row = (
    badge: string,
    num: number,
    title: string,
    sub: string,
    bg: string
  ) => `
    <tr style="background:${bg};">
      <td style="width:52px;padding:14px 0 14px 18px;vertical-align:middle;">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:28px;height:28px;background:${badge};border-radius:6px;text-align:center;vertical-align:middle;line-height:28px;">
              <span style="color:#ffffff;font-size:13px;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${num}</span>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:14px 18px 14px 10px;vertical-align:middle;">
        <div style="font-size:13.5px;font-weight:700;color:#0f172a;line-height:1.3;">${title}</div>
        <div style="font-size:11.5px;color:#64748b;line-height:1.4;margin-top:2px;">${sub}</div>
      </td>
    </tr>
    <tr><td colspan="2" style="background:#e2e8f0;height:1px;font-size:0;line-height:0;padding:0;">&nbsp;</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eaf2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e8eaf2;padding:32px 16px 48px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

          <!-- ── Wordmark bar ── -->
          <tr>
            <td style="padding:0 0 18px;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${LOGO_URL}" width="32" height="32" alt="Agent Runway" style="display:block;border:0;border-radius:7px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:16px;font-weight:800;color:#0d1f44;letter-spacing:-0.3px;">Agent Runway</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Main card ── -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);">

              <!-- ── Hero ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#0d1f44" style="background:linear-gradient(150deg,#071428 0%,#0d1f44 60%,#142d5e 100%);padding:44px 40px 0;text-align:center;">

                    <!-- Amber accent bar above badge -->
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:18px;">
                      <tr>
                        <td style="background:rgba(240,168,0,0.18);border:1px solid rgba(240,168,0,0.45);border-radius:20px;padding:5px 16px;">
                          <span style="color:#F0A800;font-size:10.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Free Resource &nbsp;&middot;&nbsp; 2025 Tax Year</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Headline -->
                    <div style="color:#ffffff;font-size:27px;font-weight:800;line-height:1.2;letter-spacing:-0.6px;margin-bottom:10px;">
                      Your cheat sheet<br/>is ready to download.
                    </div>
                    <div style="color:#c4d9f0;font-size:14px;line-height:1.6;margin-bottom:36px;">
                      One page. Every figure cited to the CRA.
                    </div>

                    <!-- CSS PDF-preview card -->
                    <table cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="background:#ffffff;border-radius:10px 10px 0 0;width:228px;padding:16px 18px 14px;border-top:4px solid #F0A800;box-shadow:0 -6px 24px rgba(0,0,0,0.28);">

                          <!-- Card header with AR logo -->
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:11px;">
                            <tr>
                              <td style="width:26px;vertical-align:middle;">
                                <img src="${LOGO_URL}" width="22" height="22" alt="" style="display:block;border:0;border-radius:5px;" />
                              </td>
                              <td style="padding-left:8px;vertical-align:middle;">
                                <div style="font-size:8px;font-weight:800;color:#0d1f44;line-height:1.2;letter-spacing:0.02em;">CANADIAN REALTOR</div>
                                <div style="font-size:7px;font-weight:600;color:#64748b;line-height:1.2;text-transform:uppercase;letter-spacing:0.06em;">Tax Cheat Sheet · 2025</div>
                              </td>
                            </tr>
                          </table>

                          <!-- Section A -->
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:5px;">
                            <tr>
                              <td style="background:#eff6ff;border-left:3px solid #2d82f5;border-radius:0 4px 4px 0;padding:5px 8px;">
                                <div style="font-size:6.5px;font-weight:800;color:#1e40af;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">A &middot; Federal + Provincial Brackets</div>
                                <div style="height:3.5px;background:#bfdbfe;border-radius:2px;margin-bottom:2px;width:100%;"></div>
                                <div style="height:3.5px;background:#bfdbfe;border-radius:2px;width:75%;"></div>
                              </td>
                            </tr>
                          </table>

                          <!-- Section B -->
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:5px;">
                            <tr>
                              <td style="background:#f0fdf4;border-left:3px solid #0d9488;border-radius:0 4px 4px 0;padding:5px 8px;">
                                <div style="font-size:6.5px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">B &middot; Self-Employed CPP1 + CPP2</div>
                                <div style="height:3.5px;background:#99f6e4;border-radius:2px;margin-bottom:2px;width:90%;"></div>
                                <div style="height:3.5px;background:#99f6e4;border-radius:2px;width:60%;"></div>
                              </td>
                            </tr>
                          </table>

                          <!-- Section C -->
                          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:5px;">
                            <tr>
                              <td style="background:#fffbeb;border-left:3px solid #d97706;border-radius:0 4px 4px 0;padding:5px 8px;">
                                <div style="font-size:6.5px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">C &middot; GST / HST Thresholds</div>
                                <div style="height:3.5px;background:#fde68a;border-radius:2px;margin-bottom:2px;width:85%;"></div>
                                <div style="height:3.5px;background:#fde68a;border-radius:2px;width:70%;"></div>
                              </td>
                            </tr>
                          </table>

                          <!-- Section D -->
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#f5f3ff;border-left:3px solid #1245a5;border-radius:0 4px 4px 0;padding:5px 8px;">
                                <div style="font-size:6.5px;font-weight:800;color:#1e1b4b;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">D &middot; 2026 Deadlines &middot; T2125 Lines</div>
                                <div style="height:3.5px;background:#c7d2fe;border-radius:2px;margin-bottom:2px;width:100%;"></div>
                                <div style="height:3.5px;background:#c7d2fe;border-radius:2px;width:80%;"></div>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- ── Body ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:36px 40px 8px;">

                    <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;">
                      ${greeting},
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#475569;">
                      Your one-page reference card is ready. Print it, pin it above your desk, or hand a copy to your accountant &mdash; every figure is sourced to a primary CRA URL.
                    </p>

                    <!-- CTA button -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">
                      <tr>
                        <td align="center">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="border-radius:11px;background:linear-gradient(135deg,#f0a800 0%,#d97706 100%);">
                                <a href="${pdfUrl}" target="_blank" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:800;color:#1c0f00;text-decoration:none;border-radius:11px;letter-spacing:-0.2px;">
                                  Download the cheat sheet (PDF)
                                </a>
                              </td>
                            </tr>
                          </table>
                          <div style="margin-top:8px;font-size:11px;color:#94a3b8;letter-spacing:0.02em;">One page &nbsp;&middot;&nbsp; Printable &nbsp;&middot;&nbsp; CRA-cited &nbsp;&middot;&nbsp; 2025 figures</div>
                        </td>
                      </tr>
                    </table>

                    <!-- Cleared for Takeoff badge -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
                      <tr>
                        <td align="center">
                          <img src="${BADGE_CLEARED_URL}" width="80" height="80" alt="Cleared for Takeoff" style="display:block;border:0;" />
                        </td>
                      </tr>
                    </table>

                    <!-- Section label -->
                    <div style="font-size:11px;font-weight:700;color:#0d1f44;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #0d1f44;display:inline-block;">What&rsquo;s inside</div>

                  </td>
                </tr>
              </table>

              <!-- ── Checklist ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 40px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
                      ${row("#2d82f5", 1, "2025 federal + provincial tax brackets", "All 13 provinces and territories at a glance", "#f8fafc")}
                      ${row("#0d9488", 2, "Self-employed CPP1 + CPP2 figures", "Rates, ceilings, YMPE &amp; YAMPE &mdash; exact 2025 values", "#ffffff")}
                      ${row("#d97706", 3, "GST/HST registration threshold + provincial rates", "The $30K threshold + every province-specific rate", "#f8fafc")}
                      ${row("#1245a5", 4, "2026 deadlines for the 2025 tax year", "Filing, instalment, and GST/HST remittance dates", "#ffffff")}
                      ${row("#0d1f44", 5, "T2125 categories + 10 commonly-deducted lines", "Business-use-of-home, vehicle, marketing, and more", "#f8fafc")}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- ── Disclaimer ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 40px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:4px solid #2d82f5;background:#f0f7ff;border-radius:0 8px 8px 0;">
                      <tr>
                        <td style="padding:12px 16px;font-size:12px;line-height:1.65;color:#1e40af;font-style:italic;">
                          Every figure is sourced to a primary CRA URL. This card is information, not advice &mdash; verify with your accountant before any filing decision.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- ── Divider ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 40px 0;">
                    <div style="height:1px;background:#e2e8f0;"></div>
                  </td>
                </tr>
              </table>

              <!-- ── Estimator nudge ── -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:28px 40px 36px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;">
                      <tr>
                        <td bgcolor="#071428" style="background:linear-gradient(145deg,#071428 0%,#0d1f44 100%);border-radius:12px;padding:24px 26px 22px;">

                          <!-- Logo + label row -->
                          <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                            <tr>
                              <td style="vertical-align:middle;padding-right:8px;">
                                <img src="${LOGO_URL}" width="24" height="24" alt="Agent Runway" style="display:block;border:0;border-radius:5px;" />
                              </td>
                              <td style="vertical-align:middle;">
                                <span style="font-size:10px;font-weight:700;color:#F0A800;text-transform:uppercase;letter-spacing:0.1em;">Free Tool</span>
                              </td>
                            </tr>
                          </table>

                          <div style="font-size:16px;font-weight:700;color:#f0f6ff;line-height:1.3;margin-bottom:8px;">
                            Want to see what your own numbers look like?
                          </div>
                          <div style="font-size:13px;color:#c4d9f0;line-height:1.6;margin-bottom:18px;">
                            Plug in your GCI and the live tax estimator calculates your estimated federal + provincial tax, CPP, and HST &mdash; built for Canadian agents.
                          </div>
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#ffffff;border-radius:8px;">
                                <a href="${estimatorUrl}" target="_blank" style="display:inline-block;padding:10px 22px;font-size:13px;font-weight:700;color:#0d1f44;text-decoration:none;border-radius:8px;letter-spacing:-0.1px;">
                                  Try the live tax estimator &rarr;
                                </a>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
          <!-- End main card -->

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:22px 0 0;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#64748b;font-weight:600;">
                Agent Runway &mdash; built for Canadian real estate agents.
              </p>
              <p style="margin:0 0 10px;font-size:12px;">
                <a href="https://agentrunway.ca" style="color:#64748b;text-decoration:underline;">agentrunway.ca</a>
              </p>
              <p style="margin:0 0 4px;font-size:10px;color:#94a3b8;line-height:1.6;">
                You&rsquo;re receiving this because you requested the cheat sheet at agentrunway.ca.
              </p>
              <p style="margin:0 0 4px;font-size:10px;color:#94a3b8;line-height:1.6;">
                Agent Runway Inc. &middot; Saint John, NB, Canada &middot; &copy; 2026 &middot; Canada Corporation No. 1786542-2
              </p>
              <p style="margin:0;font-size:11px;line-height:1.6;">
                <a href="${unsubscribeUrl}" style="color:#475569;text-decoration:underline;font-weight:600;">Unsubscribe</a>
                <span style="color:#cbd5e1;">&nbsp;&middot;&nbsp;</span>
                <a href="https://agentrunway.ca" style="color:#94a3b8;text-decoration:none;">agentrunway.ca</a>
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

What's inside:
1. 2025 federal + provincial tax brackets — all 13 provinces and territories at a glance
2. Self-employed CPP1 + CPP2 figures — rates, ceilings, YMPE & YAMPE, exact 2025 values
3. GST/HST registration threshold + provincial rates — the $30K threshold + every province-specific rate
4. 2026 deadlines for the 2025 tax year — filing, instalment, and GST/HST remittance dates
5. T2125 categories + 10 commonly-deducted lines — business-use-of-home, vehicle, marketing, and more

Every figure is sourced to a primary CRA URL. This card is information,
not advice — verify with your accountant before any filing decision.

---

Want to see what your own numbers look like?
The live tax estimator calculates your estimated federal + provincial tax, CPP,
and HST from your GCI — built for Canadian agents.

Try it: ${estimatorUrl}

---
Agent Runway - built for Canadian real estate agents.
https://agentrunway.ca

You're receiving this because you requested the cheat sheet at agentrunway.ca.
Agent Runway Inc. - Saint John, NB, Canada - (c) 2026 - Canada Corporation No. 1786542-2

Unsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
