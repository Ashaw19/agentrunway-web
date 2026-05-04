import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Contact Us — Real Estate Analytics Software",
  description:
    "Get in touch with the Agent Runway team. We're here to help Canadian real estate agents get the most out of their analytics dashboard.",
  openGraph: {
    url: "https://agentrunway.ca/contact",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/contact",
  },
};

const BASE_URL = "https://agentrunway.ca";

const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Agent Runway",
  description:
    "Contact Agent Runway — support, general inquiries, and feedback from Canadian real estate agents. We respond within one business day.",
  url: `${BASE_URL}/contact`,
  isPartOf: { "@id": `${BASE_URL}/#website` },
  publisher: { "@id": `${BASE_URL}/#organization` },
  inLanguage: "en-CA",
  mainEntity: {
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@agentrunway.ca",
        areaServed: "CA",
        availableLanguage: ["en"],
      },
      {
        "@type": "ContactPoint",
        contactType: "security",
        email: "security@agentrunway.ca",
        areaServed: "CA",
        availableLanguage: ["en"],
      },
      {
        "@type": "ContactPoint",
        contactType: "privacy",
        email: "privacy@agentrunway.ca",
        areaServed: "CA",
        availableLanguage: ["en"],
      },
    ],
  },
};

const contactBreadcrumb = breadcrumbSchema([
  { name: "Home",    url: "/" },
  { name: "Contact", url: "/contact" },
]);

// ── Contact reasons ────────────────────────────────────────────────────────────

const CONTACT_REASONS = [
  {
    icon: MessageSquare,
    title: "General questions",
    description:
      "Questions about Agent Runway features, pricing, or whether it's the right fit for your practice.",
    email: "hello@agentrunway.ca",
  },
  {
    icon: Mail,
    title: "Support",
    description:
      "Need help with your account, data, or something not working as expected? We're here.",
    email: "hello@agentrunway.ca",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (ContactPage + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactBreadcrumb) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-2xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Get In Touch
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Contact Us
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              We&apos;re a small team building Agent Runway for Canadian real estate
              agents. Questions, feedback, or just want to talk — we read every email.
            </p>
          </div>
        </section>

        {/* ── Contact cards ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">

            <div className="grid gap-6 sm:grid-cols-2">
              {CONTACT_REASONS.map(({ icon: Icon, title, description, email }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-8"
                >
                  <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-blue-600/10 p-3">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
                  <p className="mb-5 text-sm leading-relaxed text-slate-500">
                    {description}
                  </p>
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-500"
                  >
                    {email}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="my-16 border-t border-slate-200" />

            {/* Direct email block */}
            <div className="rounded-2xl border-2 border-blue-100 bg-blue-50 p-10 text-center">
              <Mail className="mx-auto mb-4 h-8 w-8 text-blue-600" />
              <h2 className="mb-2 text-xl font-bold text-slate-900">
                Email is the best way to reach us
              </h2>
              <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-slate-600">
                We aim to respond to all inquiries within one business day.
                Canadian business hours (ET).
              </p>
              <a
                href="mailto:hello@agentrunway.ca"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Mail className="h-4 w-4" />
                hello@agentrunway.ca
              </a>
            </div>

          </div>
        </section>

        {/* ── FAQ nudge ── */}
        <section className="bg-slate-50 px-6 py-16 text-center sm:px-10">
          <div className="mx-auto max-w-xl">
            <p className="text-sm text-slate-500">
              Looking for quick answers?{" "}
              <Link
                href="/faq"
                className="font-semibold text-blue-600 underline-offset-2 hover:underline"
              >
                Check our FAQ
              </Link>
              , or browse{" "}
              <Link
                href="/real-estate-business-analytics"
                className="font-semibold text-blue-600 underline-offset-2 hover:underline"
              >
                all features
              </Link>
              .
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
