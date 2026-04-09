/**
 * Receipt OCR extraction via Claude vision.
 * Sends the receipt image as a base64 data URL and returns structured JSON.
 *
 * Model: Claude Haiku 4.5 (fast tier — cheap OCR extraction)
 */
import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import type { OcrExtraction } from "@/lib/types/receipt";
import { withRetry } from "@/lib/retry";

const VISION_PROMPT = `You are a receipt data extraction assistant for Canadian real estate agents.
Extract structured data from this receipt image.
Return ONLY a raw JSON object — no markdown, no code fences, no explanation.

CRITICAL RULES FOR AMOUNTS:
- "total_amount" MUST be the FINAL TOTAL on the receipt — the very last amount, the grand total, the amount paid. This is usually labeled "TOTAL", "AMOUNT DUE", "BALANCE", or appears at the very bottom near the payment method. It is NEVER a line item price.
- "subtotal" is the pre-tax subtotal, usually labeled "SUBTOTAL" or "SUB-TOTAL". This is the sum of all items BEFORE tax.
- "tax_amount" is the ACTUAL tax printed on the receipt (GST, HST, QST, PST, or combined). Read the exact tax amount — do NOT calculate it yourself.
- If the receipt shows multiple items, IGNORE individual item prices. Only extract the TOTAL, SUBTOTAL, and TAX lines that summarize the entire transaction.
- Look at the BOTTOM of the receipt first for totals. Scan upward for subtotal and tax lines.

Required JSON structure:
{
  "vendor":             "<merchant or store name, or null>",
  "expense_date":       "<YYYY-MM-DD, or null if not visible>",
  "total_amount":       <FINAL TOTAL PAID as a plain number, or null>,
  "tax_amount":         <tax amount printed on receipt as a plain number, or null>,
  "subtotal":           <pre-tax subtotal as a plain number, or null>,
  "currency":           "<3-letter ISO code — default CAD for Canadian receipts>",
  "suggested_category": "<one of the keys listed below — or null if uncertain>",
  "confidence":         <your extraction confidence 0.0–1.0>
}

Category keys (pick the most specific match):
- vehicle_fuel:     Gas stations (Shell, Esso, Petro-Canada, Circle K, Irving, Husky), fuel, car wash
- vehicle_service:  Oil change, tire shop, auto repair, parking, Midas, Mr Lube, Canadian Tire service
- vehicle_insurance: Car insurance premiums
- vehicle_payment:  Car loan or lease payments
- marketing_ads:    Facebook/Instagram/Google/LinkedIn Ads, Mailchimp, signage
- marketing_photography: Photography, videography, drone photo, virtual tour, Matterport
- marketing_print:  Print shops, Vistaprint, Minuteman Press, flyers, signs
- marketing_gifts:  Client gifts, gift cards
- office_supplies:  Staples, paper, toner, office supplies, Walmart, Amazon (non-device)
- office_software:  Adobe, Microsoft 365, Slack, Zoom, Canva, app/software subscriptions
- office_phone:     Phone bills, internet service bills
- office_hardware:  Best Buy, computers, monitors, tablets, phones, devices
- prof_board_mls:   Board dues, MLS fees, CREA, OREA, TRREB, real estate board
- prof_licensing:   License renewal, real estate council fees
- prof_eo:          E&O insurance, errors & omissions insurance
- prof_accounting:  Accounting, bookkeeping, CPA, legal fees, notary
- edu_courses:      Udemy, courses, coaching, masterminds, workshops, webinars
- edu_conferences:  Conferences, summits, conventions
- edu_books:        Books, Chapters, Indigo, Kobo, Audible
- meals_client:     Restaurants, coffee shops (Starbucks, Tim Hortons), food delivery, client meals
- meals_team:       Team lunch or dinner
- ent_client:       Client entertainment, golf, spa
- ent_events:       Event tickets, concerts, sports events, Ticketmaster
- other_misc:       Anything that doesn't fit the above

Rules:
- Amounts must be plain numbers (e.g. 25.99, not "$25.99")
- If currency is ambiguous but the receipt looks Canadian, use "CAD"
- Never invent data — use null for any field not clearly visible
- ALWAYS read the actual total from the receipt — NEVER use a line item price as the total
- Confidence: 0.9+ all key fields visible; 0.65–0.9 minor gaps; <0.65 significant issues`;

/**
 * Send a base64-encoded receipt image to Claude vision and return extracted fields.
 *
 * @param imageBase64  raw base64 string (no data-URI prefix)
 * @param mimeType     image MIME type, e.g. "image/jpeg"
 * @param userId       optional user ID for Helicone cost tracking
 */
export async function extractReceiptData(
  imageBase64: string,
  mimeType: string = "image/jpeg",
  userId?: string,
): Promise<OcrExtraction> {
  const imageSizeKB = Math.round(imageBase64.length * 0.75 / 1024);

  console.log(`[receipt/extract] Starting OCR. model=claude-haiku-4.5, mimeType=${mimeType}, ~${imageSizeKB}KB`);

  const { text: raw } = await withRetry(
    () => generateText({
      model: models.fast,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: imageBase64,
              mediaType: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            },
            {
              type: "text",
              text: VISION_PROMPT,
            },
          ],
        },
      ],
      temperature: 0.05,
      maxOutputTokens: 1024,
      headers: userId
        ? heliconeHeaders({ userId, feature: "receipt-ocr" })
        : {},
    }),
    { label: "claude/receipt-ocr", attempts: 3 },
  );

  console.log(`[receipt/extract] Raw response (first 500):`, raw.slice(0, 500));

  if (!raw.trim()) {
    throw new Error("Empty response from Claude vision model");
  }

  // Strip markdown fences if the model wraps output
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: Partial<OcrExtraction>;
  try {
    parsed = JSON.parse(cleaned) as Partial<OcrExtraction>;
  } catch {
    console.error("[receipt/extract] JSON parse failed. Raw:", raw.slice(0, 300));
    throw new Error(`JSON parse failed. Model returned: ${raw.slice(0, 200)}`);
  }

  const result: OcrExtraction = {
    vendor:             parsed.vendor             ?? null,
    expense_date:       parsed.expense_date       ?? null,
    total_amount:       typeof parsed.total_amount === "number" ? parsed.total_amount : null,
    tax_amount:         typeof parsed.tax_amount  === "number" ? parsed.tax_amount  : null,
    subtotal:           typeof parsed.subtotal    === "number" ? parsed.subtotal    : null,
    currency:           parsed.currency           ?? "CAD",
    suggested_category: parsed.suggested_category ?? null,
    confidence:         typeof parsed.confidence  === "number"
                          ? Math.max(0, Math.min(1, parsed.confidence))
                          : 0.5,
  };

  // ── Sanity checks ──────────────────────────────────────────────────────────
  // If subtotal is greater than total, they're likely swapped
  if (result.subtotal != null && result.total_amount != null && result.subtotal > result.total_amount) {
    console.warn(`[receipt/extract] Swapped subtotal/total (subtotal ${result.subtotal} > total ${result.total_amount})`);
    const tmp = result.total_amount;
    result.total_amount = result.subtotal;
    result.subtotal = tmp;
  }

  // If tax + subtotal exist and roughly equal total, trust them; if total is way off, recalculate
  if (result.subtotal != null && result.tax_amount != null && result.total_amount != null) {
    const expectedTotal = Math.round((result.subtotal + result.tax_amount) * 100) / 100;
    const diff = Math.abs(expectedTotal - result.total_amount);
    if (diff > 0.5 && diff > result.total_amount * 0.1) {
      console.warn(`[receipt/extract] Total mismatch: subtotal(${result.subtotal}) + tax(${result.tax_amount}) = ${expectedTotal}, but total=${result.total_amount}. Using higher value.`);
      // Use the higher of the two as total (line item vs real total)
      result.total_amount = Math.max(result.total_amount, expectedTotal);
    }
  }

  console.log(`[receipt/extract] Extracted: vendor=${result.vendor}, total=${result.total_amount}, tax=${result.tax_amount}, subtotal=${result.subtotal}, confidence=${result.confidence}`);
  return result;
}
