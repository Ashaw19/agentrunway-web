/**
 * The lines of CRA form T2125, "Statement of Business or Professional
 * Activities", exactly as the form prints them.
 *
 * Source: form T2125 E (25), the edition linked from
 *   canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html
 *   (page last updated 2026-05-01; the PDF read line by line on 2026-10-13)
 *
 * Why this exists: until 2026-10-13 every surface typed its own line numbers.
 * The T2125 guide page had 11 of its 14 expense lines wrong (phone on "8940",
 * which is not on the form; travel on 8910, which is Rent; home office on
 * 8810, which is Office expenses), and the Reports T2125 tab and its PDF
 * printed "Line 8200" and "Line 8270", which are not on the form either.
 * A line number in copy now comes from here: `t2125Line("9220")` does not
 * compile for a number the form does not have, and
 * t2125-line-numbers.test.ts fails on a typed "Line NNNN" that is not below.
 *
 * Labels are the form's own words. Do not shorten them here: a page that
 * wants a friendlier name prints it beside the form's label, not instead.
 */

export const T2125_FORM = {
  edition: "T2125 E (25)",
  title: "Statement of Business or Professional Activities",
  url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  readOn: "2026-10-13",
} as const;

export const T2125_LINES = {
  // Part 3C: Gross business or professional income
  "8000": "Adjusted gross sales or adjusted professional fees",
  "8290": "Reserves deducted last year",
  "8230": "Other income",
  "8299": "Gross business or professional income",
  // Part 3D: Cost of goods sold and gross profit
  "8300": "Opening inventory",
  "8320": "Purchases during the year",
  "8340": "Direct wage costs",
  "8360": "Subcontracts",
  "8450": "Other costs",
  "8500": "Closing inventory",
  "8518": "Cost of goods sold",
  "8519": "Gross profit (or loss)",
  // Part 4: Net income (loss) before adjustments
  "8521": "Advertising",
  "8523": "Meals and entertainment",
  "8590": "Bad debts",
  "8690": "Insurance",
  "8710": "Interest and bank charges",
  "8760": "Business taxes, licences, and memberships",
  "8810": "Office expenses",
  "8811": "Office stationery and supplies",
  "8860": "Professional fees (includes legal and accounting fees)",
  "8871": "Management and administration fees",
  "8910": "Rent",
  "8960": "Repairs and maintenance",
  "9060": "Salaries, wages, and benefits (including employer's contributions)",
  "9180": "Property taxes",
  "9200": "Travel expenses",
  "9220": "Utilities",
  "9224": "Fuel costs (except for motor vehicles)",
  "9275": "Delivery, freight, and express",
  "9281": "Motor vehicle expenses (not including CCA)",
  "9936": "Capital cost allowance (CCA)",
  "9270": "Other expenses",
  "9368": "Total expenses",
  "9369": "Net income (loss) before adjustments",
  // Part 5: Your net income (loss)
  "9974": "GST/HST rebate for partners received in the year",
  "9943": "Other amounts deductible from your share of net partnership income (loss)",
  "9945": "Business-use-of-home expenses",
  "9946": "Your net income (loss)",
} as const;

export type T2125LineNumber = keyof typeof T2125_LINES;

export interface T2125Line {
  number: T2125LineNumber;
  /** The form's own label for the line. */
  label: (typeof T2125_LINES)[T2125LineNumber];
  /** "Line 9220" */
  ref: string;
}

/** A line of the form. Only compiles for a number the form has. */
export function t2125Line(number: T2125LineNumber): T2125Line {
  return { number, label: T2125_LINES[number], ref: `Line ${number}` };
}

/** True for a line number printed on the form. For checking typed copy. */
export function isT2125LineNumber(value: string): value is T2125LineNumber {
  return Object.prototype.hasOwnProperty.call(T2125_LINES, value);
}

/**
 * Where the form says its two results go on the income tax and benefit
 * return. The form lists all three kinds of income and does not say which one
 * a real estate agent's commissions are, so copy lists the three as well.
 */
export const T2125_RETURN_LINES = {
  /** "Report the gross business or professional income from line 8299 on…" */
  gross: { business: "13499", professional: "13699", commission: "13899" },
  /** "Report the net income amount from line 9946 on…" */
  net: { business: "13500", professional: "13700", commission: "13900" },
} as const;

/** "business income on line 13500, professional income on line 13700 or commission income on line 13900" */
export function t2125ReturnLinesPhrase(kind: keyof typeof T2125_RETURN_LINES): string {
  const lines = T2125_RETURN_LINES[kind];
  return `business income on line ${lines.business}, professional income on line ${lines.professional} or commission income on line ${lines.commission}`;
}
