/**
 * Merchant hints (lib/receipts/category-hints.ts), used by receipt OCR and
 * by the statement import, on realistic vendor strings.
 *
 * Each row: the vendor as a receipt or a statement line writes it, what the
 * hints returned before 2026-10-18 (origin/main at #361), and what they return
 * now. Changed rows are the fixes: a short name matched inside another word
 * ("PHOTO" as pho, "ESPRESSO" as Esso, "MOBILE" as Mobil, "KOREA" as OREA,
 * "QUICKBOOKS" as books, "SPACE" as spa), and carriers are now Phone &
 * Internet. The carrier rule runs last and skips venue words, so tickets and
 * venues named after a carrier keep their category ("Rogers Centre",
 * "TELUS Convention Centre", "Shaw Festival Theatre"); names glued to digits
 * still match ("ESSO0412", "THAIEXPRESS", "EXXONMOBIL").
 */
import { describe, expect, it } from "vitest";
import { suggestCategoryFromText } from "../category-hints";

type Row = [vendor: string, before: string | null, after: string | null];

const ROWS: Row[] = [
  ["Shell Canada", "vehicle_fuel", "vehicle_fuel"],
  ["SHELL C04512 SAINT JOHN NB", "vehicle_fuel", "vehicle_fuel"],
  ["QUISPAMSIS ESSO", "vehicle_fuel", "vehicle_fuel"],
  ["ESSO0412 HAMPTON", "vehicle_fuel", "vehicle_fuel"],
  ["EXXONMOBIL 4412", "vehicle_fuel", "vehicle_fuel"],
  ["MOBIL GAS 22", "vehicle_fuel", "vehicle_fuel"],
  ["Petro-Canada", "vehicle_fuel", "vehicle_fuel"],
  ["Irving Oil", "vehicle_fuel", "vehicle_fuel"],
  ["Circle K/Irving", "vehicle_fuel", "vehicle_fuel"],
  ["ESPRESSO BAR", "vehicle_fuel", null],  // changed
  ["Tim Hortons #0912", "meals_client", "meals_client"],
  ["Starbucks", "meals_client", "meals_client"],
  ["PHO 99 NOODLE HOUSE", "meals_client", "meals_client"],
  ["THAIEXPRESS MONCTON", "meals_client", "meals_client"],
  ["THAILAND TRAVEL CO", "meals_client", null],  // changed
  ["Earls Kitchen", "meals_client", "meals_client"],
  ["The Keg Steakhouse", "meals_client", "meals_client"],
  ["LISTING PHOTO STUDIO", "meals_client", null],  // changed
  ["Photography Studio Inc", "meals_client", "marketing_ads"],  // changed
  ["Rogers Wireless", null, "office_phone"],  // changed
  ["ROGERS CABLE", "office_supplies", "office_phone"],  // changed
  ["Bell Aliant", null, "office_phone"],  // changed
  ["BELL MOBILITY IPHONE", "vehicle_fuel", "office_phone"],  // changed
  ["Telus", null, "office_phone"],  // changed
  ["TELUS Convention Centre", "edu_conferences", "edu_conferences"],
  ["Ticketmaster Rogers Centre Blue Jays", "ent_events", "ent_events"],
  ["Shaw Festival Theatre", "ent_events", "ent_events"],
  ["Rogers Place Edmonton Oilers", "ent_events", "ent_events"],
  ["Freedom Mobile", "vehicle_fuel", "office_phone"],  // changed
  ["Eastlink", null, "office_phone"],  // changed
  ["Canva", "office_software", "office_software"],
  ["CANVA* PRO", "office_software", "office_software"],
  ["Notion Labs", "office_software", "office_software"],
  ["PROMOTION CO", null, null],
  ["Microsoft Teams", "office_software", "office_software"],
  ["QuickBooks Online", "edu_books", "office_software"],  // changed
  ["Intuit Canada", null, "office_software"],  // changed
  ["Adobe Creative Cloud", "office_software", "office_software"],
  ["Staples #123", "office_supplies", "office_supplies"],
  ["Best Buy", "office_supplies", "office_supplies"],
  ["Amazon.ca", "office_supplies", "office_supplies"],
  ["HDMI CABLE", "office_supplies", "office_supplies"],
  ["Costco Wholesale", "office_supplies", "office_supplies"],
  ["OREA Membership", "prof_board_mls", "prof_board_mls"],
  ["KOREA HOUSE", "prof_board_mls", null],  // changed
  ["CREA", "prof_board_mls", "prof_board_mls"],
  ["MLS Board Fees", "prof_board_mls", "prof_board_mls"],
  ["Realtor.ca", "prof_board_mls", "prof_board_mls"],
  ["Udemy", "edu_courses", "edu_courses"],
  ["REIN Canada", "edu_courses", "edu_courses"],
  ["TERREIN LANDSCAPING", "edu_courses", null],  // changed
  ["Indigo Books", "edu_books", "edu_books"],
  ["Real Estate Conference 2026", "edu_courses", "edu_courses"],
  ["Spa Utopia", "ent_events", "ent_events"],
  ["SPACE STORAGE", "ent_events", null],  // changed
  ["Golf Town", "ent_events", "ent_events"],
  ["Cineplex Movie", "ent_events", "ent_events"],
  ["NB Power", "home_utilities", "home_utilities"],
  ["Impark Parking", "vehicle_service", "vehicle_service"],
  ["Midas Auto", "vehicle_service", "vehicle_service"],
];

describe("suggestCategoryFromText on realistic vendor strings", () => {
  it.each(ROWS)("%s → %s before, %s now", (vendor, _before, after) => {
    expect(suggestCategoryFromText(vendor)).toBe(after);
  });

  it("every change from before is one of the intended fixes", () => {
    const changed = ROWS.filter(([, before, after]) => before !== after).map(([v]) => v);
    expect(changed).toEqual([
      "ESPRESSO BAR", "THAILAND TRAVEL CO", "LISTING PHOTO STUDIO", "Photography Studio Inc",
      "Rogers Wireless", "ROGERS CABLE", "Bell Aliant", "BELL MOBILITY IPHONE", "Telus", "Freedom Mobile", "Eastlink",
      "QuickBooks Online", "Intuit Canada", "KOREA HOUSE", "TERREIN LANDSCAPING", "SPACE STORAGE",
    ]);
  });
});
