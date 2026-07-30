import type { FinancialStatementItem } from "@/lib/cfp/supabase";

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

function itemDate(item: FinancialStatementItem) {
  return new Date(item.statement_date || item.created_at);
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
  const date = itemDate(item);
  const itemYear = date.getFullYear();
  const itemMonth = date.getMonth();
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

function percent(value: number | null) {
  return value === null ? "Not enough data" : `${(value * 100).toFixed(1)}%`;
}

export function buildFinancialRatios(
  items: FinancialStatementItem[],
  monthlyCashFlow: MonthlyCashFlow[],
  year: number,
): FinancialRatio[] {
  const balanceItems = items.filter((item) => item.statement_type === "balance_sheet");
  const totalAssets = sumItems(balanceItems, ["asset"]);
  const totalLiabilities = sumItems(balanceItems, ["liability"]);
  const liquidAssets = balanceItems
    .filter(
      (item) =>
        item.item_type === "asset" &&
        [item.category, item.description]
          .filter(Boolean)
          .some((value) => /\b(cash|saving|current account|fixed deposit)\b/i.test(String(value))),
    )
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const annualIncome = monthlyCashFlow.reduce((sum, month) => sum + month.income, 0);
  const annualExpenses = monthlyCashFlow.reduce((sum, month) => sum + month.expenses, 0);
  const annualSurplus = annualIncome - annualExpenses;
  const averageMonthlyExpenses = annualExpenses / 12;
  const cashFlowItems = items.filter((item) => item.statement_type === "cash_flow");
  const debtCategories =
    /\b(loan|mortgage|credit card|hire purchase|debt repayment|debt servicing)\b/i;
  const annualDebtPayments = monthlyCashFlow.reduce((sum, month) => {
    const monthlyDebt = cashFlowItems
      .filter(
        (item) =>
          item.item_type === "expense" &&
          debtCategories.test(`${item.category || ""} ${item.description || ""}`),
      )
      .reduce(
        (monthSum, item) =>
          monthSum + cashFlowAmountForMonth(item, year, month.monthIndex),
        0,
      );
    return sum + monthlyDebt;
  }, 0);

  const reserveCoverage =
    averageMonthlyExpenses > 0 ? liquidAssets / averageMonthlyExpenses : null;
  const debtServiceRatio = annualIncome > 0 ? annualDebtPayments / annualIncome : null;
  const savingsRatio = annualIncome > 0 ? annualSurplus / annualIncome : null;
  const solvencyRatio = totalAssets > 0 ? (totalAssets - totalLiabilities) / totalAssets : null;

  return [
    {
      id: "reserve",
      label: "Cash reserve coverage",
      value: reserveCoverage,
      displayValue:
        reserveCoverage === null ? "Not enough data" : `${reserveCoverage.toFixed(1)} months`,
      status: ratioStatus(
        reserveCoverage,
        (value) => value >= 6,
        (value) => value >= 3,
      ),
      benchmark: "Good: 6+ months | Watch: 3-5.9 months",
      formula: "Liquid cash assets / average monthly expenses",
      explanation:
        "Shows how long essential spending could continue using readily available cash if income stopped.",
    },
    {
      id: "debt",
      label: "Debt service ratio",
      value: debtServiceRatio,
      displayValue: percent(debtServiceRatio),
      status: ratioStatus(
        debtServiceRatio,
        (value) => value <= 0.35,
        (value) => value <= 0.5,
      ),
      benchmark: "Good: 35% or less | Watch: 35.1%-50%",
      formula: "Annual debt repayments / annual gross income",
      explanation:
        "Shows how much income is committed to loans and credit. A lender may use a different formula.",
    },
    {
      id: "savings",
      label: "Savings capacity ratio",
      value: savingsRatio,
      displayValue: percent(savingsRatio),
      status: ratioStatus(
        savingsRatio,
        (value) => value >= 0.2,
        (value) => value >= 0.1,
      ),
      benchmark: "Good: 20%+ | Watch: 10%-19.9%",
      formula: "Annual cash surplus / annual gross income",
      explanation:
        "Shows the share of income currently available for goals, reserves, investing, or faster debt repayment.",
    },
    {
      id: "solvency",
      label: "Solvency ratio",
      value: solvencyRatio,
      displayValue: percent(solvencyRatio),
      status: ratioStatus(
        solvencyRatio,
        (value) => value >= 0.5,
        (value) => value >= 0.2,
      ),
      benchmark: "Good: 50%+ | Watch: 20%-49.9%",
      formula: "Net worth / total assets",
      explanation:
        "Shows how much of the asset base remains after liabilities. It is a broad resilience indicator, not a credit score.",
    },
  ];
}
