import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintPlanButton } from "@/app/customers/[id]/plan/print-button";
import { AppShell, PageHeader } from "@/app/ui";
import {
  buildFinancialRatios,
  buildMonthlyCashFlow,
  cashFlowAmountForMonth,
  statementItemsForMonth,
  type FinancialRatio,
  type RatioStatus,
} from "@/lib/cfp/financial-analysis";
import { getCustomerDetail } from "@/lib/cfp/data";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import type { FinancialStatementItem } from "@/lib/cfp/supabase";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
};

const ratioStyles: Record<RatioStatus, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  watch: "border-amber-200 bg-amber-50 text-amber-900",
  attention: "border-red-200 bg-red-50 text-red-900",
  insufficient: "border-slate-200 bg-slate-50 text-slate-700",
};

const ratioLabels: Record<RatioStatus, string> = {
  good: "Good shape",
  watch: "Review",
  attention: "Needs attention",
  insufficient: "Not assessed",
};

function itemDate(item: FinancialStatementItem) {
  return new Date(item.statement_date || item.created_at);
}

function validDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function availableYears(items: FinancialStatementItem[]) {
  const years = new Set<number>([new Date().getFullYear()]);
  items.forEach((item) => {
    const date = itemDate(item);
    if (validDate(date)) years.add(date.getFullYear());
  });
  return [...years].sort((a, b) => b - a);
}

function lineItems(
  items: FinancialStatementItem[],
  statementType: string,
  itemType: string,
) {
  return items.filter(
    (item) => item.statement_type === statementType && item.item_type === itemType,
  );
}

function total(items: FinancialStatementItem[]) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function Frequency({ item }: { item: FinancialStatementItem }) {
  const value = (item.frequency || "monthly").replaceAll("_", " ");
  return <span className="capitalize">{value}</span>;
}

function StatementRows({
  items,
  emptyMessage,
}: {
  items: FinancialStatementItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="text-[#66736d]">
          {emptyMessage}
        </td>
      </tr>
    );
  }

  return items.map((item) => (
    <tr key={item.id}>
      <td className="capitalize">{item.item_type.replaceAll("_", " ")}</td>
      <td>{item.category || "Other"}</td>
      <td>{item.description}</td>
      <td className="whitespace-nowrap font-semibold tabular-nums">
        {formatCurrency(item.amount)}
      </td>
      <td className="whitespace-nowrap">
        {item.statement_date ? formatDate(item.statement_date) : "Current"}
      </td>
    </tr>
  ));
}

function RatioCard({ ratio }: { ratio: FinancialRatio }) {
  return (
    <article className={`min-w-0 border p-4 ${ratioStyles[ratio.status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{ratio.label}</h3>
          <p className="mt-1 text-sm font-semibold">{ratioLabels[ratio.status]}</p>
        </div>
        <p className="break-words text-right text-xl font-bold tabular-nums">
          {ratio.displayValue}
        </p>
      </div>
      <p className="mt-3 text-sm">{ratio.explanation}</p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="font-bold">Calculation</dt>
          <dd>{ratio.formula}</dd>
        </div>
        <div>
          <dt className="font-bold">Planning guide</dt>
          <dd>{ratio.benchmark}</dd>
        </div>
      </dl>
    </article>
  );
}

export default async function CustomerStatementsPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getCustomerDetail(id);

  if (!data.configured || !data.customer) notFound();

  const customer = data.customer;
  const items = data.statementItems ?? [];
  const years = availableYears(items);
  const requestedYear = Number(query.year);
  const year = years.includes(requestedYear) ? requestedYear : years[0];
  const requestedMonth = Number(query.month);
  const monthIndex =
    Number.isInteger(requestedMonth) && requestedMonth >= 0 && requestedMonth <= 11
      ? requestedMonth
      : new Date().getMonth();

  const monthlyCashFlow = buildMonthlyCashFlow(items, year);
  const selectedMonth = monthlyCashFlow[monthIndex];
  const selectedMonthItems = statementItemsForMonth(items, year, monthIndex);
  const ratios = buildFinancialRatios(items, monthlyCashFlow, year);
  const annualIncome = monthlyCashFlow.reduce((sum, month) => sum + month.income, 0);
  const annualExpenses = monthlyCashFlow.reduce((sum, month) => sum + month.expenses, 0);
  const annualSurplus = annualIncome - annualExpenses;

  const balanceItems = items.filter((item) => item.statement_type === "balance_sheet");
  const assets = lineItems(balanceItems, "balance_sheet", "asset");
  const liabilities = lineItems(balanceItems, "balance_sheet", "liability");
  const netWorth = total(assets) - total(liabilities);
  const profitLossItems = items.filter((item) => item.statement_type === "profit_loss");
  const revenue = lineItems(profitLossItems, "profit_loss", "revenue");
  const businessExpenses = lineItems(profitLossItems, "profit_loss", "expense");
  const businessProfit = total(revenue) - total(businessExpenses);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Financial reports"
        title={customer.full_name}
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintPlanButton />
            <Link className="btn btn-secondary no-print" href={`/customers/${id}`}>
              Back to Customer
            </Link>
          </div>
        }
      />

      <section className="panel mb-6 p-5 no-print">
        <div className="flex flex-wrap items-end gap-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="field min-w-40">
              <span>Reporting year</span>
              <select name="year" defaultValue={year}>
                {years.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>
                    {availableYear}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="month" value={monthIndex} />
            <button className="btn btn-primary" type="submit">
              View Year
            </button>
          </form>
          <p className="max-w-3xl text-sm text-[#5c6963]">
            Recurring entries are projected from their recorded start date. One-time items appear
            only in their dated month.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Financial ratio snapshot</h2>
            <p className="text-[#5c6963]">
              Plain-language planning indicators based on the statements entered for {year}.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ratios.map((ratio) => (
            <RatioCard key={ratio.id} ratio={ratio} />
          ))}
        </div>
        <p className="mt-3 text-sm text-[#5c6963]">
          These benchmarks are internal planning guides based only on the data entered. They are
          not a credit score, lending decision, regulatory assessment, or substitute for
          professional judgement. Protection and goal funding remain unassessed until their
          required projection data is recorded.
        </p>
      </section>

      <section className="panel mb-8 overflow-hidden">
        <div className="border-b border-[#d7ded9] p-5">
          <h2 className="text-2xl font-bold">Cash Flow Statement</h2>
          <p className="text-[#5c6963]">
            Monthly income, spending, and available surplus for {year}.
          </p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Surplus / Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {monthlyCashFlow.map((month) => (
                <tr key={month.month}>
                  <td>
                    <Link
                      className="font-semibold text-[#006b63] underline-offset-4 hover:underline no-print"
                      href={`?year=${year}&month=${month.monthIndex}`}
                    >
                      {month.month}
                    </Link>
                    <span className="hidden print:inline">{month.month}</span>
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatCurrency(month.income)}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatCurrency(month.expenses)}
                  </td>
                  <td
                    className={`whitespace-nowrap font-bold tabular-nums ${
                      month.surplus < 0 ? "text-red-700" : "text-[#006b63]"
                    }`}
                  >
                    {formatCurrency(month.surplus)}
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Annual total</td>
                <td className="whitespace-nowrap tabular-nums">{formatCurrency(annualIncome)}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {formatCurrency(annualExpenses)}
                </td>
                <td
                  className={`whitespace-nowrap tabular-nums ${
                    annualSurplus < 0 ? "text-red-700" : "text-[#006b63]"
                  }`}
                >
                  {formatCurrency(annualSurplus)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mb-8 overflow-hidden">
        <div className="border-b border-[#d7ded9] p-5">
          <h2 className="text-2xl font-bold">{selectedMonth.month} detail</h2>
          <p className="text-[#5c6963]">
            Entries contributing to this month. Projected recurring amounts are shown at their
            monthly equivalent.
          </p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Frequency</th>
                <th>Entered Amount</th>
                <th>Month Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedMonthItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-[#66736d]">
                    No cash-flow entries contribute to this month yet.
                  </td>
                </tr>
              ) : (
                selectedMonthItems.map((item) => (
                  <tr key={item.id}>
                    <td className="capitalize">{item.item_type}</td>
                    <td>{item.category || "Other"}</td>
                    <td>{item.description}</td>
                    <td>
                      <Frequency item={item} />
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="whitespace-nowrap font-semibold tabular-nums">
                      {formatCurrency(cashFlowAmountForMonth(item, year, monthIndex))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mb-8 overflow-hidden">
        <div className="border-b border-[#d7ded9] p-5">
          <h2 className="text-2xl font-bold">Balance Sheet</h2>
          <p className="text-[#5c6963]">
            Current recorded assets and liabilities. Net worth:{" "}
            <strong>{formatCurrency(netWorth)}</strong>.
          </p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>As At</th>
              </tr>
            </thead>
            <tbody>
              <StatementRows items={balanceItems} emptyMessage="No balance-sheet entries yet." />
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mb-8 overflow-hidden">
        <div className="border-b border-[#d7ded9] p-5">
          <h2 className="text-2xl font-bold">Business Profit and Loss</h2>
          <p className="text-[#5c6963]">
            Optional for self-employed and business clients. Recorded profit:{" "}
            <strong>{formatCurrency(businessProfit)}</strong>.
          </p>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>As At</th>
              </tr>
            </thead>
            <tbody>
              <StatementRows
                items={profitLossItems}
                emptyMessage="No business profit-and-loss entries yet."
              />
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
