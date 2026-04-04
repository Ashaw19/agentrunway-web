/**
 * Nurture Sequence Engine
 *
 * Defines the step templates for post-close nurture sequences.
 * Each step specifies timing (days after trigger), outreach type, and
 * content generation hints. The actual email generation happens via AI
 * when the step becomes due.
 *
 * IMPORTANT — CASL COMPLIANCE:
 * This engine ONLY generates drafts and schedules reminders.
 * Emails are NEVER sent automatically. The user must always
 * review and explicitly click "Send" for every outreach message.
 * No cron job or background process may bypass this requirement.
 */

export interface NurtureStep {
  step: number;
  days_after_trigger: number;
  label: string;
  outreach_type: string;
  content_hint: string;
  requires_consent: boolean;
}

export interface NurtureTemplate {
  type: string;
  name: string;
  description: string;
  steps: NurtureStep[];
}

/** 12-month post-close nurture sequence */
export const POST_CLOSE_TEMPLATE: NurtureTemplate = {
  type: "post_close",
  name: "Post-Close Nurture",
  description: "12-month relationship maintenance sequence after closing a deal",
  steps: [
    { step: 0, days_after_trigger: 1, label: "Congratulations", outreach_type: "email", content_hint: "Congratulations on the close. Include settlement checklist reminders (utility transfers, address change, insurance). Personal and warm.", requires_consent: false },
    { step: 1, days_after_trigger: 30, label: "Settling In Check-In", outreach_type: "email", content_hint: "Check how they're settling in. Offer to help with any post-move questions. Share a seasonal home maintenance tip relevant to the current season.", requires_consent: true },
    { step: 2, days_after_trigger: 90, label: "Market Update", outreach_type: "email", content_hint: "Share a brief local market update for their neighbourhood. Include recent comparable sales if available. Position as keeping them informed about their investment.", requires_consent: true },
    { step: 3, days_after_trigger: 180, label: "Home Value Estimate", outreach_type: "email", content_hint: "6-month check-in approaching their half-anniversary. Share an estimated current value of their home. Mention any neighbourhood developments.", requires_consent: true },
    { step: 4, days_after_trigger: 270, label: "Referral Ask", outreach_type: "email", content_hint: "Warm referral ask. Mention you've enjoyed working with them and ask if they know anyone thinking about buying or selling. Keep it soft, not salesy.", requires_consent: true },
    { step: 5, days_after_trigger: 365, label: "Move-iversary", outreach_type: "email", content_hint: "Celebrate their 1-year move-iversary. Include a year-in-review of their home's value change. Brief local market summary. Express genuine appreciation.", requires_consent: true },
  ],
};

/** Re-engagement sequence for cold contacts */
export const RE_ENGAGEMENT_TEMPLATE: NurtureTemplate = {
  type: "re_engagement",
  name: "Re-Engagement",
  description: "3-touch sequence for contacts who have gone cold",
  steps: [
    { step: 0, days_after_trigger: 0, label: "Value Check-In", outreach_type: "email", content_hint: "Share something valuable — a market insight or neighbourhood news relevant to them. No ask, pure value.", requires_consent: true },
    { step: 1, days_after_trigger: 14, label: "Personal Touch", outreach_type: "email", content_hint: "Personal note referencing something specific about them (from client memory). Ask how things are going.", requires_consent: true },
    { step: 2, days_after_trigger: 30, label: "Soft Reconnect", outreach_type: "email", content_hint: "Light touchpoint — share a relevant article or event. Mention you're available if they ever need anything real estate related.", requires_consent: true },
  ],
};

export const NURTURE_TEMPLATES: Record<string, NurtureTemplate> = {
  post_close: POST_CLOSE_TEMPLATE,
  re_engagement: RE_ENGAGEMENT_TEMPLATE,
};

/**
 * Get the next step in a nurture sequence.
 * Returns null if the sequence is complete.
 */
export function getNextStep(templateType: string, currentStep: number): NurtureStep | null {
  const template = NURTURE_TEMPLATES[templateType];
  if (!template) return null;
  const nextStep = template.steps.find(s => s.step === currentStep + 1);
  return nextStep ?? null;
}

/**
 * Calculate the next send date based on template timing.
 */
export function calculateNextSendDate(
  templateType: string,
  currentStep: number,
  triggerDate: Date
): Date | null {
  const next = getNextStep(templateType, currentStep);
  if (!next) return null;
  const sendDate = new Date(triggerDate);
  sendDate.setDate(sendDate.getDate() + next.days_after_trigger);
  return sendDate;
}

/**
 * Check if a sequence is complete.
 */
export function isSequenceComplete(templateType: string, currentStep: number): boolean {
  const template = NURTURE_TEMPLATES[templateType];
  if (!template) return true;
  return currentStep >= template.steps.length - 1;
}

/**
 * Get a human-readable summary of the template.
 */
export function getTemplateSummary(templateType: string): { name: string; stepCount: number; durationDays: number } | null {
  const template = NURTURE_TEMPLATES[templateType];
  if (!template) return null;
  const lastStep = template.steps[template.steps.length - 1];
  return {
    name: template.name,
    stepCount: template.steps.length,
    durationDays: lastStep?.days_after_trigger ?? 0,
  };
}
