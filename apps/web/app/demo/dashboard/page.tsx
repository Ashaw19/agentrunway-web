/**
 * Demo Dashboard
 *
 * A fully interactive, no-auth-required preview of the Agent Runway dashboard
 * populated with realistic sample data for a fictional agent, Sarah Mitchell.
 *
 * All engine calculations run client-side exactly as in the real app —
 * scenario toggle, monthly chart, probability bands, runway score, etc.
 * No database reads or writes occur.
 */

import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { DashboardContent } from "@/app/(app)/dashboard/dashboard-content";
import type {
  Transaction,
  PipelineDeal,
  UserSettings,
  ExpenseCategoryWithItems,
} from "@/lib/types/database";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Demo Dashboard",
  description:
    "Explore the Agent Runway dashboard with realistic sample data — no sign-up required. See GCI tracking, income forecasting, tax estimates, and AI-powered data exploration.",
  robots: { index: false, follow: false },
};

// ── Sample Data ───────────────────────────────────────────────────────────────
// Agent: Sarah Mitchell | Province: Ontario | 7 years experience
// Goal: $200,000 GCI | Split: 80/20 | Monthly Brokerage Fee: $1,200

const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: "demo-tx-1",
    user_id: "demo",
    date: "2026-01-12",
    address: "44 Forest Hill Rd, Toronto",
    client_name: "The Ng Family",
    side: "buyer",
    status: "closed",
    sale_price: 1050000,
    commission_pct: 0.025,
    gci_override: null,
    pipeline_deal_id: null,
    notes: "",
    created_at: "2026-01-12T12:00:00Z",
    updated_at: "2026-01-12T12:00:00Z",
  },
  {
    id: "demo-tx-2",
    user_id: "demo",
    date: "2026-01-28",
    address: "217 Rosedale Valley Rd, Toronto",
    client_name: "Patricia Holloway",
    side: "seller",
    status: "closed",
    sale_price: 875000,
    commission_pct: 0.025,
    gci_override: null,
    pipeline_deal_id: null,
    notes: "",
    created_at: "2026-01-28T12:00:00Z",
    updated_at: "2026-01-28T12:00:00Z",
  },
  {
    id: "demo-tx-3",
    user_id: "demo",
    date: "2026-02-14",
    address: "891 King St W #3210, Toronto",
    client_name: "Marco & Julia Reeves",
    side: "buyer",
    status: "closed",
    sale_price: 680000,
    commission_pct: 0.025,
    gci_override: null,
    pipeline_deal_id: null,
    notes: "",
    created_at: "2026-02-14T12:00:00Z",
    updated_at: "2026-02-14T12:00:00Z",
  },
  {
    id: "demo-tx-4",
    user_id: "demo",
    date: "2026-02-26",
    address: "156 Bloor St E #1802, Toronto",
    client_name: "David Chen",
    side: "both",
    status: "closed",
    sale_price: 940000,
    commission_pct: 0.025,
    gci_override: null,
    pipeline_deal_id: null,
    notes: "",
    created_at: "2026-02-26T12:00:00Z",
    updated_at: "2026-02-26T12:00:00Z",
  },
  {
    id: "demo-tx-5",
    user_id: "demo",
    date: "2026-03-04",
    address: "72 Avenue Rd, Toronto",
    client_name: "The Okafor Estate",
    side: "seller",
    status: "closed",
    sale_price: 1200000,
    commission_pct: 0.025,
    gci_override: null,
    pipeline_deal_id: null,
    notes: "",
    created_at: "2026-03-04T12:00:00Z",
    updated_at: "2026-03-04T12:00:00Z",
  },
];

const DEMO_PIPELINE: PipelineDeal[] = [
  {
    id: "demo-deal-1",
    user_id: "demo",
    address: "425 Davenport Rd, Toronto",
    client_name: "James & Linda Park",
    side: "buyer",
    stage: "firm",
    estimated_price: 1100000,
    estimated_commission_pct: 0.025,
    expected_close_date: "2026-03-28",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    notes:"Conditions removed, firm close expected end of March",
    created_at: "2026-02-20T12:00:00Z",
    updated_at: "2026-02-20T12:00:00Z",
  },
  {
    id: "demo-deal-2",
    user_id: "demo",
    address: "33 Merton St #710, Toronto",
    client_name: "Sophia Andersson",
    side: "buyer",
    stage: "conditional",
    estimated_price: 820000,
    estimated_commission_pct: 0.025,
    expected_close_date: "2026-04-15",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    notes:"Home inspection scheduled, financing pre-approved",
    created_at: "2026-02-28T12:00:00Z",
    updated_at: "2026-02-28T12:00:00Z",
  },
  {
    id: "demo-deal-3",
    user_id: "demo",
    address: "1560 Bathurst St #204, Toronto",
    client_name: "Kwame Mensah",
    side: "buyer",
    stage: "offer",
    estimated_price: 560000,
    estimated_commission_pct: 0.025,
    expected_close_date: "2026-04-30",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    notes:"Offer submitted, waiting on seller response",
    created_at: "2026-03-01T12:00:00Z",
    updated_at: "2026-03-01T12:00:00Z",
  },
  {
    id: "demo-deal-4",
    user_id: "demo",
    address: "88 Dundas St W #1505, Toronto",
    client_name: "Priya & Raj Nair",
    side: "buyer",
    stage: "showing",
    estimated_price: 445000,
    estimated_commission_pct: 0.025,
    expected_close_date: null,
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    notes:"Second showing booked this weekend",
    created_at: "2026-03-03T12:00:00Z",
    updated_at: "2026-03-03T12:00:00Z",
  },
  {
    id: "demo-deal-5",
    user_id: "demo",
    address: "310 Front St W #4102, Toronto",
    client_name: "Institutional Referral",
    side: "seller",
    stage: "lead",
    estimated_price: 1650000,
    estimated_commission_pct: 0.025,
    expected_close_date: null,
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    notes:"High-value listing lead, needs listing presentation",
    created_at: "2026-03-05T12:00:00Z",
    updated_at: "2026-03-05T12:00:00Z",
  },
];

const DEMO_SETTINGS: UserSettings = {
  user_id: "demo",
  display_name: "Sarah Mitchell",
  brokerage_name: "Royal LePage Toronto",
  phone: "",
  province: "ontario",
  split_preset: "p80_20",
  monthly_brokerage_fee: 1200,
  tx_fee_rate_pct: 0.002,
  tx_fee_annual_cap: 2000,
  post_cap_threshold_gci: 0,
  post_cap_agent_pct: 1.0,
  post_cap_brokerage_pct: 0,
  goal_gci: 200000,
  goal_transactions: 15,
  goal_volume: 8000000,
  growth_goal_year_pcts: [0.1, 0.1, 0.08, 0.07, 0.06],
  cash_reserve: 22000,
  experience_years: 7,
  estimated_weekly_hours: 45,
  vacation_weeks_per_year: 2,
  use_national_seasonality: true,
  national_quarter_pcts: [0.2, 0.32, 0.27, 0.21],
  national_seasonality_updated: "2026-01-01",
  market_yoy_growth_pct: 0.03,
  market_mom_growth_pct: 0.005,
  market_sales_change_pct: 0.02,
  market_new_listings_change_pct: 0.01,
  market_index_source_note: "TRREB Market Watch",
  apply_market_adjustment: false,
  market_report_month: "2026-02",
  market_data_is_manual: true,
  market_last_updated: "2026-03-01",
  market_board_name: "TRREB",
  market_metric_focus: "combined",
  home_office_business_use_pct: 0.25,
  vehicle_business_use_pct: 0.8,
  // T2125 fields
  home_office_method: "simplified",
  home_office_sq_footage: 150,
  home_office_rent_monthly: 0,
  home_office_utilities_monthly: 0,
  home_office_property_tax_annual: 0,
  home_office_insurance_monthly: 0,
  home_office_maintenance_annual: 0,
  home_office_condo_fees_monthly: 0,
  gst_hst_registered: true,
  gst_hst_remitted_q1: 0,
  gst_hst_remitted_q2: 0,
  gst_hst_remitted_q3: 0,
  gst_hst_remitted_q4: 0,
  gst_hst_paid_on_expenses: 0,
  vehicle_type: "own",
  cpp_instalment_paid_ytd: 0,
  tax_instalment_paid_q1: 0,
  tax_instalment_paid_q2: 0,
  tax_instalment_paid_q3: 0,
  tax_instalment_paid_q4: 0,
  ytd_gci: 0,
  ytd_transactions: 0,
  ytd_volume: 0,
  color_theme: "blue",
  avatar_url: "",
  business_logo_url: "",
  agent_cutout_url: "",
  business_name: "Mitchell Real Estate Group",
  business_number: "",
  social_instagram: "",
  social_facebook: "",
  social_linkedin: "",
  social_tiktok: "",
  social_youtube: "",
  dashboard_view: "standard",
  subscription_tier: "professional",
  subscription_status: "active",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_current_period_end: null,
  is_admin: false,
  is_incorporated: false,
  corp_type: null,
  compensation_method: "salary",
  has_employees: false,
  num_employees: 0,
  tax_opt_dismissed: [],
  board_code: "",
  board_subregion: "",
  email_signature: "",
  ai_voice_guide: null,
  communication_profile: null,
  business_identity: null,
  agent_goals: null,
  ai_profile_prompt_dismissed_at: null,
  filing_frequency: "quarterly",
  fiscal_year_end_month: 12,
  brokerage_withholds_hst: false,
  created_at: "2025-01-10T09:00:00Z",
  updated_at: "2026-03-07T09:00:00Z",
};

const DEMO_EXPENSE_CATEGORIES: ExpenseCategoryWithItems[] = [
  {
    id: "demo-cat-1",
    user_id: "demo",
    key: "marketing",
    title: "Marketing",
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "demo-item-1",
        user_id: "demo",
        category_id: "demo-cat-1",
        key: "digital_advertising",
        title: "Digital Advertising",
        ytd_amount: 2000,
        monthly_recurring: 1000,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "demo-item-2",
        user_id: "demo",
        category_id: "demo-cat-1",
        key: "print_flyers",
        title: "Print & Flyers",
        ytd_amount: 600,
        monthly_recurring: 300,
        sort_order: 2,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "demo-item-3",
        user_id: "demo",
        category_id: "demo-cat-1",
        key: "signage",
        title: "Signage",
        ytd_amount: 300,
        monthly_recurring: 150,
        sort_order: 3,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "demo-cat-2",
    user_id: "demo",
    key: "technology",
    title: "Technology",
    sort_order: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "demo-item-4",
        user_id: "demo",
        category_id: "demo-cat-2",
        key: "crm_software",
        title: "CRM & Software",
        ytd_amount: 400,
        monthly_recurring: 200,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "demo-item-5",
        user_id: "demo",
        category_id: "demo-cat-2",
        key: "website_domains",
        title: "Website & Domains",
        ytd_amount: 200,
        monthly_recurring: 100,
        sort_order: 2,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "demo-cat-3",
    user_id: "demo",
    key: "professional_fees",
    title: "Professional Fees",
    sort_order: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "demo-item-6",
        user_id: "demo",
        category_id: "demo-cat-3",
        key: "board_mls_dues",
        title: "Board & MLS Dues",
        ytd_amount: 700,
        monthly_recurring: 350,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "demo-item-7",
        user_id: "demo",
        category_id: "demo-cat-3",
        key: "eo_insurance",
        title: "E&O Insurance",
        ytd_amount: 300,
        monthly_recurring: 150,
        sort_order: 2,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "demo-cat-4",
    user_id: "demo",
    key: "vehicle_travel",
    title: "Vehicle & Travel",
    sort_order: 4,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "demo-item-8",
        user_id: "demo",
        category_id: "demo-cat-4",
        key: "mileage_fuel",
        title: "Mileage & Fuel",
        ytd_amount: 800,
        monthly_recurring: 400,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "demo-item-9",
        user_id: "demo",
        category_id: "demo-cat-4",
        key: "parking",
        title: "Parking",
        ytd_amount: 300,
        monthly_recurring: 150,
        sort_order: 2,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
  {
    id: "demo-cat-5",
    user_id: "demo",
    key: "education_training",
    title: "Education & Training",
    sort_order: 5,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "demo-item-10",
        user_id: "demo",
        category_id: "demo-cat-5",
        key: "courses_designations",
        title: "Courses & Designations",
        ytd_amount: 400,
        monthly_recurring: 200,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoDashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden" data-color-theme="blue">
      {/* Sidebar (same as real app; nav links redirect to /login for unauthenticated visitors) */}
      <SidebarNav isPro={true} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile nav */}
        <MobileNav isPro={true} />

        {/* ── Demo banner ── */}
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2">
          <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Demo Mode</strong> — sample data for{" "}
                <strong>Sarah Mitchell</strong>, Ontario agent. All calculations
                are live and interactive.
              </span>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Start with your real data
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-screen-xl">
            <DashboardContent
              transactions={DEMO_TRANSACTIONS}
              pipelineDeals={DEMO_PIPELINE}
              settings={DEMO_SETTINGS}
              expenseCategories={DEMO_EXPENSE_CATEGORIES}
              initialDashboardView="standard"
              isPro={true}
              showUpgradeBanner={false}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
