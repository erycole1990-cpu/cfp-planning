import Link from "next/link";

import { createInvestmentPortfolio } from "@/app/portfolio-actions";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader } from "@/app/ui";
import { formatDate } from "@/lib/cfp/format";
import { getCustomerPortfolioData } from "@/lib/cfp/portfolio-data";

export const dynamic = "force-dynamic";

export default async function CustomerPortfoliosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getCustomerPortfolioData(id);
  const state = data.portfolios;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Portfolio Analysis · Phase 1"
        title={data.customer?.full_name || "Investment portfolios"}
        actions={
          <Link className="btn btn-secondary" href={`/customers/${id}`}>
            Back to Customer
          </Link>
        }
      />

      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={query.error} />
      <ErrorNotice message={state.status === "error" ? state.error : undefined} />
      {query.saved === "portfolio" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Portfolio created with customer and agency access controls.
        </div>
      ) : null}

      {state.status === "ready" ? (
        <section className="panel">
          <div className="border-b border-[#dce2dc] p-5">
            <h2 className="text-xl font-bold">Portfolios</h2>
            <p className="mt-1 text-sm text-[#68756f]">
              Foundation records only. Performance, allocation, risk comparison, and benchmark calculations are not available in Phase 1.
            </p>
          </div>
          <div className="divide-y divide-[#dce2dc]">
            {state.records.map((portfolio) => (
              <article className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]" key={portfolio.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">{portfolio.name}</h3>
                    <span className="rounded-full bg-[#eef3ef] px-2.5 py-1 text-xs font-bold capitalize text-[#405047]">
                      {portfolio.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#68756f]">
                    {portfolio.portfolio_type.replaceAll("_", " ")} · {portfolio.base_currency} · inception {formatDate(portfolio.inception_date)}
                  </p>
                  <p className="mt-2 text-sm text-[#405047]">
                    {portfolio.objective || "No objective recorded."}
                  </p>
                </div>
                <Link
                  className="btn btn-secondary self-center"
                  href={`/customers/${id}/portfolios/${portfolio.id}`}
                >
                  Open portfolio
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {state.status === "empty" ? (
        <EmptyState
          title="No investment portfolios yet"
          body="This is a valid empty portfolio record set. Add the first portfolio to begin recording holdings, immutable transactions, and valuation history."
        />
      ) : null}

      {data.canManage && state.status !== "error" ? (
        <section className="panel mt-6 p-5">
          <h2 className="text-xl font-bold">Create portfolio</h2>
          <p className="mt-1 text-sm text-[#68756f]">
            The portfolio agency is derived from the customer by the database and cannot be supplied here.
          </p>
          <form action={createInvestmentPortfolio} className="mt-5 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="customer_id" value={id} />
            <label className="field">
              <span className="label">Portfolio name</span>
              <input className="input" name="name" required />
            </label>
            <label className="field">
              <span className="label">Portfolio type</span>
              <select className="input" name="portfolio_type" defaultValue="general">
                <option value="general">General</option>
                <option value="retirement">Retirement</option>
                <option value="education">Education</option>
                <option value="income">Income</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field md:col-span-2">
              <span className="label">Objective</span>
              <textarea className="input min-h-24" name="objective" />
            </label>
            <label className="field">
              <span className="label">Base currency</span>
              <input className="input uppercase" name="base_currency" defaultValue="MYR" maxLength={3} required />
            </label>
            <label className="field">
              <span className="label">Inception date</span>
              <input className="input" name="inception_date" type="date" />
            </label>
            <label className="field">
              <span className="label">Custodian / provider</span>
              <input className="input" name="custodian_provider" />
            </label>
            <label className="field">
              <span className="label">Account reference</span>
              <input className="input" name="account_reference" />
            </label>
            <div className="md:col-span-2">
              <button className="btn" type="submit">Create portfolio</button>
            </div>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
