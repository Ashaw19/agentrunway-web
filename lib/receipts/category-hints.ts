/**
 * Category suggestion system — layered vendor + keyword hints.
 *
 * Priority order:
 *  1. Exact vendor pattern match
 *  2. Keyword scan of full OCR text
 *  3. Groq's own suggested_category (passed through from extraction)
 *  4. Fallback → "other"
 */

interface HintRule {
  /** Pattern tested against lowercased vendor name + any receipt text */
  pattern: RegExp;
  /** Matching expense_categories.key */
  categoryKey: string;
  /** Minimum confidence required to apply this rule (default 0) */
  minConfidence?: number;
}

/**
 * Ordered from most-specific (high confidence) to least-specific.
 * First match wins.
 */
const HINT_RULES: HintRule[] = [
  // ── Vehicle / Fuel ─────────────────────────────────────────────────────────
  {
    pattern: /shell|esso|petro.?canada|irving oil|husky|pioneer|ultramar|sunoco|chevron|mobil|bp\s|co-op gas|fas gas|cardlock|fuel|gasoline|diesel|gas station|gas bar|car wash|auto parts|canadian tire|napa auto|midas|jiffy lube|mr lube|oil change|parking|impark|precise parklink/i,
    categoryKey: "vehicle",
  },

  // ── Meals & Coffee ─────────────────────────────────────────────────────────
  {
    pattern: /starbucks|tim hortons|timmies|mcdonald|burger king|wendy|subway|a&w|dairy queen|pizza hut|domino|pizza pizza|little caesars|panera|chipotle|restaurant|brasserie|bistro|café|cafe|coffee|breakfast|brunch|lunch|dinner|sushi|pho|ramen|thai|chinese food|greek|italian|indian food|food delivery|skip the dishes|uber eats|doordash|grubhub|boston pizza|jack astor|milestones|keg steakhouse|earls|cactus club|moxie|montana|kelsey|east side mario|la belle province|harvey|orange julius|second cup|country style|robin's|williams coffee|bridgehead/i,
    categoryKey: "meals",
  },

  // ── Marketing & Advertising ────────────────────────────────────────────────
  {
    pattern: /meta ads|facebook ads|instagram ads|google ads|google analytics|linkedin ads|twitter ads|tiktok ads|mailchimp|constant contact|activecampaign|klaviyo|hubspot|hootsuite|later\.com|buffer|semrush|ahrefs|print shop|minuteman press|fedex office|staples print|vistaprint|moo\.com|postcard|flyer|signage|billboard|banner print|photography studio|videographer|drone photo|virtual tour|matterport/i,
    categoryKey: "marketing",
  },

  // ── Office & Tech (Software / Subscriptions) ───────────────────────────────
  {
    pattern: /canva|adobe|figma|sketch|microsoft 365|office 365|dropbox|google workspace|slack|notion|zoom|teams|webex|asana|monday\.com|trello|clickup|github|vercel|netlify|aws\b|amazon web services|cloudflare|digitalocean|heroku|stripe\.com|twilio|sendgrid|mailgun|intercom|zendesk|freshdesk|openai|anthropic|apple\.com\/bill|icloud|google one|spotify|1password|lastpass|nordvpn|expressvpn/i,
    categoryKey: "office_tech",
  },

  // ── Office & Tech (Hardware / Supplies) ────────────────────────────────────
  {
    pattern: /staples|bureau en gros|office depot|best buy|the source|bestbuy|london drugs|walmart|amazon\.ca|amazon\.com|costco|dollarama|dollar tree|paper|toner|ink cartridge|printer|monitor|keyboard|mouse|laptop|computer|tablet|ipad|iphone|samsung|headphone|webcam|hard drive|usb|flash drive|cable|charger|office chair|desk|shredder/i,
    categoryKey: "office_tech",
  },

  // ── Professional Fees ──────────────────────────────────────────────────────
  {
    pattern: /realtor\.ca|crea\b|orea\b|reco\b|rebgv|creb|trreb|mls\b|board dues|board fee|licensing|license renewal|real estate council|e&o insurance|errors and omission|professional liability|insurance premium|accounting|bookkeeping|cpa\b|tax preparation|legal fee|notary|lawyer|conveyancing|title insurance/i,
    categoryKey: "professional",
  },

  // ── Education ─────────────────────────────────────────────────────────────
  {
    pattern: /udemy|coursera|linkedin learning|skillshare|masterclass|real estate school|humber college|coaching program|mastermind|summit|real estate conference|rein\b|rei\b|seminar|workshop|webinar|online course|books|chapters|indigo|amazon books|kobo|audible|podcast subscription|newsletter pro/i,
    categoryKey: "education",
  },

  // ── Entertainment ──────────────────────────────────────────────────────────
  {
    pattern: /eventbrite|ticketmaster|live nation|sportsnet|maple leafs|raptors|blue jays|canucks|flames|oilers|senators|canadiens|blue bombers|cfl\b|nhl\b|nba\b|mlb\b|concert|theatre|theater|cinema|movie|imax|sports event|golf course|golf|spa|resort/i,
    categoryKey: "entertainment",
  },
];

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

  // Layer 2: Groq's suggestion (model-level confidence)
  const VALID_KEYS = new Set([
    "vehicle", "marketing", "office_tech", "professional",
    "education", "meals", "entertainment", "other",
  ]);
  if (groqCategory && VALID_KEYS.has(groqCategory) && confidence >= 0.55) {
    return { categoryKey: groqCategory, source: "groq" };
  }

  // Layer 3: fallback
  return { categoryKey: "other", source: "fallback" };
}
