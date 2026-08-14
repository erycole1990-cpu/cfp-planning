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

export type ProfitAndLossSummary = {
  revenue: number;
  costs: number;
  profit: number;
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
  return value === null ? "Not assessed" : `${(value * 100).toFixed(1)}%`;
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
  const totalAssets = sumItems(balanceItems, ["asset"]);
  const totalLiabilities = sumItems(balanceItems, ["liability"]);
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
      displayValue: percent(surplusRatio),
      status: ratioStatus(
        surplusRatio,
        (value) => value >= 0.2,
        (value) => value >= 0.1,
      ),
      benchmark: "Good: 20%+ | Review: 10%-19.9% | Attention: below 10%",
      formula: "Annual cash-flow surplus / annual recorded income",
      explanation:
        "Shows how much recorded income remains after all recorded expenses. A negative result signals a cash-flow shortfall.",
    },
    {
      id: "savings-investment",
      label: "Savings and Investment Ratio",
      value: savingsAndInvestmentRatio,
      displayValue: percent(savingsAndInvestmentRatio),
      status: ratioStatus(
        savingsAndInvestmentRatio,
        (value) => value >= 0.2,
        (value) => value >= 0.1,
      ),
      benchmark: "Good: 20%+ | Review: 10%-19.9% | Attention: below 10%",
      formula: "Recorded savings and investment contributions / annual recorded income",
      explanation:
        "Measures the share of income deliberately directed to future wealth. It only counts entries categorised as Savings / Investment.",
    },
    {
      id: "reserve",
      label: "Basic Liquidity Ratio",
      value: reserveCoverage,
      displayValue:
        reserveCoverage === null ? "Not assessed" : `${reserveCoverage.toFixed(1)} months`,
      status: ratioStatus(
        reserveCoverage,
        (value) => value >= 6,
        (value) => value >= 3,
      ),
      benchmark: "Good: 6+ months | Review: 3-5.9 months | Attention: below 3 months",
      formula: "Liquid assets / average monthly essential expenses",
      explanation:
        "Shows how many months of essential expenses could be covered using cash, savings, current accounts, and fixed deposits.",
    },
    {
      id: "debt",
      label: "Debt-Service Ratio",
      value: debtServiceRatio,
      displayValue: percent(debtServiceRatio),
      status: ratioStatus(
        debtServiceRatio,
        (value) => value <= 0.35,
        (value) => value <= 0.5,
      ),
      benchmark: "Good: 35% or less | Review: 35.1%-50% | Attention: above 50%",
      formula: "Annual recorded debt repayments / annual recorded income",
      explanation:
        "Shows how much recorded income is committed to loans and credit. Lenders may use different income definitions and limits.",
    },
    {
      id: "housing",
      label: "Housing-Cost Ratio",
      value: housingCostRatio,
      displayValue: percent(housingCostRatio),
      status: ratioStatus(
        housingCostRatio,
        (value) => value <= 0.3,
        (value) => value <= 0.35,
      ),
      benchmark: "Good: 30% or less | Review: 30.1%-35% | Attention: above 35%",
      formula: "Annual recorded housing costs / annual recorded income",
      explanation:
        "Shows how much income is used for rent or housing instalments and related recorded housing costs.",
    },
    {
      id: "solvency",
      label: "Solvency Ratio",
      value: solvencyRatio,
      displayValue: percent(solvencyRatio),
      status: ratioStatus(
        solvencyRatio,
        (value) => value >= 0.5,
        (value) => value >= 0.3,
      ),
      benchmark: "Good: 50%+ | Review: 30%-49.9% | Attention: below 30%",
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

export function buildProfitAndLossSummary(
  items: FinancialStatementItem[],
): ProfitAndLossSummary {
  const profitAndLossItems = items.filter(
    (item) => item.statement_type === "profit_loss",
  );
  const revenue = sumItems(profitAndLossItems, ["revenue"]);
  const costs = sumItems(profitAndLossItems, ["cost", "expense"]);

  return {
    revenue,
    costs,
    profit: revenue - costs,
  };
}
