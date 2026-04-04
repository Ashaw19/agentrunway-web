/**
 * Email Warm-Up System
 *
 * Enforces sending limits to build email reputation:
 * Week 1-2: 5/day -> 10/day
 * Week 3-4: 10/day -> 25/day
 * Week 5-6: 25/day -> 50/day
 * Week 7+:  50/day -> 100/day
 *
 * Auto-pauses if bounce rate > 5% or complaint rate > 0.1%
 */

import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function todayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface WarmupStatus {
  id: string;
  user_id: string;
  provider: string;
  daily_sends_today: number;
  daily_limit: number;
  warmup_start_date: string;
  total_sends: number;
  bounce_count: number;
  complaint_count: number;
  paused: boolean;
  pause_reason: string | null;
  last_send_at: string | null;
  updated_at: string;
}

export interface CanSendResult {
  allowed: boolean;
  reason?: string;
  remaining: number;
  dailyLimit: number;
}

// ── Daily limit calculation ─────────────────────────────────────────────────────

/**
 * Calculate the current daily limit based on warmup age.
 */
export function calculateDailyLimit(warmupStartDate: Date, now: Date = new Date()): number {
  const daysSinceStart = Math.floor(
    (now.getTime() - warmupStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceStart < 7) return 5;
  if (daysSinceStart < 14) return 10;
  if (daysSinceStart < 21) return 25;
  if (daysSinceStart < 28) return 50;
  if (daysSinceStart < 42) return 75;
  return 100;
}

// ── Core functions ──────────────────────────────────────────────────────────────

/**
 * Check if a user can send an email right now.
 * Returns { allowed, reason, remaining, dailyLimit }.
 */
export async function canSendEmail(
  userId: string,
  provider: string = "gmail"
): Promise<CanSendResult> {
  const db = serviceClient();

  const { data: status } = await db
    .from("email_warmup_status")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  // No warmup record = first time, create one
  if (!status) {
    await db.from("email_warmup_status").insert({
      user_id: userId,
      provider,
      daily_sends_today: 0,
      daily_limit: 5,
      warmup_start_date: todayUTC(),
    });
    return { allowed: true, remaining: 5, dailyLimit: 5 };
  }

  // Check if paused
  if (status.paused) {
    return {
      allowed: false,
      reason: status.pause_reason || "Sending paused due to deliverability issues",
      remaining: 0,
      dailyLimit: status.daily_limit,
    };
  }

  // Calculate current limit based on warmup age
  const currentLimit = calculateDailyLimit(new Date(status.warmup_start_date));

  // Reset daily count if last send was a different day
  const today = todayUTC();
  const lastSendDay = status.last_send_at
    ? new Date(status.last_send_at).toISOString().split("T")[0]
    : null;
  const dailySends = lastSendDay === today ? status.daily_sends_today : 0;

  if (dailySends >= currentLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${currentLimit}/day). Limit increases as your sending reputation builds.`,
      remaining: 0,
      dailyLimit: currentLimit,
    };
  }

  // Check bounce/complaint rates after a meaningful sample
  if (status.total_sends > 20) {
    const bounceRate = status.bounce_count / status.total_sends;
    const complaintRate = status.complaint_count / status.total_sends;

    if (bounceRate > 0.05) {
      await db
        .from("email_warmup_status")
        .update({
          paused: true,
          pause_reason: `Bounce rate too high (${(bounceRate * 100).toFixed(1)}%). Review your contact list quality.`,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("provider", provider);
      return {
        allowed: false,
        reason: "Sending paused: bounce rate too high",
        remaining: 0,
        dailyLimit: currentLimit,
      };
    }

    if (complaintRate > 0.001) {
      await db
        .from("email_warmup_status")
        .update({
          paused: true,
          pause_reason: `Complaint rate too high (${(complaintRate * 100).toFixed(2)}%).`,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("provider", provider);
      return {
        allowed: false,
        reason: "Sending paused: complaint rate too high",
        remaining: 0,
        dailyLimit: currentLimit,
      };
    }
  }

  return { allowed: true, remaining: currentLimit - dailySends, dailyLimit: currentLimit };
}

/**
 * Record a sent email. Call after successful send.
 */
export async function recordSend(
  userId: string,
  provider: string = "gmail"
): Promise<void> {
  const db = serviceClient();
  const now = new Date();
  const today = todayUTC();

  const { data: existing } = await db
    .from("email_warmup_status")
    .select("daily_sends_today, total_sends, last_send_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (!existing) {
    await db.from("email_warmup_status").insert({
      user_id: userId,
      provider,
      daily_sends_today: 1,
      total_sends: 1,
      warmup_start_date: today,
      last_send_at: now.toISOString(),
    });
    return;
  }

  const lastSendDay = existing.last_send_at
    ? new Date(existing.last_send_at).toISOString().split("T")[0]
    : null;
  const dailySends = lastSendDay === today ? existing.daily_sends_today + 1 : 1;

  await db
    .from("email_warmup_status")
    .update({
      daily_sends_today: dailySends,
      total_sends: existing.total_sends + 1,
      last_send_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
}

/**
 * Record a bounce event. Call when a bounce notification is received.
 */
export async function recordBounce(
  userId: string,
  provider: string = "gmail"
): Promise<void> {
  const db = serviceClient();

  const { data: existing } = await db
    .from("email_warmup_status")
    .select("bounce_count")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (!existing) return;

  await db
    .from("email_warmup_status")
    .update({
      bounce_count: existing.bounce_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
}

/**
 * Record a complaint event (spam report). Call when a complaint notification is received.
 */
export async function recordComplaint(
  userId: string,
  provider: string = "gmail"
): Promise<void> {
  const db = serviceClient();

  const { data: existing } = await db
    .from("email_warmup_status")
    .select("complaint_count")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (!existing) return;

  await db
    .from("email_warmup_status")
    .update({
      complaint_count: existing.complaint_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
}

/**
 * Get the current warmup status for UI display.
 */
export async function getWarmupStatus(
  userId: string,
  provider: string = "gmail"
): Promise<{
  exists: boolean;
  status: WarmupStatus | null;
  currentLimit: number;
  dailySendsToday: number;
  remaining: number;
  warmupDay: number;
  paused: boolean;
  pauseReason: string | null;
}> {
  const db = serviceClient();

  const { data: status } = await db
    .from("email_warmup_status")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (!status) {
    return {
      exists: false,
      status: null,
      currentLimit: 5,
      dailySendsToday: 0,
      remaining: 5,
      warmupDay: 0,
      paused: false,
      pauseReason: null,
    };
  }

  const now = new Date();
  const startDate = new Date(status.warmup_start_date);
  const warmupDay = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentLimit = calculateDailyLimit(startDate, now);

  const today = todayUTC();
  const lastSendDay = status.last_send_at
    ? new Date(status.last_send_at).toISOString().split("T")[0]
    : null;
  const dailySendsToday = lastSendDay === today ? status.daily_sends_today : 0;

  return {
    exists: true,
    status: status as WarmupStatus,
    currentLimit,
    dailySendsToday,
    remaining: Math.max(0, currentLimit - dailySendsToday),
    warmupDay,
    paused: status.paused,
    pauseReason: status.pause_reason,
  };
}

/**
 * Unpause sending after the user has resolved deliverability issues.
 * Optionally resets bounce/complaint counts.
 */
export async function unpauseSending(
  userId: string,
  provider: string = "gmail",
  resetCounts: boolean = false
): Promise<void> {
  const db = serviceClient();

  const update: Record<string, unknown> = {
    paused: false,
    pause_reason: null,
    updated_at: new Date().toISOString(),
  };

  if (resetCounts) {
    update.bounce_count = 0;
    update.complaint_count = 0;
  }

  await db
    .from("email_warmup_status")
    .update(update)
    .eq("user_id", userId)
    .eq("provider", provider);
}
