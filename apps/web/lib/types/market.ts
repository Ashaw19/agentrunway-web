// ============================================================================
// Agent Runway — Market Data Types
// Shared type definitions for CREA board market data used across dashboard,
// altimeter, sandbox, settings, and API routes.
// ============================================================================

export interface CreaBoard {
  label: string;          // Human-readable display name
  slug: string;           // Gatsby dropdown value (used in /board/{slug})
  urlCode: string;        // URL board code used in /mls/{urlCode}-... pages
  province: string[];     // Province codes this board covers
  subRegions?: string[];  // Named sub-regions within this board (for sub-region selection)
}

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

  // YoY percentage changes (current month vs same month last year)
  salesYoYPct?: number;
  avgPriceYoYPct?: number;
  dollarVolumeYoYPct?: number;
  newListingsYoYPct?: number;

  // YTD data
  ytdSales?: number;
  ytdSalesYoYPct?: number;
  ytdAvgPrice?: number;
  ytdAvgPriceYoYPct?: number;
  ytdDollarVolume?: number;

  // Multi-year historical comparisons
  historicalComparisons?: Array<{
    year: number;
    salesPct: number | null;
    avgPricePct: number | null;
    dollarVolumePct: number | null;
  }>;

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

export interface AgentMarketPosition {
  agentAvgDeal: number;
  boardAvgPrice: number;
  subRegionName: string;
  differenceAbs: number;    // agent - board (can be negative)
  differencePct: number;    // % above (+) or below (-) board average
  positionLabel: string;    // "Above Market", "At Market", "Below Market"
  positionTier: "above" | "at" | "below";
}
