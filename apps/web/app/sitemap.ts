import { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Runway sitemap.ts
// ─────────────────────────────────────────────────────────────────────────────
// Only public, crawlable pages belong here. Authenticated app routes
// (/dashboard, /transactions, /pipeline, etc.) are DISALLOWED in robots.ts —
// putting them in the sitemap sends a conflicting signal and wastes crawl
// budget. Keep this list in sync with the `/app` directory: any new public
// page should be added here, any page behind auth should stay out.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://agentrunway.ca";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Dynamically include all blog posts
  const blogEntries: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url:             `${BASE_URL}/blog/${post.slug}`,
    lastModified:    new Date(post.date),
    changeFrequency: "monthly" as const,
    priority:        0.7,
  }));

  return [
    // ── Blog (dynamic) ──────────────────────────────────────────────────
    ...blogEntries,
    { url: `${BASE_URL}/blog`,                                lastModified: now, changeFrequency: "weekly",  priority: 0.8 },

    // ── Core marketing pages ────────────────────────────────────────────
    { url: `${BASE_URL}/`,                                    lastModified: now, changeFrequency: "monthly", priority: 1.0 },
    { url: `${BASE_URL}/pricing`,                             lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/features`,                            lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/demo`,                                lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/about`,                               lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/about/andrew-shaw`,                   lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`,                             lastModified: now, changeFrequency: "yearly",  priority: 0.6 },
    { url: `${BASE_URL}/faq`,                                 lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/review`,                              lastModified: now, changeFrequency: "monthly", priority: 0.5 },

    // ── Developer / integration pages ───────────────────────────────────
    { url: `${BASE_URL}/mcp`,                                 lastModified: now, changeFrequency: "monthly", priority: 0.7 },

    // ── Trust & security ────────────────────────────────────────────────
    { url: `${BASE_URL}/security`,                            lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/subprocessors`,                       lastModified: now, changeFrequency: "monthly", priority: 0.5 },

    // ── Legal ──────────────────────────────────────────────────────────
    { url: `${BASE_URL}/privacy`,                             lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/terms`,                               lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/cookie-policy`,                       lastModified: now, changeFrequency: "yearly",  priority: 0.2 },
    { url: `${BASE_URL}/ai-disclaimer`,                       lastModified: now, changeFrequency: "yearly",  priority: 0.2 },
    { url: `${BASE_URL}/acceptable-use`,                      lastModified: now, changeFrequency: "yearly",  priority: 0.2 },

    // ── Metrics hub + per-metric pages ─────────────────────────────────
    { url: `${BASE_URL}/real-estate-metrics`,                 lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/metrics/gci`,                         lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/metrics/conversion-rate`,             lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/metrics/average-commission`,          lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/metrics/expense-ratio`,               lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/metrics/net-income`,                  lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/metrics/financial-runway`,            lastModified: now, changeFrequency: "monthly", priority: 0.7 },

    // ── SEO content cluster (tax, GCI, expenses, T2125) ─────────────────
    { url: `${BASE_URL}/real-estate-business-analytics`,              lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/how-real-estate-agents-track-gci`,            lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/how-real-estate-agents-calculate-net-income`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-tax-planning-canada`,       lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/how-much-should-real-estate-agents-save-for-taxes-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-analytics-vs-spreadsheets`,       lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/t2125-guide-real-estate-agents-canada`,       lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-tax-deadlines-canada`,            lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-commission-calculator-canada`,    lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-business-expenses-canada`,  lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/vehicle-expenses-real-estate-agents-canada`,  lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/business-use-of-home-real-estate-agents-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/gst-hst-quick-method-real-estate-agents-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/first-year-tax-filing-real-estate-agents-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/capital-gains-real-estate-agents-canada`,        lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/self-employed-cpp-real-estate-agents-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-tax-instalments-canada`,          lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/prec-vs-sole-proprietor-real-estate-agents-canada`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-tax-rates-nb-ns-pei`,             lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-hst-registration-canada`,         lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/real-estate-agent-tools-canada`,                    lastModified: now, changeFrequency: "monthly", priority: 0.8 },

    // ── Lead-gen funnel templates (Phase 1.2) ─────────────────────────
    // noindex in metadata — included here so internal tools can discover them.
    { url: `${BASE_URL}/open-house`,                                   lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/listing-inquiry`,                              lastModified: now, changeFrequency: "monthly", priority: 0.5 },

    // ── Branded agent open house pages (Phase 1.3) ────────────────────
    // Dynamic routes (/open-house/[slug]) are agent-generated and noindex'd;
    // we list the setup page (in-app) here so internal tooling sees it.
    // Individual slug pages are NOT enumerated here — they are dynamically
    // served and not intended for search indexing (robots: noindex per metadata).

    // ── Tools (hero asset: realtor tax estimator) ──────────────────────
    { url: `${BASE_URL}/tools`,                                       lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/tools/realtor-tax-estimator`,                 lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/tools/canadian-realtor-tax-cheat-sheet`,      lastModified: now, changeFrequency: "monthly", priority: 0.85 },
  ];
}
