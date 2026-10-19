/**
 * Category suggestion system — layered vendor + keyword hints.
 *
 * Priority order:
 *  1. Exact vendor pattern match
 *  2. Keyword scan of full OCR text
 *  3. Groq's own suggested_category (passed through from extraction)
 *  4. Fallback → "other_misc"
 *
 * Keys match expense_items.key. The saved receipt carries the key as
 * receipt_expenses.category_key; totals are built from those rows.
 */

import { RECEIPT_CATEGORY_KEYS } from "@agent-runway/core/lib/expense-items";

interface HintRule {
  /** Pattern tested against lowercased vendor name + any receipt text */
  pattern: RegExp;
  /** Matching expense_items.key */
  categoryKey: string;
  /** Minimum confidence required to apply this rule (default 0) */
  minConfidence?: number;
}

/**
 * Ordered from most-specific (high confidence) to least-specific.
 * First match wins.
 */
const HINT_RULES: HintRule[] = [
  // ── Home bills ─────────────────────────────────────────────────────────────
  // Ahead of the fuel rule: "heating fuel" and an oil company's home-heating
  // delivery would otherwise match it. Named utilities and unambiguous bill
  // wording only; the review form lets the agent change it.
  {
    pattern: /nb power|énergie nb|energie nb|saint john energy|nova scotia power|maritime electric|newfoundland power|hydro[- ]?qu[eé]bec|hydro one|hydro ottawa|toronto hydro|alectra|bc hydro|manitoba hydro|saskpower|saskenergy|fortis|epcor|enmax|atco|enbridge|liberty utilities|\bhydro bill|electricity bill|power bill|heating oil|furnace oil|home heat|water (?:&|and) sewer|water bill/i,
    categoryKey: "home_utilities",
  },
  {
    pattern: /property tax|municipal tax bill/i,
    categoryKey: "home_property_tax",
  },
  {
    pattern: /condo fees?|strata fees?|condominium corporation/i,
    categoryKey: "home_condo_fees",
  },

  // ── Vehicle / Parking ──────────────────────────────────────────────────────
  // Its own item since 2026-10-19: CRA lets business parking be deducted in
  // full, not by the vehicle business-use share. Before fuel, so a parking
  // lot's receipt never reads as a gas bar's.
  {
    pattern: /parking|impark|indigo park|precise parklink|paybyphone|honk mobile|hotspot parking|easypark|green p\b|parkplus/i,
    categoryKey: "vehicle_parking",
  },

  // ── Vehicle / Fuel ─────────────────────────────────────────────────────────
  {
    pattern: /shell|(?<![a-z])esso(?![a-z])|petro.?canada|irving oil|husky|(?<![a-z])pioneer(?![a-z])|ultramar|sunoco|chevron|exxon|(?<![a-z])mobil(?![a-z])|bp\s|co-op gas|fas gas|cardlock|circle\s*k|couche.?tard|flying j|pilot travel|kwik trip|fuel|gasoline|diesel|gas station|gas bar|car wash/i,
    categoryKey: "vehicle_fuel",
  },
  {
    pattern: /auto parts|napa auto|midas|jiffy lube|mr lube|oil change|tire shop|firestone|pep boys|o'reilly|advance auto|speedy auto|muffler|brake|mechanic|service centre|service center|detailing/i,
    categoryKey: "vehicle_service",
  },

  // ── Meals & Coffee ─────────────────────────────────────────────────────────
  {
    pattern: /starbucks|tim hortons|timmies|mcdonald|burger king|wendy|subway|a&w|dairy queen|pizza hut|domino|pizza pizza|little caesars|panera|chipotle|restaurant|brasserie|bistro|café|cafe|coffee|breakfast|brunch|lunch|dinner|sushi|(?<![a-z])pho(?![a-z])|ramen|(?<![a-z])thai(?!land)|chinese food|greek|italian|indian food|food delivery|skip the dishes|uber eats|doordash|grubhub|boston pizza|jack astor|milestones|keg steakhouse|(?<![a-z])earls(?![a-z])|cactus club|moxie|montana|kelsey|east side mario|la belle province|harvey|orange julius|second cup|country style|robin's|williams coffee|bridgehead/i,
    categoryKey: "meals_client",
  },

  // ── Marketing & Advertising ────────────────────────────────────────────────
  {
    pattern: /meta ads|facebook ads|instagram ads|google ads|linkedin ads|twitter ads|tiktok ads|mailchimp|constant contact|activecampaign|klaviyo|hubspot|hootsuite|later\.com|buffer|semrush|ahrefs|postcard|flyer|signage|billboard|banner print|photography studio|videographer|drone photo|virtual tour|matterport/i,
    categoryKey: "marketing_ads",
  },
  {
    pattern: /print shop|minuteman press|fedex office|staples print|vistaprint|moo\.com/i,
    categoryKey: "marketing_print",
  },

  // ── Office & Tech (Software / Subscriptions) ───────────────────────────────
  {
    pattern: /canva|adobe|figma|sketch|microsoft 365|office 365|dropbox|google workspace|slack|(?<![a-z])notion(?![a-z])|zoom|(?<![a-z])teams(?![a-z])|webex|quickbooks|intuit|freshbooks|asana|monday\.com|trello|clickup|github|vercel|netlify|aws\b|amazon web services|cloudflare|digitalocean|heroku|stripe\.com|twilio|sendgrid|mailgun|intercom|zendesk|freshdesk|openai|anthropic|apple\.com\/bill|icloud|google one|spotify|1password|lastpass|nordvpn|expressvpn/i,
    categoryKey: "office_software",
  },
  {
    // A carrier's bill ("ROGERS CABLE", "BELL MOBILITY IPHONE") is Phone & Internet, below.
    pattern: /^(?!.*\b(?:rogers|bell canada|bell mobility|bell aliant|telus|fido|koodo|virgin plus|freedom mobile|videotron|cogeco|eastlink|shaw)\b).*(?:staples|bureau en gros|office depot|best buy|the source|bestbuy|london drugs|walmart|amazon\.ca|amazon\.com|costco|dollarama|dollar tree|paper|toner|ink cartridge|printer|monitor|keyboard|mouse|laptop|computer|tablet|ipad|iphone|samsung|headphone|webcam|hard drive|usb|flash drive|cable|charger|office chair|desk|shredder)/i,
    categoryKey: "office_supplies",
  },

  // ── Professional Fees ──────────────────────────────────────────────────────
  {
    pattern: /realtor\.ca|(?<![a-z])(?:crea|orea|reco|creb|mls)(?![a-z])|rebgv|trreb|board dues|board fee|licensing|license renewal|real estate council/i,
    categoryKey: "prof_board_mls",
  },
  {
    pattern: /e&o insurance|errors and omission|professional liability/i,
    categoryKey: "prof_eo",
  },
  {
    pattern: /accounting|bookkeeping|cpa\b|tax preparation|legal fee|notary|lawyer|conveyancing|title insurance/i,
    categoryKey: "prof_accounting",
  },

  // ── Education ─────────────────────────────────────────────────────────────
  {
    pattern: /udemy|coursera|linkedin learning|skillshare|masterclass|real estate school|humber college|coaching program|mastermind|real estate conference|(?<![a-z])rein(?![a-z])|seminar|workshop|webinar|online course/i,
    categoryKey: "edu_courses",
  },
  {
    pattern: /summit|conference|convention/i,
    categoryKey: "edu_conferences",
  },
  {
    pattern: /books|chapters|indigo|amazon books|kobo|audible/i,
    categoryKey: "edu_books",
  },

  // ── Entertainment ──────────────────────────────────────────────────────────
  {
    pattern: /eventbrite|ticketmaster|live nation|sportsnet|maple leafs|raptors|blue jays|canucks|flames|oilers|senators|canadiens|blue bombers|cfl\b|nhl\b|nba\b|mlb\b|concert|theatre|theater|cinema|movie|imax|sports event|golf course|golf|(?<![a-z])spa(?![a-z])|resort/i,
    categoryKey: "ent_events",
  },

  // ── Phone & Internet ───────────────────────────────────────────────────────
  // Carriers by name (a statement line names the carrier, not the service).
  // Last, so a venue or event named after one is placed above ("Rogers
  // Centre" tickets, "TELUS Convention Centre", "Shaw Festival Theatre"),
  // and never for a venue word.
  {
    pattern: /^(?!.*\b(?:centre|center|festival|theatre|theater|arena|stadium|field|place|park|gardens?|amphitheatre|hall|convention)\b).*\b(?:rogers|bell canada|bell mobility|bell aliant|telus|fido|koodo|virgin plus|virgin mobile|freedom mobile|chatr|public mobile|videotron|vid[eé]otron|cogeco|eastlink|shaw|xplore|starlink)\b/i,
    categoryKey: "office_phone",
  },
];

/**
 * All valid sub-item keys: the canonical item list (RECEIPT_CATEGORY_KEYS),
 * used to validate the model's suggestion. This file kept its own copy until
 * 2026-10-19, so a key added to the canonical list (Business Parking) was
 * dropped to Miscellaneous when the model suggested it.
 */
const VALID_KEYS: ReadonlySet<string> = new Set(RECEIPT_CATEGORY_KEYS);

/**
 * Suggest a category key from vendor name + any receipt text.
 * Returns null if no confident match (caller should fall back to Groq's suggestion).
 */
export function suggestCategoryFromText(
  vendor: string | null,
  receiptText?: string,
): string | null {
  const haystack = [vendor ?? "", receiptText ?? ""].join(" ").toLowerCase();
  if (!haystack.trim()) return null;

  for (const rule of HINT_RULES) {
    if (rule.pattern.test(haystack)) {
      return rule.categoryKey;
    }
  }
  return null;
}

/**
 * Full layered category resolution.
 *
 * @param vendorName   - OCR-extracted merchant name
 * @param receiptText  - any additional raw text from the OCR response
 * @param groqCategory - suggested_category from the Groq extraction (already a key)
 * @param confidence   - overall OCR confidence (0–1)
 * @returns { categoryKey, source } — where source explains how we got it
 */
export function resolveCategory(
  vendorName:    string | null,
  receiptText:   string | undefined,
  groqCategory:  string | null,
  confidence:    number,
): { categoryKey: string; source: "vendor" | "groq" | "fallback" } {
  // Layer 1: our deterministic vendor/keyword rules (most reliable)
  const fromHints = suggestCategoryFromText(vendorName, receiptText);
  if (fromHints) return { categoryKey: fromHints, source: "vendor" };

  // Layer 2: Groq's suggestion — only accept valid sub-item keys
  if (groqCategory && VALID_KEYS.has(groqCategory) && confidence >= 0.55) {
    return { categoryKey: groqCategory, source: "groq" };
  }

  // Layer 3: fallback
  return { categoryKey: "other_misc", source: "fallback" };
}
