/**
 * Synthetic receipt images for the OCR eval, drawn with sharp from SVG text.
 * Every vendor, address and amount is made up. Each receipt carries the
 * reading a correct OCR pass returns (what is printed on it).
 */
import sharp from "sharp";

export interface SyntheticReceipt {
  name: string;
  lines: string[];
  expect: {
    vendorIncludes: string;
    date: string;
    total: number;
    /** The GST/HST printed (null when none is printed). */
    tax: number | null;
    currency: string;
  };
}

export const RECEIPTS: SyntheticReceipt[] = [
  {
    name: "NB gas station, split HST",
    lines: ["EXAMPLE GAS #214", "88 Sample Rd, Saint John NB", "2026-10-14  08:12", "", "REGULAR 34.512 L", "@ 1.461/L        50.43", "", "SUBTOTAL         50.43", "HST(F) 5%         2.52", "HST(P) 10%        5.04", "TOTAL            57.99", "", "DEBIT  **** 4821", "HST# 123456789 RT0001"],
    expect: { vendorIncludes: "example gas", date: "2026-10-14", total: 57.99, tax: 7.56, currency: "CAD" },
  },
  {
    name: "ON office supply store, 13% HST",
    lines: ["DEMO OFFICE SUPPLY", "1200 Fake St, Ottawa ON", "Oct 9, 2026 3:41 PM", "", "Printer paper x2   23.98", "Toner cartridge    64.52", "", "Subtotal           88.50", "HST 13%            11.51", "Total             100.01", "", "VISA **** 1173"],
    expect: { vendorIncludes: "demo office", date: "2026-10-09", total: 100.01, tax: 11.51, currency: "CAD" },
  },
  {
    name: "NS coffee shop, 14% HST",
    lines: ["SAMPLE CAFE", "5 Harbour Lane, Halifax NS", "10/02/2026 07:55", "", "Lg coffee x2        5.18", "Breakfast wrap x2   7.21", "", "Subtotal           12.39", "HST 14%             1.73", "Total              14.12", "", "Thank you!"],
    expect: { vendorIncludes: "sample cafe", date: "2026-10-02", total: 14.12, tax: 1.73, currency: "CAD" },
  },
  {
    name: "BC pharmacy, GST and PST",
    lines: ["EXAMPLE DRUGS", "77 Placeholder Ave, Kelowna BC", "2026-09-28 18:20", "", "Phone charger      40.00", "", "Subtotal           40.00", "GST 5%              2.00", "PST 7%              2.80", "Total              44.80"],
    expect: { vendorIncludes: "example drugs", date: "2026-09-28", total: 44.8, tax: 2, currency: "CAD" },
  },
  {
    name: "US online order, sales tax, USD",
    lines: ["SAMPLESHOP.COM", "Order #A-55102", "September 30, 2026", "", "Tripod stand        39.99", "Sales tax (WA)       4.12", "Order total (USD)   44.11"],
    expect: { vendorIncludes: "sampleshop", date: "2026-09-30", total: 44.11, tax: 4.12, currency: "USD" },
  },
];

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A receipt as a PNG, base64, like a phone photo of a paper slip (no data-URI prefix). */
export async function receiptPngBase64(r: SyntheticReceipt): Promise<string> {
  const lineHeight = 30;
  const width = 560;
  const height = 60 + r.lines.length * lineHeight;
  const text = r.lines
    .map((l, i) => `<text x="30" y="${50 + i * lineHeight}" font-family="Courier New, Courier, monospace" font-size="22" fill="#111">${escapeXml(l)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbfaf6"/>${text}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return png.toString("base64");
}
