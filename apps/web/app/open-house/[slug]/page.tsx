import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MarketingNav }    from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { OpenHouseSignInForm } from "./open-house-sign-in-form";
import {
  Home,
  MapPin,
  CalendarDays,
  Clock,
  DollarSign,
  Phone,
  Mail,
  Building2,
} from "lucide-react";

// ── Dynamic metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("agent_open_houses")
    .select("property_address, property_city, property_province, agent_display_name, agent_brokerage, open_house_date, property_photo_url, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!page) {
    return {
      title: "Open House Sign-In",
      robots: { index: false, follow: false },
    };
  }

  const address = [page.property_address, page.property_city, page.property_province]
    .filter(Boolean)
    .join(", ");
  const agentId = page.agent_display_name || "Your REALTOR®";
  const dateStr = page.open_house_date
    ? new Date(page.open_house_date).toLocaleDateString("en-CA", {
        weekday: "long",
        month:   "long",
        day:     "numeric",
      })
    : "";

  return {
    title:       `Open House Sign-In${address ? ` — ${address}` : ""}`,
    description: `Register for ${agentId}'s open house${address ? ` at ${address}` : ""}${dateStr ? ` on ${dateStr}` : ""}. Powered by Agent Runway.`,
    openGraph:   page.property_photo_url
      ? { images: [{ url: page.property_photo_url.split("?")[0] }] }
      : undefined,
    robots:      { index: false, follow: false }, // lead-gen page, not for Google
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h ?? "0", 10);
  const min  = m ?? "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12  = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function formatPrice(price: number | null): string {
  if (price == null) return "";
  return new Intl.NumberFormat("en-CA", {
    style:    "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(d: string | null): string {
  if (!d) return "";
  // d is "YYYY-MM-DD" from Postgres. Parse in local TZ to avoid UTC shift.
  const [y, mo, day] = d.split("-").map(Number);
  return new Date(y!, mo! - 1, day!).toLocaleDateString("en-CA", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    year:    "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OpenHouseSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Use anon-safe server client — no auth needed for public read
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("agent_open_houses")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!page) notFound();

  const address = [page.property_address, page.property_city, page.property_province]
    .filter(Boolean)
    .join(", ");

  const dateStr  = formatDate(page.open_house_date);
  const timeStr  = [formatTime(page.open_house_start), formatTime(page.open_house_end)]
    .filter(Boolean)
    .join(" – ");
  const priceStr = formatPrice(page.property_price);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex flex-1 flex-col">

        {/* ── Property photo hero ──────────────────────────────────────── */}
        {page.property_photo_url ? (
          <div className="relative h-[260px] w-full sm:h-[340px]">
            <Image
              src={page.property_photo_url.split("?")[0]!}
              alt={address || "Property photo"}
              fill
              className="object-cover"
              priority
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-slate-950" />
          </div>
        ) : (
          /* Gradient placeholder when no photo */
          <div
            className="h-[120px] w-full"
            style={{ background: "linear-gradient(135deg, #010D1F 0%, #0a1628 100%)" }}
          />
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        <section className="px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-10 lg:grid-cols-5 lg:gap-16">

              {/* Left column — sign-in form (3 cols on lg) */}
              <div className="lg:col-span-3">
                {/* Badge */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  Open House Sign-In
                </div>

                <OpenHouseSignInForm
                  slug={slug}
                  agentName={page.agent_display_name}
                  propertyAddress={address}
                />
              </div>

              {/* Right column — property + agent info (2 cols on lg) */}
              <div className="lg:col-span-2">

                {/* Property info card */}
                <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 backdrop-blur-sm">
                  <h2 className="text-lg font-bold text-white">
                    {page.property_address || "Property Details"}
                  </h2>
                  {(page.property_city || page.property_province) && (
                    <p className="mt-0.5 text-sm text-slate-400">
                      {[page.property_city, page.property_province].filter(Boolean).join(", ")}
                    </p>
                  )}

                  <ul className="mt-4 space-y-2.5">
                    {priceStr && (
                      <li className="flex items-center gap-2.5 text-sm text-slate-300">
                        <DollarSign className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                        <span>{priceStr}</span>
                      </li>
                    )}
                    {dateStr && (
                      <li className="flex items-center gap-2.5 text-sm text-slate-300">
                        <CalendarDays className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                        <span>{dateStr}</span>
                      </li>
                    )}
                    {timeStr && (
                      <li className="flex items-center gap-2.5 text-sm text-slate-300">
                        <Clock className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                        <span>{timeStr}</span>
                      </li>
                    )}
                    {address && (
                      <li className="flex items-start gap-2.5 text-sm text-slate-300">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                        <span>{address}</span>
                      </li>
                    )}
                  </ul>

                  {page.description && (
                    <p className="mt-4 text-sm leading-relaxed text-slate-400">
                      {page.description}
                    </p>
                  )}
                </div>

                {/* Agent card */}
                <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    {page.agent_photo_url ? (
                      <Image
                        src={page.agent_photo_url.split("?")[0]!}
                        alt={page.agent_display_name || "Agent photo"}
                        width={64}
                        height={64}
                        className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-slate-700"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600/20 ring-2 ring-blue-500/20">
                        <span className="text-xl font-bold text-blue-300">
                          {(page.agent_display_name?.[0] ?? "A").toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-white">
                        {page.agent_display_name || "Your Agent"}
                      </p>
                      {page.agent_brokerage && (
                        <p className="flex items-center gap-1 text-xs text-slate-400">
                          <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {page.agent_brokerage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {page.agent_phone && (
                      <a
                        href={`tel:${page.agent_phone}`}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        {page.agent_phone}
                      </a>
                    )}
                    {page.agent_email && (
                      <a
                        href={`mailto:${page.agent_email}`}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        {page.agent_email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Powered-by strip ─────────────────────────────────────────── */}
        <section className="border-t border-slate-800/60 px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs text-slate-500">
              This page is powered by{" "}
              <Link href="/" className="font-semibold text-slate-400 hover:text-white">
                Agent Runway
              </Link>{" "}
              — the business operating system for Canadian real estate agents.{" "}
              <Link href="/tools/realtor-tax-estimator" className="underline underline-offset-4 hover:text-slate-300">
                Try the free tax estimator →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
