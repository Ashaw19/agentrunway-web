/**
 * Receipt OCR extraction via Claude vision.
 * Sends the receipt image as a base64 data URL and returns structured JSON.
 *
 * Model: Claude Haiku 4.5 (fast tier — cheap OCR extraction)
 */
import { generateText } from "ai";
import { models, aiCallHeaders } from "@/lib/ai/provider";
import type { OcrExtraction, OcrTaxLine } from "@/lib/types/receipt";
import { withRetry } from "@/lib/retry";
import { checkReceiptAmounts } from "./check-amounts";
import { uprightImage } from "./upright-image";

const VISION_PROMPT = `You are a receipt data extraction assistant for Canadian real estate agents.
Extract structured data from this receipt image.
Return ONLY a raw JSON object — no markdown, no code fences, no explanation.

CRITICAL RULES FOR AMOUNTS:
- "total_amount" MUST be the FINAL TOTAL on the receipt — the very last amount, the grand total, the amount paid. This is usually labeled "TOTAL", "AMOUNT DUE", "BALANCE", or appears at the very bottom near the payment method. It is NEVER a line item price.
- "subtotal" is the pre-tax subtotal printed on the receipt, usually labeled "SUBTOTAL" or "SUB-TOTAL". This is the sum of all items BEFORE tax. If the receipt prints no subtotal (gas receipts usually don't), use null.
- "tax_amount" is the GST/HST printed on the receipt: the HST line, or the GST line where GST and PST are charged separately. Read the exact amount printed — do NOT calculate it yourself.
- "tax_amount" NEVER includes any other tax or fee, even when it is printed next to the HST: no PST, QST or RST, no federal excise tax, provincial gasoline or fuel tax or carbon charge, no environmental or recycling fee, bottle deposit or tip.
- GAS RECEIPTS: the pump price already includes the HST. Irving and Circle K receipts print it in two parts under "Taxes on fuel:": "HST(F)" is the federal part and "HST(P)" the provincial part. The HST is the two added together. In NB, NL and PEI, HST(P) is twice HST(F).
- "HST # R100853829" or "HST(F) # R..." is a registration number, not an amount. A receipt that prints only the registration number has no tax amount: use null.
- If no GST/HST amount is printed, use null.
- "tax_lines" lists each GST/HST amount line exactly as printed, with its label (for example [{"label": "HST(F)", "amount": 2.52}, {"label": "HST(P)", "amount": 5.04}]). Use [] when none is printed.

READING DIGITS:
- Receipt printers often print zero with a slash or a dot inside it. That is 0, never 8. Read each digit of the tax lines and the total twice.
- If the receipt shows multiple items, IGNORE individual item prices. Only extract the TOTAL, SUBTOTAL, and TAX lines that summarize the entire transaction.
- Look at the BOTTOM of the receipt first for totals. Scan upward for subtotal and tax lines.

Required JSON structure:
{
  "vendor":             "<merchant or store name, or null>",
  "expense_date":       "<YYYY-MM-DD, or null if not visible>",
  "total_amount":       <FINAL TOTAL PAID as a plain number, or null>,
  "tax_amount":         <GST/HST printed on the receipt as a plain number, or null>,
  "tax_lines":          [{"label": "<label as printed>", "amount": <plain number>}],
  "subtotal":           <pre-tax subtotal printed on the receipt as a plain number, or null>,
  "currency":           "<3-letter ISO code — default CAD for Canadian receipts>",
  "suggested_category": "<one of the keys listed below — or null if uncertain>",
  "confidence":         <your extraction confidence 0.0–1.0>
}

Category keys (pick the most specific match):
- vehicle_fuel:     Gas stations (Shell, Esso, Petro-Canada, Circle K, Irving, Husky), fuel, car wash
- vehicle_service:  Oil change, tire shop, auto repair, Midas, Mr Lube, Canadian Tire service
- vehicle_insurance: Car insurance premiums
- vehicle_payment:  Car loan or lease payments
- vehicle_parking:  Parking lots, meters and parking apps (Impark, Indigo Park, Precise ParkLink, PayByPhone, HONK)
- vehicle_business_insurance: An extra premium or rider for using the vehicle for business (only when the document says so; regular car insurance is vehicle_insurance)
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
- home_utilities:   A HOME power, heating, natural gas, heating oil, propane or water bill (NB Power, Saint John Energy, Hydro One, Enbridge, Nova Scotia Power)
- home_internet:    A HOME internet bill (only when the bill is clearly residential internet)
- home_insurance:   Home or tenant insurance premiums
- home_maintenance: Repairs or upkeep to the home (plumber, furnace service, roof repair)
- home_property_tax: Municipal property tax bill
- home_mortgage_interest: Mortgage statement showing interest paid
- home_rent:        Residential rent receipt
- home_condo_fees:  Condo or strata fees
- other_misc:       Anything that doesn't fit the above

Rules:
- Amounts must be plain numbers (e.g. 25.99, not "$25.99")
- If currency is ambiguous but the receipt looks Canadian, use "CAD"
- Never invent data — use null for any field not clearly visible
- ALWAYS read the actual total from the receipt — NEVER use a line item price as the total
- Confidence: 0.9+ all key fields visible; 0.65–0.9 minor gaps; <0.65 significant issues`;

/** The model's tax lines, keeping only well-formed ones. */
function taxLines(raw: unknown): OcrTaxLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is OcrTaxLine =>
      typeof l === "object" && l !== null &&
      typeof (l as OcrTaxLine).label === "string" &&
      typeof (l as OcrTaxLine).amount === "number" &&
      Number.isFinite((l as OcrTaxLine).amount),
  );
}

/**
 * Send a base64-encoded receipt image to Claude vision and return extracted fields.
 *
 * @param imageBase64  raw base64 string (no data-URI prefix)
 * @param mimeType     image MIME type, e.g. "image/jpeg"
 * @param userId       optional user ID for the AI run ledger (ai_runs)
 */
export async function extractReceiptData(
  imageBase64: string,
  mimeType: string = "image/jpeg",
  userId?: string,
): Promise<OcrExtraction> {
  const upright = await uprightImage(Buffer.from(imageBase64, "base64"), mimeType);
  imageBase64 = upright.bytes.toString("base64");
  mimeType = upright.mimeType;
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
      headers: aiCallHeaders({ userId, feature: "receipt-ocr" }),
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
    tax_lines:          taxLines(parsed.tax_lines),
    subtotal:           typeof parsed.subtotal    === "number" ? parsed.subtotal    : null,
    currency:           parsed.currency           ?? "CAD",
    suggested_category: parsed.suggested_category ?? null,
    confidence:         typeof parsed.confidence  === "number"
                          ? Math.max(0, Math.min(1, parsed.confidence))
                          : 0.5,
  };

  const checked = checkReceiptAmounts(result);

  console.log(`[receipt/extract] Extracted: vendor=${result.vendor}, total=${checked.total_amount}, tax=${checked.tax_amount}, subtotal=${checked.subtotal}, confidence=${checked.confidence}`);
  return checked;
}
