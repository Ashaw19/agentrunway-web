/**
 * Input validation guards for all CRM data mutations.
 *
 * Every form save — web and mobile — must run through these guards
 * before writing to Supabase.  They return { valid, errors } so the
 * caller can show specific toast messages instead of silently saving bad data.
 */

// ── Primitive helpers ────────────────────────────────────────────────────────

/** Parse a user-entered dollar string.  Returns null when the input is empty / non-numeric. */
export function parseDollar(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a user-entered percentage string (e.g. "2.5" → 0.025). Returns null on bad input. */
export function parsePercent(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n / 100 : null;
}

/** Validate an email address (basic RFC-ish check). */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  // Covers 99%+ of real-world addresses
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Validate a phone number (digits, spaces, dashes, parens, plus — at least 7 digits). */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// ── Validation result type ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...msgs: string[]): ValidationResult {
  return { valid: false, errors: msgs };
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return { valid: errors.length === 0, errors };
}

// ── Field-level validators ──────────────────────────────────────────────────

export function validateSalePrice(value: number | null): ValidationResult {
  if (value === null) return fail("Sale price is required");
  if (value <= 0) return fail("Sale price must be greater than $0");
  if (value > 100_000_000) return fail("Sale price exceeds $100M — please double-check");
  return ok();
}

export function validateCommissionPct(decimal: number | null): ValidationResult {
  if (decimal === null) return fail("Commission % is required");
  if (decimal < 0) return fail("Commission % cannot be negative");
  if (decimal > 0.25) return fail("Commission % exceeds 25% — please double-check");
  return ok();
}

export function validateGciOverride(value: number | null): ValidationResult {
  if (value === null) return ok(); // optional field
  if (value < 0) return fail("GCI override cannot be negative");
  if (value > 2_000_000) return fail("GCI override exceeds $2M — please double-check");
  return ok();
}

export function validateTeamSplitPct(decimal: number | null): ValidationResult {
  if (decimal === null) return ok(); // optional
  if (decimal < 0) return fail("Team split cannot be negative");
  if (decimal > 1) return fail("Team split cannot exceed 100%");
  return ok();
}

export function validateExpenseAmount(value: number | null): ValidationResult {
  if (value === null) return fail("Amount is required");
  if (value < 0) return fail("Expense amount cannot be negative");
  if (value > 10_000_000) return fail("Expense amount exceeds $10M — please double-check");
  return ok();
}

export function validateMonthlyRecurring(value: number | null): ValidationResult {
  if (value === null) return fail("Monthly amount is required");
  if (value < 0) return fail("Monthly recurring cannot be negative");
  if (value > 100_000) return fail("Monthly recurring exceeds $100K — please double-check");
  return ok();
}

export function validateEstimatedPrice(value: number | null): ValidationResult {
  if (value === null) return fail("Estimated price is required");
  if (value < 0) return fail("Estimated price cannot be negative");
  if (value > 100_000_000) return fail("Estimated price exceeds $100M — please double-check");
  return ok();
}

export function validateProbabilityOverride(decimal: number | null): ValidationResult {
  if (decimal === null) return ok(); // optional
  if (decimal < 0 || decimal > 1)
    return fail("Probability must be between 0% and 100%");
  return ok();
}

export function validateVehicleBusinessPct(decimal: number): ValidationResult {
  if (!Number.isFinite(decimal)) return fail("Invalid vehicle business use %");
  if (decimal < 0 || decimal > 1) return fail("Vehicle business use must be between 0% and 100%");
  return ok();
}

export function validateClientName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) return fail("Client name is required");
  if (trimmed.length > 200) return fail("Client name is too long (max 200 characters)");
  return ok();
}

export function validateEmail(email: string | null | undefined): ValidationResult {
  if (!email || !email.trim()) return ok(); // optional
  if (!isValidEmail(email)) return fail("Invalid email address format");
  return ok();
}

export function validatePhone(phone: string | null | undefined): ValidationResult {
  if (!phone || !phone.trim()) return ok(); // optional
  if (!isValidPhone(phone)) return fail("Invalid phone number (need 7-15 digits)");
  return ok();
}

export function validateNotes(text: string | null | undefined): ValidationResult {
  if (!text) return ok();
  if (text.length > 10_000) return fail("Notes are too long (max 10,000 characters)");
  return ok();
}

export function validateAddress(text: string | null | undefined): ValidationResult {
  if (!text) return ok();
  if (text.length > 500) return fail("Address is too long (max 500 characters)");
  return ok();
}

// ── Composite validators ────────────────────────────────────────────────────

export interface TransactionInput {
  sale_price: string;
  commission_pct: string;
  gci_override?: string;
  team_split_pct?: string | null;
  has_team_split?: boolean;
  address?: string;
  client_name?: string;
  notes?: string;
}

export interface TransactionParsed {
  sale_price: number;
  commission_pct: number;
  gci_override: number | null;
  team_split_pct: number | null;
}

export function validateTransaction(input: TransactionInput): ValidationResult & { parsed?: TransactionParsed } {
  const sp = parseDollar(input.sale_price);
  const cp = parsePercent(input.commission_pct);
  const gci = input.gci_override ? parseDollar(input.gci_override) : null;
  const tsp =
    input.has_team_split && input.team_split_pct
      ? parsePercent(input.team_split_pct)
      : null;

  const result = merge(
    validateSalePrice(sp),
    validateCommissionPct(cp),
    validateGciOverride(gci),
    validateTeamSplitPct(tsp),
    validateAddress(input.address),
    validateNotes(input.notes),
  );

  if (!result.valid) return result;

  return {
    ...result,
    parsed: {
      sale_price: sp!,
      commission_pct: cp!,
      gci_override: gci,
      team_split_pct: tsp,
    },
  };
}

export interface PipelineDealInput {
  estimated_price: string;
  estimated_commission_pct: string;
  probability_override?: string;
  address?: string;
  client_name?: string;
  notes?: string;
}

export interface PipelineDealParsed {
  estimated_price: number;
  estimated_commission_pct: number;
  probability_override: number | null;
}

export function validatePipelineDeal(input: PipelineDealInput): ValidationResult & { parsed?: PipelineDealParsed } {
  const ep = parseDollar(input.estimated_price);
  const ecp = parsePercent(input.estimated_commission_pct);
  const po = input.probability_override
    ? parsePercent(input.probability_override)
    : null;

  const result = merge(
    validateEstimatedPrice(ep),
    validateCommissionPct(ecp),
    validateProbabilityOverride(po),
    validateAddress(input.address),
    validateNotes(input.notes),
  );

  if (!result.valid) return result;

  return {
    ...result,
    parsed: {
      estimated_price: ep!,
      estimated_commission_pct: ecp!,
      probability_override: po,
    },
  };
}

export interface ClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export function validateClient(input: ClientInput): ValidationResult {
  return merge(
    validateClientName(input.name),
    validateEmail(input.email),
    validatePhone(input.phone),
    validateNotes(input.notes),
  );
}

// ── Text field limits (for use in maxLength props) ──────────────────────────

export const FIELD_LIMITS = {
  clientName: 200,
  address: 500,
  notes: 10_000,
  description: 5_000,
  vendor: 200,
  taskTitle: 500,
  email: 320,
  phone: 30,
} as const;
