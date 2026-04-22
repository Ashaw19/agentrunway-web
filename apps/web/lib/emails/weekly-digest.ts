/**
 * Weekly Business Digest Email
 *
 * Sent every Monday morning to Professional-tier subscribers.
 * Summarises key business metrics for the past 7 days and YTD context.
 */

export interface WeeklyDigestData {
  firstName: string | null;
  /** Week date range label, e.g. "Mar 17 – Mar 23, 2026" */
  weekLabel: string;
  /** YTD gross commission income */
  ytdGCI: number;
  /** Goal GCI for the year */
  goalGCI: number;
  /** Pace vs goal as a percentage (e.g. 85 = 85%) */
  paceVsGoalPct: number;
  /** Deals closed in the past 7 days */
  dealsClosedThisWeek: number;
  /** Total YTD deals closed */
  ytdDealsClosed: number;
  /** Pipeline value (weighted) */
  pipelineValue: number;
  /** Number of active pipeline deals */
  pipelineCount: number;
  /** Outreach items ready or queued */
  outreachReady: number;
  /** Upcoming tasks due in the next 7 days */
  upcomingTaskCount: number;
  /** Expenses logged this month */
  monthlyExpenses: number;
  /** Runway Score letter grade (A+ to F) — visual badge only, not prose */
  runwayGrade: string;
  /** Runway Score canonical prose band: Strong / On Track / Building / At Risk */
  runwayStateLabel: string;
  /** Runway Score numeric (0-100) */
  runwayScore: number;
  /** One-line AI insight/tip (optional) */
  aiInsight?: string;
  /** Dashboard URL */
  dashboardUrl?: string;
  /** Unsubscribe URL for one-click opt-out */
  unsubscribeUrl?: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function pctBar(pct: number): string {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const color = clamped >= 90 ? "#10B981" : clamped >= 70 ? "#F59E0B" : "#EF4444";
  return `
    <div style="background-color:#e2e8f0;border-radius:6px;height:8px;width:100%;margin-top:6px;">
      <div style="background-color:${color};border-radius:6px;height:8px;width:${clamped}%;"></div>
    </div>`;
}

export function weeklyDigestEmail(data: WeeklyDigestData): { subject: string; html: string; text: string; unsubscribeUrl?: string } {
  const greeting = data.firstName ? `Hi ${data.firstName}` : "Hi there";
  const dashboardUrl = data.dashboardUrl ?? "https://agentrunway.ca/dashboard";
  const unsubscribeUrl = data.unsubscribeUrl;

  const subject = `Your Week in Review — ${data.weekLabel}`;

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
              <img src="https://agentrunway.ca/logo-email.png" alt="Agent Runway" width="44" height="44" style="display:block;margin:0 auto 12px;" />
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">Weekly Business Digest</div>
              <div style="color:#8ba8d4;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px;">${data.weekLabel}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 16px;">
              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">
                ${greeting}, here's your business snapshot for the week.
              </p>

              <!-- Runway Score Badge -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center;">
                    <span style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Runway Score</span>
                    <div style="font-size:36px;font-weight:800;color:${data.runwayScore >= 80 ? "#10B981" : data.runwayScore >= 60 ? "#F59E0B" : "#EF4444"};margin:4px 0 2px;">${data.runwayGrade}</div>
                    <span style="font-size:13px;color:#94a3b8;">${data.runwayScore}/100</span>
                  </td>
                </tr>
              </table>

              <!-- KPI Grid (2×2) -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
                    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
                      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">YTD GCI</div>
                      <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${fmt(data.ytdGCI)}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;">of ${fmt(data.goalGCI)} goal</div>
                      ${pctBar(data.paceVsGoalPct)}
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
                    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
                      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Deals Closed</div>
                      <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${data.dealsClosedThisWeek} this week</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;">${data.ytdDealsClosed} YTD total</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
                    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
                      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Pipeline</div>
                      <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${fmt(data.pipelineValue)}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;">${data.pipelineCount} active deal${data.pipelineCount !== 1 ? "s" : ""}</div>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
                    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">
                      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Monthly Expenses</div>
                      <div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:4px;">${fmt(data.monthlyExpenses)}</div>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;">this month logged</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Action Items -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;">
                    <div style="font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">This Week's Focus</div>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${data.outreachReady > 0 ? `
                      <tr>
                        <td style="padding:3px 0;font-size:14px;color:#1e3a5f;">
                          <span style="color:#F97316;font-weight:700;">&#x2709;</span>&nbsp; ${data.outreachReady} outreach message${data.outreachReady !== 1 ? "s" : ""} ready to send
                        </td>
                      </tr>` : ""}
                      ${data.upcomingTaskCount > 0 ? `
                      <tr>
                        <td style="padding:3px 0;font-size:14px;color:#1e3a5f;">
                          <span style="color:#7C3AED;font-weight:700;">&#x2611;</span>&nbsp; ${data.upcomingTaskCount} task${data.upcomingTaskCount !== 1 ? "s" : ""} due this week
                        </td>
                      </tr>` : ""}
                      ${data.outreachReady === 0 && data.upcomingTaskCount === 0 ? `
                      <tr>
                        <td style="padding:3px 0;font-size:14px;color:#1e3a5f;">
                          <span style="color:#10B981;font-weight:700;">&#x2713;</span>&nbsp; All caught up! No pending outreach or tasks.
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              ${data.aiInsight ? `
              <!-- AI Insight -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px 20px;">
                    <div style="font-size:12px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">AI Insight</div>
                    <div style="font-size:14px;line-height:1.55;color:#334155;">${data.aiInsight}</div>
                  </td>
                </tr>
              </table>` : ""}

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;background-color:#1E72F2;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.01em;">
                      Open Dashboard →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;text-align:center;">
                Have a great week ahead!
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
                You're receiving this weekly digest as a Professional subscriber at
                <a href="https://agentrunway.ca" style="color:#1E72F2;text-decoration:none;">agentrunway.ca</a>.
                &nbsp;&middot;&nbsp;
                <a href="https://agentrunway.ca/settings" style="color:#1E72F2;text-decoration:none;">Manage preferences</a>
                ${unsubscribeUrl ? `&nbsp;&middot;&nbsp;
                <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:none;">Unsubscribe from weekly digest</a>` : ""}
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

  const paceEmoji = data.paceVsGoalPct >= 90 ? "🟢" : data.paceVsGoalPct >= 70 ? "🟡" : "🔴";

  const text = `${greeting}, here's your business snapshot for ${data.weekLabel}.

RUNWAY SCORE: ${data.runwayScore}/100 — ${data.runwayStateLabel}

${paceEmoji} YTD GCI: ${fmt(data.ytdGCI)} of ${fmt(data.goalGCI)} goal (${data.paceVsGoalPct}% pace)
📊 Deals closed this week: ${data.dealsClosedThisWeek} (${data.ytdDealsClosed} YTD)
📋 Pipeline: ${fmt(data.pipelineValue)} across ${data.pipelineCount} deal(s)
💰 Monthly expenses: ${fmt(data.monthlyExpenses)}

THIS WEEK'S FOCUS:
${data.outreachReady > 0 ? `• ${data.outreachReady} outreach message(s) ready to send` : ""}
${data.upcomingTaskCount > 0 ? `• ${data.upcomingTaskCount} task(s) due this week` : ""}
${data.outreachReady === 0 && data.upcomingTaskCount === 0 ? "• All caught up! No pending outreach or tasks." : ""}

${data.aiInsight ? `AI INSIGHT: ${data.aiInsight}\n` : ""}
Open your dashboard: ${dashboardUrl}

Have a great week!
— Agent Runway
https://agentrunway.ca

(c) 2026 Agent Runway Inc. - Canada Corporation No. 1786542-2
${unsubscribeUrl ? `\nUnsubscribe from weekly digest: ${unsubscribeUrl}` : ""}`;

  return { subject, html, text, unsubscribeUrl };
}
