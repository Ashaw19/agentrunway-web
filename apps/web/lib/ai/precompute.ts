/**
 * Morning Briefing Pre-Computation
 *
 * Generates AI-powered morning briefings using Haiku (models.fast) for
 * cheap, fast generation. Called by the nightly cron job and as an
 * on-demand fallback when the dashboard loads a stale/missing briefing.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { models, heliconeHeaders } from "./provider";

// ── Input Data ───────────────────────────────────────────────────────────────

export interface BriefingData {
  userName: string;
  todayDate: string;
  overdueFollowUps: number;
  pipelineDeals: number;
  pipelineValue: number;
  goalGci: number;
  ytdGci: number;
  pacePercent: number;
  upcomingCloses: { address: string; date: string }[];
  recentAnomalies: string[];
  hotContacts: { name: string; score: number }[];
}

// ── Output Schema ────────────────────────────────────────────────────────────

export const MorningBriefingSchema = z.object({
  greeting: z.string().describe("Personalized good-morning greeting with user name"),
  priorities: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("Top 3-5 prioritized action items for today, specific with numbers"),
  alerts: z
    .array(z.string())
    .max(3)
    .describe("0-3 urgent alerts or anomalies that need attention"),
  encouragement: z
    .string()
    .describe("One sentence of motivational encouragement tied to their progress"),
});

export type MorningBriefing = z.infer<typeof MorningBriefingSchema>;

// ── Generator ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a proactive business coach for a Canadian real estate agent. Generate a concise morning briefing based on their current metrics and pipeline data.

Rules:
- Be specific with numbers (dollar amounts, counts, percentages)
- Priorities should be actionable ("Call Jane Doe about closing on Apr 12" not "Follow up with clients")
- Alerts only for genuinely urgent items (overdue follow-ups, deals closing within 48h, pace falling behind)
- Encouragement should reference a specific achievement or positive trend
- Keep each priority and alert to one sentence
- Use Canadian spelling (colour, centre, etc.)`;

export async function generateMorningBriefing(
  data: BriefingData,
  userId?: string,
): Promise<MorningBriefing> {
  const { object } = await generateObject({
    model: models.fast,
    schema: MorningBriefingSchema,
    system: SYSTEM_PROMPT,
    prompt: `Generate a morning briefing for ${data.userName} on ${data.todayDate}.

Current metrics:
- Overdue follow-ups: ${data.overdueFollowUps}
- Pipeline: ${data.pipelineDeals} deals worth $${data.pipelineValue.toLocaleString()}
- GCI goal: $${data.goalGci.toLocaleString()} | YTD: $${data.ytdGci.toLocaleString()} (${data.pacePercent}% of pace)
- Upcoming closes: ${data.upcomingCloses.length > 0 ? data.upcomingCloses.map((c) => `${c.address} on ${c.date}`).join("; ") : "None in the next 14 days"}
- Hot contacts: ${data.hotContacts.length > 0 ? data.hotContacts.map((c) => `${c.name} (score ${c.score})`).join(", ") : "None flagged"}
- Recent anomalies: ${data.recentAnomalies.length > 0 ? data.recentAnomalies.join("; ") : "None"}`,
    ...(userId
      ? {
          headers: heliconeHeaders({
            userId,
            feature: "morning_briefing",
          }),
        }
      : {}),
  });

  return object;
}
