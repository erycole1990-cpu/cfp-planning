import type { FinancialStatementItem } from "@/lib/cfp/supabase";
import { parseDateOnly, planningCalendarDate } from "./format.ts";

export type MonthlyCashFlow = {
  monthIndex: number;
  month: string;
  income: number;
  expenses: number;
  surplus: number;
};

export type RatioStatus = "good" | "watch" | "attention" | "insufficient";

export type FinancialRatio = {
  id: string;
  label: string;
  value: number | null;
  displayValue: string;
  status: RatioStatus;
  benchmark: string;
  formula: string;
  explanation: string;
};

export type ProfitAndLossSummary = {
  revenue: number;
  costs: number;
  profit: number;
};

export type BalanceSheetSummary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};

export type MonthlyProfitAndLoss = ProfitAndLossSummary & {
  monthIndex: number;
  month: string;
};

export type MonthlyFinancialOverview = {
  year: number;
  monthIndex: number;
  month: string;
  monthlyCashFlow: MonthlyCashFlow[];
  cashFlow: MonthlyCashFlow;
  profitAndLoss: ProfitAndLossSummary;
};

export type StatementCalendarDate = {
  year: number;
  monthIndex: number;
  day: number;
};

export type PlanReportingPeriod = {
  asOfDate: string;
  year: number;
  monthIndex: number;
  timeZone: string;
};

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function statementCalendarDate(
  item: FinancialStatementItem,
): StatementCalendarDate | null {
  if (item.statement_date) {
    const dateOnly = parseDateOnly(item.statement_date);
    if (dateOnly) return dateOnly;
  }

  const createdAt = new Date(item.created_at);
  if (Number.isNaN(createdAt.getTime())) return null;
  const calendarDate = planningCalendarDate(createdAt);
  return {
    year: calendarDate.year,
    monthIndex: calendarDate.monthIndex,
    day: calendarDate.day,
  };
}

function normalizedFrequency(item: FinancialStatementItem) {
  return (item.frequency || "monthly").toLowerCase().replace("-", "_");
}

function monthlyEquivalent(item: FinancialStatementItem) {
  const amount = Number(item.amount) || 0;
  switch (normalizedFrequency(item)) {
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

function appliesInMonth(item: FinancialStatementItem, year: number, monthIndex: number) {
  const date = statementCalendarDate(item);
  if (!date) return false;

  const itemYear = date.year;
  const itemMonth = date.monthIndex;
  const frequency = normalizedFrequency(item);

  if (frequency === "one_time") {
    return itemYear === year && itemMonth === monthIndex;
  }

  if (frequency === "annual") {
    return year >= itemYear && itemMonth === monthIndex;
  }

  return year > itemYear || (year === itemYear && monthIndex >= itemMonth);
}

export function cashFlowAmountForMonth(
  item: FinancialStatementItem,
  year: number,
  monthIndex: number,
) {
  if (!appliesInMonth(item, year, monthIndex)) return 0;

  const amount = Number(item.amount) || 0;
  if (normalizedFrequency(item) === "annual" || normalizedFrequency(item) === "one_time") {
    return amount;
  }

  return monthlyEquivalent(item);
}

export function buildMonthlyCashFlow(items: FinancialStatementItem[], year: number) {
  return monthLabels.map<MonthlyCashFlow>((month, monthIndex) => {
    const income = items
      .filter((item) => item.statement_type === "cash_flow" && item.item_type === "income")
      .reduce((sum, item) => sum + cashFlowAmountForMonth(item, year, monthIndex), 0);
    const expenses = items
      .filter((item) => item.statement_type === "cash_flow" && item.item_type === "expense")
      .reduce((sum, item) => sum + cashFlowAmountForMonth(item, year, monthIndex), 0);

    return {
      monthIndex,
      month,
      income,
      expenses,
      surplus: income - expenses,
    };
  });
}

export function statementItemsForMonth(
  items: FinancialStatementItem[],
  year: number,
  monthIndex: number,
) {
  return items.filter(
    (item) =>
      item.statement_type === "cash_flow" &&
      appliesInMonth(item, year, monthIndex) &&
      cashFlowAmountForMonth(item, year, monthIndex) !== 0,
  );
}

function sumItems(items: FinancialStatementItem[], itemTypes: string[]) {
  return items
    .filter((item) => itemTypes.includes(item.item_type))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function buildBalanceSheetSummary(
  items: FinancialStatementItem[],
): BalanceSheetSummary {
  const balanceItems = items.filter((item) => item.statement_type === "balance_sheet");
  const totalAssets = sumItems(balanceItems, ["asset"]);
  const totalLiabilities = sumItems(balanceItems, ["liability"]);
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

function ratioStatus(
  value: number | null,
  good: (value: number) => boolean,
  watch: (value: number) => boolean,
): RatioStatus {
  if (value === null || !Number.isFinite(value)) return "insufficient";
  if (good(value)) return "good";
  if (watch(value)) return "watch";
  return "attention";
}

function thresholdAwareDisplay(
  value: number,
  thresholds: number[],
  suffix: string,
) {
  const rounded = Number(value.toFixed(2));
  for (const threshold of thresholds) {
    if (value < threshold && rounded >= threshold) {
      return `<${threshold.toFixed(2)}${suffix}`;
    }
    if (value > threshold && rounded <= threshold) {
      return `>${threshold.toFixed(2)}${suffix}`;
    }
  }
  return `${value.toFixed(2)}${suffix}`;
}

function percent(value: number | null, thresholds: number[]) {
  return value === null
    ? "Not assessed"
    : thresholdAwareDisplay(value * 100, thresholds, "%");
}

function itemText(item: FinancialStatementItem) {
  return `${item.category || ""} ${item.description || ""}`.trim();
}

function matchesCashFlowNature(
  item: FinancialStatementItem,
  values: string[],
  fallback: RegExp,
) {
  if (item.cash_flow_nature) return values.includes(item.cash_flow_nature);
  return fallback.test(itemText(item));
}

function annualCashFlowAmount(
  items: FinancialStatementItem[],
  year: number,
  matches: (item: FinancialStatementItem) => boolean,
) {
  let total = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    total += items
      .filter(matches)
      .reduce(
        (monthTotal, item) =>
          monthTotal + cashFlowAmountForMonth(item, year, monthIndex),
        0,
      );
  }

  return total;
}

export function buildFinancialRatios(
  items: FinancialStatementItem[],
  monthlyCashFlow: MonthlyCashFlow[],
  year: number,
): FinancialRatio[] {
  const balanceItems = items.filter((item) => item.statement_type === "balance_sheet");
  const { totalAssets, totalLiabilities } = buildBalanceSheetSummary(items);
  const liquidAssets = balanceItems
    .filter(
      (item) =>
        item.item_type === "asset" &&
        (item.liquidity_class
          ? item.liquidity_class === "liquid"
          : [item.category, item.description]
              .filter(Boolean)
              .some((value) => /\b(cash|saving|current account|fixed deposit)\b/i.test(String(value)))),
    )
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const annualIncome = monthlyCashFlow.reduce((sum, month) => sum + month.income, 0);
  const annualExpenses = monthlyCashFlow.reduce((sum, month) => sum + month.expenses, 0);
  const annualSurplus = annualIncome - annualExpenses;
  const cashFlowItems = items.filter((item) => item.statement_type === "cash_flow");
  const debtCategories = /\b(loan|mortgage|credit card|hire purchase|debt repayment|debt servicing)\b/i;
  const housingCategories =
    /\b(home expenses|home \/ rental insurance|housing loan|mortgage|rent|rental expense|assessment|maintenance fee)\b/i;
  const essentialCategories =
    /\b(income tax|statutory deduction|home expenses|home \/ rental insurance|utilities|groceries|food|loan repayment|housing loan|car loan|credit card|education loan|personal loan|auto insurance|insurance|medical|healthcare|education|family expenses|parents support|childcare)\b/i;
  const savingsCategories = /\b(savings? \/ investment|savings? contribution|investment contribution)\b/i;

  const annualDebtPayments = annualCashFlowAmount(
    cashFlowItems,
    year,
    (item) =>
      item.item_type === "expense" &&
      matchesCashFlowNature(item, ["debt_repayment"], debtCategories),
  );
  const annualHousingCosts = annualCashFlowAmount(
    cashFlowItems,
    year,
    (item) => item.item_type === "expense" && housingCategories.test(itemText(item)),
  );
  const annualEssentialExpenses = annualCashFlowAmount(
    cashFlowItems,
    year,
    (item) =>
      item.item_type === "expense" &&
      matchesCashFlowNature(
        item,
        ["essential", "debt_repayment", "tax_statutory"],
        essentialCategories,
      ),
  );
  const annualSavingsAndInvestments = annualCashFlowAmount(
    cashFlowItems,
    year,
    (item) =>
      item.item_type === "expense" &&
      matchesCashFlowNature(item, ["savings_investment"], savingsCategories),
  );

  const averageMonthlyEssentialExpenses = annualEssentialExpenses / 12;
  const surplusRatio = annualIncome > 0 ? annualSurplus / annualIncome : null;
  const savingsAndInvestmentRatio =
    annualIncome > 0 ? annualSavingsAndInvestments / annualIncome : null;
  const reserveCoverage =
    averageMonthlyEssentialExpenses > 0
      ? liquidAssets / averageMonthlyEssentialExpenses
      : null;
  const debtServiceRatio = annualIncome > 0 ? annualDebtPayments / annualIncome : null;
  const housingCostRatio = annualIncome > 0 ? annualHousingCosts / annualIncome : null;
  const solvencyRatio = totalAssets > 0 ? (totalAssets - totalLiabilities) / totalAssets : null;

  return [
    {
      id: "cash-flow-surplus",
      label: "Cash-Flow Surplus Ratio",
      value: surplusRatio,
      displayValue: percent(surplusRatio, [10, 20]),
      status: ratioStatus(
        surplusRatio,
        (value) => value >= 0.2,
        (value) => value >= 0.1,
      ),
      benchmark: "Good: 20.00% or more | Review: 10.00% to below 20.00% | Attention: below 10.00%",
      formula: "Annual cash-flow surplus / annual recorded income",
      explanation:
        "Shows how much recorded income remains after all recorded expenses. A negative result signals a cash-flow shortfall.",
    },
    {
      id: "savings-investment",
      label: "Savings and Investment Ratio",
      value: savingsAndInvestmentRatio,
      displayValue: percent(savingsAndInvestmentRatio, [10, 20]),
      status: ratioStatus(
        savingsAndInvestmentRatio,
        (value) => value >= 0.2,
        (value) => value >= 0.1,
      ),
      benchmark: "Good: 20.00% or more | Review: 10.00% to below 20.00% | Attention: below 10.00%",
      formula: "Recorded savings and investment contributions / annual recorded income",
      explanation:
        "Measures the share of income deliberately directed to future wealth. It only counts entries categorised as Savings / Investment.",
    },
    {
      id: "reserve",
      label: "Basic Liquidity Ratio",
      value: reserveCoverage,
      displayValue:
        reserveCoverage === null
          ? "Not assessed"
          : thresholdAwareDisplay(reserveCoverage, [3, 6], " months"),
      status: ratioStatus(
        reserveCoverage,
        (value) => value >= 6,
        (value) => value >= 3,
      ),
      benchmark: "Good: 6.00 months or more | Review: 3.00 to below 6.00 months | Attention: below 3.00 months",
      formula: "Liquid assets / average monthly essential expenses",
      explanation:
        "Shows how many months of essential expenses could be covered using cash, savings, current accounts, and fixed deposits.",
    },
    {
      id: "debt",
      label: "Debt-Service Ratio",
      value: debtServiceRatio,
      displayValue: percent(debtServiceRatio, [35, 50]),
      status: ratioStatus(
        debtServiceRatio,
        (value) => value <= 0.35,
        (value) => value <= 0.5,
      ),
      benchmark: "Good: 35.00% or less | Review: above 35.00% to 50.00% | Attention: above 50.00%",
      formula: "Annual recorded debt repayments / annual recorded income",
      explanation:
        "Shows how much recorded income is committed to loans and credit. Lenders may use different income definitions and limits.",
    },
    {
      id: "housing",
      label: "Housing-Cost Ratio",
      value: housingCostRatio,
      displayValue: percent(housingCostRatio, [30, 35]),
      status: ratioStatus(
        housingCostRatio,
        (value) => value <= 0.3,
        (value) => value <= 0.35,
      ),
      benchmark: "Good: 30.00% or less | Review: above 30.00% to 35.00% | Attention: above 35.00%",
      formula: "Annual recorded housing costs / annual recorded income",
      explanation:
        "Shows how much income is used for rent or housing instalments and related recorded housing costs.",
    },
    {
      id: "solvency",
      label: "Solvency Ratio",
      value: solvencyRatio,
      displayValue: percent(solvencyRatio, [30, 50]),
      status: ratioStatus(
        solvencyRatio,
        (value) => value >= 0.5,
        (value) => value >= 0.3,
      ),
      benchmark: "Good: 50.00% or more | Review: 30.00% to below 50.00% | Attention: below 30.00%",
      formula: "Net worth / total assets",
      explanation:
        "Shows how much of the asset base remains after liabilities. It is a broad resilience indicator, not a credit score.",
    },
    {
      id: "protection",
      label: "Protection Funding Ratio",
      value: null,
      displayValue: "Not assessed",
      status: "insufficient",
      benchmark: "Funded: 100%+ | Partial gap: 80%-99.9% | Material gap: below 80%",
      formula: "Available protection benefits / calculated protection need",
      explanation:
        "Requires a calculated death, disability, or critical-illness need and matching policy benefits. Insurance cash value is not a substitute for coverage data.",
    },
    {
      id: "goal-funding",
      label: "Goal-Funding Ratio",
      value: null,
      displayValue: "Not assessed",
      status: "insufficient",
      benchmark: "Funded: 100%+ | Close: 80%-99.9% | Underfunded: below 80%",
      formula: "Projected assets available at goal date / required goal amount",
      explanation:
        "Requires projected assets and contributions at the goal date. A current balance alone cannot provide a reliable funding projection.",
    },
  ];
}

export function buildMonthlyProfitAndLoss(
  items: FinancialStatementItem[],
  year: number,
) {
  const profitAndLossItems = items.filter(
    (item) => item.statement_type === "profit_loss",
  );

  return monthLabels.map<MonthlyProfitAndLoss>((month, monthIndex) => {
    const revenue = profitAndLossItems
      .filter((item) => item.item_type === "revenue")
      .reduce(
        (sum, item) => sum + cashFlowAmountForMonth(item, year, monthIndex),
        0,
      );
    const costs = profitAndLossItems
      .filter((item) => ["cost", "expense"].includes(item.item_type))
      .reduce(
        (sum, item) => sum + cashFlowAmountForMonth(item, year, monthIndex),
        0,
      );

    return {
      monthIndex,
      month,
      revenue,
      costs,
      profit: revenue - costs,
    };
  });
}

export function buildProfitAndLossSummary(
  items: FinancialStatementItem[],
  year: number,
  monthIndex?: number,
): ProfitAndLossSummary {
  const months = buildMonthlyProfitAndLoss(items, year);
  const periods =
    monthIndex === undefined
      ? months
      : months.filter((month) => month.monthIndex === monthIndex);

  return periods.reduce<ProfitAndLossSummary>(
    (summary, month) => ({
      revenue: summary.revenue + month.revenue,
      costs: summary.costs + month.costs,
      profit: summary.profit + month.profit,
    }),
    { revenue: 0, costs: 0, profit: 0 },
  );
}

export function buildMonthlyFinancialOverview(
  items: FinancialStatementItem[],
  year: number,
  monthIndex: number,
): MonthlyFinancialOverview {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("Reporting month must be between January and December.");
  }

  const monthlyCashFlow = buildMonthlyCashFlow(items, year);
  const cashFlow = monthlyCashFlow[monthIndex];
  return {
    year,
    monthIndex,
    month: cashFlow.month,
    monthlyCashFlow,
    cashFlow,
    profitAndLoss: buildProfitAndLossSummary(items, year, monthIndex),
  };
}

export function buildPlanFinancialSnapshot(
  items: FinancialStatementItem[],
  reportingPeriod: PlanReportingPeriod,
) {
  const overview = buildMonthlyFinancialOverview(
    items,
    reportingPeriod.year,
    reportingPeriod.monthIndex,
  );
  const balanceSheet = buildBalanceSheetSummary(items);

  return {
    reporting_period: {
      as_of_date: reportingPeriod.asOfDate,
      year: reportingPeriod.year,
      month_index: reportingPeriod.monthIndex,
      month: overview.month,
      time_zone: reportingPeriod.timeZone,
    },
    summary: {
      total_assets: balanceSheet.totalAssets,
      total_liabilities: balanceSheet.totalLiabilities,
      net_worth: balanceSheet.netWorth,
      monthly_income: overview.cashFlow.income,
      monthly_expenses: overview.cashFlow.expenses,
      monthly_surplus: overview.cashFlow.surplus,
    },
  };
}
