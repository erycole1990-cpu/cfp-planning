import Link from "next/link";

import {
  createInvestmentHolding,
  recordInvestmentTransaction,
  recordInvestmentValuation,
  reverseInvestmentTransaction,
} from "@/app/portfolio-actions";
import { AppShell, EnvNotice, ErrorNotice, PageHeader, Pagination } from "@/app/ui";
import { formatDate, formatMoney, planningToday } from "@/lib/cfp/format";
import { getPortfolioDetailData } from "@/lib/cfp/portfolio-data";
import { portfolioTransactionDisplayAmounts } from "@/lib/cfp/portfolio";
import {
  HoldingRiskFields,
  PortfolioFxFields,
  PortfolioValuationScopeFields,
} from "./portfolio-entry-fields";

export const dynamic = "force-dynamic";

const instrumentTypes = [
  "cash", "fixed_deposit", "bond", "equity", "etf", "unit_trust",
  "private_equity", "property_fund", "insurance_linked", "crypto", "commodity", "other",
];
const assetClasses = ["cash", "fixed_income", "equity", "property", "alternatives", "mixed", "other"];
const transactionTypes = [
  "opening_balance", "buy", "sell", "contribution", "withdrawal",
  "distribution", "interest", "fee", "tax", "reinvestment",
];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function savedNotice(saved?: string) {
  if (saved === "holding") return "Holding created.";
  if (saved === "transaction") return "Transaction and audit record saved atomically.";
  if (saved === "reversal") return "Reversal saved; the original transaction remains in history.";
  if (saved === "valuation") return "Valuation saved; earlier valuation history remains intact.";
  return null;
}

export default async function PortfolioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; portfolioId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const { id, portfolioId } = await params;
  const query = await searchParams;
  const data = await getPortfolioDetailData(id, portfolioId, Number(query.page || "1"));
  const state = data.detail;
  const today = planningToday();
  const notice = savedNotice(query.saved);
  const detail = state.status === "ready" ? state.data : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.customer?.full_name || "Portfolio Analysis · Phase 1"}
        title={detail ? detail.portfolio.name : "Investment portfolio"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" href={`/customers/${id}/portfolios`}>All portfolios</Link>
            <Link className="btn btn-secondary" href={`/customers/${id}`}>Back to Customer</Link>
          </div>
        }
      />
      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={query.error} />
      <ErrorNotice message={state.status === "error" ? state.error : undefined} />
      {notice ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div> : null}

      {detail ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Type", label(detail.portfolio.portfolio_type)],
              ["Base currency", detail.portfolio.base_currency],
              ["Status", label(detail.portfolio.status)],
              ["Inception", formatDate(detail.portfolio.inception_date)],
            ].map(([heading, value]) => (
              <div className="panel p-4" key={heading}>
                <p className="label">{heading}</p><p className="mt-2 font-bold">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-md border border-blue-200 bg-blue-50 p-5 text-blue-950">
            <h2 className="text-xl font-bold">Analysis unavailable in Phase 1</h2>
            <p className="mt-2 text-sm">
              This screen validates secure portfolio records only. Current value, returns, allocation, benchmark performance, risk scoring, formal suitability, and charts are not calculated. No zero-value analysis is inferred.
            </p>
          </section>

          <section className="panel">
            <div className="border-b border-[#dce2dc] p-5">
              <h2 className="text-xl font-bold">Holdings</h2>
              <p className="mt-1 text-sm text-[#68756f]">Metadata only; derived units and market value are not stored on holdings.</p>
            </div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Holding</th><th>Instrument</th><th>Asset class</th><th>Currency</th><th>Status</th></tr></thead>
              <tbody>
                {detail.holdings.map((holding) => <tr key={holding.id}>
                  <td><span className="font-bold">{holding.name}</span><br /><span className="text-sm text-[#68756f]">{holding.symbol || holding.isin || "No identifier"}</span></td>
                  <td>{label(holding.instrument_type)}</td><td>{label(holding.asset_class)}</td><td>{holding.currency_code}</td><td>{label(holding.status)}</td>
                </tr>)}
                {!detail.holdings.length ? <tr><td colSpan={5} className="text-[#68756f]">No holdings recorded. This is a valid empty holding set.</td></tr> : null}
              </tbody>
            </table></div>
          </section>

          {data.canManage ? <details className="panel p-5">
            <summary className="cursor-pointer text-lg font-bold">Add holding</summary>
            <form action={createInvestmentHolding} className="mt-5 grid gap-4 md:grid-cols-3">
              <input type="hidden" name="customer_id" value={id} /><input type="hidden" name="portfolio_id" value={portfolioId} />
              <label className="field"><span className="label">Holding name</span><input className="input" name="name" required /></label>
              <label className="field"><span className="label">Instrument type</span><select className="input" name="instrument_type" defaultValue="unit_trust">{instrumentTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label className="field"><span className="label">Asset class</span><select className="input" name="asset_class" defaultValue="mixed">{assetClasses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label className="field"><span className="label">Currency</span><input className="input uppercase" name="currency_code" defaultValue={detail.portfolio.base_currency} maxLength={3} required /></label>
              <label className="field"><span className="label">Quantity mode</span><select className="input" name="quantity_mode" defaultValue="units"><option value="units">Units</option><option value="notional">Notional</option><option value="manual_value">Manual value</option></select></label>
              <label className="field"><span className="label">Opened on</span><input className="input" name="opened_on" type="date" /></label>
              <label className="field"><span className="label">Provider</span><input className="input" name="provider_name" /></label>
              <label className="field"><span className="label">Symbol</span><input className="input" name="symbol" /></label>
              <label className="field"><span className="label">ISIN</span><input className="input uppercase" name="isin" /></label>
              <label className="field"><span className="label">Geography code</span><input className="input uppercase" name="geography_code" /></label>
              <HoldingRiskFields />
              <div className="md:col-span-3"><button className="btn" type="submit">Add holding</button></div>
            </form>
          </details> : null}

          <section className="panel">
            <div className="border-b border-[#dce2dc] p-5">
              <h2 className="text-xl font-bold">Immutable transaction history</h2>
              <p className="mt-1 text-sm text-[#68756f]">{detail.transactionCount} transaction{detail.transactionCount === 1 ? "" : "s"}; database-paginated in pages of 20.</p>
            </div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Holding</th><th>Amounts</th><th>Scope</th><th>Correction</th></tr></thead>
              <tbody>
                {detail.transactions.map((transaction) => {
                  const holding = detail.holdings.find((item) => item.id === transaction.holding_id);
                  return <tr key={transaction.id}>
                    <td>{formatDate(transaction.transaction_date)}</td><td>{label(transaction.transaction_type)}</td>
                    <td>{holding?.name || (transaction.holding_id ? "Unknown holding" : "Portfolio cash")}</td>
                    <td className="tabular-nums">
                      <div className="grid gap-1">
                        {portfolioTransactionDisplayAmounts(transaction).map((amount) => (
                          <span key={amount.label}>
                            <span className="text-xs font-bold uppercase tracking-wide text-[#68756f]">{amount.label}</span>{" "}
                            <span className="font-semibold">{formatMoney(amount.value, transaction.currency_code)}</span>
                          </span>
                        ))}
                      </div>
                    </td><td>{label(transaction.cash_flow_scope)}</td>
                    <td>{data.canManage && transaction.transaction_type !== "reversal" ? <details>
                      <summary className="cursor-pointer text-sm font-bold text-[#0f766e]">Record reversal</summary>
                      <form action={reverseInvestmentTransaction} className="mt-2 grid min-w-56 gap-2">
                        <input type="hidden" name="customer_id" value={id} /><input type="hidden" name="portfolio_id" value={portfolioId} /><input type="hidden" name="transaction_id" value={transaction.id} />
                        <input className="input" name="reversal_date" type="date" defaultValue={today} min={transaction.transaction_date} required />
                        <input className="input" name="reversal_notes" placeholder="Reason for correction" required />
                        <button className="btn btn-danger" type="submit">Record reversal</button>
                      </form>
                    </details> : transaction.transaction_type === "reversal" ? "Correction record" : "—"}</td>
                  </tr>;
                })}
                {!detail.transactions.length ? <tr><td colSpan={6} className="text-[#68756f]">No transactions recorded. This is a legitimate empty ledger, not a zero-value analysis.</td></tr> : null}
              </tbody>
            </table></div>
            <div className="px-5 pb-5"><Pagination page={detail.transactionPage} totalPages={detail.transactionTotalPages} pathname={`/customers/${id}/portfolios/${portfolioId}`} /></div>
          </section>

          {data.canManage ? <details className="panel p-5">
            <summary className="cursor-pointer text-lg font-bold">Record transaction</summary>
            <p className="mt-2 text-sm text-[#68756f]">Corrections use reversals. Secure paired transfers exist at the database layer but are not exposed in this validation UI.</p>
            <p className="mt-1 text-sm text-[#68756f]">Opening balances are non-cash; trades, fees, taxes, and reinvestments are internal; contributions are external in; withdrawals are external out; distributions and interest may be internal or external out.</p>
            <form action={recordInvestmentTransaction} className="mt-5 grid gap-4 md:grid-cols-3">
              <input type="hidden" name="customer_id" value={id} /><input type="hidden" name="portfolio_id" value={portfolioId} />
              <label className="field"><span className="label">Date</span><input className="input" name="transaction_date" type="date" defaultValue={today} required /></label>
              <label className="field"><span className="label">Type</span><select className="input" name="transaction_type" defaultValue="contribution">{transactionTypes.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label className="field"><span className="label">Cash-flow scope</span><select className="input" name="cash_flow_scope" defaultValue="external_in"><option value="external_in">External in</option><option value="external_out">External out</option><option value="internal">Internal</option><option value="non_cash">Non-cash</option></select></label>
              <label className="field"><span className="label">Holding (when applicable)</span><select className="input" name="holding_id" defaultValue=""><option value="">Portfolio cash / none</option>{detail.holdings.map((holding) => <option key={holding.id} value={holding.id}>{holding.name}</option>)}</select></label>
              <label className="field"><span className="label">Quantity</span><input className="input" name="quantity" type="number" min="0" step="any" /></label>
              <label className="field"><span className="label">Unit price</span><input className="input" name="unit_price" type="number" min="0" step="any" /></label>
              <label className="field"><span className="label">Gross / trade amount</span><input className="input" name="gross_amount" type="number" min="0" step="any" defaultValue="0" /><span className="text-xs text-[#68756f]">Use zero for a standalone fee or tax.</span></label>
              <label className="field"><span className="label">Fee amount</span><input className="input" name="fee_amount" type="number" min="0" step="any" defaultValue="0" /><span className="text-xs text-[#68756f]">For Fee type: positive amount; gross and tax must be zero.</span></label>
              <label className="field"><span className="label">Tax amount</span><input className="input" name="tax_amount" type="number" min="0" step="any" defaultValue="0" /><span className="text-xs text-[#68756f]">For Tax type: positive amount; gross and fee must be zero.</span></label>
              <PortfolioFxFields baseCurrency={detail.portfolio.base_currency} />
              <label className="field"><span className="label">Source reference</span><input className="input" name="source_reference" /></label>
              <label className="field"><span className="label">Notes</span><input className="input" name="notes" /></label>
              <div className="md:col-span-3"><button className="btn" type="submit">Record immutable transaction</button></div>
            </form>
          </details> : null}

          <section className="panel">
            <div className="border-b border-[#dce2dc] p-5"><h2 className="text-xl font-bold">Valuation history</h2><p className="mt-1 text-sm text-[#68756f]">Corrections supersede, rather than overwrite, earlier records.</p></div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Date</th><th>Scope</th><th>Holding</th><th>Market value</th><th>Evidence</th><th>History</th></tr></thead>
              <tbody>
                {detail.valuations.map((valuation) => { const holding = detail.holdings.find((item) => item.id === valuation.holding_id); return <tr key={valuation.id}><td>{formatDate(valuation.valuation_date)}</td><td>{label(valuation.valuation_scope)}</td><td>{holding?.name || "Whole portfolio"}</td><td className="font-semibold tabular-nums">{formatMoney(valuation.market_value, valuation.currency_code)}</td><td>{label(valuation.evidence_status)}</td><td>{valuation.supersedes_valuation_id ? "Superseding record" : "Original record"}</td></tr>; })}
                {!detail.valuations.length ? <tr><td colSpan={6} className="text-[#68756f]">No valuations recorded. Current value is unavailable; RM0 is not inferred.</td></tr> : null}
              </tbody>
            </table></div>
          </section>

          {data.canManage ? <details className="panel p-5">
            <summary className="cursor-pointer text-lg font-bold">Record valuation</summary>
            <form action={recordInvestmentValuation} className="mt-5 grid gap-4 md:grid-cols-3">
              <input type="hidden" name="customer_id" value={id} /><input type="hidden" name="portfolio_id" value={portfolioId} />
              <PortfolioValuationScopeFields holdings={detail.holdings.map(({ id: holdingId, name }) => ({ id: holdingId, name }))} />
              <label className="field"><span className="label">Valuation date</span><input className="input" name="valuation_date" type="date" defaultValue={today} required /></label>
              <label className="field"><span className="label">Market value</span><input className="input" name="market_value" type="number" min="0" step="any" required /></label>
              <label className="field"><span className="label">Units</span><input className="input" name="units" type="number" min="0" step="any" /></label>
              <label className="field"><span className="label">Unit price</span><input className="input" name="unit_price" type="number" min="0" step="any" /></label>
              <PortfolioFxFields baseCurrency={detail.portfolio.base_currency} />
              <label className="field"><span className="label">Source</span><select className="input" name="source" defaultValue="manual"><option value="manual">Manual</option><option value="provider_statement">Provider statement</option><option value="import">Import</option></select></label>
              <label className="field"><span className="label">Evidence status</span><select className="input" name="evidence_status" defaultValue="unverified"><option value="unverified">Unverified</option><option value="client_provided">Client provided</option><option value="adviser_verified">Adviser verified</option></select></label>
              <label className="field"><span className="label">Evidence note</span><input className="input" name="evidence_note" /></label>
              <label className="field md:col-span-2"><span className="label">Supersedes valuation (same date/scope/holding only)</span><select className="input" name="supersedes_valuation_id" defaultValue=""><option value="">New valuation</option>{detail.valuations.map((valuation) => <option key={valuation.id} value={valuation.id}>{formatDate(valuation.valuation_date)} · {valuation.valuation_scope} · {formatMoney(valuation.market_value, valuation.currency_code)}</option>)}</select></label>
              <div className="md:col-span-3"><button className="btn" type="submit">Record immutable valuation</button></div>
            </form>
          </details> : null}
        </div>
      ) : null}
    </AppShell>
  );
}
