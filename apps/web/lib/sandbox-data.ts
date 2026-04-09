// ============================================================================
// Agent Runway — Sandbox Data Generator
// Generates a realistic fictional-agent dataset grounded in live CREA board
// data. The fictional agent inherits the real user's name and board, but all
// financial data is synthetic and never touches real tables.
// ============================================================================

import type {
  Transaction,
  PipelineDeal,
  HistoryItem,
  ExpenseCategoryWithItems,
  ExpenseItem,
  UserSettings,
  SandboxDataset,
  SandboxTier,
  TransactionSide,
  PipelineStage,
  SplitPreset,
  Client,
  ClientStatus,
  ContactActivity,
  ActivityType,
  ContactTask,
  ClientRecord,
  ClientRelationship,
  FlightPlan,
  FlightPlanStep,
  PropertyShowing,
  ListingAppointment,
  OutreachQueueItem,
  OutreachOpportunityType,
  OutreachStatus,
  NewsletterQueue,
  MileageLog,
  CcaAsset,
  LeadSource,
  CommunicationTone,
  PhoneType,
  PreferredContact,
  TaskPriority,
} from "@/lib/types/database";

import type { LocalMarketData } from "@/lib/crea-board";
import { BOARD_AGENT_COUNTS } from "@/lib/crea-board";

// ── Tier Configuration ──────────────────────────────────────────────────────
// Each tier defines deal ranges and expense ratios relative to GCI.
// The ranges are intentionally wide — the generator picks a value within
// the range using a seeded pseudo-random function so results feel natural.

interface TierConfig {
  /** Annual deal count range [min, max] */
  dealsPerYear: [number, number];
  /** Multiplier vs. board avg deals-per-agent (1.0 = average) */
  boardMultiplier: [number, number];
  /** Commission rate range */
  commissionPct: [number, number];
  /** Total annual expenses as % of GCI */
  expenseRatioPct: [number, number];
  /** Cash reserve in months of expenses */
  cashReserveMonths: [number, number];
  /** Years of experience */
  experienceYears: [number, number];
  /** Goal GCI as multiplier of projected GCI */
  goalMultiplier: number;
}

const TIER_CONFIG: Record<SandboxTier, TierConfig> = {
  building: {
    dealsPerYear: [2, 8],
    boardMultiplier: [0.3, 0.8],
    commissionPct: [0.025, 0.025],
    expenseRatioPct: [0.30, 0.40],
    cashReserveMonths: [2, 5],
    experienceYears: [1, 3],
    goalMultiplier: 1.3,
  },
  established: {
    dealsPerYear: [8, 20],
    boardMultiplier: [0.8, 1.5],
    commissionPct: [0.025, 0.025],
    expenseRatioPct: [0.25, 0.33],
    cashReserveMonths: [4, 8],
    experienceYears: [3, 8],
    goalMultiplier: 1.15,
  },
  high_producer: {
    dealsPerYear: [20, 40],
    boardMultiplier: [1.5, 3.0],
    commissionPct: [0.025, 0.03],
    expenseRatioPct: [0.22, 0.30],
    cashReserveMonths: [6, 14],
    experienceYears: [6, 15],
    goalMultiplier: 1.10,
  },
};

// ── Seeded Random ───────────────────────────────────────────────────────────
// Deterministic PRNG so the same board + tier always produces the same dataset.
// Uses a simple mulberry32 implementation.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function uuid(rng: () => number): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const seg = (n: number) => Array.from({ length: n }, hex).join("");
  return `sandbox-${seg(8)}-${seg(4)}-${seg(4)}-${seg(4)}-${seg(12)}`;
}

// ── Canadian Street Addresses (Province-Aware) ─────────────────────────────
// Realistic addresses for sandbox transactions. Grouped by province code.

const STREET_NAMES: Record<string, string[]> = {
  ON: [
    "Maple Ave", "King St W", "Yonge St", "Dundas St E", "Queen St W",
    "Bloor St W", "College St", "Bay St", "Church St", "Bathurst St",
    "Lawrence Ave E", "Eglinton Ave W", "Danforth Ave", "Dufferin St",
    "Keele St", "Lakeshore Blvd W", "Victoria Park Ave", "Sheppard Ave E",
  ],
  BC: [
    "Granville St", "Robson St", "Hastings St", "Main St", "Broadway W",
    "Cambie St", "Fraser St", "Commercial Dr", "Oak St", "Kingsway",
    "Marine Dr", "Knight St", "Arbutus St", "Dunbar St",
  ],
  AB: [
    "Macleod Trail S", "Centre St N", "17th Ave SW", "4th St SW",
    "Crowchild Trail NW", "Jasper Ave", "Whyte Ave", "Stony Plain Rd",
    "Gateway Blvd", "Calgary Trail", "109th St", "Kensington Rd NW",
  ],
  QC: [
    "Rue Sainte-Catherine", "Boulevard Saint-Laurent", "Rue Sherbrooke",
    "Avenue du Parc", "Rue Saint-Denis", "Boulevard René-Lévesque",
    "Rue Notre-Dame", "Avenue Mont-Royal", "Rue de la Commune",
  ],
  NB: [
    "King St", "Main St", "Mountain Rd", "Prospect St", "Union St",
    "Hanwell Rd", "Smythe St", "Regent St", "Queen St", "York St",
  ],
  NS: [
    "Barrington St", "Spring Garden Rd", "Robie St", "Quinpool Rd",
    "Oxford St", "Gottingen St", "Agricola St", "Windsor St",
  ],
  MB: [
    "Portage Ave", "Main St", "Pembina Hwy", "Henderson Hwy",
    "Corydon Ave", "St. Mary's Rd", "McPhillips St", "Osborne St",
  ],
  SK: [
    "Albert St", "Victoria Ave", "Broad St", "Scarth St",
    "8th Ave", "Broadway Ave", "Circle Dr", "Idylwyld Dr",
  ],
  NL: [
    "Water St", "Duckworth St", "Military Rd", "Torbay Rd",
    "Kenmount Rd", "Elizabeth Ave", "Portugal Cove Rd",
  ],
  PE: [
    "University Ave", "Queen St", "Grafton St", "Kent St",
    "Water St", "Richmond St",
  ],
  // Fallback for territories
  DEFAULT: [
    "Main St", "First Ave", "Centre St", "Elm St", "Pine Ave",
    "Cedar Rd", "Lake Dr", "River Rd",
  ],
};

const CITIES: Record<string, string[]> = {
  ON: ["Toronto", "Ottawa", "Hamilton", "London", "Kitchener", "Barrie", "Guelph", "Kingston"],
  BC: ["Vancouver", "Victoria", "Burnaby", "Surrey", "Kelowna", "Nanaimo", "Langley"],
  AB: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Medicine Hat", "Grande Prairie"],
  QC: ["Montréal", "Québec City", "Laval", "Gatineau", "Sherbrooke", "Longueuil"],
  NB: ["Fredericton", "Moncton", "Saint John", "Dieppe", "Miramichi"],
  NS: ["Halifax", "Dartmouth", "Sydney", "Truro", "New Glasgow"],
  MB: ["Winnipeg", "Brandon", "Steinbach", "Thompson", "Portage la Prairie"],
  SK: ["Regina", "Saskatoon", "Prince Albert", "Moose Jaw", "Swift Current"],
  NL: ["St. John's", "Mount Pearl", "Corner Brook", "Conception Bay South"],
  PE: ["Charlottetown", "Summerside", "Stratford", "Cornwall"],
  DEFAULT: ["Central City"],
};

// Province code lookup from the Province enum value
const PROVINCE_TO_CODE: Record<string, string> = {
  ontario: "ON", britishColumbia: "BC", alberta: "AB", quebec: "QC",
  newBrunswick: "NB", novaScotia: "NS", manitoba: "MB", saskatchewan: "SK",
  newfoundland: "NL", princeEdwardIsland: "PE", northwestTerritories: "NT",
  nunavut: "NU", yukon: "YT",
};

// ── Client Names ────────────────────────────────────────────────────────────
// Diverse, realistic Canadian names. First + Last are combined at generation.

const FIRST_NAMES = [
  "James", "Sarah", "Michael", "Emma", "David", "Olivia", "Daniel", "Sophia",
  "Robert", "Isabella", "William", "Mia", "Thomas", "Charlotte", "Joseph", "Amelia",
  "Richard", "Harper", "Andrew", "Evelyn", "Christopher", "Abigail", "Matthew", "Emily",
  "Raj", "Priya", "Wei", "Mei", "Ahmed", "Fatima", "Carlos", "Maria",
  "Kwame", "Adaeze", "Yuki", "Hiroshi", "Pierre", "Marie", "Hassan", "Aisha",
  "Patrick", "Siobhan", "Marco", "Lucia", "Stefan", "Katarina", "Ivan", "Natalia",
];

const LAST_NAMES = [
  "Thompson", "Chen", "Wilson", "Singh", "Anderson", "Kim", "Garcia", "Brown",
  "Martinez", "Lee", "Taylor", "Nguyen", "Patel", "Jones", "Williams", "Murphy",
  "O'Brien", "Campbell", "MacDonald", "Fraser", "Morrison", "Stewart", "Robertson",
  "Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "Okafor", "Mensah", "Diallo",
  "Park", "Yamamoto", "Petrov", "Johansson", "Mueller", "Fernandez", "Rossi",
  "Szabo", "Kowalski", "Nair", "Sharma", "Watt", "Beaulieu", "Leblanc",
];

// ── Seasonality ─────────────────────────────────────────────────────────────
// Canadian real estate seasonality — spring/summer weighted.
// Month weights (Jan=0 → Dec=11) for distributing deals across the year.
const MONTHLY_WEIGHTS = [
  0.05, 0.06, 0.08, 0.10, 0.12, 0.11,
  0.10, 0.09, 0.08, 0.08, 0.07, 0.06,
];

// ── Expense Templates ───────────────────────────────────────────────────────
// 8 categories matching the auto-seeded defaults from seed_default_expenses().
// Monthly amounts are set as fractions of monthly GCI at generation time.

interface ExpenseTemplate {
  key: string;
  title: string;
  items: { key: string; title: string; monthlyPctOfGCI: [number, number] }[];
}

const EXPENSE_TEMPLATES: ExpenseTemplate[] = [
  {
    key: "vehicle",
    title: "Vehicle",
    items: [
      { key: "payment", title: "Vehicle Payment", monthlyPctOfGCI: [0.02, 0.04] },
      { key: "insurance", title: "Vehicle Insurance", monthlyPctOfGCI: [0.005, 0.015] },
      { key: "fuel", title: "Fuel", monthlyPctOfGCI: [0.01, 0.025] },
      { key: "service", title: "Maintenance & Service", monthlyPctOfGCI: [0.003, 0.008] },
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    items: [
      { key: "digital_ads", title: "Digital Advertising", monthlyPctOfGCI: [0.015, 0.04] },
      { key: "photography", title: "Photography & Staging", monthlyPctOfGCI: [0.005, 0.015] },
      { key: "print", title: "Print & Flyers", monthlyPctOfGCI: [0.003, 0.01] },
      { key: "gifts", title: "Client Gifts", monthlyPctOfGCI: [0.002, 0.008] },
    ],
  },
  {
    key: "office_tech",
    title: "Office & Technology",
    items: [
      { key: "software", title: "Software & Subscriptions", monthlyPctOfGCI: [0.01, 0.02] },
      { key: "phone", title: "Phone Plan", monthlyPctOfGCI: [0.005, 0.01] },
      { key: "supplies", title: "Office Supplies", monthlyPctOfGCI: [0.002, 0.005] },
    ],
  },
  {
    key: "professional_fees",
    title: "Professional Fees",
    items: [
      { key: "board_mls", title: "Board & MLS Fees", monthlyPctOfGCI: [0.01, 0.025] },
      { key: "licensing", title: "Licensing & RECO/BCFSA", monthlyPctOfGCI: [0.003, 0.008] },
      { key: "eo_insurance", title: "E&O Insurance", monthlyPctOfGCI: [0.004, 0.01] },
      { key: "accounting", title: "Accounting", monthlyPctOfGCI: [0.003, 0.008] },
    ],
  },
  {
    key: "education",
    title: "Education & Development",
    items: [
      { key: "courses", title: "Courses & Certifications", monthlyPctOfGCI: [0.003, 0.01] },
      { key: "conferences", title: "Conferences", monthlyPctOfGCI: [0.002, 0.006] },
    ],
  },
  {
    key: "meals",
    title: "Meals & Entertainment",
    items: [
      { key: "client_meals", title: "Client Meals", monthlyPctOfGCI: [0.005, 0.015] },
      { key: "team_meals", title: "Team Meals", monthlyPctOfGCI: [0.002, 0.005] },
    ],
  },
  {
    key: "insurance",
    title: "Insurance",
    items: [
      { key: "health", title: "Health & Dental", monthlyPctOfGCI: [0.01, 0.02] },
      { key: "liability", title: "Business Liability", monthlyPctOfGCI: [0.002, 0.005] },
    ],
  },
  {
    key: "other",
    title: "Other",
    items: [
      { key: "miscellaneous", title: "Miscellaneous", monthlyPctOfGCI: [0.005, 0.015] },
    ],
  },
];

// ── Split Presets by Tier ───────────────────────────────────────────────────
const SPLITS_BY_TIER: Record<SandboxTier, SplitPreset[]> = {
  building:      ["p70_30", "p75_25", "p80_20"],
  established:   ["p80_20", "p85_15", "p90_10"],
  high_producer: ["p90_10", "p95_5", "p100_0"],
};

// ============================================================================
// Main Generator
// ============================================================================

export function generateSandboxData(
  boardCode: string,
  boardName: string,
  province: string,
  displayName: string,
  tier: SandboxTier,
  boardStats: LocalMarketData,
): SandboxDataset {
  // ── Seed ────────────────────────────────────────────────────────────────
  const seed = hashString(`${boardCode}-${tier}-${province}-sandbox-2026`);
  const rng = mulberry32(seed);

  const config = TIER_CONFIG[tier];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const provinceCode = PROVINCE_TO_CODE[province] ?? "DEFAULT";

  // ── Core Financial Parameters ───────────────────────────────────────────
  const avgBoardPrice = boardStats.boardTotal.averagePrice > 0
    ? boardStats.boardTotal.averagePrice
    : 500000; // fallback if board data missing

  const boardAgentCount = BOARD_AGENT_COUNTS[boardCode] ?? null;
  const monthlyBoardSales = boardStats.boardTotal.sales > 0
    ? boardStats.boardTotal.sales
    : null;

  // Deals per agent per year from real board data
  const boardDealsPerAgent = (boardAgentCount != null && monthlyBoardSales != null)
    ? (monthlyBoardSales * 12) / boardAgentCount
    : 5; // fallback: conservative estimate

  // Agent's annual deal count — tier-appropriate range, bounded by board data
  const tierDeals = randRange(rng, config.dealsPerYear[0], config.dealsPerYear[1]);
  const boardScaledDeals = boardDealsPerAgent * randRange(rng, config.boardMultiplier[0], config.boardMultiplier[1]);
  const annualDeals = Math.round(Math.max(config.dealsPerYear[0], Math.min(tierDeals, boardScaledDeals)));

  const commissionPct = randRange(rng, config.commissionPct[0], config.commissionPct[1]);
  const avgGCIPerDeal = avgBoardPrice * commissionPct;
  const annualGCI = Math.round(annualDeals * avgGCIPerDeal);
  const monthlyGCI = annualGCI / 12;

  const splitPreset = pick(rng, SPLITS_BY_TIER[tier]);
  const expenseRatio = randRange(rng, config.expenseRatioPct[0], config.expenseRatioPct[1]);

  // ── Generate YTD Transactions ───────────────────────────────────────────
  // Distribute deals across months Jan → current month using seasonality weights
  const ytdMonthWeights = MONTHLY_WEIGHTS.slice(0, currentMonth + 1);
  const ytdWeightSum = ytdMonthWeights.reduce((a, b) => a + b, 0);
  const fullYearWeightSum = MONTHLY_WEIGHTS.reduce((a, b) => a + b, 0);
  const ytdExpectedDeals = Math.round(annualDeals * (ytdWeightSum / fullYearWeightSum));
  const ytdDealCount = Math.max(1, ytdExpectedDeals); // at least 1 deal

  const streets = STREET_NAMES[provinceCode] ?? STREET_NAMES.DEFAULT;
  const cities = CITIES[provinceCode] ?? CITIES.DEFAULT;
  const ts = "2026-01-01T00:00:00Z";

  const transactions: Transaction[] = [];
  for (let i = 0; i < ytdDealCount; i++) {
    // Distribute across YTD months by weight
    let monthIdx = 0;
    let cumWeight = 0;
    const r = rng() * ytdWeightSum;
    for (let m = 0; m < ytdMonthWeights.length; m++) {
      cumWeight += ytdMonthWeights[m];
      if (r <= cumWeight) { monthIdx = m; break; }
    }

    const day = randInt(rng, 1, 28);
    const month = String(monthIdx + 1).padStart(2, "0");
    const date = `${currentYear}-${month}-${String(day).padStart(2, "0")}`;

    // Price variation: ±30% around board average
    const priceVariation = randRange(rng, 0.7, 1.3);
    const salePrice = Math.round(avgBoardPrice * priceVariation / 1000) * 1000;

    const side: TransactionSide = rng() < 0.15 ? "both" : (rng() < 0.5 ? "buyer" : "seller");
    const streetNum = randInt(rng, 10, 999);
    const street = pick(rng, streets);
    const city = pick(rng, cities);
    const unitNum = rng() < 0.3 ? ` #${randInt(rng, 100, 3000)}` : "";
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);

    transactions.push({
      id: uuid(rng),
      user_id: "sandbox",
      date,
      address: `${streetNum} ${street}${unitNum}, ${city}`,
      client_name: `${firstName} ${lastName}`,
      sale_price: salePrice,
      commission_pct: commissionPct,
      gci_override: null,
      pipeline_deal_id: null,
      side,
      status: "closed",
      notes: "",
      created_at: ts,
      updated_at: ts,
    });
  }

  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // ── Generate Pipeline Deals ─────────────────────────────────────────────
  // Active pipeline = remaining expected deals at various stages
  const remainingDeals = Math.max(2, annualDeals - ytdDealCount);
  const pipelineCount = Math.min(remainingDeals, randInt(rng, 3, 7));

  const stages: PipelineStage[] = ["lead", "showing", "offer", "conditional", "firm"];
  const pipelineDeals: PipelineDeal[] = [];

  for (let i = 0; i < pipelineCount; i++) {
    // Earlier pipeline entries are at earlier stages
    const stageIdx = Math.min(stages.length - 1, Math.floor((i / pipelineCount) * stages.length));
    const stage = stages[stages.length - 1 - stageIdx]; // firm first, lead last

    const priceVariation = randRange(rng, 0.7, 1.3);
    const estimatedPrice = Math.round(avgBoardPrice * priceVariation / 1000) * 1000;

    const side: TransactionSide = rng() < 0.5 ? "buyer" : "seller";
    const streetNum = randInt(rng, 10, 999);
    const street = pick(rng, streets);
    const city = pick(rng, cities);
    const unitNum = rng() < 0.3 ? ` #${randInt(rng, 100, 3000)}` : "";
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);

    // Expected close dates spread over next 1-4 months
    const closeMonth = currentMonth + 1 + Math.floor(stageIdx * 0.8);
    const closeDate = closeMonth <= 12
      ? `${currentYear}-${String(closeMonth).padStart(2, "0")}-${String(randInt(rng, 5, 28)).padStart(2, "0")}`
      : null;

    pipelineDeals.push({
      id: uuid(rng),
      user_id: "sandbox",
      address: `${streetNum} ${street}${unitNum}, ${city}`,
      client_name: `${firstName} ${lastName}`,
      estimated_price: estimatedPrice,
      estimated_commission_pct: commissionPct,
      side,
      stage,
      expected_close_date: closeDate,
      probability_override: null,
      client_id: null,
      original_estimated_price: null,
      notes: "",
      created_at: ts,
      updated_at: ts,
    });
  }

  // ── Generate Expense Categories ─────────────────────────────────────────
  const expenseCategories: ExpenseCategoryWithItems[] = EXPENSE_TEMPLATES.map(
    (template, catIdx) => {
      const catId = `sandbox-cat-${catIdx + 1}`;
      const items: ExpenseItem[] = template.items.map((itemTpl, itemIdx) => {
        const monthlyAmount = Math.round(
          monthlyGCI * randRange(rng, itemTpl.monthlyPctOfGCI[0], itemTpl.monthlyPctOfGCI[1])
        );
        // YTD = monthly × months elapsed
        const monthsElapsed = currentMonth + 1;
        const ytdAmount = monthlyAmount * monthsElapsed;

        return {
          id: `sandbox-item-${catIdx + 1}-${itemIdx + 1}`,
          user_id: "sandbox",
          category_id: catId,
          key: itemTpl.key,
          title: itemTpl.title,
          ytd_amount: ytdAmount,
          monthly_recurring: monthlyAmount,
          sort_order: itemIdx + 1,
          created_at: ts,
          updated_at: ts,
        };
      });

      return {
        id: catId,
        user_id: "sandbox",
        key: template.key,
        title: template.title,
        sort_order: catIdx + 1,
        created_at: ts,
        updated_at: ts,
        items,
      };
    }
  );

  // ── Generate History Items (3 Prior Years) ──────────────────────────────
  // Growth trajectory: the agent was at ~70% of current production 3 years ago
  const historyItems: HistoryItem[] = [];
  for (let yearsBack = 3; yearsBack >= 1; yearsBack--) {
    const year = currentYear - yearsBack;
    const growthFactor = 1 - (yearsBack * 0.10) + randRange(rng, -0.05, 0.05);
    const yearDeals = Math.max(1, Math.round(annualDeals * growthFactor));
    const yearGCI = Math.round(yearDeals * avgGCIPerDeal * randRange(rng, 0.92, 1.08));
    const yearExpenses = Math.round(yearGCI * expenseRatio);

    // Distribute across quarters using seasonality
    const qWeights = [
      MONTHLY_WEIGHTS[0] + MONTHLY_WEIGHTS[1] + MONTHLY_WEIGHTS[2],     // Q1
      MONTHLY_WEIGHTS[3] + MONTHLY_WEIGHTS[4] + MONTHLY_WEIGHTS[5],     // Q2
      MONTHLY_WEIGHTS[6] + MONTHLY_WEIGHTS[7] + MONTHLY_WEIGHTS[8],     // Q3
      MONTHLY_WEIGHTS[9] + MONTHLY_WEIGHTS[10] + MONTHLY_WEIGHTS[11],   // Q4
    ];
    const qTotal = qWeights.reduce((a, b) => a + b, 0);

    const quarterGCI = qWeights.map((w) => Math.round(yearGCI * (w / qTotal)));
    const quarterTX = qWeights.map((w) => Math.max(0, Math.round(yearDeals * (w / qTotal))));

    // Adjust for rounding so totals match
    quarterGCI[3] = yearGCI - quarterGCI[0] - quarterGCI[1] - quarterGCI[2];
    quarterTX[3] = yearDeals - quarterTX[0] - quarterTX[1] - quarterTX[2];

    const splitMap: Record<string, number> = {
      p70_30: 0.70, p75_25: 0.75, p80_20: 0.80,
      p85_15: 0.85, p90_10: 0.90, p95_5: 0.95, p100_0: 1.00,
    };

    historyItems.push({
      id: `sandbox-history-${year}`,
      user_id: "sandbox",
      year,
      annual_gci: yearGCI,
      annual_tx: yearDeals,
      quarter_gci: quarterGCI,
      quarter_tx: quarterTX,
      is_locked: true,
      split_pct: splitMap[splitPreset] ?? 0.80,
      annual_expenses: yearExpenses,
      annual_mileage_km: Math.round(randRange(rng, 8000, 25000)),
      annual_mileage_deduct: Math.round(randRange(rng, 4000, 12000)),
      created_at: ts,
      updated_at: ts,
    });
  }

  // ── Settings Overrides ────────────────────────────────────────────────────
  // These override the user's real settings when sandbox mode is active.
  const totalMonthlyExpenses = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + item.monthly_recurring, 0),
    0
  );
  const cashReserve = Math.round(
    totalMonthlyExpenses * randRange(rng, config.cashReserveMonths[0], config.cashReserveMonths[1])
  );

  const settingsOverrides: Partial<UserSettings> = {
    split_preset: splitPreset,
    monthly_brokerage_fee: pick(rng, [500, 750, 1000, 1200, 1500]),
    tx_fee_rate_pct: pick(rng, [0.01, 0.015, 0.02]),
    tx_fee_annual_cap: pick(rng, [2000, 3000, 4000]),
    goal_gci: Math.round(annualGCI * config.goalMultiplier / 1000) * 1000,
    goal_transactions: Math.round(annualDeals * config.goalMultiplier),
    goal_volume: Math.round(annualDeals * config.goalMultiplier * avgBoardPrice / 1000) * 1000,
    cash_reserve: cashReserve,
    experience_years: randInt(rng, config.experienceYears[0], config.experienceYears[1]),
    estimated_weekly_hours: 45,
    vacation_weeks_per_year: 2,
    growth_goal_year_pcts: [0.10, 0.10, 0.08, 0.07, 0.06],
    use_national_seasonality: true,
    national_quarter_pcts: [0.20, 0.30, 0.28, 0.22],
    post_cap_threshold_gci: tier === "high_producer"
      ? Math.round(annualGCI * 0.6 / 1000) * 1000
      : 0,
    post_cap_agent_pct: tier === "high_producer" ? 0.95 : 1.0,
    post_cap_brokerage_pct: tier === "high_producer" ? 0.05 : 0,
  };

  // ── Generate Clients ──────────────────────────────────────────────────────
  // Create Client objects from transaction + pipeline names, plus extra clients
  const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.ca", "hotmail.com", "icloud.com"];
  const LEAD_SOURCES: LeadSource[] = [
    "SOI", "Referral — Past Client", "Referral — Agent", "Realtor.ca",
    "Open House", "Social Media", "Cold Call", "Referral — General",
    "Door Knocking", "Direct Mail", "Sphere Event", "Google Ads",
  ];
  const CLIENT_TAGS = [
    ["VIP"], ["Investor"], ["First-time buyer"], ["Downsizer"], ["Upsizer"],
    ["Pre-construction"], ["Rental"], [], [], [], // empty = no tags (common)
  ];
  const TONES: CommunicationTone[] = ["casual", "friendly", "professional", "formal"];
  const PHONE_TYPES: PhoneType[] = ["mobile", "mobile", "mobile", "home", "work"];
  const PREFERRED_CONTACTS: PreferredContact[] = ["phone", "email", "text", "email", "text"];
  const CLIENT_TIMEFRAMES = ["asap", "1_3_months", "3_6_months", "6_12_months", "unknown"];

  // Collect all names already used in transactions and pipeline
  const usedNames = new Set<string>();
  const allClientNames: { first: string; last: string; full: string; source: "tx" | "pipeline" | "extra" }[] = [];

  for (const tx of transactions) {
    if (!usedNames.has(tx.client_name)) {
      usedNames.add(tx.client_name);
      const [first, ...rest] = tx.client_name.split(" ");
      allClientNames.push({ first, last: rest.join(" ") || "Client", full: tx.client_name, source: "tx" });
    }
  }
  for (const pd of pipelineDeals) {
    if (!usedNames.has(pd.client_name)) {
      usedNames.add(pd.client_name);
      const [first, ...rest] = pd.client_name.split(" ");
      allClientNames.push({ first, last: rest.join(" ") || "Client", full: pd.client_name, source: "pipeline" });
    }
  }

  // Add extra clients (past clients, prospects, SOI)
  const extraClientCount = tier === "building" ? randInt(rng, 8, 15)
    : tier === "established" ? randInt(rng, 15, 30)
    : randInt(rng, 25, 45);

  for (let i = 0; i < extraClientCount; i++) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const full = `${first} ${last}`;
    if (!usedNames.has(full)) {
      usedNames.add(full);
      allClientNames.push({ first, last, full, source: "extra" });
    }
  }

  const clients: Client[] = allClientNames.map((cn, idx) => {
    const clientId = `sandbox-client-${idx + 1}`;
    const city = pick(rng, cities);
    const street = pick(rng, streets);
    const streetNum = randInt(rng, 10, 999);
    const emailName = `${cn.first.toLowerCase()}.${cn.last.toLowerCase().replace(/[^a-z]/g, "")}`;

    // Determine status based on source (4-stage model — migration 00102)
    let status: ClientStatus;
    if (cn.source === "tx") {
      // Past transactions → always cruising (landed removed in 00102)
      status = "cruising";
    } else if (cn.source === "pipeline") {
      const stageMap: Record<string, ClientStatus> = {
        lead: "boarding", showing: "boarding", offer: "in_flight",
        conditional: "in_flight", firm: "in_flight", closed: "cruising",
      };
      const dealStage = pipelineDeals.find(d => d.client_name === cn.full)?.stage ?? "lead";
      status = stageMap[dealStage] ?? "boarding";
    } else {
      // Extra clients — mix of statuses
      const statusPool: ClientStatus[] = ["cruising", "cruising", "cruising", "boarding", "boarding", "scheduled"];
      status = pick(rng, statusPool);
    }

    // Generate realistic dates
    const createdMonthsAgo = cn.source === "tx" ? randInt(rng, 2, 18)
      : cn.source === "pipeline" ? randInt(rng, 1, 6)
      : randInt(rng, 1, 36);
    const createdDate = new Date(now.getTime() - createdMonthsAgo * 30 * 86400000);
    const lastContactDaysAgo = status === "in_flight" ? randInt(rng, 0, 5)
      : status === "boarding" ? randInt(rng, 3, 20)
      : status === "scheduled" ? randInt(rng, 7, 45)
      : randInt(rng, 10, 60); // cruising

    const lastContactDate = new Date(now.getTime() - lastContactDaysAgo * 86400000);

    // Birthdate: random month/day, age 28-65
    const birthYear = currentYear - randInt(rng, 28, 65);
    const birthMonth = randInt(rng, 1, 12);
    const birthDay = randInt(rng, 1, 28);
    const birthdate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

    const phone = `${pick(rng, ["416", "647", "905", "604", "778", "403", "587", "514", "438", "613"])}-${randInt(rng, 200, 999)}-${randInt(rng, 1000, 9999)}`;

    return {
      id: clientId,
      user_id: "sandbox",
      name: cn.full,
      name_search: cn.full.toLowerCase().trim(),
      first_name: cn.first,
      last_name: cn.last,
      email: `${emailName}@${pick(rng, EMAIL_DOMAINS)}`,
      phone,
      birthdate: rng() < 0.6 ? birthdate : null,
      tags: pick(rng, CLIENT_TAGS),
      lead_source: pick(rng, LEAD_SOURCES),
      last_contact_at: lastContactDate.toISOString(),
      notes: null,
      status,
      city,
      province_region: province,
      street_address: `${streetNum} ${street}`,
      unit_number: rng() < 0.2 ? `${randInt(rng, 100, 2000)}` : null,
      postal_code: `${pick(rng, ["K", "L", "M", "N", "T", "V", "R", "S", "A", "B", "C", "E", "G", "H", "J", "P"])}${randInt(rng, 0, 9)}${pick(rng, ["A","B","C","E","G","H","J","K","L","M","N","P","R","S","T","V","W","X","Y"])} ${randInt(rng, 0, 9)}${pick(rng, ["A","B","C","E","G","H","J","K","L","M","N","P","R","S","T","V","W","X","Y"])}${randInt(rng, 0, 9)}`,
      country: "Canada",
      phone_type: pick(rng, PHONE_TYPES),
      secondary_email: null,
      secondary_phone: null,
      secondary_phone_type: "mobile" as PhoneType,
      property_interest: cn.source === "pipeline" ? Math.round(avgBoardPrice * randRange(rng, 0.7, 1.3)) : null,
      property_interest_type: rng() < 0.5 ? "budget" as const : "listing" as const,
      timeframe: cn.source === "pipeline" ? pick(rng, ["asap", "1_3_months", "3_6_months"]) : pick(rng, CLIENT_TIMEFRAMES),
      preferred_contact: pick(rng, PREFERRED_CONTACTS),
      first_contacted_at: createdDate.toISOString(),
      archived_at: null,
      archive_reason: null,
      communication_tone: pick(rng, TONES),
      buyer_pre_approved: cn.source === "pipeline" && rng() < 0.5 ? true : null,
      buyer_pre_approval_amount: cn.source === "pipeline" && rng() < 0.4 ? Math.round(avgBoardPrice * randRange(rng, 0.8, 1.2) / 1000) * 1000 : null,
      buyer_financing_type: rng() < 0.7 ? "mortgage" : rng() < 0.5 ? "cash" : null,
      buyer_target_close_date: null,
      imported_at: null,
      created_at: createdDate.toISOString(),
      updated_at: lastContactDate.toISOString(),
    } as Client;
  });

  // ── Generate Contact Activities ─────────────────────────────────────────
  const ACTIVITY_TYPES: ActivityType[] = ["call", "email", "text", "showing", "meeting", "note"];
  const ACTIVITY_DESCRIPTIONS: Record<ActivityType, string[]> = {
    call: ["Discussed listing strategy", "Follow-up call on showing feedback", "Checked in on financing", "Monthly check-in call", "Reviewed market update"],
    email: ["Sent new listings matching criteria", "Followed up on open house", "Shared market report", "Sent closing timeline", "Anniversary check-in email"],
    text: ["Quick check-in", "Confirmed showing time", "Sent listing link", "Thanked for referral", "Coordinated meeting time"],
    showing: ["Showed 3 properties in west end", "Toured new build development", "Showed downtown condo", "Viewed suburban listings", "Pre-construction showroom visit"],
    meeting: ["Coffee meeting — discussed timeline", "Listing presentation", "Buyer consultation", "Reviewed offer strategy", "Pre-approval planning meeting"],
    offer: ["Submitted offer on listing", "Reviewed competing offers with client", "Negotiated counter-offer terms", "Prepared conditional offer", "Accepted offer — deal firm"],
    note: ["Client mentioned interest in investment property", "Spouse handles finances — follow up with both", "Prefers weekend showings only", "Referred by Thompson family", "Moving for job relocation"],
  };

  const contactActivities: ContactActivity[] = [];
  for (const client of clients) {
    // Number of activities based on status
    const activityCount =
      client.status === "in_flight" ? randInt(rng, 8, 15) :
      client.status === "boarding" ? randInt(rng, 3, 8) :
      client.status === "scheduled" ? randInt(rng, 1, 4) :
      randInt(rng, 3, 8); // cruising

    for (let a = 0; a < activityCount; a++) {
      const type = pick(rng, ACTIVITY_TYPES);
      const daysAgo = randInt(rng, 0, Math.min(365, 30 * (activityCount - a + 1)));
      const actDate = new Date(now.getTime() - daysAgo * 86400000);

      contactActivities.push({
        id: uuid(rng),
        user_id: "sandbox",
        client_id: client.id,
        type,
        description: pick(rng, ACTIVITY_DESCRIPTIONS[type]),
        activity_date: actDate.toISOString(),
        created_at: actDate.toISOString(),
      });
    }
  }
  contactActivities.sort((a, b) => b.activity_date.localeCompare(a.activity_date));

  // ── Generate Contact Tasks ──────────────────────────────────────────────
  const TASK_TEMPLATES = [
    "Follow up on showing feedback",
    "Send market update report",
    "Call to discuss offer strategy",
    "Schedule listing photos",
    "Send closing paperwork reminder",
    "Check in on moving timeline",
    "Confirm inspection date",
    "Send anniversary card",
    "Review comparable sales",
    "Touch base — mortgage renewal coming up",
    "Send pre-approval checklist",
    "Coordinate appraisal access",
    "Follow up on referral introduction",
    "Send quarterly market newsletter",
    "Schedule pre-listing walkthrough",
  ];
  const PRIORITIES: TaskPriority[] = ["low", "normal", "normal", "normal", "high"];

  const taskCount = randInt(rng, 6, 14);
  const activeClients = clients.filter(c => ["boarding", "scheduled", "in_flight", "cruising"].includes(c.status));
  const contactTasks: ContactTask[] = [];

  for (let t = 0; t < taskCount; t++) {
    const client = activeClients.length > 0 ? pick(rng, activeClients) : pick(rng, clients);
    // Mix of overdue, today, and upcoming
    const daysOffset = t < 2 ? randInt(rng, -7, -1) // overdue
      : t < 4 ? 0 // today
      : randInt(rng, 1, 21); // upcoming
    const dueDate = new Date(now.getTime() + daysOffset * 86400000);

    contactTasks.push({
      id: uuid(rng),
      user_id: "sandbox",
      client_id: client.id,
      title: pick(rng, TASK_TEMPLATES),
      due_date: dueDate.toISOString().slice(0, 10),
      priority: pick(rng, PRIORITIES),
      notes: rng() < 0.3 ? "Discussed at last meeting" : null,
      completed_at: null,
      created_at: new Date(dueDate.getTime() - randInt(rng, 1, 14) * 86400000).toISOString(),
      updated_at: dueDate.toISOString(),
    });
  }
  contactTasks.sort((a, b) => a.due_date.localeCompare(b.due_date));

  // ── Generate Client Records (Historical Deals) ──────────────────────────
  const clientRecords: ClientRecord[] = [];
  // "Landed" removed in migration 00102 — tx-sourced clients are now cruising
  const landedClients = clients.filter(c => c.status === "cruising");
  for (const hist of historyItems) {
    const recordsForYear = Math.min(hist.annual_tx, landedClients.length);
    for (let r = 0; r < recordsForYear; r++) {
      const client = landedClients[r % landedClients.length];
      const closeMonth = randInt(rng, 1, 12);
      const closeDay = randInt(rng, 1, 28);
      const side = rng() < 0.5 ? "buyer" as const : "seller" as const;
      const gci = Math.round(hist.annual_gci / hist.annual_tx * randRange(rng, 0.7, 1.3));

      clientRecords.push({
        id: uuid(rng),
        user_id: "sandbox",
        client_id: client.id,
        name: client.name,
        side,
        source: client.lead_source,
        address: `${randInt(rng, 10, 999)} ${pick(rng, streets)}, ${pick(rng, cities)}`,
        close_date: `${hist.year}-${String(closeMonth).padStart(2, "0")}-${String(closeDay).padStart(2, "0")}`,
        year: hist.year,
        gci,
        notes: null,
        property_use: rng() < 0.8 ? "primary_residence" : "investment",
        bedrooms: null,
        bathrooms: null,
        garage: null,
        lot_acres: null,
        waterfront: null,
        square_feet: null,
        listing_url: null,
        condition_date: null,
        condition_status: null,
        created_at: ts,
        updated_at: ts,
      });
    }
  }

  // ── Generate Client Relationships ────────────────────────────────────────
  const clientRelationships: ClientRelationship[] = [];
  const pairCount = Math.min(randInt(rng, 2, 5), Math.floor(clients.length / 2));
  for (let p = 0; p < pairCount; p++) {
    const idxA = p * 2;
    const idxB = p * 2 + 1;
    if (idxB < clients.length) {
      clientRelationships.push({
        id: uuid(rng),
        user_id: "sandbox",
        client_id_a: clients[idxA].id,
        client_id_b: clients[idxB].id,
        relationship_type: pick(rng, ["spouse", "spouse", "partner", "referrer"]),
        created_at: ts,
      });
    }
  }

  // ── Generate Flight Plans ────────────────────────────────────────────────
  const flightPlans: FlightPlan[] = [
    {
      id: "sandbox-fp-1", user_id: "sandbox", name: "New Buyer Onboarding",
      description: "Automated sequence for new buyer clients", trigger_status: "boarding" as ClientStatus,
      trigger_tag: null, is_active: true, is_system: true, system_key: "new_buyer_onboarding",
      created_at: ts, updated_at: ts,
    },
    {
      id: "sandbox-fp-2", user_id: "sandbox", name: "Post-Close Follow-up",
      description: "Nurture sequence after deal closes", trigger_status: "cruising" as ClientStatus,
      trigger_tag: null, is_active: true, is_system: true, system_key: "post_close_followup",
      created_at: ts, updated_at: ts,
    },
    {
      id: "sandbox-fp-3", user_id: "sandbox", name: "Sphere Nurture",
      description: "Quarterly touchpoints for SOI clients", trigger_status: "cruising" as ClientStatus,
      trigger_tag: null, is_active: true, is_system: true, system_key: "sphere_nurture",
      created_at: ts, updated_at: ts,
    },
  ];

  const flightPlanSteps: FlightPlanStep[] = [
    // New Buyer Onboarding steps
    { id: "sandbox-fps-1-1", flight_plan_id: "sandbox-fp-1", step_order: 1, delay_days: 0, action_type: "email", template: "Welcome email with buyer guide", created_at: ts },
    { id: "sandbox-fps-1-2", flight_plan_id: "sandbox-fp-1", step_order: 2, delay_days: 3, action_type: "task", template: "Schedule buyer consultation call", created_at: ts },
    { id: "sandbox-fps-1-3", flight_plan_id: "sandbox-fp-1", step_order: 3, delay_days: 7, action_type: "email", template: "Send pre-approval checklist", created_at: ts },
    // Post-Close steps
    { id: "sandbox-fps-2-1", flight_plan_id: "sandbox-fp-2", step_order: 1, delay_days: 3, action_type: "email", template: "Thank you + review request", created_at: ts },
    { id: "sandbox-fps-2-2", flight_plan_id: "sandbox-fp-2", step_order: 2, delay_days: 14, action_type: "task", template: "Check in on move-in", created_at: ts },
    { id: "sandbox-fps-2-3", flight_plan_id: "sandbox-fp-2", step_order: 3, delay_days: 90, action_type: "email", template: "90-day check-in + referral ask", created_at: ts },
    // Sphere Nurture steps
    { id: "sandbox-fps-3-1", flight_plan_id: "sandbox-fp-3", step_order: 1, delay_days: 0, action_type: "email", template: "Quarterly market update", created_at: ts },
    { id: "sandbox-fps-3-2", flight_plan_id: "sandbox-fp-3", step_order: 2, delay_days: 90, action_type: "email", template: "Seasonal check-in", created_at: ts },
  ];

  // ── Generate Property Showings ──────────────────────────────────────────
  const propertyShowings: PropertyShowing[] = [];
  const buyerClients = clients.filter(c => ["boarding", "in_flight"].includes(c.status));
  const showingCount = Math.min(randInt(rng, 5, 15), buyerClients.length * 3);

  for (let s = 0; s < showingCount; s++) {
    const client = buyerClients.length > 0 ? pick(rng, buyerClients) : pick(rng, clients);
    const daysAgo = randInt(rng, 0, 45);
    const showDate = new Date(now.getTime() - daysAgo * 86400000);
    const price = Math.round(avgBoardPrice * randRange(rng, 0.7, 1.3) / 1000) * 1000;

    propertyShowings.push({
      id: uuid(rng),
      user_id: "sandbox",
      client_id: client.id,
      property_address: `${randInt(rng, 10, 999)} ${pick(rng, streets)}`,
      city: pick(rng, cities),
      province_region: province,
      postal_code: null,
      mls_number: `MLS${randInt(rng, 1000000, 9999999)}`,
      listing_price: price,
      property_type: pick(rng, ["detached", "semi", "townhouse", "condo"]) as "detached" | "semi" | "townhouse" | "condo",
      bedrooms: randInt(rng, 1, 5),
      bathrooms: randInt(rng, 1, 4),
      square_feet: randInt(rng, 600, 3500),
      lot_size: null,
      year_built: randInt(rng, 1960, 2024),
      showing_date: showDate.toISOString(),
      client_rating: rng() < 0.7 ? randInt(rng, 2, 5) : null,
      notes: rng() < 0.4 ? pick(rng, ["Client loved the layout", "Too small for family", "Great location, needs renos", "Backup option", "Offer potential"]) : null,
      realtor_ca_url: null,
      screenshot_url: null,
      extracted_data: {},
      created_at: showDate.toISOString(),
      updated_at: showDate.toISOString(),
    });
  }
  propertyShowings.sort((a, b) => b.showing_date.localeCompare(a.showing_date));

  // ── Generate Listing Appointments ────────────────────────────────────────
  const listingAppointments: ListingAppointment[] = [];
  const sellerPipelineClients = clients.filter(c =>
    pipelineDeals.some(d => d.client_name === c.name && d.side === "seller")
  );
  const listingApptCount = Math.min(randInt(rng, 2, 6), Math.max(1, sellerPipelineClients.length + 2));

  for (let la = 0; la < listingApptCount; la++) {
    const client = sellerPipelineClients.length > 0 && la < sellerPipelineClients.length
      ? sellerPipelineClients[la]
      : pick(rng, clients);
    const daysAgo = randInt(rng, 0, 60);
    const apptDate = new Date(now.getTime() - daysAgo * 86400000);
    const estPrice = Math.round(avgBoardPrice * randRange(rng, 0.8, 1.2) / 1000) * 1000;
    const statusOpts = daysAgo > 30 ? ["active", "sold", "expired"] : ["scheduled", "active"];

    listingAppointments.push({
      id: uuid(rng),
      user_id: "sandbox",
      client_id: client.id,
      appointment_date: apptDate.toISOString().slice(0, 10),
      property_address: `${randInt(rng, 10, 999)} ${pick(rng, streets)}, ${pick(rng, cities)}`,
      estimated_list_price: estPrice,
      estimated_commission_pct: 0.025,
      expected_close_date: null,
      listing_agreement_date: null,
      actual_list_price: daysAgo > 14 ? Math.round(estPrice * randRange(rng, 0.95, 1.05) / 1000) * 1000 : null,
      actual_sale_price: daysAgo > 30 && rng() < 0.5 ? Math.round(estPrice * randRange(rng, 0.92, 1.02) / 1000) * 1000 : null,
      status: pick(rng, statusOpts),
      notes: rng() < 0.3 ? "Met with homeowner, discussed pricing strategy" : null,
      created_at: apptDate.toISOString(),
      updated_at: apptDate.toISOString(),
    });
  }

  // ── Generate Outreach Queue ─────────────────────────────────────────────
  const OPPORTUNITY_TYPES: OutreachOpportunityType[] = [
    "closing_anniversary", "idle_client", "birthday",
    "post_close_3", "post_close_14", "post_close_90",
    "review_request", "referral_ask", "new_client_welcome",
    "seasonal_spring", "past_client_check_in",
  ];
  const OUTREACH_SUBJECTS: Record<string, string> = {
    closing_anniversary: "Happy home anniversary!",
    idle_client: "Just checking in — how's everything?",
    birthday: "Happy birthday!",
    post_close_3: "How's the new place?",
    post_close_14: "Two weeks in — settling in well?",
    post_close_90: "90-day check-in — how's everything?",
    review_request: "Would you mind sharing your experience?",
    referral_ask: "Know anyone thinking of buying or selling?",
    new_client_welcome: "Welcome! Here's what to expect",
    seasonal_spring: "Spring market update for your area",
    past_client_check_in: "It's been a while — let's catch up",
  };
  const OUTREACH_BODIES: Record<string, string> = {
    closing_anniversary: "Hi {name}, it's been a year since you closed on your home! I hope you're enjoying it. Let me know if there's anything I can help with.",
    idle_client: "Hi {name}, I noticed we haven't connected in a while. I'd love to catch up and see how things are going. Are you free for a quick call this week?",
    birthday: "Happy birthday, {name}! Wishing you a wonderful year ahead. Let me know if you ever need anything real estate related.",
    review_request: "Hi {name}, I hope you're enjoying your home! If you had a positive experience working together, I'd really appreciate a quick review on Google.",
    referral_ask: "Hi {name}, I hope all is well! If you know anyone thinking of buying or selling, I'd be grateful for the introduction.",
    new_client_welcome: "Welcome, {name}! I'm excited to work together. Here's a quick overview of what to expect as we get started.",
    seasonal_spring: "Hi {name}, the spring market is heating up! Here's a quick update on what's happening in your neighbourhood.",
    past_client_check_in: "Hi {name}, it's been a while since we last connected. I'd love to hear how you're doing and share some market updates.",
  };

  const outreachQueue: OutreachQueueItem[] = [];
  const outreachCount = randInt(rng, 6, 14);
  for (let oq = 0; oq < outreachCount; oq++) {
    const client = pick(rng, clients);
    const oppType = pick(rng, OPPORTUNITY_TYPES);
    const daysAgo = randInt(rng, 0, 7);
    const triggerDate = new Date(now.getTime() - daysAgo * 86400000);
    const status: OutreachStatus = rng() < 0.4 ? "ready" : "draft";
    const subject = OUTREACH_SUBJECTS[oppType] ?? "Checking in";
    const body = (OUTREACH_BODIES[oppType] ?? "Hi {name}, just wanted to reach out.").replace("{name}", client.first_name ?? client.name.split(" ")[0]);

    outreachQueue.push({
      id: uuid(rng),
      user_id: "sandbox",
      client_id: client.id,
      client_record_id: null,
      opportunity_type: oppType,
      trigger_date: triggerDate.toISOString().slice(0, 10),
      context: { clientName: client.name, city: client.city },
      status,
      ai_subject: subject,
      ai_body: body,
      final_subject: status === "ready" ? subject : null,
      final_body: status === "ready" ? body : null,
      sent_at: null,
      created_at: triggerDate.toISOString(),
    });
  }

  // ── Generate Newsletter Queue ────────────────────────────────────────────
  const newsletterQueue: NewsletterQueue[] = [
    {
      id: uuid(rng),
      user_id: "sandbox",
      template_type: "market_update",
      context: { topic: "Spring Market Preview", region: boardName },
      status: "draft",
      ai_subject: `Spring ${currentYear} Market Update — ${boardName}`,
      ai_body: `The spring market is showing strong activity in ${boardName}. Here's what you need to know about current trends, pricing, and what to expect in the months ahead.`,
      final_subject: null,
      final_body: null,
      recipient_tags: [],
      sent_at: null,
      created_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
      updated_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
    },
  ];

  // ── Generate Mileage Logs ───────────────────────────────────────────────
  const TRIP_PURPOSES = [
    "Client showing", "Listing appointment", "Office meeting", "Open house",
    "Client consultation", "Property inspection", "Sign installation",
    "Closing meeting", "CRM follow-up visit", "Networking event",
  ];
  const mileageLogs: MileageLog[] = [];
  const monthsElapsed = currentMonth + 1;
  const tripsPerMonth = tier === "building" ? randInt(rng, 2, 4)
    : tier === "established" ? randInt(rng, 4, 8)
    : randInt(rng, 6, 12);

  for (let m = 0; m < monthsElapsed; m++) {
    const monthTrips = randInt(rng, Math.max(1, tripsPerMonth - 2), tripsPerMonth + 2);
    for (let t = 0; t < monthTrips; t++) {
      const tripDay = randInt(rng, 1, 28);
      const tripDate = `${currentYear}-${String(m + 1).padStart(2, "0")}-${String(tripDay).padStart(2, "0")}`;
      const km = Math.round(randRange(rng, 8, 65) * 10) / 10;
      const craRate = 0.72; // 2025 CRA rate for first 5,000 km — source of truth: CRA_MILEAGE_RATES in packages/core/types/database.ts

      mileageLogs.push({
        id: uuid(rng),
        user_id: "sandbox",
        trip_date: tripDate,
        description: pick(rng, TRIP_PURPOSES),
        from_location: "Home office",
        to_location: `${pick(rng, cities)} — ${pick(rng, streets)}`,
        km,
        cra_rate_per_km: craRate,
        deduction: Math.round(km * craRate * 100) / 100,
        purpose: pick(rng, TRIP_PURPOSES),
        notes: null,
        created_at: `${tripDate}T12:00:00Z`,
        updated_at: `${tripDate}T12:00:00Z`,
      });
    }
  }
  mileageLogs.sort((a, b) => b.trip_date.localeCompare(a.trip_date));

  // ── Generate CCA Assets ─────────────────────────────────────────────────
  const ccaAssets: CcaAsset[] = [
    {
      id: uuid(rng), user_id: "sandbox", cca_class: 10, class_rate: 0.30,
      class_half_year: true, description: "Business vehicle",
      acquisition_date: `${currentYear - 2}-06-15`, original_cost: pick(rng, [35000, 42000, 48000, 55000]),
      business_use_pct: randRange(rng, 0.6, 0.85),
      opening_ucc: 0, additions_this_year: 0, disposals_this_year: 0, cca_claimed_prior: 0,
      notes: null, created_at: ts, updated_at: ts,
    },
    {
      id: uuid(rng), user_id: "sandbox", cca_class: 50, class_rate: 0.55,
      class_half_year: true, description: "MacBook Pro — business laptop",
      acquisition_date: `${currentYear - 1}-01-10`, original_cost: pick(rng, [2500, 3200, 3800]),
      business_use_pct: 0.90,
      opening_ucc: 0, additions_this_year: 0, disposals_this_year: 0, cca_claimed_prior: 0,
      notes: null, created_at: ts, updated_at: ts,
    },
    {
      id: uuid(rng), user_id: "sandbox", cca_class: 8, class_rate: 0.20,
      class_half_year: true, description: "Camera & lighting kit (listing photos)",
      acquisition_date: `${currentYear - 1}-04-20`, original_cost: pick(rng, [1500, 2200, 2800]),
      business_use_pct: 1.0,
      opening_ucc: 0, additions_this_year: 0, disposals_this_year: 0, cca_claimed_prior: 0,
      notes: null, created_at: ts, updated_at: ts,
    },
  ];

  // ── Generate Receipt Expenses ────────────────────────────────────────────
  // Small supplemental receipts that complement the category-based expenses
  const receiptExpenses: { total_amount: number; expense_date: string; category_key: string }[] = [];
  const receiptCategories = ["vehicle", "marketing", "meals", "office_tech"];
  for (let m = 0; m < monthsElapsed; m++) {
    const receiptCount = randInt(rng, 1, 4);
    for (let r = 0; r < receiptCount; r++) {
      receiptExpenses.push({
        total_amount: Math.round(randRange(rng, 15, 250) * 100) / 100,
        expense_date: `${currentYear}-${String(m + 1).padStart(2, "0")}-${String(randInt(rng, 1, 28)).padStart(2, "0")}`,
        category_key: pick(rng, receiptCategories),
      });
    }
  }

  // ── Assemble Dataset ──────────────────────────────────────────────────────
  return {
    transactions,
    pipelineDeals,
    expenseCategories,
    historyItems,
    settingsOverrides,
    clients,
    contactActivities,
    contactTasks,
    clientRecords,
    clientRelationships,
    flightPlans,
    flightPlanSteps,
    propertyShowings,
    listingAppointments,
    outreachQueue,
    newsletterQueue,
    mileageLogs,
    ccaAssets,
    receiptExpenses,
    meta: {
      generatedAt: now.toISOString(),
      boardCode,
      boardName,
      tier,
      avgBoardPrice,
      dealsPerAgent: Math.round(boardDealsPerAgent * 10) / 10,
    },
  };
}
