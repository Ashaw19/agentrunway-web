import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { trialWelcomeEmail, formatTrialEndDate } from "@/lib/emails/trial-welcome";
import { trialEndingSoonEmail } from "@/lib/emails/trial-ending-soon";
import { winBackEmail } from "@/lib/emails/win-back";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import type Stripe from "stripe";

/**
 * Stripe webhook handler.
 *
 * Register this endpoint in your Stripe dashboard:
 *   Webhook URL: https://agentrunway.ca/api/stripe-webhook
 *   Events to listen for:
 *     - checkout.session.completed
 *     - customer.subscription.updated
 *     - customer.subscription.deleted
 *     - customer.subscription.trial_will_end
 *     - invoice.payment_failed
 *     - invoice.payment_succeeded
 *
 * Set STRIPE_WEBHOOK_SECRET in .env.local to the signing secret from Stripe.
 */

// ── Service-role Supabase client (bypasses RLS) ───────────────────────────────

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function customerId(
  val: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!val) return null;
  return typeof val === "string" ? val : val.id;
}

function subscriptionId(val: string | Stripe.Subscription | null): string | null {
  if (!val) return null;
  return typeof val === "string" ? val : val.id;
}

// Stripe v18+ removed `invoice.subscription` — the subscription is now nested
// under `invoice.parent.subscription_details.subscription`. This helper walks
// the new shape and returns the subscription id (or null for non-subscription
// invoices like one-off quotes).
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== "subscription_details") return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const body = await request.text();
  const sig = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header or STRIPE_WEBHOOK_SECRET." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  const db = serviceClient();

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // Stripe guarantees at-least-once delivery: the same event can fire twice.
  // Insert the event ID into stripe_events; a unique-constraint violation
  // means we've already handled it — return 200 immediately so Stripe stops
  // retrying without us double-processing (double-granting, double-emailing).
  const { error: idempotencyError } = await db
    .from("stripe_events")
    .insert({ event_id: event.id });

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      // Duplicate event — already processed
      console.log("[stripe] duplicate event ignored:", event.id);
      return NextResponse.json({ received: true });
    }
    // Transient DB error: return 503 so Stripe retries after recovery.
    // Continuing here risks double-processing if the webhook is retried
    // while the DB is back up but the event was never recorded.
    console.error("[stripe] failed to record event id — returning 503:", idempotencyError.message);
    return NextResponse.json({ error: "Database unavailable, retry later" }, { status: 503 });
  }

  switch (event.type) {

    // ── New subscription activated via Checkout ─────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const orgId  = session.metadata?.orgId;
      const cid = customerId(session.customer);
      const sid = subscriptionId(session.subscription);

      if (!userId) {
        console.error(
          "[stripe] checkout.session.completed — missing userId in metadata",
          session.id,
        );
        break;
      }

      // payment_status is "no_payment_required" when the session starts a
      // free trial (payment_method_collection: "if_required").
      const initStatus =
        session.payment_status === "no_payment_required" ? "trialing" : "active";

      // ── Team/org checkout ──────────────────────────────────────────────────
      if (orgId) {
        const { error: orgErr } = await db
          .from("organizations")
          .update({
            stripe_customer_id: cid,
            stripe_subscription_id: sid,
            subscription_status: initStatus,
            billing_email: session.customer_details?.email ?? null,
          })
          .eq("id", orgId);

        if (orgErr) {
          console.error("[stripe] failed to activate team billing for org", orgId, orgErr.message);
        } else {
          console.log("[stripe] activated team billing for org", orgId, initStatus);
        }

        // Grant all org members professional tier
        const { data: members } = await db
          .from("organization_members")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("status", "active");

        if (members?.length) {
          const userIds = members.map((m) => m.user_id);
          await db
            .from("user_settings")
            .update({
              subscription_tier: "professional",
              subscription_status: initStatus,
            })
            .in("user_id", userIds);

          console.log("[stripe] granted professional to", userIds.length, "team members");
        }
        break;
      }

      // ── Individual checkout ────────────────────────────────────────────────
      const { error } = await db
        .from("user_settings")
        .update({
          subscription_tier: "professional",
          subscription_status: initStatus,
          stripe_customer_id: cid,
          stripe_subscription_id: sid,
        })
        .eq("user_id", userId);

      if (error) {
        console.error(
          "[stripe] failed to activate professional for user",
          userId,
          error.message,
        );
      } else {
        console.log("[stripe] activated professional for user", userId, initStatus);

        // ── Send welcome email on trial start ───────────────────────────────
        // Only send when a free trial begins (no card collected yet).
        if (initStatus === "trialing" && resend) {
          const toEmail =
            session.customer_details?.email ?? session.customer_email;

          if (toEmail) {
            // Retrieve the subscription to get the trial end date
            let trialEndsOn: string | undefined;
            if (sid) {
              try {
                const sub = await stripe!.subscriptions.retrieve(sid);
                const rawTrialEnd = (sub as unknown as Record<string, unknown>).trial_end;
                if (typeof rawTrialEnd === "number") {
                  trialEndsOn = formatTrialEndDate(rawTrialEnd);
                }
              } catch {
                // Non-fatal — email sends without trial date
              }
            }

            const firstName =
              session.customer_details?.name?.split(" ")[0] ?? null;

            const { subject, html, text } = trialWelcomeEmail({
              firstName,
              dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca"}/dashboard`,
              trialEndsOn,
            });

            const { error: emailError } = await resend.emails.send({
              from: FROM_ADDRESS,
              to: toEmail,
              subject,
              html,
              text,
            });

            if (emailError) {
              // Non-fatal — log but don't fail the webhook
              console.error("[resend] failed to send trial welcome email", emailError);
            } else {
              console.log("[resend] trial welcome email sent to", toEmail);
            }
          }
        }
      }
      break;
    }

    // ── Subscription status changed (renewal, payment failure, trial end) ───
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const cid = customerId(sub.customer);
      const orgId = sub.metadata?.orgId;

      // ── Team/org subscription update ──────────────────────────────────────
      if (orgId) {
        const { error: orgErr } = await db
          .from("organizations")
          .update({ subscription_status: sub.status })
          .eq("stripe_subscription_id", sub.id);

        if (orgErr) {
          console.error("[stripe] failed to sync org subscription status", orgId, orgErr.message);
        } else {
          console.log("[stripe] synced org subscription", sub.id, sub.status);
        }

        // If org subscription is no longer active, downgrade member tiers
        // Allow grace period for past_due — Stripe dunning handles retries
        const orgIsActive = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
        if (!orgIsActive) {
          const { data: members } = await db
            .from("organization_members")
            .select("user_id")
            .eq("org_id", orgId)
            .eq("status", "active");

          if (members && members.length > 0) {
            const memberIds = members.map((m: { user_id: string }) => m.user_id);
            await db
              .from("user_settings")
              .update({ subscription_tier: "starter" })
              .in("user_id", memberIds);
            console.log("[stripe] downgraded", memberIds.length, "org members to starter");
          }
        }
        break;
      }

      if (!cid) {
        console.error("[stripe] subscription.updated — no customer ID", sub.id);
        break;
      }

      // Downgrade to starter on canceled/unpaid — keep access during past_due
      // (Stripe dunning handles payment retries; immediate downgrade is hostile)
      const isActive = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
      // Stripe v18+ moved current_period_end from Subscription to SubscriptionItem.
      // All items on our single-plan subscriptions share one cycle, so the first
      // item's period is the canonical subscription period.
      const firstItemPeriodEnd = sub.items.data[0]?.current_period_end ?? null;
      const periodEnd =
        typeof firstItemPeriodEnd === "number"
          ? new Date(firstItemPeriodEnd * 1000).toISOString()
          : null;

      const { error } = await db
        .from("user_settings")
        .update({
          subscription_tier: isActive ? "professional" : "starter",
          subscription_status: sub.status,
          subscription_current_period_end: periodEnd,
        })
        .eq("stripe_customer_id", cid);

      if (error) {
        console.error(
          "[stripe] failed to sync subscription for customer",
          cid,
          error.message,
        );
      } else {
        console.log(
          "[stripe] synced subscription",
          sub.id,
          sub.status,
          "→",
          isActive ? "professional" : "starter",
        );
      }
      break;
    }

    // ── Trial ending soon (3 days before trial_end) ─────────────────────────
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const cid = customerId(sub.customer);

      if (!cid) {
        console.error("[stripe] trial_will_end — no customer ID", sub.id);
        break;
      }

      if (resend) {
        try {
          const stripeCustomer = await stripe!.customers.retrieve(cid);
          if (!stripeCustomer.deleted) {
            const toEmail = stripeCustomer.email;
            if (toEmail) {
              const rawTrialEnd = (sub as unknown as Record<string, unknown>).trial_end;
              const trialEndsOn =
                typeof rawTrialEnd === "number"
                  ? formatTrialEndDate(rawTrialEnd)
                  : undefined;

              const firstName =
                (stripeCustomer.name?.split(" ")[0] ?? null) || null;

              const { subject, html, text } = trialEndingSoonEmail({
                firstName,
                trialEndsOn,
                upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca"}/pricing`,
              });

              const { error: emailError } = await resend.emails.send({
                from: FROM_ADDRESS,
                to: toEmail,
                subject,
                html,
                text,
              });

              if (emailError) {
                console.error("[resend] failed to send trial_will_end email", emailError);
              } else {
                console.log("[resend] trial_will_end email sent to", toEmail);
              }
            }
          }
        } catch (err) {
          // Non-fatal
          console.error("[stripe] failed to retrieve customer for trial_will_end", cid, err);
        }
      }
      break;
    }

    // ── Subscription cancelled (end of period or immediate) ─────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const cid = customerId(sub.customer);
      const orgId = sub.metadata?.orgId;

      // ── Team/org subscription canceled ────────────────────────────────────
      if (orgId) {
        const { error: orgErr } = await db
          .from("organizations")
          .update({
            subscription_status: "canceled",
            stripe_subscription_id: null,
          })
          .eq("stripe_subscription_id", sub.id);

        if (orgErr) {
          console.error("[stripe] failed to cancel org subscription", orgId, orgErr.message);
        } else {
          console.log("[stripe] canceled org subscription", sub.id);

          // Downgrade all team members to starter tier
          const { data: members } = await db
            .from("organization_members")
            .select("user_id")
            .eq("org_id", orgId);

          if (members?.length) {
            const memberIds = members.map((m) => m.user_id);
            const { error: downgradeErr } = await db
              .from("user_settings")
              .update({
                subscription_tier: "starter",
                subscription_status: "canceled",
              })
              .in("user_id", memberIds);

            if (downgradeErr) {
              console.error("[stripe] failed to downgrade team members", orgId, downgradeErr.message);
            } else {
              console.log(`[stripe] downgraded ${memberIds.length} team members for org ${orgId}`);
            }
          }
        }
        break;
      }

      if (!cid) {
        console.error("[stripe] subscription.deleted — no customer ID", sub.id);
        break;
      }

      const { error } = await db
        .from("user_settings")
        .update({
          subscription_tier: "starter",
          subscription_status: "canceled",
          stripe_subscription_id: null,
          subscription_current_period_end: null,
        })
        .eq("stripe_customer_id", cid);

      if (error) {
        console.error(
          "[stripe] failed to downgrade for customer",
          cid,
          error.message,
        );
      } else {
        console.log("[stripe] downgraded to starter for customer", cid);
      }

      // ── Send win-back email ────────────────────────────────────────────────
      if (resend) {
        try {
          const stripeCustomer = await stripe!.customers.retrieve(cid);
          if (!stripeCustomer.deleted && stripeCustomer.email) {
            const firstName =
              (stripeCustomer.name?.split(" ")[0] ?? null) || null;

            const { subject, html, text } = winBackEmail({
              firstName,
              pricingUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca"}/pricing`,
              dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca"}/dashboard`,
            });

            const { error: emailError } = await resend.emails.send({
              from: FROM_ADDRESS,
              to: stripeCustomer.email,
              subject,
              html,
              text,
            });

            if (emailError) {
              console.error("[resend] failed to send win-back email", emailError);
            } else {
              console.log("[resend] win-back email sent to", stripeCustomer.email);
            }
          }
        } catch (err) {
          // Non-fatal
          console.error("[stripe] failed to retrieve customer for win-back email", cid, err);
        }
      }
      break;
    }

    // ── Invoice payment failed (dunning / retry cycle) ──────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const cid = customerId(invoice.customer);
      const sid = invoiceSubscriptionId(invoice);

      if (!cid || !sid) {
        console.error("[stripe] invoice.payment_failed — missing customer or subscription ID", invoice.id);
        break;
      }

      // Retrieve the subscription to check for orgId metadata
      let sub: Stripe.Subscription;
      try {
        sub = await stripe!.subscriptions.retrieve(sid);
      } catch (err) {
        console.error("[stripe] failed to retrieve subscription for payment_failed", sid, err);
        break;
      }

      const orgId = sub.metadata?.orgId;

      // ── Update subscription status to past_due ───────────────────────────
      if (orgId) {
        const { error: orgErr } = await db
          .from("organizations")
          .update({ subscription_status: "past_due" })
          .eq("id", orgId);

        if (orgErr) {
          console.error("[stripe] failed to set org past_due", orgId, orgErr.message);
        } else {
          console.log("[stripe] set org past_due for", orgId);
        }
      } else {
        const { error: userErr } = await db
          .from("user_settings")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", cid);

        if (userErr) {
          console.error("[stripe] failed to set user past_due for customer", cid, userErr.message);
        } else {
          console.log("[stripe] set user past_due for customer", cid);
        }
      }

      // ── Determine retry info ─────────────────────────────────────────────
      const attemptCount = invoice.attempt_count ?? 1;
      // Stripe Smart Retries typically retry at day 1, 3, 7
      const nextRetryDaysMap: Record<number, number | null> = { 1: 3, 2: 4, 3: null };
      const nextRetryDays = nextRetryDaysMap[attemptCount] ?? null;
      const nextRetryDate = nextRetryDays
        ? new Date(Date.now() + nextRetryDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : null;

      // ── Send payment-failed email ────────────────────────────────────────
      if (resend) {
        try {
          const stripeCustomer = await stripe!.customers.retrieve(cid);
          if (!stripeCustomer.deleted && stripeCustomer.email) {
            const firstName =
              (stripeCustomer.name?.split(" ")[0] ?? null) || null;

            const { subject, html, text } = paymentFailedEmail({
              firstName,
              attemptNumber: attemptCount,
              nextRetryDate: nextRetryDate ?? undefined,
              updatePaymentUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca"}/settings/billing`,
            });

            const { error: emailError } = await resend.emails.send({
              from: FROM_ADDRESS,
              to: stripeCustomer.email,
              subject,
              html,
              text,
            });

            if (emailError) {
              console.error("[resend] failed to send payment-failed email", emailError);
            } else {
              console.log("[resend] payment-failed email sent to", stripeCustomer.email, "attempt", attemptCount);
            }
          }
        } catch (err) {
          // Non-fatal
          console.error("[stripe] failed to retrieve customer for payment-failed email", cid, err);
        }
      }
      break;
    }

    // ── Invoice payment succeeded (recovery from past_due) ─────────────────
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const cid = customerId(invoice.customer);
      const sid = invoiceSubscriptionId(invoice);

      if (!cid || !sid) {
        console.error("[stripe] invoice.payment_succeeded — missing customer or subscription ID", invoice.id);
        break;
      }

      // Retrieve the subscription to check for orgId metadata
      let sub: Stripe.Subscription;
      try {
        sub = await stripe!.subscriptions.retrieve(sid);
      } catch (err) {
        console.error("[stripe] failed to retrieve subscription for payment_succeeded", sid, err);
        break;
      }

      const orgId = sub.metadata?.orgId;

      // ── Only act if recovering from past_due ─────────────────────────────
      if (orgId) {
        const { data: org } = await db
          .from("organizations")
          .select("subscription_status")
          .eq("id", orgId)
          .single();

        if (org?.subscription_status === "past_due") {
          const { error: orgErr } = await db
            .from("organizations")
            .update({ subscription_status: "active" })
            .eq("id", orgId);

          if (orgErr) {
            console.error("[stripe] failed to recover org from past_due", orgId, orgErr.message);
          } else {
            console.log("[stripe] recovered org from past_due → active", orgId);
          }
        }
      } else {
        const { data: userRow } = await db
          .from("user_settings")
          .select("subscription_status")
          .eq("stripe_customer_id", cid)
          .single();

        if (userRow?.subscription_status === "past_due") {
          const { error: userErr } = await db
            .from("user_settings")
            .update({ subscription_status: "active" })
            .eq("stripe_customer_id", cid);

          if (userErr) {
            console.error("[stripe] failed to recover user from past_due for customer", cid, userErr.message);
          } else {
            console.log("[stripe] recovered user from past_due → active for customer", cid);
          }
        }
      }
      break;
    }

    default:
      console.log("[stripe] unhandled event:", event.type);
  }

  return NextResponse.json({ received: true });
}
