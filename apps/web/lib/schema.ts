/**
 * JSON-LD schema factory functions for Agent Runway.
 *
 * Schema.org markup feeds Google rich results, Bing knowledge panels,
 * and modern answer engines (Claude, ChatGPT, Perplexity, Google AI
 * Overviews). Every marketing page should emit at least one relevant
 * schema block.
 *
 * Import pattern:
 *
 *   import { organizationSchema, softwareApplicationSchema } from "@/lib/schema";
 *   ...
 *   <script type="application/ld+json"
 *           dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
 */

const BASE_URL = "https://agentrunway.ca";

// ─────────────────────────────────────────────────────────────────────────────
// Organization — emitted globally on every page via root layout
// ─────────────────────────────────────────────────────────────────────────────

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${BASE_URL}/#organization`,
  name: "Agent Runway",
  legalName: "Agent Runway Inc.",
  alternateName: "Agent Runway Inc.",
  url: BASE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${BASE_URL}/logo.png`,
    width: 512,
    height: 512,
  },
  image: `${BASE_URL}/og-image-v2.png`,
  slogan: "Know where your business stands.",
  description:
    "Agent Runway is an agentic business operating system for Canadian real estate agents — unifying transactions, pipeline, CRM, Canadian taxes, and forecasting, with a Flight Crew that executes tasks with human approval.",
  foundingDate: "2026-04-16",
  founder: {
    "@type": "Person",
    "@id": `${BASE_URL}/about/andrew-shaw#person`,
    name: "Andrew Shaw",
    jobTitle: "Founder & Director",
    worksFor: { "@id": `${BASE_URL}/#organization` },
    url: `${BASE_URL}/about/andrew-shaw`,
  },
  foundingLocation: {
    "@type": "Country",
    name: "Canada",
  },
  address: {
    "@type": "PostalAddress",
    addressRegion: "NB",
    addressCountry: "CA",
  },
  areaServed: {
    "@type": "Country",
    name: "Canada",
  },
  knowsAbout: [
    "Canadian real estate",
    "Real estate commissions (GCI)",
    "Canadian income tax for self-employed realtors",
    "T2125 Statement of Business Activities",
    "HST registration and input tax credits",
    "CCA depreciation classes",
    "Quarterly tax instalments (CRA)",
    "PREC (Personal Real Estate Corporation)",
    "Real estate CRM and pipeline management",
  ],
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
};

// ─────────────────────────────────────────────────────────────────────────────
// SoftwareApplication — emitted on home and /features
// ─────────────────────────────────────────────────────────────────────────────

export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${BASE_URL}/#software`,
  name: "Agent Runway",
  description:
    "An agentic business operating system for Canadian real estate agents. Unifies income, taxes, expenses, pipeline, CRM, and forecasting — with a Flight Crew that executes tasks with human approval.",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Real Estate Management Software",
  operatingSystem: "Web, iOS, Android",
  url: BASE_URL,
  image: `${BASE_URL}/og-image-v2.png`,
  screenshot: `${BASE_URL}/og-image-v2.png`,
  inLanguage: "en-CA",
  isAccessibleForFree: false,
  countriesSupported: "CA",
  publisher: { "@id": `${BASE_URL}/#organization` },
  creator: { "@id": `${BASE_URL}/#organization` },
  offers: [
    {
      "@type": "Offer",
      name: "Charter",
      price: "79.00",
      priceCurrency: "CAD",
      availability: "https://schema.org/LimitedAvailability",
      description: "Charter pricing — first 50 users, locked for as long as your subscription stays active",
      billingIncrement: 1,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "79.00",
        priceCurrency: "CAD",
        unitText: "MONTH",
      },
    },
    {
      "@type": "Offer",
      name: "Founding",
      price: "99.00",
      priceCurrency: "CAD",
      description: "Founding pricing — next 50 users",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "99.00",
        priceCurrency: "CAD",
        unitText: "MONTH",
      },
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "149.00",
      priceCurrency: "CAD",
      description: "Standard individual plan",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "149.00",
        priceCurrency: "CAD",
        unitText: "MONTH",
      },
    },
  ],
  featureList: [
    "Agentic Flight Crew with 60+ write-enabled tools",
    "Runway Score (0-100 composite business health grade)",
    "Flight Control outreach triggers with AI-drafted messages",
    "Canadian tax estimation for all 13 provinces and territories",
    "T2125 reconciliation and HST input tax credits",
    "P10-P90 probabilistic year-end forecasting",
    "Industry-cohort peer benchmarking",
    "MCP server for Claude, ChatGPT, and Perplexity integration",
    "Voice-first mobile input with intent classification",
    "Mileage tracking with CRA deduction calculation",
  ],
  audience: {
    "@type": "Audience",
    audienceType: "Canadian real estate agents",
    geographicArea: {
      "@type": "Country",
      name: "Canada",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WebSite — helps search engines understand site structure and sitelinks searchbox
// ─────────────────────────────────────────────────────────────────────────────

export const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${BASE_URL}/#website`,
  url: BASE_URL,
  name: "Agent Runway",
  description:
    "Agent Runway — agentic business operating system for Canadian real estate agents.",
  publisher: { "@id": `${BASE_URL}/#organization` },
  inLanguage: "en-CA",
};

// ─────────────────────────────────────────────────────────────────────────────
// BreadcrumbList factory
// ─────────────────────────────────────────────────────────────────────────────

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQPage factory
// ─────────────────────────────────────────────────────────────────────────────

export function faqSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HowTo factory — for tutorial / guide pages
// ─────────────────────────────────────────────────────────────────────────────

export function howToSchema(params: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  totalTime?: string; // ISO 8601 duration (e.g. "PT10M")
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: params.name,
    description: params.description,
    ...(params.totalTime ? { totalTime: params.totalTime } : {}),
    step: params.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Article factory — for blog posts
// ─────────────────────────────────────────────────────────────────────────────

export function articleSchema(params: {
  headline: string;
  description: string;
  url: string;
  datePublished: string; // ISO
  dateModified?: string;
  /** If provided, overrides the default Andrew Shaw @id reference. */
  authorName?: string;
  imageUrl?: string;
}) {
  // Default: reference the canonical Andrew Shaw Person entity by @id so
  // every Agent Runway article links to the same author node in the graph.
  const author = params.authorName
    ? {
        "@type": "Person" as const,
        name: params.authorName,
        url: `${BASE_URL}/about`,
      }
    : { "@id": `${BASE_URL}/about/andrew-shaw#person` };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.headline,
    description: params.description,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": params.url.startsWith("http") ? params.url : `${BASE_URL}${params.url}`,
    },
    datePublished: params.datePublished,
    dateModified: params.dateModified ?? params.datePublished,
    author,
    publisher: { "@id": `${BASE_URL}/#organization` },
    ...(params.imageUrl
      ? {
          image: params.imageUrl.startsWith("http")
            ? params.imageUrl
            : `${BASE_URL}${params.imageUrl}`,
        }
      : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DefinedTerm factory — for metric / glossary pages
// ─────────────────────────────────────────────────────────────────────────────
// Use this on /metrics/* pages so answer engines can surface the definition
// directly when users ask things like "what is GCI" or "how is expense ratio
// calculated for real estate agents."

export function definedTermSchema(params: {
  name: string;
  description: string;
  url: string;
  /** Short canonical code/abbreviation (e.g. "GCI"). Optional. */
  termCode?: string;
  /** Alternate phrasings so AI engines can match more queries. */
  alternateName?: string | string[];
  /** Hub page this term belongs to (defaults to /real-estate-metrics). */
  definedTermSetUrl?: string;
  definedTermSetName?: string;
}) {
  const BASE = BASE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${params.url.startsWith("http") ? params.url : BASE + params.url}#term`,
    name: params.name,
    description: params.description,
    url: params.url.startsWith("http") ? params.url : `${BASE}${params.url}`,
    ...(params.termCode ? { termCode: params.termCode } : {}),
    ...(params.alternateName ? { alternateName: params.alternateName } : {}),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: params.definedTermSetName ?? "Real Estate Business Metrics",
      url: params.definedTermSetUrl ?? `${BASE}/real-estate-metrics`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CollectionPage factory — for hub / index pages that list other pages
// ─────────────────────────────────────────────────────────────────────────────

export function collectionPageSchema(params: {
  name: string;
  description: string;
  url: string;
  items: { name: string; url: string; description?: string }[];
}) {
  const BASE = BASE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: params.name,
    description: params.description,
    url: params.url.startsWith("http") ? params.url : `${BASE}${params.url}`,
    isPartOf: { "@id": `${BASE}/#website` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: params.items.map((item, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: item.url.startsWith("http") ? item.url : `${BASE}${item.url}`,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebPage factory — for general pages that aren't articles or collections
// ─────────────────────────────────────────────────────────────────────────────

export function webPageSchema(params: {
  name: string;
  description: string;
  url: string;
  lastReviewed?: string; // ISO date
}) {
  const BASE = BASE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: params.name,
    description: params.description,
    url: params.url.startsWith("http") ? params.url : `${BASE}${params.url}`,
    isPartOf: { "@id": `${BASE}/#website` },
    publisher: { "@id": `${BASE}/#organization` },
    inLanguage: "en-CA",
    ...(params.lastReviewed ? { lastReviewed: params.lastReviewed } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Person — for founder/author pages
// ─────────────────────────────────────────────────────────────────────────────

export const andrewShawPersonSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${BASE_URL}/about/andrew-shaw#person`,
  name: "Andrew Shaw",
  givenName: "Andrew",
  familyName: "Shaw",
  jobTitle: "REALTOR® and Founder of Agent Runway",
  description:
    "Andrew Shaw is a working REALTOR® on the Ellis Team in Saint John, New Brunswick, and the founder of Agent Runway — an agentic business operating system for Canadian real estate agents.",
  url: `${BASE_URL}/about/andrew-shaw`,
  mainEntityOfPage: `${BASE_URL}/about/andrew-shaw`,
  image: `${BASE_URL}/og-image-v2.png`,
  worksFor: { "@id": `${BASE_URL}/#organization` },
  knowsAbout: [
    "Canadian real estate practice",
    "Real estate business analytics",
    "Canadian self-employed tax planning",
    "T2125 and CCA depreciation",
    "Real estate CRM and pipeline management",
  ],
  homeLocation: {
    "@type": "Place",
    name: "Saint John, New Brunswick, Canada",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Saint John",
      addressRegion: "NB",
      addressCountry: "CA",
    },
  },
  nationality: {
    "@type": "Country",
    name: "Canada",
  },
};
