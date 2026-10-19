// What an earlier tax year's T2125 summary is built from, and what it leaves
// out (2026-10-19). One list, printed by the Reports T2125 tab and the T2125
// PDF, so the screen and the document say the same thing.
//
// The Reports page builds an earlier year (?taxYear=) from dated records
// only: receipts dated in that year and the active recurring expenses'
// charges in it. The monthly estimates typed on expense lines describe the
// current year, so they are not counted for another year (12 × today's
// estimate would put a cost on a year with no record of it). user_settings
// holds one set of GST/HST remittances, GST/HST paid on expenses and tax
// instalments paid, the current year's, so an earlier year leaves them out
// (t2125-engine `paymentsYear`) and shows no balance for them.

/** The notes for a T2125 of `taxYear`; none for the current year. */
export function earlierYearT2125Notes(taxYear: number, currentYear: number, engineTaxYear: number): string[] {
  if (taxYear === currentYear) return [];
  return [
    `${taxYear} expenses are receipts dated in ${taxYear} and the active Recurring Expenses' charges in ${taxYear}. The monthly estimates on expense lines describe the current year and are not counted for ${taxYear}; a recurring expense deleted since is not included.`,
    `Vehicle business use is the ${taxYear} logbook's share, or the declared setting when the logbook does not cover ${taxYear}. CCA assets and the home office estimates are as recorded now.`,
    `GST/HST remitted, GST/HST paid on expenses and tax instalments paid are stored for the current year only, so this ${taxYear} summary leaves them out and shows no balance for them.`,
    ...(taxYear !== engineTaxYear ? [`Income tax figures use the tax engine's ${engineTaxYear} tables.`] : []),
  ];
}
