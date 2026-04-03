/**
 * Troubleshooting Topic Classifier
 *
 * Keyword-based intent classifier that routes user chat messages to the
 * correct troubleshooting playbook. Runs entirely on the server with zero
 * latency — no LLM call needed.
 *
 * Returns the top matching topic (or "general" if no strong match).
 */

export type TroubleshootingTopic =
  | "runway-score"
  | "tax"
  | "pipeline"
  | "expenses"
  | "forecast"
  | "crm"
  | "flight-control"
  | "transactions"
  | "settings"
  | "survival"
  | "benchmark"
  | "social"
  | "import"
  | "voice"
  | "onboarding"
  | "general";

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
  "/expenses":     ["expenses"],
  "/mileage":      ["expenses"],
  "/forecast":     ["forecast", "tax"],
  "/crm":          ["crm"],
  "/clients":      ["crm"],
  "/reports":      ["tax", "benchmark"],
  "/settings":     ["settings"],
  "/history":      ["import"],
  "/guide":        ["onboarding"],
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
    primary: ["client", "crm", "contact", "boarding", "taxiing", "approach", "in-flight", "landed", "cruising"],
    secondary: ["lead", "relationship", "birthday", "tag", "activity", "phone", "email", "note"],
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
    ],
  },
  {
    topic: "flight-control",
    primary: ["flight control", "outreach", "draft", "outreach queue", "ai voice guide"],
    secondary: ["send", "message", "tone", "formal", "casual", "friendly", "suppress", "newsletter"],
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
    primary: ["survival", "runway months", "cash reserve", "burn rate", "emergency"],
    secondary: ["survive", "months left", "critical", "warning"],
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
    ],
  },
  {
    topic: "benchmark",
    primary: ["benchmark", "crea", "cohort", "percentile", "national median"],
    secondary: ["rookie", "growth", "established", "top producer", "peer", "comparison"],
    phrases: [
      "benchmark comparison",
      "crea 2023",
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
