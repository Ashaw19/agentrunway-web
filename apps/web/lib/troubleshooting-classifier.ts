/**
 * Troubleshooting Topic Classifier
 *
 * Keyword-based intent classifier that routes user chat messages to the
 * correct troubleshooting playbook. Runs entirely on the server with zero
 * latency — no LLM call needed.
 *
 * Returns the top matching topic (or "general" if no strong match).
 */

// Re-export from centralized types for backward compatibility
export type { TroubleshootingTopic } from "@/lib/types/chat";
import type { TroubleshootingTopic } from "@/lib/types/chat";

interface TopicRule {
  topic: TroubleshootingTopic;
  /** Primary keywords — 3 points each */
  primary: string[];
  /** Secondary keywords — 1 point each */
  secondary: string[];
  /** Exact phrases — 5 points each (matched as substrings) */
  phrases: string[];
}

/**
 * Enhancement #1: Page-aware auto-injection.
 * Maps URL paths to default troubleshooting topics.
 * When a user asks a vague question ("why is this wrong?"), the page they're
 * on provides signal for which playbook to inject.
 */
export const PAGE_TO_TOPICS: Record<string, TroubleshootingTopic[]> = {
  "/dashboard":    ["runway-score", "forecast"],
  "/transactions": ["transactions"],
  "/pipeline":     ["pipeline"],
  "/expenses":     ["expenses", "recurring-expenses"],
  "/mileage":      ["mileage", "expenses"],
  "/forecast":     ["forecast", "tax"],
  "/crm":          ["crm"],
  "/clients":      ["crm"],
  "/reports":      ["tax", "benchmark"],
  "/settings":     ["settings", "bank-sync"],
  "/history":      ["import"],
  "/guide":        ["onboarding"],
  "/org":          ["teams"],
  "/org/members":  ["teams"],
  "/org/billing":  ["teams"],
  "/org/reports":  ["teams"],
  "/org/settings": ["teams", "settings"],
  "/org/audit-log": ["teams"],
  "/referrals":    ["referrals"],
  "/overhead":     ["overhead", "tax"],
  "/altimeter":    ["altimeter", "benchmark"],
  "/scenarios":    ["scenarios", "forecast"],
  "/social":       ["social"],
  "/profile":      ["settings"],
  "/flight-control": ["flight-control"],
};

/**
 * Enhancement #3: Deep links for AI responses.
 * Maps each topic to action links the AI can reference when diagnosing issues.
 * Injected into system prompt so the AI can say "Go to [Settings → Commission Split](/settings)".
 */
export const TOPIC_ACTION_LINKS: Record<TroubleshootingTopic, { label: string; href: string }[]> = {
  "runway-score": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Settings → Annual Goal", href: "/settings" },
  ],
  tax: [
    { label: "Forecast → Tax Estimates", href: "/forecast" },
    { label: "Settings → Province & Structure", href: "/settings" },
    { label: "Expenses", href: "/expenses" },
  ],
  pipeline: [
    { label: "Pipeline", href: "/pipeline" },
    { label: "Add Pipeline Deal", href: "/pipeline" },
  ],
  expenses: [
    { label: "Expenses", href: "/expenses" },
    { label: "Mileage Log", href: "/mileage" },
    { label: "Settings → Vehicle Use %", href: "/settings" },
  ],
  forecast: [
    { label: "Forecast", href: "/forecast" },
    { label: "Settings → Seasonal Weights", href: "/settings" },
    { label: "Settings → Annual Goal", href: "/settings" },
  ],
  crm: [
    { label: "Clients (CRM)", href: "/crm" },
    { label: "Flight Control", href: "/crm" },
  ],
  "flight-control": [
    { label: "Clients (CRM)", href: "/crm" },
    { label: "Settings → AI Voice Guide", href: "/settings" },
  ],
  transactions: [
    { label: "Transactions", href: "/transactions" },
    { label: "Add Transaction", href: "/transactions" },
    { label: "Settings → Commission Split", href: "/settings" },
  ],
  settings: [
    { label: "Settings", href: "/settings" },
  ],
  survival: [
    { label: "Dashboard → Survival Runway", href: "/dashboard" },
    { label: "Settings → Cash Reserve", href: "/settings" },
    { label: "Expenses", href: "/expenses" },
  ],
  benchmark: [
    { label: "Reports → Benchmark", href: "/reports" },
    { label: "Settings → Experience Years", href: "/settings" },
  ],
  social: [
    { label: "Social Studio", href: "/social" },
  ],
  import: [
    { label: "Import History", href: "/history" },
    { label: "Transactions", href: "/transactions" },
  ],
  voice: [
    { label: "Dashboard (Voice FAB)", href: "/dashboard" },
  ],
  onboarding: [
    { label: "Guide", href: "/guide" },
    { label: "Settings", href: "/settings" },
  ],
  teams: [
    { label: "Team Dashboard", href: "/org" },
    { label: "Members & Invites", href: "/org/members" },
    { label: "Team Billing", href: "/org/billing" },
    { label: "Team Reports", href: "/org/reports" },
    { label: "Team Settings", href: "/org/settings" },
  ],
  referrals: [
    { label: "Referrals", href: "/referrals" },
    { label: "Transactions", href: "/transactions" },
  ],
  overhead: [
    { label: "Overhead → Tax Estimates", href: "/overhead" },
    { label: "Overhead → CCA Assets", href: "/overhead" },
    { label: "Settings → Province & Structure", href: "/settings" },
    { label: "Expenses", href: "/expenses" },
  ],
  altimeter: [
    { label: "Altimeter → Personal Records", href: "/altimeter" },
    { label: "Altimeter → Insights", href: "/altimeter" },
    { label: "Altimeter → Where You Stand", href: "/altimeter" },
  ],
  scenarios: [
    { label: "Scenarios", href: "/scenarios" },
    { label: "Forecast", href: "/forecast" },
  ],
  mileage: [
    { label: "Expenses → Mileage Tab", href: "/expenses" },
    { label: "Settings → Vehicle Use %", href: "/settings" },
  ],
  "recurring-expenses": [
    { label: "Expenses → Recurring Tab", href: "/expenses" },
  ],
  "bank-sync": [
    { label: "Expenses → Receipts (manual entry)", href: "/expenses" },
    { label: "Expenses → Mileage", href: "/expenses" },
  ],
  "email-integration": [
    { label: "Flight Control (draft, then send from your own email)", href: "/flight-control" },
    { label: "CRM (log sent activity)", href: "/crm" },
  ],
  general: [],
};

const TOPIC_RULES: TopicRule[] = [
  {
    topic: "runway-score",
    primary: ["runway score", "health score", "score grade", "my score", "my grade"],
    secondary: ["score", "grade", "a+", "a ", "b ", "c ", "d ", "f ", "composite", "health"],
    phrases: [
      "why is my score",
      "how is my score calculated",
      "score went down",
      "score went up",
      "score low",
      "score wrong",
      "improve my score",
      "runway score",
      "what does my grade mean",
    ],
  },
  {
    topic: "tax",
    primary: ["tax", "cra", "t2125", "cpp", "qpp", "gst", "hst", "rrsp", "instalment", "deduction", "bracket"],
    secondary: ["federal", "provincial", "filing", "quarterly", "set aside", "write off", "capital cost", "cca", "mileage rate"],
    phrases: [
      "how much tax",
      "tax estimate",
      "set aside per deal",
      "tax rate",
      "effective rate",
      "marginal rate",
      "tax wrong",
      "tax too high",
      "tax too low",
      "tax deduction",
      "home office",
      "gst registration",
      "small supplier",
      "quarterly instalment",
      "cra rates",
      "corporate tax",
      "prec",
      "incorporate",
      "dividend",
      "salary vs dividend",
    ],
  },
  {
    topic: "pipeline",
    primary: ["pipeline", "stage", "weighted gci", "probability", "convert", "deal stage"],
    secondary: ["lead", "showing", "offer", "conditional", "firm", "weighted"],
    phrases: [
      "pipeline deal",
      "move to closed",
      "convert deal",
      "pipeline empty",
      "add to pipeline",
      "pipeline stage",
      "pipeline probability",
      "weighted gci wrong",
      "pipeline forecast",
      "deal probability",
      "forecast accuracy",
      "conversion funnel",
      "listing appointment",
      "buyer client pipeline",
    ],
  },
  {
    topic: "expenses",
    primary: ["expense", "receipt", "ocr", "mileage", "plaid", "bank import", "expense ratio"],
    secondary: ["cost", "spending", "category", "deductible", "vehicle", "marketing", "office", "meals"],
    phrases: [
      "expense ratio",
      "add expense",
      "scan receipt",
      "mileage log",
      "bank connection",
      "auto categoriz",
      "expense too high",
      "expense category",
      "cra category",
      "plaid connect",
      "expense ratio wrong",
      "recurring expense",
      "expense spike",
      "expense alert",
      "smart alert",
      "anomaly",
      "unusual expense",
      "marketing spend",
    ],
  },
  {
    topic: "forecast",
    primary: ["forecast", "projection", "probability band", "scenario", "waterfall", "p10", "p25", "p50", "p75", "p90"],
    secondary: ["conservative", "optimistic", "base", "projected", "year end", "annual"],
    phrases: [
      "projected gci",
      "year end projection",
      "probability band",
      "forecast wrong",
      "5 year",
      "five year",
      "growth plan",
      "goal gap",
      "deals needed",
      "daily pace",
      "forecast page",
      "take home",
      "financial waterfall",
    ],
  },
  {
    topic: "crm",
    primary: ["client", "crm", "contact", "boarding", "scheduled", "in-flight", "in_flight", "cruising", "archive", "hangar", "engagement score"],
    secondary: ["lead", "relationship", "birthday", "tag", "activity", "phone", "email", "note", "showing", "listing appointment", "dormant"],
    phrases: [
      "add client",
      "client status",
      "flight status",
      "stale lead",
      "client detail",
      "contact log",
      "client tier",
      "platinum", "gold tier", "silver tier", "bronze tier",
      "client valuation",
      "save button",
      "first name", "last name",
      "speed to lead",
      "flight plan",
      "client list",
      "overdue client",
      "move to cruising",
      "landed status",
      "scheduled stage",
      "engagement score",
      "client dormant",
      "cooling contact",
      "ascending contact",
      "hot contact",
      "mortgage renewal",
      "mortgage renewal alert",
      "renewal window",
      "renewal due",
    ],
  },
  {
    topic: "flight-control",
    primary: ["flight control", "outreach", "draft", "outreach queue", "ai voice guide", "nurture"],
    secondary: ["send", "message", "tone", "formal", "casual", "friendly", "suppress", "newsletter", "sequence", "post-close", "re-engagement"],
    phrases: [
      "flight control",
      "outreach queue",
      "generate draft",
      "ai voice guide",
      "voice guide",
      "outreach draft",
      "send message",
      "birthday outreach",
      "check-in message",
      "seasonal outreach",
      "communication tone",
      "suppression",
      "over messaging",
      "nurture sequence",
      "post close sequence",
      "re-engagement sequence",
      "post close nurture",
      "send time",
      "best time to send",
      "when to send",
      "mortgage renewal",
      "mortgage renewal alert",
      "renewal window",
      "renewal due",
    ],
  },
  {
    topic: "transactions",
    primary: ["transaction", "deal", "gci", "commission", "sale price", "closed deal"],
    secondary: ["buyer", "seller", "both sides", "split", "referral", "pending", "fallen"],
    phrases: [
      "add transaction",
      "gci calculated",
      "gci wrong",
      "commission percent",
      "gci override",
      "deal closed",
      "deal fell through",
      "both sides",
      "team split",
      "referral split",
      "sale price",
      "deal form",
    ],
  },
  {
    topic: "settings",
    primary: ["setting", "configure", "setup", "preference"],
    secondary: ["province", "split", "brokerage fee", "cap", "goal", "seasonal", "dark mode", "theme"],
    phrases: [
      "change province",
      "commission split",
      "brokerage fee",
      "annual cap",
      "post cap",
      "business structure",
      "sole prop",
      "set goal",
      "change goal",
      "seasonal weight",
      "custom season",
      "vehicle use",
      "home office method",
      "gst registered",
      "color theme",
      "experience years",
      "cash reserve",
    ],
  },
  {
    topic: "survival",
    primary: ["survival", "runway months", "cash reserve", "burn rate", "emergency", "cash position"],
    secondary: ["survive", "months left", "critical", "warning", "implied cash"],
    phrases: [
      "survival runway",
      "how long can i survive",
      "cash runway",
      "monthly burn",
      "net burn",
      "survival critical",
      "runway warning",
      "set cash reserve",
      "update cash reserve",
      "implied cash position",
      "effective cash",
      "cash position",
    ],
  },
  {
    topic: "benchmark",
    primary: ["benchmark", "cohort", "percentile", "national median"],
    secondary: ["rookie", "growth", "established", "top producer", "peer", "comparison"],
    phrases: [
      "benchmark comparison",
      "industry cohort",
      "how do i compare",
      "percentile rank",
      "national median",
      "cohort comparison",
      "where do i stand",
      "market position",
      "board average",
      "market conditions",
      "snlr",
    ],
  },
  {
    topic: "social",
    primary: ["social", "instagram", "carousel", "canva"],
    secondary: ["post", "template", "headshot", "branding", "hashtag", "slide"],
    phrases: [
      "social studio",
      "social page",
      "month in review",
      "instagram carousel",
      "export to instagram",
      "canva zip",
      "social media post",
    ],
  },
  {
    topic: "import",
    primary: ["import", "csv", "spreadsheet", "upload", "pdf import"],
    secondary: ["column", "mapping", "history", "year", "bulk"],
    phrases: [
      "import transactions",
      "import history",
      "csv import",
      "spreadsheet import",
      "pdf import",
      "import failed",
      "import error",
      "column mapping",
      "annual history",
      "import from",
    ],
  },
  {
    topic: "voice",
    primary: ["voice", "microphone", "transcrib", "whisper", "fab"],
    secondary: ["record", "speak", "audio", "amber"],
    phrases: [
      "voice input",
      "voice record",
      "quick action",
      "floating action button",
      "voice not working",
      "microphone not",
      "voice command",
      "speak to add",
    ],
  },
  {
    topic: "onboarding",
    primary: ["onboarding", "getting started", "wizard", "first time", "new user"],
    secondary: ["start", "setup", "begin", "welcome", "tour"],
    phrases: [
      "getting started",
      "how to start",
      "set up my account",
      "onboarding wizard",
      "welcome tour",
      "first steps",
      "new to agent runway",
    ],
  },
  {
    topic: "teams",
    primary: ["team", "organization", "org", "member", "teammate", "leader", "brokerage team"],
    secondary: ["invite", "seat", "billing", "role", "admin", "agent role", "cohort", "roster"],
    phrases: [
      "my team",
      "team dashboard",
      "team report",
      "team performance",
      "team average",
      "invite member",
      "add member",
      "remove member",
      "invite link",
      "team billing",
      "team leader",
      "org settings",
      "team settings",
      "who can see my data",
      "what does my leader see",
      "data sharing",
      "team comparison",
      "compared to team",
      "vs team",
      "team goal",
      "team meeting",
      "onboard my team",
      "member not showing",
      "invite expired",
      "pending invite",
      "org dashboard",
      "team insights",
      "coaching",
      "team coaching",
      "pipeline health report",
      "crm consistency",
      "tax responsibility report",
      "forecasting report",
      "seat limit",
      "member seat",
      "how many seats",
    ],
  },
  {
    topic: "referrals",
    primary: ["referral", "referral fee", "referral partner", "inbound referral", "outbound referral"],
    secondary: ["refer", "referred", "referring", "partner", "brokerage referral"],
    phrases: [
      "how do referrals work",
      "referral fee",
      "referral tracking",
      "log a referral",
      "referral partner",
      "referral percentage",
      "referral status",
      "inbound referral",
      "outbound referral",
      "referred by",
      "referred to",
      "referral fee paid",
      "referral pending",
      "referral closed",
    ],
  },
  {
    topic: "overhead",
    primary: ["overhead", "tax breakdown", "instalment", "depreciation", "cca class", "t2125 category", "gst34", "gst 34"],
    secondary: ["effective rate", "marginal rate", "quarterly payment", "deduction summary", "capital cost allowance", "quick method"],
    phrases: [
      "overhead page",
      "tax breakdown",
      "instalment amount",
      "instalment deadline",
      "cca schedule",
      "depreciation schedule",
      "cca class",
      "undepreciated capital cost",
      "ucc balance",
      "half year rule",
      "deduction by category",
      "t2125 breakdown",
      "hst collected",
      "input tax credit",
      "itc",
      "net hst owing",
      "set aside per deal",
      "paycheque allocation",
      "gst34 form",
      "gst return",
      "hst return",
      "quick method",
      "filing period",
      "line 101",
      "line 103",
      "line 109",
    ],
  },
  {
    topic: "altimeter",
    primary: ["altimeter", "personal record", "best year", "best month", "best deal", "runway score breakdown"],
    secondary: ["insights", "deviation", "anomaly", "year over year", "yoy"],
    phrases: [
      "altimeter page",
      "personal records",
      "best year",
      "best month",
      "best single deal",
      "year over year",
      "all insights",
      "insight engine",
      "board benchmarking",
      "where you stand",
      "where do i stand",
      "launching to leading",
      "deviation detection",
      "runway score breakdown",
      "pace weight",
      "pipeline weight",
      "what is my best",
    ],
  },
  {
    topic: "scenarios",
    primary: ["scenario", "what-if", "what if", "financial model"],
    secondary: ["model", "simulate", "adjust", "variable", "hypothetical"],
    phrases: [
      "scenario page",
      "what if i",
      "what-if model",
      "scenario comparison",
      "adjust deal count",
      "adjust commission rate",
      "adjust expenses",
      "scenario planning",
      "financial scenario",
      "run a scenario",
      "compare scenarios",
    ],
  },
  {
    topic: "mileage",
    primary: ["mileage", "km driven", "kilometre", "kilometer", "vehicle deduction", "mileage log"],
    secondary: ["driving", "trip", "odometer", "fuel", "gas"],
    phrases: [
      "mileage log",
      "log mileage",
      "mileage deduction",
      "cra mileage rate",
      "km driven",
      "mileage tracking",
      "vehicle expense",
      "driving to showing",
      "mileage for tax",
      "how much mileage",
      "mileage ytd",
      "trip log",
    ],
  },
  {
    topic: "recurring-expenses",
    primary: ["recurring expense", "recurring cost", "subscription", "monthly expense"],
    secondary: ["recurring", "auto-generate", "confirm skip"],
    phrases: [
      "recurring expense",
      "set up recurring",
      "monthly subscription",
      "recurring payment",
      "auto generate expense",
      "confirm or skip",
      "recurring tab",
      "cancel recurring",
      "edit recurring",
      "how recurring expenses work",
    ],
  },
  {
    topic: "bank-sync",
    primary: ["bank sync", "plaid", "bank connection", "bank account", "connect bank"],
    secondary: ["sync", "linked account", "bank feed"],
    phrases: [
      "connect bank",
      "bank sync",
      "plaid connection",
      "bank not syncing",
      "disconnect bank",
      "auto categorize",
      "bank import",
      "synced expense",
      "review transaction",
      "bank feed",
      "connect my bank",
    ],
  },
  {
    topic: "email-integration",
    primary: [
      "gmail",
      "google calendar",
      "google drive",
      "google workspace",
      "outlook",
      "microsoft 365",
      "email integration",
      "connect email",
      "connect gmail",
      "connect google",
      "connect outlook",
      "smtp",
    ],
    secondary: ["email account", "email connect", "send email from", "calendar sync", "drive analyze"],
    phrases: [
      "can i connect my gmail",
      "can i connect my email",
      "connect my google account",
      "connect my outlook",
      "send emails from agent runway",
      "sync my calendar",
      "analyze my drive",
      "email forwarding setup",
      "outreach sending",
      "send outreach automatically",
      "auto send email",
    ],
  },
];

/**
 * Classify a user message into a troubleshooting topic.
 * Returns the best-matching topic, or "general" if no strong signal.
 */
export function classifyTopic(message: string): TroubleshootingTopic {
  const lower = message.toLowerCase().trim();
  const scores: Partial<Record<TroubleshootingTopic, number>> = {};

  for (const rule of TOPIC_RULES) {
    let score = 0;

    // Exact phrases (5 points each)
    for (const phrase of rule.phrases) {
      if (lower.includes(phrase)) score += 5;
    }

    // Primary keywords (3 points each)
    for (const kw of rule.primary) {
      if (lower.includes(kw)) score += 3;
    }

    // Secondary keywords (1 point each)
    for (const kw of rule.secondary) {
      // Word boundary check to avoid false positives (e.g., "lead" in "leader")
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (regex.test(lower)) score += 1;
    }

    if (score > 0) {
      scores[rule.topic] = (scores[rule.topic] ?? 0) + score;
    }
  }

  // Find the highest-scoring topic
  let bestTopic: TroubleshootingTopic = "general";
  let bestScore = 0;

  for (const [topic, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic as TroubleshootingTopic;
    }
  }

  // Require a minimum score of 3 to avoid false positives
  return bestScore >= 3 ? bestTopic : "general";
}

/**
 * Returns all matching topics with scores, sorted by relevance.
 * Useful for injecting multiple related playbooks on ambiguous queries.
 */
export function classifyTopicMulti(message: string): { topic: TroubleshootingTopic; score: number }[] {
  const lower = message.toLowerCase().trim();
  const scores: { topic: TroubleshootingTopic; score: number }[] = [];

  for (const rule of TOPIC_RULES) {
    let score = 0;
    for (const phrase of rule.phrases) {
      if (lower.includes(phrase)) score += 5;
    }
    for (const kw of rule.primary) {
      if (lower.includes(kw)) score += 3;
    }
    for (const kw of rule.secondary) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
      if (regex.test(lower)) score += 1;
    }
    if (score >= 3) {
      scores.push({ topic: rule.topic, score });
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}
