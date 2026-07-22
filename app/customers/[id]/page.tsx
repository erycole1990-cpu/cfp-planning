import Link from "next/link";
import { notFound } from "next/navigation";
import {
  completeNextStepAction,
  createNextStepAction,
  createFinancialStatementItem,
  deleteFinancialStatementItem,
  endCustomerService,
  logProgress,
  reactivateCustomerService,
  updateCustomer,
  updateGoalPriority,
} from "@/app/actions";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, PriorityBadge, StatusBadge } from "@/app/ui";
import { dateTimeValue, formatCurrency, formatDate, toDateInputValue } from "@/lib/cfp/format";
import { getCustomerDetail } from "@/lib/cfp/data";
import { accessDisplayName, isPersonalCustomer, requireCurrentAccess } from "@/lib/cfp/access";
import { AddGoalForm } from "./add-goal-form";
import { StatementImporter } from "./statement-importer";
import { RiskProfileField } from "@/app/customers/risk-profile-field";
import type { FinancialStatementItem } from "@/lib/cfp/supabase";
import { GoalLifecycleActions } from "./goal-lifecycle-actions";
import { auditActionLabel, auditDetails, auditEntityLabel } from "@/lib/cfp/audit";
import { evaluateGoalHealth } from "@/lib/cfp/status";

export const dynamic = "force-dynamic";

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function progressPercent(currentAmount: number | string, targetAmount: number | string) {
  const current = Number(currentAmount);
  const target = Number(targetAmount);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function nextPriority(priority: string, direction: "up" | "down") {
  const order = ["high", "medium", "low"];
  const index = order.indexOf(priority);
  if (index === -1) return "medium";
  const nextIndex = direction === "up" ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1);
  return order[nextIndex];
}

function yearsUntil(targetDate: string) {
  const today = new Date();
  const target = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;

  const years = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.round(years * 10) / 10);
}

function calculatorHref(customerId: string, goal: {
  id: string;
  goal_name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string;
}) {
  const returnTo = `/customers/${customerId}#goal-${goal.id}`;
  const params = new URLSearchParams({
    customerId,
    goalId: goal.id,
    goalName: goal.goal_name,
    todayCost: String(goal.target_amount),
    currentSavings: String(goal.current_amount),
    returnTo,
    years: String(yearsUntil(goal.target_date)),
  });
  return `/calculator?${params.toString()}`;
}

function monthlyEquivalent(item: FinancialStatementItem) {
  const amount = Number(item.amount) || 0;
  switch (item.frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    case "one_time":
      return 0;
    default:
      return amount;
  }
}

function frequencyLabel(frequency: string | null) {
  switch (frequency) {
    case "weekly":
      return "weekly";
    case "quarterly":
      return "quarterly";
    case "annual":
      return "annual";
    case "one_time":
      return "one-time";
    case "current":
      return "current value";
    default:
      return "monthly";
  }
}

function statementDate(item: FinancialStatementItem) {
  const date = new Date(item.statement_date ? `${item.statement_date}T00:00:00` : item.created_at);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function formatStatementMonth(item: FinancialStatementItem) {
  const date = statementDate(item);
  return `${monthLabels[date.getMonth()]} ${date.getFullYear()}`;
}

function cashFlowImpactForMonth(item: FinancialStatementItem, monthIndex: number) {
  const amount = Number(item.amount) || 0;
  if (["monthly", "weekly", "quarterly"].includes(item.frequency || "monthly")) {
    return monthlyEquivalent(item);
  }

  const date = statementDate(item);
  return date.getMonth() === monthIndex ? amount : 0;
}

function buildCashFlowMonthlySummary(items: FinancialStatementItem[]) {
  return monthLabels.map((month, index) => {
    const income = items
      .filter((item) => item.item_type === "income")
      .reduce((total, item) => total + cashFlowImpactForMonth(item, index), 0);
    const expenses = items
      .filter((item) => item.item_type === "expense")
      .reduce((total, item) => total + cashFlowImpactForMonth(item, index), 0);

    return {
      month,
      income,
      expenses,
      surplus: income - expenses,
    };
  });
}

function sumStatement(items: FinancialStatementItem[], statementType: string, itemTypes: string[], monthly = false) {
  return items
    .filter((item) => item.statement_type === statementType && itemTypes.includes(item.item_type))
    .reduce((total, item) => total + (monthly ? monthlyEquivalent(item) : Number(item.amount) || 0), 0);
}

function isBusinessPlanningRelevant(customer: { employment_status?: string | null; occupation?: string | null } | null | undefined) {
  const employment = (customer?.employment_status || "").toLowerCase();
  const occupation = (customer?.occupation || "").toLowerCase();
  return employment.includes("self-employed") || employment.includes("business") || occupation.includes("business");
}

function submissionLabel(type: string) {
  switch (type) {
    case "financial_statement_item":
      return "Financial statement entry";
    case "financial_statement_import":
      return "Statement import";
    case "goal_progress":
      return "Goal progress update";
    case "customer_profile_update":
      return "Profile update";
    case "goal_create":
      return "New financial goal";
    default:
      return "Planning update";
  }
}

function StatementSection({
  title,
  summary,
  statementType,
  items,
  customerId,
  actor,
  itemTypes,
  categories,
  showFrequency = true,
  dateLabel,
  monthlySummary,
  canDelete = true,
}: {
  title: string;
  summary: string;
  statementType: string;
  items: FinancialStatementItem[];
  customerId: string;
  actor: string;
  itemTypes: Array<{ value: string; label: string }>;
  categories: string[];
  showFrequency?: boolean;
  dateLabel?: string;
  monthlySummary?: Array<{ month: string; income: number; expenses: number; surplus: number }>;
  canDelete?: boolean;
}) {
  const showDate = Boolean(dateLabel);
  const tableColumnCount = showDate ? 7 : 6;

  return (
    <details className="rounded-md border border-[#dce2dc] p-4" open={statementType === "balance_sheet"}>
      <summary className="cursor-pointer text-lg font-bold">{title}</summary>
      <p className="mt-2 text-sm text-[#68756f]">{summary}</p>

      <form
        action={createFinancialStatementItem}
        className={`mt-4 grid gap-3 ${
          showDate
            ? "lg:grid-cols-[0.8fr_1fr_1.2fr_0.75fr_0.85fr_0.85fr_auto]"
            : "lg:grid-cols-[0.8fr_1fr_1.3fr_0.8fr_0.8fr_auto]"
        }`}
      >
        <input type="hidden" name="customer_id" value={customerId} />
        <input type="hidden" name="actor" value={actor} />
        <input type="hidden" name="statement_type" value={statementType} />
        <label className="field">
          <span className="label">Type</span>
          <select className="input" name="item_type" required>
            {itemTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Category</span>
          <select className="input" name="category" defaultValue={categories[0] || ""}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Description</span>
          <input className="input" name="description" required placeholder="Example: EPF, housing loan, salary, rent" />
        </label>
        <label className="field">
          <span className="label">Amount</span>
          <input className="input" name="amount" required min="0" step="0.01" type="number" />
        </label>
        {showDate ? (
          <label className="field">
            <span className="label">{dateLabel}</span>
            <input className="input" name="statement_date" type="date" defaultValue={toDateInputValue(new Date())} />
          </label>
        ) : null}
        <label className="field">
          <span className="label">Frequency</span>
          <select className="input" name="frequency" defaultValue={showFrequency ? "monthly" : "current"}>
            {showFrequency ? (
              <>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="one_time">One-time</option>
              </>
            ) : (
              <option value="current">Current value</option>
            )}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn w-full" type="submit">
            Add
          </button>
        </div>
      </form>

      <div className="mt-4 table-wrap rounded-md border border-[#dce2dc]">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              {showDate ? <th>{dateLabel}</th> : null}
              <th>{showFrequency ? "Monthly eq." : "Value"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="capitalize">{item.item_type.replace("_", " ")}</td>
                <td>{item.category || "Not set"}</td>
                <td>{item.description}</td>
                <td>
                  {formatCurrency(item.amount)}
                  {showFrequency ? <p className="text-sm text-[#68756f]">{frequencyLabel(item.frequency)}</p> : null}
                </td>
                {showDate ? (
                  <td>{item.statement_date ? (showFrequency ? formatStatementMonth(item) : formatDate(item.statement_date)) : "Not set"}</td>
                ) : null}
                <td>{formatCurrency(showFrequency ? monthlyEquivalent(item) : item.amount)}</td>
                <td>
                  {canDelete ? (
                    <form action={deleteFinancialStatementItem}>
                      <input type="hidden" name="customer_id" value={customerId} />
                      <input type="hidden" name="statement_item_id" value={item.id} />
                      <input type="hidden" name="actor" value={actor} />
                      <button className="btn btn-secondary" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={tableColumnCount} className="text-sm text-[#68756f]">
                  No line items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {monthlySummary ? (
        <div className="mt-4 rounded-md border border-[#dce2dc]">
          <div className="border-b border-[#dce2dc] p-4">
            <h3 className="font-bold">Monthly cash-flow summary</h3>
            <p className="mt-1 text-sm text-[#68756f]">
              Monthly, weekly, and quarterly items are spread across every month. Annual and one-time items are shown in the month selected above.
            </p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Surplus / shortfall</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{formatCurrency(row.income)}</td>
                    <td>{formatCurrency(row.expenses)}</td>
                    <td className={row.surplus < 0 ? "font-bold text-red-700" : "font-bold text-[#006263]"}>
                      {formatCurrency(row.surplus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </details>
  );
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; error?: string; goal?: string; goals?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const access = await requireCurrentAccess();
  const data = await getCustomerDetail(id);

  if (data.configured && !data.customer && !data.error) notFound();

  const customer = data.customer;
  const personalOwner = Boolean(customer && isPersonalCustomer(access, customer));
  const submissionOnly = access.isClient || personalOwner;
  const pendingSubmissions = (data.pendingSubmissions ?? []).filter((submission) => submission.review_status === "pending");
  const isInactiveCustomer = customer?.service_status === "inactive";
  const today = toDateInputValue(new Date());
  const actionsByGoal = new Map<string, NonNullable<typeof data.actions>>();
  for (const action of data.actions ?? []) {
    if (!action.goal_id) continue;
    const list = actionsByGoal.get(action.goal_id) ?? [];
    list.push(action);
    actionsByGoal.set(action.goal_id, list);
  }

  const activity = (data.auditLogs ?? []).map((log) => ({
    ...log,
    details: auditDetails(log.action, log.payload),
  }));

  const sortedGoals = (data.goals ?? []).slice().sort((a, b) => {
    const priorityDelta =
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1);
    if (priorityDelta) return priorityDelta;
    return dateTimeValue(a.target_date) - dateTimeValue(b.target_date);
  });
  const priorityGoals = query.goals === "all" ? sortedGoals : sortedGoals.slice(0, 5);
  const focusedGoalId =
    (query.goal && sortedGoals.some((goal) => goal.id === query.goal) ? query.goal : null) ||
    sortedGoals.find((goal) => goal.on_track_status === "off_track" || goal.on_track_status === "at_risk")?.id ||
    sortedGoals[0]?.id;
  const statementItems = data.statementItems ?? [];
  const balanceSheetItems = statementItems.filter((item) => item.statement_type === "balance_sheet");
  const cashFlowItems = statementItems.filter((item) => item.statement_type === "cash_flow");
  const profitLossItems = statementItems.filter((item) => item.statement_type === "profit_loss");
  const totalAssets = sumStatement(statementItems, "balance_sheet", ["asset"]);
  const totalLiabilities = sumStatement(statementItems, "balance_sheet", ["liability"]);
  const netWorth = totalAssets - totalLiabilities;
  const monthlyIncome = sumStatement(statementItems, "cash_flow", ["income"], true);
  const monthlyExpenses = sumStatement(statementItems, "cash_flow", ["expense"], true);
  const monthlySurplus = monthlyIncome - monthlyExpenses;
  const cashFlowMonthlySummary = buildCashFlowMonthlySummary(cashFlowItems);
  const monthlyRevenue = sumStatement(statementItems, "profit_loss", ["revenue"], true);
  const monthlyCosts = sumStatement(statementItems, "profit_loss", ["cost", "expense"], true);
  const monthlyProfit = monthlyRevenue - monthlyCosts;
  const showProfitLossSummary = isBusinessPlanningRelevant(customer) || profitLossItems.length > 0;
  const actor = accessDisplayName(access);

  return (
    <AppShell>
      <PageHeader
        eyebrow={customer?.assigned_advisor_name || "Customer detail"}
        title={customer?.full_name || "Customer"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" href={`/customers/${id}/plan`}>
              Plan Documents
            </Link>
            <Link className="btn btn-secondary" href="/customers">
              Back
            </Link>
            <Link className="btn btn-secondary" href="/">
              Dashboard
            </Link>
          </div>
        }
      />

      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={data.error} />
      <ErrorNotice message={query.error} />
      {query.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {query.saved === "pending"
            ? "Submitted for advisor review. Official planning numbers will update after approval."
            : query.saved === "goal-number"
              ? "Calculated goal number saved to the customer portfolio."
              : query.saved === "goal-completed"
                ? "Goal marked completed. Its planning history remains available below."
                : query.saved === "goal-archived"
                  ? "Goal archived and removed from active planning."
                  : query.saved === "goal-restored"
                    ? "Goal restored to active planning."
                    : query.saved === "goal-deleted"
                      ? "Empty setup goal permanently deleted."
            : "Saved. The database and dashboard are updated."}
        </div>
      ) : null}
      {isInactiveCustomer ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          This customer is marked no longer servicing and is hidden from the active customer list.
        </div>
      ) : null}
      {personalOwner ? (
        <div className="mb-4 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <p className="font-bold">This is your personal financial plan.</p>
          <p className="mt-1">
            Profile, goal, financial entry, and progress changes are submitted to {customer?.assigned_advisor_name || "your assigned advisor"} for independent review.
          </p>
        </div>
      ) : null}

      {submissionOnly && pendingSubmissions.length ? (
        <section className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">Updates awaiting review</h2>
          <div className="mt-3 divide-y divide-amber-200">
            {pendingSubmissions.map((submission) => (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={submission.id}>
                <span className="font-semibold text-amber-950">{submissionLabel(submission.submission_type)}</span>
                <span className="text-amber-800">Submitted {formatDate(submission.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.configured && customer ? (
        <div className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="panel p-5">
              <h2 className="text-xl font-bold">Customer profile</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-[#68756f]">Email</dt>
                  <dd>{customer.email || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Phone</dt>
                  <dd>{customer.phone || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">DOB</dt>
                  <dd>{formatDate(customer.date_of_birth)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Risk</dt>
                  <dd className="capitalize">{customer.risk_profile || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Service status</dt>
                  <dd className="capitalize">{customer.service_status || "active"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Service ended</dt>
                  <dd>{customer.service_ended_at ? formatDate(customer.service_ended_at) : "Not ended"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">NRIC / Passport</dt>
                  <dd>{customer.nric_passport || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Nationality</dt>
                  <dd>{customer.nationality || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Marital status</dt>
                  <dd>{customer.marital_status || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Dependents</dt>
                  <dd>{customer.number_of_dependents ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Employment</dt>
                  <dd>{customer.employment_status || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Occupation</dt>
                  <dd>{customer.occupation || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Employer / Business</dt>
                  <dd>{customer.employer_name || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Monthly income</dt>
                  <dd>{customer.monthly_income_range || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Source of funds</dt>
                  <dd>{customer.source_of_funds || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Source of wealth</dt>
                  <dd>{customer.source_of_wealth || "Not set"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-bold text-[#68756f]">Residential address</dt>
                  <dd className="whitespace-pre-line">{customer.residential_address || "Not set"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-[#405047]">{customer.notes || "No customer notes yet."}</p>
              {customer.service_ended_reason ? (
                <p className="mt-2 text-sm text-[#405047]">
                  <span className="font-bold">Service ended reason: </span>
                  {customer.service_ended_reason}
                </p>
              ) : null}

              <details className="mt-5 rounded-md border border-[#dce2dc] p-4">
                <summary className="cursor-pointer font-bold">{submissionOnly ? "Propose profile update" : "Edit customer"}</summary>
                <form action={updateCustomer} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <div className="sm:col-span-2">
                    <h3 className="font-bold">Personal particulars</h3>
                  </div>
                  <label className="field sm:col-span-2">
                    <span className="label">Full name</span>
                    <input className="input" name="full_name" required defaultValue={customer.full_name} />
                  </label>
                  <label className="field">
                    <span className="label">Email</span>
                    <input className="input" name="email" type="email" defaultValue={customer.email || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Phone</span>
                    <input className="input" name="phone" defaultValue={customer.phone || ""} />
                  </label>
                  <label className="field">
                    <span className="label">DOB</span>
                    <input className="input" name="date_of_birth" type="date" defaultValue={customer.date_of_birth || ""} />
                  </label>
                  <label className="field">
                    <span className="label">NRIC / Passport</span>
                    <input className="input" name="nric_passport" defaultValue={customer.nric_passport || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Nationality</span>
                    <input className="input" name="nationality" defaultValue={customer.nationality || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Marital status</span>
                    <select className="input" name="marital_status" defaultValue={customer.marital_status || ""}>
                      <option value="">Not set</option>
                      <option>Single</option>
                      <option>Married</option>
                      <option>Divorced</option>
                      <option>Widowed</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Dependents</span>
                    <input
                      className="input"
                      name="number_of_dependents"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={customer.number_of_dependents ?? ""}
                    />
                  </label>
                  <label className="field sm:col-span-2">
                    <span className="label">Residential address</span>
                    <textarea className="input min-h-24" name="residential_address" defaultValue={customer.residential_address || ""} />
                  </label>

                  <div className="border-t border-[#dce2dc] pt-4 sm:col-span-2">
                    <h3 className="font-bold">Employment and financial background</h3>
                  </div>
                  <label className="field">
                    <span className="label">Employment status</span>
                    <select className="input" name="employment_status" defaultValue={customer.employment_status || ""}>
                      <option value="">Not set</option>
                      <option>Employed</option>
                      <option>Self-employed / Business owner</option>
                      <option>Professional</option>
                      <option>Retired</option>
                      <option>Homemaker</option>
                      <option>Student</option>
                      <option>Unemployed</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Occupation</span>
                    <input className="input" name="occupation" defaultValue={customer.occupation || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Employer / Business name</span>
                    <input className="input" name="employer_name" defaultValue={customer.employer_name || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Monthly income range</span>
                    <select className="input" name="monthly_income_range" defaultValue={customer.monthly_income_range || ""}>
                      <option value="">Not set</option>
                      <option>Up to RM1,500</option>
                      <option>RM1,501 - RM3,000</option>
                      <option>RM3,001 - RM5,000</option>
                      <option>RM5,001 - RM8,000</option>
                      <option>RM8,001 - RM15,000</option>
                      <option>RM15,001 - RM25,000</option>
                      <option>Above RM25,000</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Source of funds</span>
                    <input className="input" name="source_of_funds" defaultValue={customer.source_of_funds || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Source of wealth</span>
                    <input className="input" name="source_of_wealth" defaultValue={customer.source_of_wealth || ""} />
                  </label>

                  <div className="border-t border-[#dce2dc] pt-4 sm:col-span-2">
                    <h3 className="font-bold">Planning assignment</h3>
                  </div>
                  <RiskProfileField defaultValue={customer.risk_profile || "moderate"} />
                  <div className="rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4 sm:col-span-2">
                    <span className="label">Advisor</span>
                    <p className="font-bold">{customer.assigned_advisor_name || "Unassigned"}</p>
                    <p className="mt-1 text-sm text-[#68756f]">
                      Admins manage reassignment from Access and Reviews so ownership changes keep an audit record.
                    </p>
                  </div>
                  <label className="field sm:col-span-2">
                    <span className="label">Notes</span>
                    <textarea className="input min-h-24" name="notes" defaultValue={customer.notes || ""} />
                  </label>
                  <button className="btn sm:col-span-2" type="submit">
                    {submissionOnly ? "Submit Profile for Review" : "Save Profile"}
                  </button>
                </form>
              </details>

              {!submissionOnly ? (
              <details className="mt-5 rounded-md border border-[#dce2dc] p-4">
                <summary className="cursor-pointer font-bold">{isInactiveCustomer ? "Reactivate servicing" : "End servicing"}</summary>
                {isInactiveCustomer ? (
                  <form action={reactivateCustomerService} className="mt-4 grid gap-3">
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                    <p className="text-sm text-[#405047]">Move this customer back into the active customer list.</p>
                    <button className="btn" type="submit">
                      Reactivate Customer
                    </button>
                  </form>
                ) : (
                  <form action={endCustomerService} className="mt-4 grid gap-3">
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                    <label className="field">
                      <span className="label">Reason</span>
                      <textarea
                        className="input min-h-20"
                        name="service_ended_reason"
                        required
                        placeholder="Transferred, no longer servicing, duplicate record, or other reason"
                      />
                    </label>
                    <button className="btn border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" type="submit">
                      Mark No Longer Servicing
                    </button>
                  </form>
                )}
              </details>
              ) : null}
            </div>

            <div className="panel p-5">
              <h2 className="text-xl font-bold">{submissionOnly ? "Propose financial goal" : "Add financial goal"}</h2>
              {submissionOnly ? (
                <p className="mt-2 text-sm text-[#68756f]">
                  Your assigned advisor reviews this goal before it becomes part of the official plan.
                </p>
              ) : null}
              <AddGoalForm customerId={customer.id} actor={actor} today={today} submitForReview={submissionOnly} />
            </div>
          </section>

          <section id="financial-statements" className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Financial Statements</h2>
                <p className="mt-1 text-sm text-[#68756f]">Start with net worth and personal cash flow. Use business P&L only for self-employed or business clients.</p>
              </div>
            </div>

            <div className={`mt-4 grid gap-3 ${showProfitLossSummary ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              <div className="rounded-md bg-[#f5f7f4] p-4">
                <p className="text-sm font-bold uppercase text-[#68756f]">Net Worth</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(netWorth)}</p>
                <p className="mt-1 text-sm text-[#405047]">{formatCurrency(totalAssets)} assets - {formatCurrency(totalLiabilities)} liabilities</p>
              </div>
              <div className="rounded-md bg-[#f5f7f4] p-4">
                <p className="text-sm font-bold uppercase text-[#68756f]">Monthly Surplus</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(monthlySurplus)}</p>
                <p className="mt-1 text-sm text-[#405047]">{formatCurrency(monthlyIncome)} income - {formatCurrency(monthlyExpenses)} expenses</p>
              </div>
              {showProfitLossSummary ? (
                <div className="rounded-md bg-[#f5f7f4] p-4">
                  <p className="text-sm font-bold uppercase text-[#68756f]">Business Monthly Profit</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(monthlyProfit)}</p>
                  <p className="mt-1 text-sm text-[#405047]">{formatCurrency(monthlyRevenue)} revenue - {formatCurrency(monthlyCosts)} costs</p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-4">
              <StatementImporter customerId={customer.id} actor={actor} />
              <StatementSection
                title="Balance Sheet"
                summary="Current assets and liabilities. This gives the client's net worth position."
                statementType="balance_sheet"
                items={balanceSheetItems}
                customerId={customer.id}
                actor={actor}
                canDelete={!submissionOnly}
                showFrequency={false}
                dateLabel="As-at date"
                itemTypes={[
                  { value: "asset", label: "Asset" },
                  { value: "liability", label: "Liability" },
                ]}
                categories={["Cash", "EPF / Retirement", "Investment", "Property", "Vehicle", "Insurance", "Loan", "Credit Card", "Other"]}
              />
              <StatementSection
                title="Cash Flow Statement"
                summary="Personal income and expenses. This shows monthly saving capacity or shortfall."
                statementType="cash_flow"
                items={cashFlowItems}
                customerId={customer.id}
                actor={actor}
                canDelete={!submissionOnly}
                dateLabel="Date / month"
                monthlySummary={cashFlowMonthlySummary}
                itemTypes={[
                  { value: "income", label: "Income" },
                  { value: "expense", label: "Expense" },
                ]}
                categories={[
                  "Active Income",
                  "Salary",
                  "Commission",
                  "Bonus",
                  "Part Time Income",
                  "Passive Income",
                  "Rental Income",
                  "Investment Income",
                  "Business Income",
                  "Royalty Income",
                  "Income Deduction",
                  "Income Tax",
                  "EPF / Statutory Deduction",
                  "Home Expenses",
                  "Home / Rental Insurance",
                  "Utilities",
                  "Groceries / Food",
                  "Loan Repayment",
                  "Housing Loan",
                  "Car Loan",
                  "Credit Card",
                  "Education Loan",
                  "Personal Loan",
                  "Auto Insurance",
                  "Insurance",
                  "Medical / Healthcare",
                  "Education",
                  "Personal Expenses",
                  "Family Expenses",
                  "Parents Support",
                  "Childcare",
                  "Lifestyle",
                  "Travel",
                  "Celebration / Festival",
                  "CNY Expenses",
                  "Gifts / Donations",
                  "Savings / Investment",
                  "Other Income",
                  "Other Expenses",
                ]}
              />
              <StatementSection
                title="Business Profit and Loss (Optional)"
                summary="Use only for self-employed, business owner, freelancer, agent, or side-business clients. For normal salaried clients, personal Cash Flow is usually enough."
                statementType="profit_loss"
                items={profitLossItems}
                customerId={customer.id}
                actor={actor}
                canDelete={!submissionOnly}
                dateLabel="Date / month"
                itemTypes={[
                  { value: "revenue", label: "Revenue" },
                  { value: "cost", label: "Cost" },
                  { value: "expense", label: "Expense" },
                ]}
                categories={["Sales", "Service Income", "Rental Income", "Cost of Goods", "Payroll", "Marketing", "Rent", "Utilities", "Tax", "Other"]}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div id="goal-setting-list" className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Priority Goal List</h2>
                  <p className="mt-1 text-sm text-[#68756f]">A quick ordered view of the client&apos;s most important goals.</p>
                </div>
                <Link className="btn btn-secondary" href="/calculator">
                  Open Calculator
                </Link>
              </div>

              {sortedGoals.length ? (
                <div className="mt-4 space-y-3">
                  {priorityGoals.map((goal, index) => {
                    const percent = progressPercent(goal.current_amount, goal.target_amount);
                    const calculatedHealth = evaluateGoalHealth({
                      currentAmount: Number(goal.current_amount),
                      targetAmount: Number(goal.target_amount),
                      createdAt: goal.created_at,
                      targetDate: goal.target_date,
                    });
                    const healthScore = goal.health_score ?? calculatedHealth.score;
                    const healthReasons = goal.health_reasons?.length ? goal.health_reasons : calculatedHealth.reasons;
                    const canMoveUp = goal.priority !== "high";
                    const canMoveDown = goal.priority !== "low";
                    return (
                      <div key={goal.id} className="rounded-md border border-[#dce2dc] p-4">
                        <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eef3ef] text-sm font-bold text-[#405047]">
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link className="text-lg font-bold text-[#0f766e]" href={`#goal-${goal.id}`}>
                                {goal.goal_name}
                              </Link>
                              <PriorityBadge priority={goal.priority} />
                              <StatusBadge status={goal.on_track_status} />
                            </div>
                            <p className="mt-1 text-sm text-[#68756f]">
                              {goal.goal_type} - target {formatCurrency(goal.target_amount)} by {formatDate(goal.target_date)}
                            </p>
                            <p className="mt-2 text-sm text-[#405047]">
                              {healthScore !== null ? <span className="font-bold">Health {healthScore}/100: </span> : null}
                              {healthReasons[0]}
                            </p>
                            <div className="mt-3">
                              <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="font-semibold">{formatCurrency(goal.current_amount)} saved</span>
                                <span className="font-bold text-[#115e59]">{percent}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[#eef3ef]">
                                <div className="h-2 rounded-full bg-[#0f766e]" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                            {!submissionOnly ? (
                              <>
                            <form action={updateGoalPriority}>
                              <input type="hidden" name="customer_id" value={customer.id} />
                              <input type="hidden" name="goal_id" value={goal.id} />
                              <input type="hidden" name="priority" value={nextPriority(goal.priority, "up")} />
                              <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                              <button className="btn btn-secondary" disabled={!canMoveUp} type="submit">
                                Move Up
                              </button>
                            </form>
                            <form action={updateGoalPriority}>
                              <input type="hidden" name="customer_id" value={customer.id} />
                              <input type="hidden" name="goal_id" value={goal.id} />
                              <input type="hidden" name="priority" value={nextPriority(goal.priority, "down")} />
                              <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                              <button className="btn btn-secondary" disabled={!canMoveDown} type="submit">
                                Move Down
                              </button>
                            </form>
                            <Link className="btn" href={calculatorHref(customer.id, goal)}>
                              Calculate Number
                            </Link>
                              </>
                            ) : null}
                            <Link className="btn btn-secondary" href={`?goal=${goal.id}#goal-${goal.id}`}>
                              Manage
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {sortedGoals.length > 5 ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4">
                      <p className="text-sm text-[#68756f]">
                        Showing {priorityGoals.length} of {sortedGoals.length} active goals.
                      </p>
                      <Link className="btn btn-secondary" href={query.goals === "all" ? "#goal-setting-list" : "?goals=all#goal-setting-list"}>
                        {query.goals === "all" ? "Show Top 5" : "Show All Goals"}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No goals in the setting list" body="Add the first financial goal, then use the calculator to confirm its target number." />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Goal Workbench</h2>
                <p className="mt-1 text-sm text-[#68756f]">Detailed progress, notes, history, and next actions for each goal.</p>
              </div>
              <p className="text-sm text-[#68756f]">{data.goals?.length || 0} active planning goals</p>
            </div>

            {sortedGoals.length ? (
              sortedGoals.map((goal) => {
                const latestLog = data.latestLogsByGoal?.[goal.id];
                const goalActions = actionsByGoal.get(goal.id) ?? [];
                const openGoalActions = goalActions.filter((action) => !action.completed);
                const completedGoalActions = goalActions.filter((action) => action.completed);
                const percent = progressPercent(goal.current_amount, goal.target_amount);
                const calculatedHealth = evaluateGoalHealth({
                  currentAmount: Number(goal.current_amount),
                  targetAmount: Number(goal.target_amount),
                  createdAt: goal.created_at,
                  targetDate: goal.target_date,
                });
                const healthScore = goal.health_score ?? calculatedHealth.score;
                const healthReasons = goal.health_reasons?.length ? goal.health_reasons : calculatedHealth.reasons;
                const canDelete = !(data.logs ?? []).some((log) => log.goal_id === goal.id) && goalActions.length === 0;
                return (
                  <details id={`goal-${goal.id}`} key={goal.id} className="panel scroll-mt-24" open={goal.id === focusedGoalId}>
                    <summary className="cursor-pointer list-none p-5">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold">{goal.goal_name}</h3>
                            <StatusBadge status={goal.on_track_status} />
                            <PriorityBadge priority={goal.priority} />
                          </div>
                          <p className="mt-2 text-sm text-[#68756f]">
                            {goal.goal_type} - {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)} - target {formatDate(goal.target_date)}
                          </p>
                          <p className="mt-2 text-sm text-[#405047]">
                            {healthScore !== null ? <span className="font-bold">Health {healthScore}/100: </span> : null}
                            {healthReasons.join(" ")}
                          </p>
                          <div className="mt-3 max-w-xl">
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-semibold">Goal progress</span>
                              <span className="font-bold text-[#115e59]">{percent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-[#eef3ef]">
                              <div className="h-2 rounded-full bg-[#0f766e]" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        </div>
                        <span className="justify-self-start rounded-md border border-[#dce2dc] bg-[#f7f8f5] px-3 py-2 text-sm font-bold lg:justify-self-end">
                          Open Goal
                        </span>
                      </div>
                    </summary>
                    <div className="border-t border-[#dce2dc] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="text-sm text-[#405047]">
                        <span className="font-bold">Last progress note: </span>
                        {latestLog?.notes || "No progress logged yet"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn btn-secondary" href={`/customers/${customer.id}/goals/${goal.id}`}>
                          View History
                        </Link>
                        {!submissionOnly ? (
                          <>
                        <Link className="btn btn-secondary" href={calculatorHref(customer.id, goal)}>
                          Calculate Number
                        </Link>
                        <GoalLifecycleActions
                          customerId={customer.id}
                          goalId={goal.id}
                          goalName={goal.goal_name}
                          status={goal.status}
                          canDelete={canDelete}
                        />
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className={`mt-5 grid gap-4 ${submissionOnly ? "" : "lg:grid-cols-2"}`}>
                      <details className="rounded-md border border-[#dce2dc] p-4" open={goal.on_track_status === "off_track"}>
                        <summary className="cursor-pointer font-bold">Log Progress</summary>
                        <form action={logProgress} className="mt-4 grid gap-3">
                          <input type="hidden" name="customer_id" value={customer.id} />
                          <input type="hidden" name="goal_id" value={goal.id} />
                          <label className="field">
                            <span className="label">Current value</span>
                            <input
                              className="input"
                              name="logged_amount"
                              required
                              min="0"
                              step="1"
                              type="number"
                              defaultValue={String(goal.current_amount)}
                            />
                          </label>
                          <div className="rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4">
                            <span className="label">Logged by</span>
                            <p className="font-bold">{actor}</p>
                          </div>
                          <label className="field">
                            <span className="label">Notes</span>
                            <textarea className="input min-h-24" name="notes" placeholder="What changed since the last review?" />
                          </label>
                          <button className="btn" type="submit">
                            {submissionOnly ? "Submit Progress for Review" : "Save Progress"}
                          </button>
                        </form>
                      </details>

                      {!submissionOnly ? (
                      <details className="rounded-md border border-[#dce2dc] p-4" open={goal.on_track_status === "off_track"}>
                        <summary className="cursor-pointer font-bold">Add Next-Step Action</summary>
                        <form action={createNextStepAction} className="mt-4 grid gap-3">
                          <input type="hidden" name="customer_id" value={customer.id} />
                          <input type="hidden" name="goal_id" value={goal.id} />
                          <label className="field">
                            <span className="label">Action title</span>
                            <input className="input" name="action_title" required placeholder="Review asset allocation" />
                          </label>
                          <label className="field">
                            <span className="label">Description</span>
                            <textarea className="input min-h-20" name="action_description" />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="field">
                              <span className="label">Assigned to</span>
                              <input className="input" name="assigned_to" required defaultValue={customer.assigned_advisor_name || ""} />
                            </label>
                            <label className="field">
                              <span className="label">Due date</span>
                              <input className="input" name="due_date" required min={today} type="date" />
                            </label>
                            <label className="field">
                              <span className="label">Priority</span>
                              <select className="input" name="priority" required defaultValue="high">
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                            </label>
                          </div>
                          <button className="btn" type="submit">
                            Save Action
                          </button>
                        </form>
                      </details>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="font-bold">Open actions</h4>
                        <div className="mt-2 divide-y divide-[#dce2dc] rounded-md border border-[#dce2dc]">
                          {openGoalActions.map((action) => (
                            <div className="grid gap-3 p-3 sm:grid-cols-[1fr_auto]" key={action.id}>
                              <div>
                                <p className="font-semibold">{action.action_title}</p>
                                <p className="text-sm text-[#68756f]">
                                  {action.assigned_to || "Unassigned"} · due {formatDate(action.due_date)}
                                </p>
                              </div>
                              {!submissionOnly ? (
                              <form action={completeNextStepAction}>
                                <input type="hidden" name="action_id" value={action.id} />
                                <input type="hidden" name="customer_id" value={customer.id} />
                                <input type="hidden" name="goal_id" value={goal.id} />
                                <input type="hidden" name="actor" value={action.assigned_to || customer.assigned_advisor_name || "Advisor"} />
                                <button className="btn btn-secondary" type="submit">
                                  Complete
                                </button>
                              </form>
                              ) : null}
                            </div>
                          ))}
                          {!openGoalActions.length ? <p className="p-3 text-sm text-[#68756f]">No open actions for this goal.</p> : null}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-bold">Completed actions</h4>
                        <div className="mt-2 divide-y divide-[#dce2dc] rounded-md border border-[#dce2dc]">
                          {completedGoalActions.slice(0, 3).map((action) => (
                            <div className="p-3" key={action.id}>
                              <p className="font-semibold">{action.action_title}</p>
                              <p className="text-sm text-[#68756f]">Completed {formatDate(action.completed_at)}</p>
                            </div>
                          ))}
                          {!completedGoalActions.length ? <p className="p-3 text-sm text-[#68756f]">No completed actions yet.</p> : null}
                        </div>
                      </div>
                    </div>
                    </div>
                  </details>
                );
              })
            ) : (
              <EmptyState title="No goals yet" body="Use Add financial goal to create the first goal for this customer." />
            )}

            {(data.inactiveGoals ?? []).length ? (
              <details className="panel">
                <summary className="cursor-pointer p-5 font-bold">
                  Completed and archived goals ({data.inactiveGoals?.length || 0})
                </summary>
                <div className="divide-y divide-[#dce2dc] border-t border-[#dce2dc]">
                  {(data.inactiveGoals ?? []).map((goal) => {
                    const goalActions = actionsByGoal.get(goal.id) ?? [];
                    const canDelete = !(data.logs ?? []).some((log) => log.goal_id === goal.id) && goalActions.length === 0;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4" key={goal.id}>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{goal.goal_name}</p>
                            <span className="rounded-full border border-[#dce2dc] bg-[#f5f7f4] px-2 py-1 text-xs font-bold capitalize">
                              {goal.status === "achieved" ? "Completed" : "Archived"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[#68756f]">
                            {goal.goal_type} - {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)} - target {formatDate(goal.target_date)}
                          </p>
                        </div>
                        {!submissionOnly ? (
                        <GoalLifecycleActions
                          customerId={customer.id}
                          goalId={goal.id}
                          goalName={goal.goal_name}
                          status={goal.status}
                          canDelete={canDelete}
                        />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">Customer activity</h2>
                <p className="mt-1 text-sm text-[#68756f]">Profile, planning, assignment, and review changes in one timeline.</p>
              </div>
              <span className="text-sm font-semibold text-[#68756f]">Latest {Math.min(activity.length, 20)} records</span>
            </div>
            <div className="mt-4 divide-y divide-[#dce2dc]">
              {activity.slice(0, 20).map((item) => (
                <article key={item.id} className="grid gap-2 py-4 md:grid-cols-[10rem_1fr]">
                  <div>
                    <p className="text-sm font-semibold">{formatDate(item.created_at)}</p>
                    <p className="mt-1 text-xs text-[#68756f]">{item.actor || "System"}</p>
                  </div>
                  <div>
                    <p className="font-semibold">{auditActionLabel(item.action)}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-[#68756f]">{auditEntityLabel(item.entity_type)}</p>
                    <dl className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                      {item.details.map((detail) => (
                        <div key={`${item.id}-${detail.label}`}>
                          <dt className="text-xs font-bold uppercase text-[#68756f]">{detail.label}</dt>
                          <dd className={`mt-0.5 text-sm ${detail.tone === "danger" ? "text-red-700" : detail.tone === "warning" ? "text-amber-700" : detail.tone === "success" ? "text-emerald-700" : ""}`}>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </article>
              ))}
              {!activity.length ? <p className="py-4 text-sm text-[#68756f]">Customer changes will appear here after the activity migration is applied.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
