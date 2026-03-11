#!/usr/bin/env npx tsx
/**
 * Agent Runway — Seed Test Agent
 * ================================
 * Creates a test agent "Sarah Chen" in Supabase with realistic data
 * across every table. Use this for:
 *   1. Visual verification of all dashboard/forecast computations
 *   2. QA testing of every page and feature
 *   3. Comparing UI outputs against unit test expected values
 *
 * Usage:
 *   npx tsx scripts/seed-test-agent.ts
 *
 * Prerequisites:
 *   - .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Run with service role key (not anon key) to bypass RLS
 *
 * The script is idempotent — it upserts by user_id, so re-running
 * updates existing data instead of duplicating.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  console.error("   Add SUPABASE_SERVICE_ROLE_KEY to .env.local (find it in Supabase dashboard → Settings → API)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test Agent Constants ─────────────────────────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"; // deterministic UUID
const CURRENT_YEAR = new Date().getFullYear();

// ── User Settings ────────────────────────────────────────────────────────────

const userSettings = {
  user_id: TEST_USER_ID,
  display_name: "Sarah Chen",
  avatar_url: null,
  province: "ontario",
  split_preset: "p80_20",
  goal_gci: 150_000,
  experience_years: 4,
  cash_reserve: 15_000,
  monthly_brokerage_fee: 500,
  monthly_recurring_expenses: 800,
  tx_fee_rate_pct: 0.02,
  tx_fee_annual_cap: 3_000,
  post_cap_threshold_gci: 100_000,
  post_cap_agent_pct: 0.95,
  post_cap_brokerage_pct: 0.05,
  seasonal_weights: [0.20, 0.30, 0.30, 0.20],
  growth_goals: [0.10, 0.10, 0.08, 0.08, 0.05],
  onboarding_complete: true,
  ytd_gci: 0,
  ytd_transactions: 0,
  ytd_volume: 0,
  pipeline_monthly_estimate: 0,
};

// ── Transactions (6 closed deals) ────────────────────────────────────────────
// These match the test-data.ts fixtures used in unit tests.
// Expected total YTD GCI: $66,375

const transactions = [
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-01-15`,
    sale_price: 450_000,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    team_split_pct: null,
    notes: "123 Maple Ave, Toronto — First deal of the year",
    address: "123 Maple Ave, Toronto",
  },
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-01-28`,
    sale_price: 720_000,
    commission_pct: 0.025,
    gci_override: 15_000, // Override — bypasses calculation
    side: "buyer",
    status: "closed",
    team_split_pct: null,
    notes: "456 Oak St, Mississauga — GCI override (referral deal)",
    address: "456 Oak St, Mississauga",
  },
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-02-10`,
    sale_price: 600_000,
    commission_pct: 0.025,
    side: "seller",
    status: "closed",
    team_split_pct: 0.5, // 50% team split
    gci_override: null,
    notes: "789 Pine Rd, Vaughan — Team deal (50/50 split)",
    address: "789 Pine Rd, Vaughan",
  },
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-02-20`,
    sale_price: 380_000,
    commission_pct: 0.025,
    gci_override: null,
    side: "seller",
    status: "closed",
    team_split_pct: null,
    notes: "321 Birch Lane, Brampton",
    address: "321 Birch Lane, Brampton",
  },
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-03-05`,
    sale_price: 525_000,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    team_split_pct: null,
    notes: "654 Elm Ct, Markham",
    address: "654 Elm Ct, Markham",
  },
  {
    user_id: TEST_USER_ID,
    date: `${CURRENT_YEAR}-03-08`,
    sale_price: 400_000,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    team_split_pct: null,
    notes: "987 Cedar Dr, Richmond Hill",
    address: "987 Cedar Dr, Richmond Hill",
  },
];

// ── Pipeline Deals (3 active) ────────────────────────────────────────────────
// Expected total weighted GCI: $22,887.50

const pipelineDeals = [
  {
    user_id: TEST_USER_ID,
    stage: "lead",
    estimated_price: 500_000,
    estimated_commission_pct: 0.025,
    probability_override: null,
    client_name: "Alex Rivera",
    notes: "Initial inquiry — first showing next week",
  },
  {
    user_id: TEST_USER_ID,
    stage: "conditional",
    estimated_price: 650_000,
    estimated_commission_pct: 0.025,
    probability_override: null,
    client_name: "Jordan Park",
    notes: "Conditional offer accepted — home inspection pending",
  },
  {
    user_id: TEST_USER_ID,
    stage: "firm",
    estimated_price: 420_000,
    estimated_commission_pct: 0.025,
    probability_override: null,
    client_name: "Priya Sharma",
    notes: "Firm deal — closing in 3 weeks",
  },
];

// ── History Items (3 years for seasonality) ──────────────────────────────────

const historyItems = [
  {
    user_id: TEST_USER_ID,
    year: CURRENT_YEAR - 1,
    annual_gci: 95_000,
    annual_transactions: 9,
    annual_volume: 3_800_000,
    quarterly_gci: [15_000, 30_000, 30_000, 20_000],
    quarterly_transactions: [2, 3, 3, 1],
  },
  {
    user_id: TEST_USER_ID,
    year: CURRENT_YEAR - 2,
    annual_gci: 72_000,
    annual_transactions: 7,
    annual_volume: 2_900_000,
    quarterly_gci: [12_000, 22_000, 24_000, 14_000],
    quarterly_transactions: [1, 2, 3, 1],
  },
  {
    user_id: TEST_USER_ID,
    year: CURRENT_YEAR - 3,
    annual_gci: 42_000,
    annual_transactions: 4,
    annual_volume: 1_600_000,
    quarterly_gci: [5_000, 15_000, 15_000, 7_000],
    quarterly_transactions: [0, 2, 1, 1],
  },
];

// ── Expense Categories + Items ───────────────────────────────────────────────

const expenseCategories = [
  { name: "Marketing", sort_order: 0 },
  { name: "Office & Desk", sort_order: 1 },
  { name: "Technology", sort_order: 2 },
  { name: "Education", sort_order: 3 },
  { name: "Vehicle", sort_order: 4 },
  { name: "Insurance", sort_order: 5 },
  { name: "Professional Fees", sort_order: 6 },
  { name: "Client Entertainment", sort_order: 7 },
];

// Expense items will be inserted after categories are created (need category IDs)
const expenseItemsTemplate = [
  { category: "Marketing", description: "Social media ads", amount: 200, is_recurring: true },
  { category: "Marketing", description: "Business cards / print", amount: 150, is_recurring: false },
  { category: "Marketing", description: "Website hosting", amount: 30, is_recurring: true },
  { category: "Office & Desk", description: "Desk fee", amount: 0, is_recurring: true }, // Included in brokerage fee
  { category: "Technology", description: "CRM subscription", amount: 80, is_recurring: true },
  { category: "Technology", description: "Laptop payment", amount: 100, is_recurring: true },
  { category: "Education", description: "RECO renewal", amount: 350, is_recurring: false },
  { category: "Education", description: "Conference", amount: 500, is_recurring: false },
  { category: "Vehicle", description: "Gas / mileage", amount: 250, is_recurring: true },
  { category: "Vehicle", description: "Car insurance", amount: 140, is_recurring: true },
  { category: "Insurance", description: "E&O insurance", amount: 1_200, is_recurring: false },
  { category: "Professional Fees", description: "Accounting", amount: 600, is_recurring: false },
  { category: "Client Entertainment", description: "Closing gifts", amount: 500, is_recurring: false },
];

// ── Seed Logic ───────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding test agent: Sarah Chen");
  console.log(`   User ID: ${TEST_USER_ID}`);
  console.log(`   Province: Ontario | Split: 80/20 | Goal GCI: $150,000`);
  console.log("");

  // 1. Upsert user settings
  console.log("📋 Upserting user_settings...");
  const { error: settingsErr } = await supabase
    .from("user_settings")
    .upsert(userSettings, { onConflict: "user_id" });
  if (settingsErr) throw new Error(`user_settings: ${settingsErr.message}`);
  console.log("   ✓ user_settings");

  // 2. Delete existing test data (for idempotency)
  console.log("🧹 Clearing existing test data...");
  await supabase.from("transactions").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("pipeline_deals").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("history_items").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("expense_items").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("expense_categories").delete().eq("user_id", TEST_USER_ID);
  console.log("   ✓ Cleared");

  // 3. Insert transactions
  console.log("💰 Inserting 6 transactions...");
  const { error: txErr } = await supabase.from("transactions").insert(transactions);
  if (txErr) throw new Error(`transactions: ${txErr.message}`);
  console.log("   ✓ 6 transactions (YTD GCI: $66,375)");

  // 4. Insert pipeline deals
  console.log("📊 Inserting 3 pipeline deals...");
  const { error: pipeErr } = await supabase.from("pipeline_deals").insert(pipelineDeals);
  if (pipeErr) throw new Error(`pipeline_deals: ${pipeErr.message}`);
  console.log("   ✓ 3 pipeline deals (Weighted GCI: $22,887.50)");

  // 5. Insert history items
  console.log("📅 Inserting 3 years of history...");
  const { error: histErr } = await supabase.from("history_items").insert(historyItems);
  if (histErr) throw new Error(`history_items: ${histErr.message}`);
  console.log("   ✓ 3 history items");

  // 6. Insert expense categories
  console.log("📁 Inserting 8 expense categories...");
  const catRows = expenseCategories.map((c) => ({ user_id: TEST_USER_ID, ...c }));
  const { data: cats, error: catErr } = await supabase
    .from("expense_categories")
    .insert(catRows)
    .select("id, name");
  if (catErr) throw new Error(`expense_categories: ${catErr.message}`);
  console.log(`   ✓ ${cats!.length} categories`);

  // 7. Insert expense items
  const catMap = new Map<string, string>();
  for (const cat of cats!) {
    catMap.set(cat.name, cat.id);
  }

  const expenseRows = expenseItemsTemplate.map((e) => ({
    user_id: TEST_USER_ID,
    category_id: catMap.get(e.category)!,
    description: e.description,
    amount: e.amount,
    is_recurring: e.is_recurring,
  }));

  console.log("💵 Inserting 13 expense items...");
  const { error: expErr } = await supabase.from("expense_items").insert(expenseRows);
  if (expErr) throw new Error(`expense_items: ${expErr.message}`);
  console.log("   ✓ 13 expense items");

  // Summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ Test agent seeded successfully!");
  console.log("");
  console.log("  Expected computation results (verify in UI):");
  console.log("  ─────────────────────────────────────────────────");
  console.log("  YTD GCI:            $66,375");
  console.log("  Closed Deals:       6");
  console.log("  Pipeline Weighted:  $22,887.50");
  console.log("  Agent Gross (80/20): $53,100");
  console.log("  Tx Fees:            $1,327.50");
  console.log("  Monthly Burn:       $1,300 (brokerage + recurring)");
  console.log("  Cash Runway:        ~11.5 months (Strong)");
  console.log("  Cohort:             Growth (4 years)");
  console.log("  Benchmark:          41st percentile");
  console.log("  Tax (Ontario est.): ~$16,917 total burden");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  ⚠️  Note: This uses user_id", TEST_USER_ID);
  console.log("  To log in as this user, you'll need to create a");
  console.log("  Supabase auth user with this UUID, or manually");
  console.log("  update the user_id to match a real auth user.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
