/**
 * Zod Schemas for AI-Generated Structured Outputs
 *
 * Used with Vercel AI SDK's `generateObject()` to guarantee
 * valid JSON from LLM responses. Eliminates regex-based JSON
 * extraction and parsing errors.
 *
 * Each schema matches the existing output format of its route
 * so migration is non-breaking.
 */

import { z } from "zod";

// ── Property Analysis (/api/ai/property-analysis) ──────────────────────────

export const PropertyDataSchema = z.object({
  address: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  mls_number: z.string().nullable(),
  listing_price: z.number().default(0),
  property_type: z.enum(["detached", "semi", "townhouse", "condo", "other"]).default("other"),
  bedrooms: z.number().default(0),
  bathrooms: z.number().default(0),
  square_feet: z.number().default(0),
  lot_size: z.string().nullable(),
  year_built: z.number().default(0),
  parking: z.string().nullable(),
  taxes_annual: z.number().default(0),
  days_on_market: z.number().default(0),
  previous_sale_price: z.number().nullable(),
  previous_sale_date: z.string().nullable(),
});

export const PropertyAnalysisSchema = z.object({
  property_data: PropertyDataSchema,
  analysis: z.object({
    pricing_assessment: z.string(),
    offer_strategy: z.string(),
    leverage_tips: z.array(z.string()),
    market_comparison: z.string(),
    risk_factors: z.array(z.string()),
    summary: z.string(),
  }),
});

export type PropertyAnalysis = z.infer<typeof PropertyAnalysisSchema>;

// ── Property Extraction (/api/ai/extract-property) ─────────────────────────

export const ExtractedPropertySchema = z.object({
  property_address: z.string(),
  city: z.string(),
  province_region: z.string(),
  postal_code: z.string().default(""),
  mls_number: z.string().nullable(),
  listing_price: z.number().default(0),
  property_type: z.enum(["detached", "semi", "townhouse", "condo", "other"]).default("other"),
  bedrooms: z.number().default(0),
  bathrooms: z.number().default(0),
  square_feet: z.number().default(0),
  lot_size: z.string().default(""),
  year_built: z.number().default(0),
  parking: z.string().default(""),
  taxes_annual: z.number().default(0),
  days_on_market: z.number().default(0),
  description: z.string().default(""),
});

export type ExtractedProperty = z.infer<typeof ExtractedPropertySchema>;

// ── Listing Description (/api/ai/listing-description) ──────────────────────

export const ListingDescriptionSchema = z.object({
  description: z.string(),
  social_post: z.string(),
});

export type ListingDescription = z.infer<typeof ListingDescriptionSchema>;

// ── Reward Suggestion (/api/ai/reward-suggestion) ──────────────────────────

export const RewardSuggestionSchema = z.object({
  suggestion: z.string(),
  venueName: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export type RewardSuggestion = z.infer<typeof RewardSuggestionSchema>;

// ── Receipt Extraction (lib/receipts/extract.ts) ───────────────────────────

export const ReceiptExtractionSchema = z.object({
  vendor: z.string().nullable(),
  expense_date: z.string().nullable(),
  total_amount: z.number().nullable(),
  tax_amount: z.number().nullable(),
  subtotal: z.number().nullable(),
  currency: z.string().default("CAD"),
  suggested_category: z.enum([
    "vehicle_fuel",
    "vehicle_service",
    "vehicle_lease",
    "vehicle_insurance",
    "marketing_ads",
    "marketing_print",
    "marketing_digital",
    "marketing_events",
    "office_supplies",
    "office_rent",
    "office_utilities",
    "office_phone",
    "office_internet",
    "tech_software",
    "tech_hardware",
    "education_courses",
    "education_events",
    "insurance_eo",
    "insurance_general",
    "professional_legal",
    "professional_accounting",
    "professional_coaching",
    "brokerage_desk",
    "brokerage_split",
    "brokerage_franchise",
    "meals_client",
    "meals_team",
    "travel_accommodation",
    "travel_transport",
    "gifts_client",
    "gifts_referral",
    "association_crea",
    "association_board",
    "association_mls",
    "other_misc",
  ]).nullable(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

// ── Import History (/api/import-history) ────────────────────────────────────

const ConfidenceLevelSchema = z.enum(["high", "medium", "low", "missing"]);

export const ImportedDealSchema = z.object({
  date: z.string(),
  address: z.string(),
  sale_price: z.number().nullable(),
  gci: z.number().nullable(),
  net_income: z.number().nullable().optional(),
  commission_percent: z.number().nullable().optional(),
  party_a: z.string(),
  party_b: z.string(),
  agent_side: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  source: z.string().optional(),
  side: z.enum(["buyer", "seller", "both"]).optional(),
  confidence: z.object({
    gci: ConfidenceLevelSchema.default("missing"),
    sale_price: ConfidenceLevelSchema.default("missing"),
    names: ConfidenceLevelSchema.default("low"),
    date: ConfidenceLevelSchema.default("low"),
    address: ConfidenceLevelSchema.default("low"),
    commission_percent: ConfidenceLevelSchema.optional(),
    net_income: ConfidenceLevelSchema.optional(),
  }).optional(),
  evidence: z.object({
    gci: z.string().nullable().optional(),
    sale_price: z.string().nullable().optional(),
    net_income: z.string().nullable().optional(),
    commission_percent: z.string().nullable().optional(),
    names: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
  }).optional(),
});

export const ImportHistorySchema = z.object({
  year: z.number(),
  deals: z.array(ImportedDealSchema),
});

export type ImportHistory = z.infer<typeof ImportHistorySchema>;
export type ImportedDeal = z.infer<typeof ImportedDealSchema>;

// ── Client Memory (lib/ai/client-memory-engine.ts) ─────────────────────────

export const ClientMemoryFactsSchema = z.object({
  goal: z.string().nullable().default(null),
  timeline: z.string().nullable().default(null),
  motivation: z.string().nullable().default(null),
  pain_point: z.string().nullable().default(null),
  objection: z.string().nullable().default(null),
  emotional_state: z.string().nullable().default(null),
  engagement_level: z.string().nullable().default(null),
  decision_style: z.string().nullable().default(null),
  communication_style: z.string().nullable().default(null),
  areas_of_interest: z.string().nullable().default(null),
  budget_context: z.string().nullable().default(null),
  last_key_topic: z.string().nullable().default(null),
  last_meaningful_contact_summary: z.string().nullable().default(null),
  likely_cold_reason: z.string().nullable().default(null),
  next_best_angle: z.string().nullable().default(null),
  last_value_sent: z.string().nullable().default(null),
});

export const ClientMemoryOutputSchema = z.object({
  memory_summary: z.string(),
  structured_facts: ClientMemoryFactsSchema,
});

export type ClientMemoryFacts = z.infer<typeof ClientMemoryFactsSchema>;
export type ClientMemoryOutput = z.infer<typeof ClientMemoryOutputSchema>;

// ── Opportunity Detection (/api/ai/detect-opportunities) ───────────────────

export const DetectedOpportunitySchema = z.object({
  client_id: z.string(),
  opportunity_type: z.string(),
  trigger_date: z.string(),
  context: z.record(z.unknown()),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

export type DetectedOpportunity = z.infer<typeof DetectedOpportunitySchema>;

// ── Voice Extract (/api/voice-extract) ─────────────────────────────────────

export const VoiceExtractSchema = z.object({
  client_name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  follow_up_date: z.string().nullable(),
  action_items: z.array(z.string()).default([]),
});

export type VoiceExtract = z.infer<typeof VoiceExtractSchema>;
