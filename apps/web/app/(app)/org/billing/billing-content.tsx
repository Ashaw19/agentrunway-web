"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Users,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Calendar,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Organization } from "@/lib/types/organizations";

interface Props {
  org: Organization;
  isOwner: boolean;
  role: string;
  activeMemberCount: number;
  subscriptionData: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    interval: string | null;
  } | null;
  upcomingInvoice: {
    amountDue: number;
    currency: string;
  } | null;
  paymentMethodLast4: string | null;
}

function StatusBadge({
  org,
  subscriptionData,
}: {
  org: Organization;
  subscriptionData: Props["subscriptionData"];
}) {
  if (org.is_beta) {
    return (
      <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
        <Shield className="h-3 w-3 mr-1" />
        Beta — Lifetime Free
      </Badge>
    );
  }

  const status = subscriptionData?.status ?? org.subscription_status;

  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case "trialing":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          Trial
        </Badge>
      );
    case "past_due":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Past Due
        </Badge>
      );
    case "canceled":
      return (
        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">
          Canceled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {status ?? "No subscription"}
        </Badge>
      );
  }
}

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingContent({
  org,
  isOwner: _isOwner,
  role: _role,
  activeMemberCount,
  subscriptionData,
  upcomingInvoice,
  paymentMethodLast4,
}: Props) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const openCustomerPortal = async (section?: "invoices") => {
    const setLoading = section === "invoices" ? setInvoicesLoading : setPortalLoading;
    setLoading(true);
    try {
      const res = await fetch("/api/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not open billing portal");
      }
    } catch {
      toast.error("Could not open billing portal");
    } finally {
      setLoading(false);
    }
  };

  const status = subscriptionData?.status ?? org.subscription_status;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 px-4">
      <div>
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manage your team subscription, seats, and payment details.
        </p>
      </div>

      {/* Past Due Warning Banner */}
      {status === "past_due" && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your payment method failed. Please update it to avoid service
              interruption.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/20"
              onClick={() => openCustomerPortal()}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Update Payment Method
            </Button>
          </div>
        </div>
      )}

      {/* Subscription Overview Card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-emerald-500" />
          Subscription Overview
        </h3>

        <div className="grid gap-3 text-sm">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge org={org} subscriptionData={subscriptionData} />
          </div>

          {/* Plan */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">
              {org.is_beta ? "Beta" : "Teams"}
            </span>
          </div>

          {/* Billing Period */}
          {subscriptionData?.interval && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Billing period</span>
              <span className="capitalize">
                {subscriptionData.interval === "year"
                  ? "Annual"
                  : "Monthly"}
              </span>
            </div>
          )}

          {/* Next Billing Date */}
          {subscriptionData?.currentPeriodEnd &&
            !subscriptionData.cancelAtPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Next billing date</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDate(subscriptionData.currentPeriodEnd)}
                </span>
              </div>
            )}

          {/* Cancellation notice */}
          {subscriptionData?.cancelAtPeriodEnd &&
            subscriptionData.currentPeriodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cancels on</span>
                <span className="text-rose-600">
                  {formatDate(subscriptionData.currentPeriodEnd)}
                </span>
              </div>
            )}

          {/* Next Invoice Amount */}
          {upcomingInvoice && !subscriptionData?.cancelAtPeriodEnd && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Next invoice (estimated)
              </span>
              <span className="font-medium">
                {formatCurrency(
                  upcomingInvoice.amountDue,
                  upcomingInvoice.currency,
                )}
              </span>
            </div>
          )}

          {/* Payment Method */}
          {paymentMethodLast4 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment method</span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                **** {paymentMethodLast4}
              </span>
            </div>
          )}

          {/* Billing Email */}
          {org.billing_email && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Billing email</span>
              <span>{org.billing_email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seat Management Card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          Seat Management
        </h3>

        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current seats</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {activeMemberCount} / {org.max_seats}
            </span>
          </div>

          {/* Per-seat cost */}
          {upcomingInvoice && activeMemberCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Effective per-seat cost
              </span>
              <span>
                {formatCurrency(
                  Math.round(upcomingInvoice.amountDue / activeMemberCount),
                  upcomingInvoice.currency,
                )}
                /seat
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Seats are automatically adjusted when you invite or remove team
          members.
        </p>

        <Link href="/org/members">
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Members
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* Billing Actions */}
      {!org.is_beta && org.stripe_subscription_id && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-500" />
            Billing Actions
          </h3>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => openCustomerPortal()}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Manage Billing
            </Button>

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => openCustomerPortal("invoices")}
              disabled={invoicesLoading}
            >
              {invoicesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="h-4 w-4" />
              )}
              View Invoices
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
