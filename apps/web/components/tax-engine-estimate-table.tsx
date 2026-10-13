import { fmtCurrency } from "@/lib/formatters";
import {
  CANONICAL_TAX_DISCLAIMER,
  TAX_ENGINE_ESTIMATE,
  TAX_ESTIMATE_EXAMPLE_INCOMES,
  fmtTaxEstimateRate,
  taxEstimateSpread,
} from "@agent-runway/core/tax-copy";

/**
 * The tax engine's own estimate at a few net business incomes: the lowest and
 * the highest of the 13 provinces and territories. Public tax articles print
 * this where they used to print a typed percentage of each commission
 * ("30–35%", "25% to 40%").
 *
 * Every figure is worked out by the engine when the page is built. Nothing
 * here is typed in, and the tax year in the caption is the engine's.
 */
export function TaxEngineEstimateTable() {
  const rows = TAX_ESTIMATE_EXAMPLE_INCOMES.map((netIncome) => taxEstimateSpread(netIncome));
  const { taxYear } = rows[0];

  return (
    <figure className="not-prose my-8">
      <figcaption className="text-sm font-semibold leading-relaxed text-slate-800">
        Agent Runway tax engine, {taxYear} tax year: estimated federal tax, provincial tax and
        CPP or QPP as a share of net business income
      </figcaption>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[30rem] text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">Net business income</th>
              <th scope="col" className="px-4 py-3">Lowest estimate</th>
              <th scope="col" className="px-4 py-3">Highest estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map(({ netIncome, low, high }) => (
              <tr key={netIncome}>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-800">
                  {fmtCurrency(netIncome)}
                </th>
                <td className="px-4 py-3">
                  {fmtTaxEstimateRate(low.rate)} ({low.label})
                </td>
                <td className="px-4 py-3">
                  {fmtTaxEstimateRate(high.rate)} ({high.label})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {TAX_ENGINE_ESTIMATE.assumptions} {TAX_ENGINE_ESTIMATE.netIncome} {CANONICAL_TAX_DISCLAIMER}
      </p>
    </figure>
  );
}
