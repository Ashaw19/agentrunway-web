/**
 * Synthetic CRM rows for the drafter evals. Every name, address, phone number
 * and date is made up; nothing comes from a real account.
 */
import type { Row } from "@/lib/ai/__tests__/helpers/fake-supabase";

export const USER = "eval-user-1";
export const CLIENT = "eval-client-1";
export const SPOUSE = "eval-client-2";

export function clientRow(overrides: Row = {}): Row {
  return {
    id: CLIENT, user_id: USER, archived_at: null,
    name: "Sam Example", first_name: "Sam", last_name: "Example",
    // Birthday on the evals' "today" (2026-10-14), so a birthday draft goes
    // out today: CASL is measured on the send date, and a later birthday
    // would cross the two-year line on its own.
    city: "Saint John", province_region: "NB", birthdate: "1985-10-14",
    communication_tone: "friendly", status: "cruising", timeframe: null,
    property_interest: null, property_interest_type: null,
    notes: null, tags: [], last_contact_at: "2026-04-01T15:00:00Z",
    email_opt_out_at: null, sms_opt_out_at: null,
    phone: "(506) 555-0101", phone_type: "mobile", secondary_phone: null, secondary_phone_type: null,
    ...overrides,
  };
}

/** A deal on the client's record (client_records). */
export function deal(close_date: string, opts: { client?: string; condition_status?: string | null; id?: string } = {}): Row {
  return {
    id: opts.id ?? `rec-${close_date}`, user_id: USER, client_id: opts.client ?? CLIENT,
    address: "12 Example St", close_date, gci: 9000, side: "buyer",
    property_use: "primary", condition_status: opts.condition_status ?? "firmed",
  };
}

export function crmTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    clients: [clientRow()],
    user_settings: [{
      user_id: USER, display_name: "Avery Agent", brokerage_name: "Example Realty",
      email_signature: "", ai_voice_guide: null, text_footer: true,
    }],
    client_records: [],
    client_record_co_parties: [],
    client_email_consents: [],
    outreach_queue: [],
    workflow_drafts: [],
    ...extra,
  };
}
