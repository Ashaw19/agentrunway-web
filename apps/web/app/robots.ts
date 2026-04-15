import { MetadataRoute } from "next";

// ─────────────────────────────────────────────────────────────────────────────
// Agent Runway robots.ts
// ─────────────────────────────────────────────────────────────────────────────
// Strategy:
//   1. Block authenticated app routes for every crawler (save crawl budget,
//      avoid indexing empty login-wall pages).
//   2. Explicitly allow major AI / answer-engine crawlers by name. A blank
//      User-agent: * allow is ambiguous — many AI crawlers default-block
//      when sites don't name them. Naming them signals intent.
//   3. Point crawlers at sitemap.xml. llms.txt is auto-discovered at the root.
// ─────────────────────────────────────────────────────────────────────────────

// Paths behind authentication or that should never appear in search results.
// Keep in sync with middleware.ts PROTECTED_PREFIXES.
const DISALLOWED_PATHS = [
  "/api/",
  "/auth/",
  "/oauth/",
  "/onboarding",
  "/dashboard",
  "/transactions",
  "/pipeline",
  "/crm",
  "/clients",
  "/flight-control",
  "/forecast",
  "/expenses",
  "/mileage",
  "/referrals",
  "/tax",
  "/overhead",
  "/altimeter",
  "/reports",
  "/scenarios",
  "/bank-sync",
  "/settings",
  "/profile",
  "/org",
  "/social",
  "/guide",
  "/inbox",
  "/consent",
  "/drive",
  "/history",
  "/receipt-upload",
];

// AI / answer-engine / generative-search crawlers we want to explicitly allow.
// Listed in order of public prevalence (April 2026).
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Google AI (distinct from Googlebot which is covered by *)
  "Google-Extended",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Apple Intelligence
  "Applebot-Extended",
  // Microsoft Copilot / Bing AI (Bingbot itself handles classic search)
  "CCBot", // Common Crawl — feeds many LLM training sets
  // DuckDuckGo Assistant
  "DuckAssistBot",
  // Meta AI
  "Meta-ExternalAgent",
  "FacebookBot",
  // Amazon Alexa / Kendra
  "Amazonbot",
  // You.com
  "YouBot",
  // Mistral (Europe)
  "MistralAI-User",
  // Cohere
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  const aiCrawlerRules = AI_CRAWLERS.map((userAgent) => ({
    userAgent,
    allow: "/",
    disallow: DISALLOWED_PATHS,
  }));

  return {
    rules: [
      // Default: allow all, but protect authenticated paths
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      // Explicit AI crawler allowlist — same rules, but named to signal intent
      ...aiCrawlerRules,
    ],
    sitemap: "https://agentrunway.ca/sitemap.xml",
    host: "https://agentrunway.ca",
  };
}
