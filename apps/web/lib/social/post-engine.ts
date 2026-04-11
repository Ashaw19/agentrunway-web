/**
 * lib/social/post-engine.ts
 *
 * Shared Social Post Engine — the single data contract that drives both
 * Quick Post (in-app Instagram publish) and Canva Export.
 *
 * All output paths read from PostConfig and produce the same SlideSpec array.
 * Nothing in this file touches React or Next.js — it is pure TypeScript.
 */

import type { Transaction } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";

// ── Template families ─────────────────────────────────────────────────────────

export type TemplateFamily = "classic-luxury" | "bold-modern" | "minimal-clean";

export const TEMPLATE_FAMILIES: Record<
  TemplateFamily,
  { label: string; description: string; previewBg: string; previewBorder: string; swatch: string }
> = {
  "classic-luxury": {
    label:         "Classic Luxury",
    description:   "Warm ivory, gold & navy serif",
    previewBg:     "bg-[#FAF7F2]",
    previewBorder: "border-[#C9A96E]",
    swatch:        "bg-[#0A1628]",
  },
  "bold-modern": {
    label:         "Bold Modern",
    description:   "True black with electric gold",
    previewBg:     "bg-black",
    previewBorder: "border-[#D4A843]",
    swatch:        "bg-[#D4A843]",
  },
  "minimal-clean": {
    label:         "Minimal Clean",
    description:   "Pure white, Swiss precision",
    previewBg:     "bg-white",
    previewBorder: "border-slate-200",
    swatch:        "bg-slate-400",
  },
};

// ── Sold wording ──────────────────────────────────────────────────────────────

export type SoldWording = "SOLD" | "JUST SOLD" | "CLOSED";

export const SOLD_WORDING_OPTIONS: SoldWording[] = ["SOLD", "JUST SOLD", "CLOSED"];

// ── Core data contract ────────────────────────────────────────────────────────

export interface PostConfig {
  postType: "month-in-review";

  // Post setup
  month: number; // 1–12
  year: number;

  // Template
  templateFamily: TemplateFamily;

  // Branding
  agentName:    string;
  businessName: string;
  logoUrl:      string; // empty string = no logo
  headshotUrl:  string; // empty string = no headshot
  cutoutUrl:    string; // empty string = no cutout overlay

  // Slide options
  soldWording:    SoldWording;
  showLogo:       boolean;
  showHeadshot:   boolean;
  showCutout:     boolean;
  showSalePrice:  boolean;
  includeEndCard: boolean;

  // Caption
  ctaLine:      string;
  extraHashtags: string;
}

// ── Month names ───────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// ── Slide spec ────────────────────────────────────────────────────────────────

export interface SlideSpec {
  type:      "cover" | "property" | "closer";
  label:     string;
  tx?:       Transaction;
  slideNum:  number;
  slideTotal: number;
}

// ── Build ordered slide list ──────────────────────────────────────────────────

export function buildSlides(config: PostConfig, selectedTx: Transaction[]): SlideSpec[] {
  const total = 1 + selectedTx.length + (config.includeEndCard ? 1 : 0);

  const slides: SlideSpec[] = [
    { type: "cover", label: "Cover", slideNum: 1, slideTotal: total },
    ...selectedTx.map((tx, i) => ({
      type:       "property" as const,
      label:      tx.address || `Property ${i + 1}`,
      tx,
      slideNum:   i + 2,
      slideTotal: total,
    })),
  ];

  if (config.includeEndCard) {
    slides.push({
      type:       "closer",
      label:      "End Card",
      slideNum:   total,
      slideTotal: total,
    });
  }

  return slides;
}

// ── Build slide API URL ───────────────────────────────────────────────────────

export function buildSlideApiUrl(
  spec: SlideSpec,
  config: PostConfig,
  photoUrls?: Record<string, string>,
): string {
  const p = new URLSearchParams({
    templateFamily: config.templateFamily,
    agentName:      config.agentName,
    businessName:   config.businessName,
    month:          MONTH_NAMES[config.month - 1],
    year:           String(config.year),
    slideNum:       String(spec.slideNum),
    slideTotal:     String(spec.slideTotal),
    soldWording:    config.soldWording,
    showLogo:       (config.showLogo && !!config.logoUrl)     ? "1" : "0",
    showHeadshot:   (config.showHeadshot && !!config.headshotUrl) ? "1" : "0",
    showCutout:     (config.showCutout && !!config.cutoutUrl)   ? "1" : "0",
    showSalePrice:  config.showSalePrice ? "1" : "0",
  });

  if (config.logoUrl    && config.showLogo)     p.set("logoUrl",     config.logoUrl);
  if (config.headshotUrl && config.showHeadshot) p.set("headshotUrl", config.headshotUrl);
  if (config.cutoutUrl  && config.showCutout)   p.set("cutoutUrl",   config.cutoutUrl);

  if (spec.type === "cover") {
    p.set("type", "cover");
    // property count = total - cover slide - end card (if included)
    const propertyCount = spec.slideTotal - 1 - (config.includeEndCard ? 1 : 0);
    p.set("count", String(Math.max(0, propertyCount)));
    return `/api/social/slide?${p}`;
  }

  if (spec.type === "property" && spec.tx) {
    p.set("type", "property");
    p.set("address", spec.tx.address ?? "");
    if (config.showSalePrice && spec.tx.sale_price) {
      p.set("price", fmtCurrency(spec.tx.sale_price));
    }
    if (photoUrls?.[spec.tx.id]) {
      // Strip cache-buster (?t=...) — only needed for the browser preview <img>, not for Satori
      p.set("photoUrl", photoUrls[spec.tx.id].split("?")[0]);
    }
    return `/api/social/slide?${p}`;
  }

  // closer / end card
  p.set("type", "closer");
  if (config.ctaLine) p.set("ctaLine", config.ctaLine);
  return `/api/social/slide?${p}`;
}

// ── Caption generator ─────────────────────────────────────────────────────────

export function generateCaption(config: PostConfig, selectedTx: Transaction[]): string {
  const count  = selectedTx.length;
  const month  = MONTH_NAMES[config.month - 1];
  const plural = count === 1 ? "home" : "homes";

  // Gratitude line
  const gratitude = count === 1
    ? `Grateful to have helped another wonderful client this ${month}. 🙏`
    : `So grateful for every client who trusted me this ${month}. 🙏`;

  // Monthly reflection
  const reflection = `${count} ${plural} sold in ${month} ${config.year} — each one a meaningful milestone for a family.`;

  // CTA
  const cta = config.ctaLine || "Ready to make your move? Let's connect.";

  // Signature
  const sig = config.businessName || config.agentName;

  // Hashtags
  const base  = "#JustSold #RealEstate #CanadianRealEstate #RealtorLife";
  const extra = config.extraHashtags
    ? config.extraHashtags
    : sig ? `#${sig.replace(/\s+/g, "")}` : "";

  const lines = [
    gratitude,
    "",
    reflection,
    "",
    cta,
    "",
    "📲 DM me to get started.",
    "",
    [base, extra].filter(Boolean).join(" "),
  ];

  return lines.join("\n");
}

// ── Canva export helpers ──────────────────────────────────────────────────────

export function buildCanvaContentJson(config: PostConfig, selectedTx: Transaction[]): string {
  return JSON.stringify(
    {
      postType:       config.postType,
      month:          MONTH_NAMES[config.month - 1],
      year:           config.year,
      templateFamily: config.templateFamily,
      agentName:      config.agentName,
      businessName:   config.businessName,
      soldWording:    config.soldWording,
      slideCount:     1 + selectedTx.length + (config.includeEndCard ? 1 : 0),
      properties: selectedTx.map((tx) => ({
        address:   tx.address,
        salePrice: tx.sale_price,
        side:      tx.side,
      })),
    },
    null,
    2,
  );
}

export function buildCanvaInstructions(config: PostConfig): string {
  const month = MONTH_NAMES[config.month - 1];
  return [
    `# Canva Finishing Guide — ${month} ${config.year} Month in Review`,
    "",
    "## What's in this package",
    "- slide-01-cover.png — Cover slide",
    "- slide-02-property.png ... — One PNG per property",
    "- slide-XX-closer.png — End card",
    "- caption.txt — Ready-to-post caption (copy directly into Instagram)",
    "- content.json — Structured post data for reference",
    "",
    "## Recommended Canva workflow",
    "1. Open Canva → New design → Instagram Post (1080×1080 px)",
    "2. Upload the PNG slides as reference images on each slide page",
    "3. Re-create the layout by adding text boxes over the PNG (for editability)",
    "4. Replace the placeholder property photo area with your actual property photo",
    "5. Swap in your brand fonts and colours if desired",
    "6. Export each slide as PNG → Post to Instagram as a Carousel",
    "",
    "## Tips",
    "- The caption is in caption.txt — copy it directly into the Instagram caption field",
    "- Use Canva's 'Grid' layout view to manage all slides at once",
    "- Tag your city + brokerage accounts for wider reach",
    "",
    `Template family used: ${config.templateFamily}`,
    `Agent: ${config.agentName}`,
    `Business: ${config.businessName || "—"}`,
  ].join("\n");
}

