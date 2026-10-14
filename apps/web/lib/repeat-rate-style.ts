/**
 * Tailwind classes for a repeat rate tone.
 *
 * The tone comes from `repeatRateBand()` (REPEAT_RATE_BANDS in
 * packages/core/engines/repeat-rate-bands.ts): which band a rate is in is
 * decided there, for every screen. This file only says what each tone looks
 * like on a web page, so no page re-encodes the cut-offs to pick a class.
 *
 * One hue, deeper as the rate rises. Not emerald, amber or red: on the
 * dashboard those mean healthy, watch and concern, and these bands pass no
 * judgement on a rate.
 */
import type { RepeatRateTone } from "@agent-runway/core/engines/repeat-rate-bands";

const TINTED_CARD = "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50";

export const REPEAT_RATE_TONE_CLASS: Record<RepeatRateTone, { card: string; icon: string; bar: string }> = {
  slate:       { card: "border-border", icon: "text-muted-foreground", bar: "bg-slate-300" },
  lightViolet: { card: TINTED_CARD,     icon: "text-violet-500",       bar: "bg-violet-400" },
  violet:      { card: TINTED_CARD,     icon: "text-violet-500",       bar: "bg-violet-500" },
};
