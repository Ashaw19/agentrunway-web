// ============================================================================
// Agent Runway — CREA Board Market Data
// Fetches and parses live local market statistics from stats.crea.ca
// Data source: CREA MLS® Statistics (Gatsby static site / Contentful CMS)
// ============================================================================

// ── Board Registry ────────────────────────────────────────────────────────────
// Maps user-facing label → Gatsby slug (used in dropdown) → URL board code
// The URL code is used for chart images and MLS sub-pages
// NOTE: slug == Gatsby react-select value; urlCode == path segment in stats.crea.ca URLs

export interface CreaBoard {
  label: string;          // Human-readable display name
  slug: string;           // Gatsby dropdown value (used in /board/{slug})
  urlCode: string;        // URL board code used in /mls/{urlCode}-... pages
  province: string[];     // Province codes this board covers
  subRegions?: string[];  // Named sub-regions within this board (for sub-region selection)
}

export const CREA_BOARDS: CreaBoard[] = [
  // Alberta
  { label: "Alberta (Province-wide)", slug: "area",  urlCode: "area",  province: ["AB"] },
  { label: "Calgary",                 slug: "calg",  urlCode: "calg",  province: ["AB"] },
  { label: "Central Alberta",         slug: "redd",  urlCode: "redd",  province: ["AB"] },
  { label: "Edmonton",                slug: "edmo",  urlCode: "edmo",  province: ["AB"] },
  { label: "Fort McMurray",           slug: "fort",  urlCode: "fort",  province: ["AB"] },
  { label: "Grande Prairie",          slug: "gran",  urlCode: "gran",  province: ["AB"] },
  { label: "Lethbridge",              slug: "leth",  urlCode: "leth",  province: ["AB"] },
  { label: "Medicine Hat",            slug: "medi",  urlCode: "medi",  province: ["AB"] },
  { label: "South Central Alberta",   slug: "broo",  urlCode: "broo",  province: ["AB"] },
  // BC
  { label: "BC Northern",             slug: "cari",  urlCode: "cari",  province: ["BC"] },
  { label: "Chilliwack",              slug: "chil",  urlCode: "chil",  province: ["BC"] },
  { label: "Fraser Valley",           slug: "fras",  urlCode: "fras",  province: ["BC"] },
  { label: "Kamloops",                slug: "kaml",  urlCode: "kaml",  province: ["BC"] },
  { label: "Kootenay",                slug: "koot",  urlCode: "koot",  province: ["BC"] },
  { label: "Association of Interior REALTORS® – Okanagan", slug: "okan", urlCode: "okan", province: ["BC"] },
  { label: "Association of Interior REALTORS® – South Peace River", slug: "norl", urlCode: "norl", province: ["BC"] },
  { label: "Powell River",            slug: "powe",  urlCode: "powe",  province: ["BC"] },
  { label: "Greater Vancouver",       slug: "vanc",  urlCode: "vanc",  province: ["BC"] },
  { label: "Vancouver Island",        slug: "vani",  urlCode: "vani",  province: ["BC"] },
  { label: "Victoria",                slug: "vict",  urlCode: "vict",  province: ["BC"] },
  // Manitoba
  { label: "Brandon",                 slug: "brnd",  urlCode: "brnd",  province: ["MB"] },
  { label: "Manitoba (Province-wide)", slug: "mrea", urlCode: "mrea",  province: ["MB"] },
  { label: "Portage la Prairie",      slug: "port",  urlCode: "port",  province: ["MB"] },
  { label: "Winnipeg Regional",       slug: "winn",  urlCode: "winn",  province: ["MB"] },
  // New Brunswick
  {
    label: "New Brunswick",
    slug: "nbreb",
    urlCode: "nbrea",
    province: ["NB"],
    subRegions: ["Fredericton Area", "Greater Moncton", "Northern and Valley Region", "Saint John"],
  },
  // Newfoundland & Labrador
  { label: "Newfoundland and Labrador", slug: "stjo", urlCode: "stjo", province: ["NL"] },
  // Northwest Territories
  { label: "Northwest Territories",   slug: "yell",  urlCode: "yell",  province: ["NT"] },
  // Nova Scotia
  { label: "Nova Scotia (NSAR)",       slug: "nsar",  urlCode: "nsar",  province: ["NS"] },
  // Ontario
  { label: "Brantford",               slug: "brnt",  urlCode: "brnt",  province: ["ON"] },
  { label: "Chatham-Kent",            slug: "chat",  urlCode: "chat",  province: ["ON"] },
  { label: "Cornwall and District",   slug: "corn",  urlCode: "corn",  province: ["ON"] },
  { label: "Central Lakes Association of REALTORS®", slug: "osha", urlCode: "osha", province: ["ON"] },
  { label: "Grey Bruce and Owen Sound", slug: "grey", urlCode: "grey", province: ["ON"] },
  { label: "Guelph",                  slug: "guel",  urlCode: "guel",  province: ["ON"] },
  { label: "Hamilton-Burlington",     slug: "hami",  urlCode: "hami",  province: ["ON"] },
  { label: "OnePoint – Huron Perth",  slug: "huro",  urlCode: "huro",  province: ["ON"] },
  { label: "Kingston",                slug: "king",  urlCode: "king",  province: ["ON"] },
  { label: "Kitchener-Waterloo-Cambridge", slug: "wrar", urlCode: "kitc", province: ["ON"] },
  { label: "London",                  slug: "lond",  urlCode: "lond",  province: ["ON"] },
  { label: "Mississauga",             slug: "miss",  urlCode: "miss",  province: ["ON"] },
  { label: "Muskoka & Simcoe County", slug: "musk",  urlCode: "musk",  province: ["ON"] },
  { label: "Niagara",                 slug: "stca",  urlCode: "stca",  province: ["ON"] },
  { label: "North Bay and Area",      slug: "noba",  urlCode: "noba",  province: ["ON"] },
  { label: "Oakville-Milton",         slug: "oakv",  urlCode: "oakv",  province: ["ON"] },
  { label: "Ontario (Province-wide)", slug: "orea",  urlCode: "orea",  province: ["ON"] },
  { label: "Ottawa",                  slug: "otta",  urlCode: "otta",  province: ["ON"] },
  { label: "Renfrew",                 slug: "renf",  urlCode: "renf",  province: ["ON"] },
  { label: "Rideau-St. Lawrence",     slug: "CENT",  urlCode: "cent",  province: ["ON"] },
  { label: "Sarnia-Lambton",          slug: "sarn",  urlCode: "sarn",  province: ["ON"] },
  { label: "Norfolk County",          slug: "simc",  urlCode: "simc",  province: ["ON"] },
  { label: "Sault Ste. Marie",        slug: "saul",  urlCode: "saul",  province: ["ON"] },
  { label: "Sudbury",                 slug: "sudb",  urlCode: "sudb",  province: ["ON"] },
  { label: "Thunder Bay",             slug: "thun",  urlCode: "thun",  province: ["ON"] },
  { label: "Timmins",                 slug: "timm",  urlCode: "timm",  province: ["ON"] },
  { label: "Greater Toronto (TRREB)", slug: "treb",  urlCode: "treb",  province: ["ON"] },
  { label: "Windsor-Essex",           slug: "wind",  urlCode: "wind",  province: ["ON"] },
  { label: "Woodstock-Ingersoll",     slug: "wood",  urlCode: "wood",  province: ["ON"] },
  // PEI
  { label: "Prince Edward Island",    slug: "peia",  urlCode: "peia",  province: ["PE"] },
  // Saskatchewan
  { label: "Saskatchewan (Province-wide)", slug: "sra", urlCode: "sra", province: ["SK"] },
  // Yukon
  { label: "Yukon Real Estate Association", slug: "yuko", urlCode: "yuko", province: ["YT"] },
];

// Province → boards lookup
export function boardsForProvince(provinceCode: string): CreaBoard[] {
  return CREA_BOARDS.filter((b) => b.province.includes(provinceCode));
}

// Province code lookup (maps Province enum value → ISO code)
const PROVINCE_TO_ISO: Record<string, string> = {
  alberta: "AB", britishColumbia: "BC", manitoba: "MB", newBrunswick: "NB",
  newfoundland: "NL", northwestTerritories: "NT", novaScotia: "NS", nunavut: "NU",
  ontario: "ON", princeEdwardIsland: "PE", quebec: "QC", saskatchewan: "SK", yukon: "YT",
};

export function boardsForProvinceEnum(province: string): CreaBoard[] {
  const iso = PROVINCE_TO_ISO[province] ?? province.toUpperCase().slice(0, 2);
  return boardsForProvince(iso);
}

// ── Data Types ────────────────────────────────────────────────────────────────

export interface SubRegionStats {
  name: string;
  sales: number;
  newListings: number;
  dollarVolume: number;
  averagePrice: number;
}

export interface LocalMarketData {
  boardSlug: string;
  boardName: string;
  reportMonth: string;           // e.g. "February 2026"

  // Monthly stats
  subRegions: SubRegionStats[];
  boardTotal: SubRegionStats;

  // Derived
  salesToNewListingsRatio: number;   // 0–1
  marketCondition: "seller" | "balanced" | "buyer";
  marketConditionLabel: string;

  // Quarterly (from MLS market conditions page)
  quarterlyUnitSales?: number;
  quarterlyPriorYearSales?: number;
  quarterlyUnitSalesYoY?: number;   // % change
  medianSalePrice?: number;
  medianSalePriceYoY?: number;      // % change

  // Sales by price range (most recent quarter)
  salesByPriceRange?: {
    band: string;
    yoyPct: number;
  }[];

  cachedAt: string;                 // ISO timestamp
}

// ── Parsing Helpers ───────────────────────────────────────────────────────────

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/[,\s]/g, "")) || 0;
}

function parseNbreaHomeEdges(edges: Array<{ node: Record<string, string> }>): {
  subRegions: SubRegionStats[];
  boardTotal: SubRegionStats;
  reportMonth: string;
} {
  // First edge is the header row; last edge is the board total
  const header = edges[0]?.node;
  const reportMonth = header?.field_1 ?? "";
  const dataRows = edges.slice(1);
  const subRegions: SubRegionStats[] = [];
  let boardTotal: SubRegionStats = { name: "", sales: 0, newListings: 0, dollarVolume: 0, averagePrice: 0 };

  for (const { node } of dataRows) {
    const row: SubRegionStats = {
      name: node.field_1?.trim() ?? "",
      sales: parseNum(node.field_2 ?? "0"),
      newListings: parseNum(node.field_3 ?? "0"),
      dollarVolume: parseDollar(node.field_4 ?? "0"),
      averagePrice: parseDollar(node.field_5 ?? "0"),
    };
    // The last row is usually the province/board total
    if (
      row.name.toLowerCase().includes("new brunswick") ||
      row.name.toLowerCase().includes("nova scotia") ||
      row.name.toLowerCase().includes("ontario") ||
      row.name.toLowerCase().includes("alberta") ||
      row.name.toLowerCase().includes("total") ||
      row.name.toLowerCase().includes("province") ||
      row.name.toLowerCase() === "nb"
    ) {
      boardTotal = row;
    } else {
      subRegions.push(row);
    }
  }

  // If no explicit total row found, compute from sub-regions
  if (boardTotal.sales === 0 && subRegions.length > 0) {
    boardTotal = {
      name: "Board Total",
      sales: subRegions.reduce((s, r) => s + r.sales, 0),
      newListings: subRegions.reduce((s, r) => s + r.newListings, 0),
      dollarVolume: subRegions.reduce((s, r) => s + r.dollarVolume, 0),
      averagePrice: subRegions.reduce((s, r) => s + r.averagePrice, 0) / subRegions.length,
    };
  }

  return { subRegions, boardTotal, reportMonth };
}

function parseMarketCondition(ratio: number): { condition: LocalMarketData["marketCondition"]; label: string } {
  // CREA long-run average sales-to-new-listings ratio is 54.8%
  // >65% = seller's market; 45–65% = balanced; <45% = buyer's market
  if (ratio > 0.65) return { condition: "seller", label: "Seller's Market" };
  if (ratio < 0.45) return { condition: "buyer", label: "Buyer's Market" };
  return { condition: "balanced", label: "Balanced Market" };
}

// ── Gatsby JSON prefix detection ──────────────────────────────────────────────
// Board data in the Gatsby JSON is keyed by a prefix derived from the urlCode
// e.g. nbrea → NbreaHome1, treb → TrebRA1, nsar → NsarHome1
// This mapping covers all major board prefixes found in the Gatsby JSON

const URL_CODE_TO_PREFIX: Record<string, string> = {
  nbrea: "Nbrea", treb: "Treb", edmo: "Edmo", calg: "Calg", vanc: "Vanc",
  fras: "Fras", vict: "Vict", vani: "Vani", otta: "Otta", hami: "Hami",
  lond: "Lond", winn: "Winn", nsar: "Nsar", stjo: "Stjo", musk: "Musk",
  orea: "Orea", miss: "Miss", osha: "Osha", oakv: "Oakv", guel: "Guel",
  kitc: "Kitc", area: "Area", okan: "Okan", sra: "Sra", peia: "Peia",
  mrea: "Mrea", wind: "Wind", brnd: "Brnd", stca: "Stca", chat: "Chat",
  grey: "Grey", king: "King", corn: "Corn", kaml: "Kaml", koot: "Koot",
  leth: "Leth", brnt: "Brnt", gran: "Gran", medi: "Medi", redd: "Redd",
  sudb: "Sudb", thun: "Thun", timm: "Timm", renf: "Renf", noba: "Noba",
  huro: "Huro", wrar: "Wrar", wood: "Wood", sarn: "Sarn", saul: "Saul",
  simc: "Simc", norl: "Norl", broo: "Broo", fort: "Fort", powe: "Powe",
  yuko: "Yuko", cari: "Cari", chil: "Chil", yell: "Yell", port: "Port",
  cent: "Cent",
};

// ── Main Fetch Function ───────────────────────────────────────────────────────

export async function fetchBoardData(board: CreaBoard): Promise<LocalMarketData | null> {
  const baseUrl = "https://stats.crea.ca/page-data/board";
  const mlsUrl = "https://stats.crea.ca/page-data/mls";

  try {
    // 1. Fetch main board page JSON
    const boardRes = await fetch(`${baseUrl}/${board.slug}/page-data.json`, {
      next: { revalidate: 86400 }, // 24-hour ISR cache
      headers: { "User-Agent": "AgentRunway/1.0 (+https://agentrunway.ca)" },
    });
    if (!boardRes.ok) return null;

    const boardJson = await boardRes.json();
    const d = boardJson?.result?.data ?? {};
    const prefix = URL_CODE_TO_PREFIX[board.urlCode.toLowerCase()] ??
                   (board.urlCode.charAt(0).toUpperCase() + board.urlCode.slice(1));

    // 2. Find the Home1 table (main monthly stats table)
    const homeKey = `${prefix}Home1`;
    const homeEdges: Array<{ node: Record<string, string> }> = d[homeKey]?.edges ?? [];

    let subRegions: SubRegionStats[] = [];
    let boardTotal: SubRegionStats = { name: board.label, sales: 0, newListings: 0, dollarVolume: 0, averagePrice: 0 };
    let reportMonth = "";

    if (homeEdges.length > 1) {
      const parsed = parseNbreaHomeEdges(homeEdges);
      subRegions = parsed.subRegions;
      boardTotal = parsed.boardTotal.sales > 0 ? parsed.boardTotal : (parsed.subRegions[parsed.subRegions.length - 1] ?? boardTotal);
      reportMonth = parsed.reportMonth;
    }

    // 3. Calculate market condition from sales-to-new-listings ratio
    const totalSales = boardTotal.sales > 0 ? boardTotal.sales :
      subRegions.reduce((s, r) => s + r.sales, 0);
    const totalListings = boardTotal.newListings > 0 ? boardTotal.newListings :
      subRegions.reduce((s, r) => s + r.newListings, 0);
    const ratio = totalListings > 0 ? totalSales / totalListings : 0;
    const { condition, label: conditionLabel } = parseMarketCondition(ratio);

    // 4. Fetch MLS market conditions (quarterly data)
    let quarterlyUnitSales: number | undefined;
    let quarterlyPriorYearSales: number | undefined;
    let quarterlyUnitSalesYoY: number | undefined;
    let medianSalePrice: number | undefined;
    let medianSalePriceYoY: number | undefined;
    let salesByPriceRange: LocalMarketData["salesByPriceRange"];

    try {
      const mlsRes = await fetch(
        `${mlsUrl}/${board.urlCode}-market-conditions/page-data.json`,
        { next: { revalidate: 86400 }, headers: { "User-Agent": "AgentRunway/1.0" } }
      );
      if (mlsRes.ok) {
        const mlsJson = await mlsRes.json();
        const mlsData = mlsJson?.result?.data ?? {};

        // RA1 = residential activity (unit sales + median price)
        const raKey = `${prefix}RA1`;
        const raEdges: Array<{ node: Record<string, string> }> = mlsData[raKey]?.edges ?? [];
        for (const { node } of raEdges) {
          const cat = node.field_1?.toLowerCase() ?? "";
          if (cat.includes("unit sales")) {
            quarterlyUnitSales = parseNum(node.field_2 ?? "0");
            quarterlyPriorYearSales = parseNum(node.field_3 ?? "0");
            quarterlyUnitSalesYoY = parseNum(node.field_4 ?? "0");
          } else if (cat.includes("median")) {
            medianSalePrice = parseDollar(node.field_2 ?? "0");
            medianSalePriceYoY = parseNum(node.field_4 ?? "0");
          }
        }

        // SP1 = sales by price range
        const spKey = `${prefix}SP1`;
        const spEdges: Array<{ node: Record<string, string> }> = mlsData[spKey]?.edges ?? [];
        if (spEdges.length >= 2) {
          const headerRow = spEdges[0]?.node ?? {};
          const dataRow = spEdges[1]?.node ?? {};
          const bands = ["field_2", "field_3", "field_4", "field_5", "field_6"];
          salesByPriceRange = bands
            .map((f) => ({
              band: headerRow[f]?.trim() ?? "",
              yoyPct: parseNum(dataRow[f] ?? "0"),
            }))
            .filter((b) => b.band !== "");
        }
      }
    } catch {
      // MLS data is optional — continue without it
    }

    return {
      boardSlug: board.slug,
      boardName: board.label,
      reportMonth,
      subRegions,
      boardTotal,
      salesToNewListingsRatio: ratio,
      marketCondition: condition,
      marketConditionLabel: conditionLabel,
      quarterlyUnitSales,
      quarterlyPriorYearSales,
      quarterlyUnitSalesYoY,
      medianSalePrice,
      medianSalePriceYoY,
      salesByPriceRange,
      cachedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Board Agent Count Lookup ──────────────────────────────────────────────────
// Approximate licensed REALTOR® member counts per board (2023–2024 data).
// Sources: individual board annual reports, board websites, CREA media releases.
// Used to calculate average deals-per-agent for market share benchmarking.
// These figures are intentionally conservative midpoints — actual counts shift
// ±5–10% year-over-year as licensing fluctuates.

// Keys MUST match the board `slug` values in CREA_BOARDS above,
// because `settings.board_code` stores the slug. Previously these
// used organisation acronyms (trreb, rebgv, etc.) which never matched
// the slugs, so the lookup always returned undefined.
export const BOARD_AGENT_COUNTS: Record<string, number> = {
  // Ontario — slugs from CREA_BOARDS
  treb:     73000,   // Toronto Regional Real Estate Board — confirmed
  otta:      3750,   // Ottawa Real Estate Board — confirmed
  hami:      3250,   // Hamilton-Burlington REALTORS® — estimated (post-merger)
  lond:      2750,   // London St. Thomas REALTORS® — estimated
  wrar:      1000,   // Kitchener-Waterloo — estimated (slug "wrar")
  stca:      1100,   // Niagara Association of REALTORS® — estimated
  wind:       900,   // Windsor-Essex — estimated
  guel:       800,   // Guelph & District — estimated
  musk:       700,   // Muskoka & Simcoe County — estimated
  sudb:       400,   // Sudbury — estimated
  miss:      4200,   // Mississauga — estimated
  oakv:      2200,   // Oakville-Milton — estimated
  osha:      2000,   // Central Lakes (Durham/Oshawa) — estimated
  king:       900,   // Kingston — estimated
  brnt:       700,   // Brantford — estimated
  grey:       600,   // Grey Bruce & Owen Sound — estimated
  // British Columbia
  vanc:     15500,   // Real Estate Board of Greater Vancouver — confirmed
  fras:      4750,   // Fraser Valley — confirmed
  vict:      1800,   // Victoria — estimated
  vani:      1400,   // Vancouver Island — estimated
  okan:      2100,   // Interior REALTORS® Okanagan — estimated
  kaml:       500,   // Kamloops — estimated
  // Alberta
  calg:      7250,   // Calgary Real Estate Board — confirmed
  edmo:      4250,   // REALTORS® Association of Edmonton — confirmed
  redd:       700,   // Central Alberta (Red Deer) — estimated
  leth:       500,   // Lethbridge — estimated
  gran:       350,   // Grande Prairie — estimated
  medi:       300,   // Medicine Hat — estimated
  // Manitoba
  winn:      2100,   // Winnipeg Regional Real Estate Board — estimated
  mrea:      2100,   // Manitoba Real Estate Association — confirmed
  // Saskatchewan
  sra:       1500,   // Saskatchewan REALTORS® Association — confirmed
  // Atlantic
  nsar:      1500,   // Nova Scotia Association of REALTORS® — confirmed
  nbreb:     1200,   // New Brunswick Real Estate Association — confirmed (slug "nbreb")
  stjo:       800,   // Newfoundland & Labrador REALTORS® — confirmed
  // PEI
  peia:       400,   // Prince Edward Island — estimated
};

// ── Market Momentum ───────────────────────────────────────────────────────────
// Three metrics comparing the agent's business trajectory against their local board.

export interface MarketMomentum {
  // Metric 1 — YoY deal count growth vs. board market growth (PRIMARY DASHBOARD METRIC)
  agentPriorYearDeals:   number | null;  // prior full-year deal count (from history)
  agentCurrentYearDeals: number;         // YTD closed deals
  agentDealGrowthPct:    number | null;  // YoY % change in agent's deal count
  boardSalesYoYPct:      number | null;  // board's YoY sales % change (from CREA quarterly)
  gainLossVsMarket:      number | null;  // agentGrowthPct − boardYoY (positive = gaining share)
  momentumTier:          "gaining" | "tracking" | "trailing" | "no_data";
  momentumLabel:         string;

  // Metric 2 — Estimated deals-per-agent vs. your deal count (for reports)
  boardAgentCount:         number | null;  // estimated licensed agents in board
  monthlyBoardSales:       number | null;  // board's monthly sales volume
  avgDealsPerAgentPerYear: number | null;  // annualized board sales ÷ agent count
  agentAnnualizedDeals:    number | null;  // projected full-year deal count from YTD pace

  // Metric 3 — GCI growth rate vs. board price appreciation (for reports)
  agentPriorYearGCI:    number | null;  // prior full-year GCI (from history)
  agentYtdGCI:          number;         // current YTD GCI
  agentGCIGrowthPct:    number | null;  // YoY GCI growth %
  boardPriceYoYPct:     number | null;  // board's YoY median price % change
  gciVsPriceGrowthDiff: number | null;  // agentGCIGrowthPct − boardPriceYoYPct

  // Context
  reportMonth:  string;
  boardName:    string;
}

export function computeMarketMomentum(
  boardCode:        string,
  ytdDealCount:     number,
  ytdGCI:           number,
  marketData:       LocalMarketData,
  historyItems:     { year: number; annual_tx: number; annual_gci: number }[],
  currentYear:      number,
): MarketMomentum {
  const priorYear      = currentYear - 1;
  const priorHistory   = historyItems.find((h) => h.year === priorYear) ?? null;
  const dayOfYear      = Math.ceil((Date.now() - new Date(`${currentYear}-01-01`).getTime()) / 86_400_000);
  const yearFraction   = dayOfYear / 365;

  // ── Metric 1 ───────────────────────────────────────────────────────────────
  // Compare YTD deals against prorated prior-year pace (not full-year total).
  // Without this adjustment, every agent looks like they're trailing in Q1/Q2
  // because we'd be comparing 3 YTD deals against 12 full-year deals.
  const agentPriorYearDeals  = priorHistory?.annual_tx ?? null;
  const priorYearPaceDeals   = agentPriorYearDeals != null ? agentPriorYearDeals * yearFraction : null;
  const agentDealGrowthPct   =
    priorYearPaceDeals != null && priorYearPaceDeals >= 0.5
      ? ((ytdDealCount - priorYearPaceDeals) / priorYearPaceDeals) * 100
      : null;

  // CREA provides YoY as a decimal or percentage depending on the field;
  // quarterlyUnitSalesYoY is already in % points (e.g. 12.5 = +12.5%)
  const boardSalesYoYPct = marketData.quarterlyUnitSalesYoY ?? null;

  const gainLossVsMarket =
    agentDealGrowthPct != null && boardSalesYoYPct != null
      ? agentDealGrowthPct - boardSalesYoYPct
      : null;

  let momentumTier: MarketMomentum["momentumTier"];
  let momentumLabel: string;

  if (gainLossVsMarket == null) {
    momentumTier  = "no_data";
    momentumLabel = "Not enough data yet";
  } else if (gainLossVsMarket > 5) {
    momentumTier  = "gaining";
    momentumLabel = "Gaining Market Share";
  } else if (gainLossVsMarket < -5) {
    momentumTier  = "trailing";
    momentumLabel = "Trailing the Market";
  } else {
    momentumTier  = "tracking";
    momentumLabel = "Tracking the Market";
  }

  // ── Metric 2 ───────────────────────────────────────────────────────────────
  const boardAgentCount        = BOARD_AGENT_COUNTS[boardCode] ?? null;
  const monthlyBoardSales      = marketData.boardTotal.sales > 0 ? marketData.boardTotal.sales : null;
  const avgDealsPerAgentPerYear =
    boardAgentCount != null && monthlyBoardSales != null
      ? Math.round((monthlyBoardSales * 12) / boardAgentCount * 10) / 10
      : null;
  const agentAnnualizedDeals   =
    yearFraction > 0.05
      ? Math.round(ytdDealCount / yearFraction)
      : null;

  // ── Metric 3 ───────────────────────────────────────────────────────────────
  // Same prorated comparison for GCI — compare YTD against where they should
  // be at this point in the year based on last year's full-year GCI.
  const agentPriorYearGCI  = priorHistory?.annual_gci ?? null;
  const priorYearPaceGCI   = agentPriorYearGCI != null ? agentPriorYearGCI * yearFraction : null;
  const agentGCIGrowthPct  =
    priorYearPaceGCI != null && priorYearPaceGCI > 0
      ? ((ytdGCI - priorYearPaceGCI) / priorYearPaceGCI) * 100
      : null;
  const boardPriceYoYPct   = marketData.medianSalePriceYoY ?? null;
  const gciVsPriceGrowthDiff =
    agentGCIGrowthPct != null && boardPriceYoYPct != null
      ? agentGCIGrowthPct - boardPriceYoYPct
      : null;

  return {
    agentPriorYearDeals,
    agentCurrentYearDeals: ytdDealCount,
    agentDealGrowthPct,
    boardSalesYoYPct,
    gainLossVsMarket,
    momentumTier,
    momentumLabel,
    boardAgentCount,
    monthlyBoardSales,
    avgDealsPerAgentPerYear,
    agentAnnualizedDeals,
    agentPriorYearGCI,
    agentYtdGCI: ytdGCI,
    agentGCIGrowthPct,
    boardPriceYoYPct,
    gciVsPriceGrowthDiff,
    reportMonth: marketData.reportMonth,
    boardName:   marketData.boardName,
  };
}

// ── Agent Market Position ─────────────────────────────────────────────────────
// Computes how the agent's average deal size compares to the local board average.

export interface AgentMarketPosition {
  agentAvgDeal: number;
  boardAvgPrice: number;
  subRegionName: string;
  differenceAbs: number;    // agent - board (can be negative)
  differencePct: number;    // % above (+) or below (-) board average
  positionLabel: string;    // "Above Market", "At Market", "Below Market"
  positionTier: "above" | "at" | "below";
}

export function computeAgentMarketPosition(
  agentAvgDealSize: number,
  marketData: LocalMarketData,
  preferredSubRegion?: string
): AgentMarketPosition {
  // Use sub-region avg if specified and available, otherwise board total
  let boardAvgPrice = marketData.boardTotal.averagePrice;
  let subRegionName = marketData.boardName;

  if (preferredSubRegion) {
    const sr = marketData.subRegions.find(
      (r) => r.name.toLowerCase().includes(preferredSubRegion.toLowerCase())
    );
    if (sr && sr.averagePrice > 0) {
      boardAvgPrice = sr.averagePrice;
      subRegionName = sr.name;
    }
  }

  const diff = agentAvgDealSize - boardAvgPrice;
  const pct = boardAvgPrice > 0 ? (diff / boardAvgPrice) * 100 : 0;

  let positionLabel: string;
  let positionTier: AgentMarketPosition["positionTier"];

  if (pct > 5) {
    positionLabel = "Above Market";
    positionTier = "above";
  } else if (pct < -5) {
    positionLabel = "Below Market";
    positionTier = "below";
  } else {
    positionLabel = "At Market";
    positionTier = "at";
  }

  return {
    agentAvgDeal: agentAvgDealSize,
    boardAvgPrice,
    subRegionName,
    differenceAbs: diff,
    differencePct: pct,
    positionLabel,
    positionTier,
  };
}
