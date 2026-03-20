/**
 * lib/import-prompt.ts
 *
 * Single source of truth for the TEXT_PROMPT used by:
 *   1. apps/web/app/api/import-history/route.ts   (production extraction)
 *   2. apps/web/scripts/import-tests/run-accuracy-tests.ts (accuracy test runner)
 *
 * Keep this file pure (no server-only imports) so it can be imported by both.
 *
 * ─── FIELD SEMANTICS — read before editing ───────────────────────────────────
 *
 *   gci               = Gross Commission Income — the agent's side earnings BEFORE
 *                       the brokerage takes their cut. Always pre-split.
 *                       • Format A: "GCI" column
 *                       • Format B: "Gross Commission" / "Commission" / "Co-op" column
 *                       • Format C: labeled "GCI" or "Commission"
 *
 *   net_income        = Post-split amount the agent actually receives, AFTER the
 *                       brokerage deduction.
 *                       • Format A: "Net Commission" column
 *                       • Format B: "Net Commission (Taxable)" / "Agent Net" / "Your Net"
 *                       • Format C: labeled "Net" or "after split" amount
 *
 *   sale_price        = Property transaction price. null if not in document.
 *                       NEVER return 0 as a placeholder.
 *
 *   commission_percent = Commission rate as a decimal (0.03 = 3%, NOT "3").
 *                        null if not determinable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Used for text-based input (Excel converted to CSV, plain CSV, .txt files).
// Handles:
//   A) Agent's own transaction tracker (Name | Address | Close Date | Buy | Sell | Source | GCI | Net)
//   B) Brokerage commission reports (party_a / party_b separated by "/")
//   C) Freeform narrative / bullet-point text (prose summaries, notes, copy-pasted text)
export const TEXT_PROMPT = (content: string) => `You are extracting real estate commission transaction data from a document.

The data below may be in any of three formats:
  (A) An agent's own deal tracker — tabular rows with columns like Name, Address, Close Date, Buy | Sell, Source, GCI, Net Commission
  (B) A brokerage commission report — tabular rows where party names are joined by "/"
  (C) Freeform narrative / bullet-point text — prose paragraphs or bullet lists describing closed deals

DOCUMENT CONTENT:
---
${content.slice(0, 20000)}
---

Return ONLY a raw JSON object (no markdown, no code fences). Required structure:
{
  "year": <integer — the calendar year this document covers. Infer from a title line or from the dates.>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — closing or payment date>",
      "address": "<property street address, or empty string if not mentioned>",
      "sale_price": <number or null — the property transaction price (e.g. 485000).
        Look for columns labelled "Sale Price", "Price", "Volume", "Amount", "Purchase Price".
        Set to null (NOT 0) if no sale price is present in the document.>,
      "gci": <number — the agent's GROSS commission income, PRE-SPLIT (before brokerage deduction).
        The correct column DEPENDS on the format:
        • Format A (agent tracker): use the "GCI" column. This is pre-split gross. Do NOT use "Net Commission".
        • Format B (brokerage report): use "Gross Commission", "Commission", "Co-op Commission", or the
          column that represents the agent's side BEFORE the brokerage split. Do NOT use "Net" or "Taxable".
        • Format C (narrative): use amounts labeled "GCI" or "Commission" (pre-split when both are mentioned).>,
      "net_income": <number or null — the agent's NET income AFTER the brokerage split.
        • Format A (agent tracker): use the "Net Commission" or "Net Income" column.
        • Format B (brokerage report): use "Net Commission (Taxable)", "Agent Net", "Your Net", "Taxable".
        • Format C (narrative): use amounts labeled "Net", "net commission", or "after split".
        Set to null if no post-split net column exists in this document.>,
      "commission_percent": <number or null — commission rate as a DECIMAL (e.g. 0.03 for 3%, NOT 3).
        Look for "%" symbols near commission or sale price mentions (e.g. "3% commission", "sold at 2.5%").
        Set to null if no commission rate is mentioned.>,
      "party_a": "<client name — see format rules below>",
      "party_b": "<other party name, or empty string>",
      "agent_side": <0 = agent represented party_a, 1 = party_b, null = unclear>,
      "side": "<\\"buyer\\" | \\"seller\\" | \\"both\\" | null — agent's role>",
      "source": "<lead source, e.g. SOI, Agent Referral, Realtor.ca — or null>",
      "confidence": {
        "gci": "<high | medium | low> — high if exact labelled GCI/Gross column found, medium if inferred, low if estimated",
        "sale_price": "<high | medium | low | missing> — missing if no sale price in document",
        "net_income": "<high | medium | low | missing> — missing if no net column in document",
        "commission_percent": "<high | medium | low | missing> — missing if no rate mentioned",
        "names": "<high | medium | low> — high if name clearly stated, medium if partial, low if ambiguous",
        "date": "<high | medium | low> — high if explicit date, medium if quarter-inferred, low if estimated",
        "address": "<high | medium | low | missing> — missing if no address mentioned"
      },
      "evidence": {
        "gci": "<verbatim text fragment from document that produced this value, e.g. 'GCI: $14,500' — or null if deterministic>",
        "sale_price": "<verbatim text fragment, or null>",
        "net_income": "<verbatim text fragment, or null>",
        "commission_percent": "<verbatim text fragment, or null>",
        "names": "<verbatim text fragment, or null>",
        "date": "<verbatim text fragment, or null>",
        "address": "<verbatim text fragment, or null>"
      }
    }
  ]
}

═══════════════════════════════════════════════════════════════════
FORMAT A — Agent's Own Tracker (tabular, one client per row)
═══════════════════════════════════════════════════════════════════
Detected when columns include: Name, Buy | Sell (or Buy/Sell), Source, GCI, Net Commission Income.

Rules:
- party_a = the Name column value (agent's client)
- party_b = "" (empty)
- agent_side = 0
- side: "Buy" → "buyer" | "Sell" → "seller" | "Buy | Sell" → "both" | "Rent" → "buyer"
- source: copy the Source column verbatim
- gci: use the "GCI" column (PRE-split gross commission income). Do NOT use "Net Commission".
- net_income: use the "Net Commission" or "Net Income" column if present. null if absent.
- sale_price: use a "Sale Price", "Price", "Volume", or "Amount" column if present. null if absent.
- commission_percent: extract from any "%" column or mention near the sale price.

Date handling — apply rules in this exact priority order:
1. If the date cell contains a SPECIFIC day (e.g. "Jan 12 2024", "March 26th 2024", "2024-04-22"):
   → Parse the specific date directly. Ignore parenthetical annotations e.g. "(paid)", "(closed)".
   → Slash dates will already be pre-converted to ISO YYYY-MM-DD — use as-is.
2. If the date cell contains ONLY a quarter code (exactly "Q1", "Q2", "Q3", or "Q4"):
   → Use the LAST day: Q1→Mar 31, Q2→Jun 30, Q3→Sep 30, Q4→Dec 31.
3. Excel serial numbers will already be pre-converted to ISO dates.
4. Partial month+year only (e.g. "Oct 2024"): use the 15th of that month.

EXAMPLES:
  Row: Matt Foster | 531 Ridge Row | Jan 12 (paid) | Sell | SOI | 580000 | 14500 | 10875
  → party_a="Matt Foster", side="seller", source="SOI", gci=14500, net_income=10875

  Row: Tong & Sunny Gao | 68 Elizabeth Pkwy | 45769 | Buy | Sell | SOI | 430000 | 10750 | 8062.5
  → party_a="Tong & Sunny Gao", side="both", source="SOI", gci=10750, net_income=8062.5

══════════════════════════════════════════════════════════════════
FORMAT B — Brokerage Commission Report (party_a / party_b names)
══════════════════════════════════════════════════════════════════
Detected when party names are combined with a "/" separator in one field.

GCI COLUMN SELECTION — CRITICAL (read carefully):
Brokerage commission reports show both a GROSS commission and a NET/TAXABLE amount.

→ gci       = the GROSS / PRE-SPLIT column. Labels: "Gross Commission", "Commission", "Co-op Commission",
              "Agent Commission", "Your Gross", or the column BEFORE brokerage deduction.
→ net_income = the NET / POST-SPLIT column. Labels: "Net Commission (Taxable)", "Taxable", "Agent Net",
              "Your Net", "Your Commission", "Net Amount", "Commission Earned".

NEVER swap these. GCI is always larger than net_income.

WORKED GCI/NET EXAMPLES:
  Columns: Gross Commission=14550  Agent Net (Taxable)=11640  → gci=14550, net_income=11640
  Columns: Gross Commission=28750  Your Net=23000             → gci=28750, net_income=23000
  Column:  Net Commission (Taxable)=9200 (only column)        → gci=null, net_income=9200

  If the document shows ONLY a net/taxable column with no gross column:
  → set gci=null and net_income to the net value.

NAME SPLITTING RULES (critical):
- Split on the FIRST "/" only: party_a = before, party_b = after (trimmed)
- "&" connects people on the SAME side — never a separator between sides
- NEVER include "/" inside party_a or party_b
- NEVER leave party_b empty when a "/" exists in the names field

WORKED NAME EXAMPLES:
  "Ashley Mathias / Jiaolao Meng"           → party_a="Ashley Mathias", party_b="Jiaolao Meng"
  "John & Mary Smith / Bob Jones Ltd."      → party_a="John & Mary Smith", party_b="Bob Jones Ltd."
  "Afshin & Donya Adivi / Estate Of Audrey" → party_a="Afshin & Donya Adivi", party_b="Estate Of Audrey"

══════════════════════════════════════════════════════════════════════
FORMAT C — Freeform Narrative / Bullet-Point Text
══════════════════════════════════════════════════════════════════════
Detected when the content is prose paragraphs or bullet lists rather than structured table rows.
Examples: "January 12: Sold 531 Ridge Row for Matt Foster. GCI earned $14,500."
          "- Jun 12: Buyer rep for Angelique Simpson — purchased 139 McCarthy's Point Road. Earned $12,700 GCI."
          "May 2: Out-of-area referral sent for Travis & Chryssie Radtke (Cape Breton). Received referral fee of $832.70."

Rules for Format C:
- Extract EVERY transaction mentioned — including small referral fees, rentals, and out-of-area referrals
- party_a = the client name (person described as "for [Name]", "buyer rep for [Name]", etc.)
- party_b = "" (narratives typically mention only the agent's client)
- agent_side = 0
- side: "Sold/Listing/Sell" → "seller"; "Buyer rep/purchased/bought" → "buyer"; "Double-ended" → "both"
- source: extract from "SOI", "Agent Referral", "Realtor.ca", etc.
- sale_price: extract any sale / purchase price. null if not mentioned.
- gci: extract pre-split commission labeled "GCI", "Commission", "gross commission". Use the GROSS amount.
- net_income: extract post-split amount labeled "Net", "net commission", "after split". null if not mentioned.
- commission_percent: extract any "%" rate mentioned near the transaction. null if not mentioned.
- address: extract any street address. If only a city/region, use that.

CRITICAL: Do NOT skip deals just because they are small, referral-only, or lack an address.

══════════════════════════════════════════════════════════════════
UNIVERSAL RULES (apply to ALL formats)
══════════════════════════════════════════════════════════════════
- SKIP rows/lines where party_a is empty, "Totals", "Name", or a section heading with no deal data
- SKIP subtotals, quarterly summary lines, and expense entries
- NEVER return 0 for sale_price — use null when the sale price is not in the document
- NEVER hallucinate values — if a field is not in the document, return null
- year: read from the document title/heading or infer from the dates
- Return ONLY the JSON — nothing before or after it`;
