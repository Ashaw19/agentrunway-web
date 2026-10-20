/**
 * Expense item keys and their labels on the phone: the receipt review screen
 * (Money → Expenses) and the voice capture card. The keys are web's
 * apps/web/lib/types/receipt.ts (receipt_expenses.category_key is an expense
 * ITEM key); apps/web/lib/__tests__/home-office-keys-parity.test.ts holds
 * the Home Office keys here to the canonical list.
 */

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  vehicle_fuel:          "Fuel / Gas",
  vehicle_service:       "Service & Repairs",
  vehicle_insurance:     "Vehicle Insurance",
  vehicle_payment:       "Vehicle Payment",
  vehicle_parking:       "Business Parking",
  vehicle_business_insurance: "Supplementary Business Insurance",
  marketing_ads:         "Ads (Meta/Google)",
  marketing_photography: "Photography & Video",
  marketing_print:       "Print (Signs, Flyers)",
  marketing_gifts:       "Client Gifts",
  office_supplies:       "Office Supplies",
  office_software:       "Software Subscriptions",
  office_phone:          "Phone & Internet",
  office_hardware:       "Hardware & Equipment",
  prof_board_mls:        "Board / MLS Dues",
  prof_licensing:        "Licensing & Renewals",
  prof_eo:               "E&O Insurance",
  prof_accounting:       "Accounting & Bookkeeping",
  edu_courses:           "Courses & Coaching",
  edu_conferences:       "Conferences",
  edu_books:             "Books & Materials",
  meals_client:          "Client Meals",
  meals_team:            "Team Meals",
  ent_client:            "Client Entertainment",
  ent_events:            "Events & Tickets",
  home_utilities:        "Home: Electricity, Heat & Water",
  home_internet:         "Home: Internet",
  home_insurance:        "Home: Insurance",
  home_maintenance:      "Home: Repairs & Maintenance",
  home_property_tax:     "Home: Property Tax",
  home_mortgage_interest: "Home: Mortgage Interest",
  home_rent:             "Home: Rent",
  home_condo_fees:       "Home: Condo Fees",
  other_misc:            "Miscellaneous",
};

/** True for one of the item keys above. */
export function isExpenseCategoryKey(key: unknown): key is string {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(EXPENSE_CATEGORY_LABELS, key);
}
