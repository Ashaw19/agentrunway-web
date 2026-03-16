/**
 * lib/import-prompt.ts
 *
 * Single source of truth for the TEXT_PROMPT used by:
 *   1. apps/web/app/api/import-history/route.ts   (production extraction)
 *   2. apps/web/scripts/import-tests/run-accuracy-tests.ts (accuracy test runner)
 *
 * Keep this file pure (no server-only imports) so it can be imported by both.
 */

// Used for text-based input (Excel converted to CSV, plain CSV, or .txt files).
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
  "year": <integer — the calendar year this document covers. Infer from a title line (e.g. "2024 YEAR-END TRANSACTION SUMMARY", "2025 Transaction Tracker") or from the dates. If explicitly stated in a heading, always use that year.>,
  "deals": [
    {
      "date": "<YYYY-MM-DD — closing or payment date>",
      "address": "<property street address, or empty string if not mentioned>",
      "sale_price": <number — the property sale / transaction price (e.g. 485000). In tracker format look for a "Sale Price", "Price", "Amount", or "Volume" column. In narratives look for phrases like "sold for $485,000" or "purchase price of $610,000". Set to 0 if no sale price is mentioned.>,
      "gci": <number — the agent's commission amount. The correct column DEPENDS on the format:
        • Format A (agent tracker): use the GROSS column labeled "GCI". Do NOT use "Net Commission" or any post-split column.
        • Format B (brokerage report): use the NET/TAXABLE column — labeled "Taxable", "Net Commission", "Agent Net", "Your Net", "Your Commission", or similar. NEVER use "Gross Commission" or "Total Commission" columns.
        • Format C (narrative): use amounts labeled "GCI", "Commission", or "referral fee".>,
      "party_a": "<client name — see format rules below>",
      "party_b": "<other party name, or empty string>",
      "agent_side": <0 = agent represented party_a, 1 = party_b, null = unclear>,
      "side": "<\\"buyer\\" | \\"seller\\" | \\"both\\" | null — agent's role>",
      "source": "<lead source, e.g. SOI, Agent Referral, Realtor.ca — or null>",
      "confidence": {
        "gci": "<high | medium | low> — high if exact labelled GCI column found, medium if inferred, low if estimated",
        "sale_price": "<high | medium | low | missing> — missing if no sale price in document",
        "names": "<high | medium | low> — high if name clearly stated, medium if partial, low if ambiguous",
        "date": "<high | medium | low> — high if explicit date, medium if quarter-inferred, low if estimated",
        "address": "<high | medium | low | missing> — missing if no address mentioned"
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
- gci: use the "GCI" column. Do NOT use "Net Commission" or any post-split column.
- sale_price: use a "Sale Price", "Price", "Volume", or "Amount" column if present. Set 0 if absent.

Date handling — apply rules in this exact priority order:
1. If the date cell contains a SPECIFIC day (e.g. "Jan 12 2024", "March 26th 2024", "2024-04-22", "May 1 (2024)", or an already-converted ISO date like "2024-03-15"):
   → Parse the specific date directly. NEVER fall back to a quarter-end date when a day is present.
   → Ignore any parenthetical annotation e.g. "(paid)", "(closed)".
   → Slash dates (DD/MM or MM/DD) will already be pre-converted to ISO YYYY-MM-DD before you see this document — just use the ISO date as-is.
   → If slash dates were NOT pre-converted: scan ALL dates in the file first. If ANY first component > 12, the entire file uses DD/MM/YYYY.
2. If the date cell contains ONLY a quarter code with no day or month (exactly "Q1", "Q2", "Q3", or "Q4"):
   → Use the LAST day of that quarter for the inferred year: Q1→Mar 31, Q2→Jun 30, Q3→Sep 30, Q4→Dec 31.
3. Excel serial numbers (5-digit integers like 45769): these will already be pre-converted to ISO dates before you see them. If you still encounter a raw serial, use anchors: 44927=2023-01-01, 45292=2024-01-01, 45658=2025-01-01.
4. Partial month+year only (e.g. "Oct 2024", "June 2024"): use the 15th of that month.

EXAMPLES:
  Row: Matt Foster | 531 Ridge Row | Jan 12 (paid) | Sell | SOI | 580000 | 14500 | 10875
  → party_a="Matt Foster", side="seller", source="SOI", gci=14500

  Row: Tong & Sunny Gao | 68 Elizabeth Pkwy | 45769 | Buy | Sell | SOI | 430000 | 10750 | 8062.5
  → party_a="Tong & Sunny Gao", side="both", source="SOI", gci=10750

══════════════════════════════════════════════════════════════════
FORMAT B — Brokerage Commission Report (party_a / party_b names)
══════════════════════════════════════════════════════════════════
Detected when party names are combined with a "/" separator in one field.

GCI COLUMN SELECTION — CRITICAL (read carefully):
Brokerage commission reports often show both a GROSS commission and a NET/TAXABLE amount.
→ ALWAYS use the NET/TAXABLE column for gci. This is the agent's share after brokerage split.
→ Common NET column labels: "Taxable", "Net Commission", "Agent Net (Taxable)", "Your Net", "Your Commission", "Net Amount", "Commission Earned"
→ NEVER use "Gross Commission", "Total Commission", "Full Commission", or similar — those are pre-split totals.
→ If only ONE commission column exists (e.g. "Net Commission (Taxable)"), use it — it IS the correct gci value.

WORKED GCI EXAMPLES (commit these to memory):
  Columns: Gross Commission=14550  Agent Net (Taxable)=11640  → gci=11640 (NOT 14550)
  Columns: Gross Commission=28750  Your Net=23000             → gci=23000 (NOT 28750)
  Column:  Net Commission (Taxable)=9200 (only column)        → gci=9200

NAME SPLITTING RULES (critical):
- Split on the FIRST "/" only: party_a = before, party_b = after (trimmed)
- "&" connects people on the SAME side — never a separator between sides
- agent_side: 0 if agent represented party_a, 1 if party_b, null if unclear
- side: null | source: null
- NEVER include "/" inside party_a or party_b
- NEVER leave party_b empty when a "/" exists in the names field

WORKED NAME EXAMPLES:
  "Ashley Mathias / Jiaolao Meng"           → party_a="Ashley Mathias", party_b="Jiaolao Meng"
  "John & Mary Smith / Bob Jones Ltd."      → party_a="John & Mary Smith", party_b="Bob Jones Ltd."
  "Afshin & Donya Adivi / Estate Of Audrey" → party_a="Afshin & Donya Adivi", party_b="Estate Of Audrey"

══════════════════════════════════════════════════════════════════════
FORMAT C — Freeform Narrative / Bullet-Point Text
══════════════════════════════════════════════════════════════════════
Detected when the content is prose paragraphs or bullet lists rather than rows with consistent columns.
Examples: "January 12: Sold 531 Ridge Row for Matt Foster. GCI earned $14,500."
          "- Jun 12: Buyer rep for Angelique Simpson — purchased 139 McCarthy's Point Road. Earned $12,700 GCI."
          "May 2: Out-of-area referral sent for Travis & Chryssie Radtke (Cape Breton). Received referral fee of $832.70."

Rules for Format C:
- Extract EVERY transaction mentioned — including small referral fees, rentals, and out-of-area referrals
- party_a = the client name (person described as "for [Name]", "buyer rep for [Name]", "[Name] purchased", etc.)
- party_b = "" (narratives typically only mention the agent's client)
- agent_side = 0
- side: look for words like "Sold/Listing/Sell" → "seller"; "Buyer rep/purchased/bought" → "buyer"; "Double-ended/both sides" → "both"
- source: extract from phrases like "SOI", "Agent Referral", "Realtor.ca", "Referral from SOI", "Database" etc.
- sale_price: extract any sale / purchase price mentioned (e.g. "sold for $485,000", "purchase price of $610,000"). Set to 0 if not mentioned.
- gci: extract the dollar amount labelled "GCI", "GCI earned", "Earned ... GCI", "Commission", or "referral fee". Use the GROSS (pre-split) amount when both gross and net are mentioned.
- date: extract from date mentions at the start of bullets or sentences. If only a quarter section is given (e.g. "Q2 CLOSINGS:"), use the last day of that quarter.
- address: extract any street address mentioned (e.g. "531 Ridge Row", "139 McCarthy's Point Road"). If only a city/region is mentioned (e.g. "Cape Breton"), use that as the address.

CRITICAL for Format C: Do NOT skip deals just because they are small, referral-only, or lack a property address. Every bullet or sentence describing a closed transaction or referral fee must produce one deal object.

══════════════════════════════════════════════════
UNIVERSAL RULES (apply to ALL formats)
══════════════════════════════════════════════════
- SKIP rows/lines where party_a is empty, "Totals", "Name", or a section heading with no deal data
- SKIP subtotals, quarterly summary lines, and expense entries
- year: read from the document title/heading (e.g. "2024 YEAR-END TRANSACTION SUMMARY" → year=2024, "2025 Transaction Tracker" → year=2025)
- If no title, infer year from the dates in the data
- Return ONLY the JSON — nothing before or after it`;
