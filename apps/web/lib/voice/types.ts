/**
 * Voice Draft — discriminated union for multi-intent voice extraction.
 *
 * The global voice button records audio, transcribes via Whisper,
 * then classifies intent + extracts structured data via Llama 3.3.
 * Each intent variant carries only the fields relevant to that action.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

interface VoiceDraftBase {
  confidence: "high" | "medium" | "low";
  transcript_cleaned: string;
  missingFields: string[];
  needsReview: boolean;
}

// ── Intent Variants ───────────────────────────────────────────────────────────

export interface VoiceDraftClient extends VoiceDraftBase {
  intent: "new_client";
  client: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    postalCode: string | null;
    source: string | null;
    tags: string[];
    notes: string | null;
  };
}

export interface VoiceDraftExpense extends VoiceDraftBase {
  intent: "new_expense";
  expense: {
    category_key: string | null;   // one of RECEIPT_CATEGORIES[].key
    amount: number | null;
    vendor: string | null;
    description: string | null;
    date: string | null;           // YYYY-MM-DD
  };
}

export interface VoiceDraftTransaction extends VoiceDraftBase {
  intent: "new_transaction";
  transaction: {
    date: string | null;           // YYYY-MM-DD
    address: string | null;
    client_name: string | null;
    side: "buyer" | "seller" | "both" | null;
    status: "closed" | "pending" | null;
    sale_price: number | null;
    commission_pct: number | null; // decimal, e.g. 0.025 for 2.5%
    gci: number | null;            // optional override
    notes: string | null;
  };
}

export interface VoiceDraftNote extends VoiceDraftBase {
  intent: "note";
  note: {
    client_name: string | null;
    activity_type: "call" | "email" | "text" | "showing" | "meeting" | "note";
    description: string;
  };
}

export interface VoiceDraftUnknown extends VoiceDraftBase {
  intent: "unknown";
  raw_text: string;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type VoiceDraft =
  | VoiceDraftClient
  | VoiceDraftExpense
  | VoiceDraftTransaction
  | VoiceDraftNote
  | VoiceDraftUnknown;
