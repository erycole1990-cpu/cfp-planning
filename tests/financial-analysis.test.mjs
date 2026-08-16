import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialRatios,
  buildMonthlyCashFlow,
  buildMonthlyFinancialOverview,
  buildMonthlyProfitAndLoss,
  buildProfitAndLossSummary,
  cashFlowAmountForMonth,
  statementCalendarDate,
  statementItemsForMonth,
} from "../lib/cfp/financial-analysis.ts";
import { formatDate } from "../lib/cfp/format.ts";

let itemId = 0;

function statementItem(statementType, itemType, category, amount, overrides = {}) {
  itemId += 1;
  return {
    id: `item-${itemId}`,
    created_at: "2026-01-01T00:00:00.000Z",
    customer_id: "customer-1",
    statement_type: statementType,
    item_type: itemType,
    category,
    description: category,
    amount,
    frequency: statementType === "balance_sheet" ? "current" : "monthly",
    statement_date: "2026-01-01",
    ...overrides,
  };
}

test("builds the eight-measure personal financial health check from recorded data", () => {
  const items = [
    statementItem("cash_flow", "income", "Active Income", 10_000),
    statementItem("cash_flow", "expense", "Groceries / Food", 1_500),
    statementItem("cash_flow", "expense", "Home Expenses", 1_000),
    statementItem("cash_flow", "expense", "Housing Loan", 1_500),
    statementItem("cash_flow", "expense", "Car Loan", 500),
    statementItem("cash_flow", "expense", "Savings / Investment", 2_000),
    statementItem("cash_flow", "expense", "Lifestyle", 500),
    statementItem("balance_sheet", "asset", "Cash / Savings", 30_000),
    statementItem("balance_sheet", "asset", "Property", 500_000),
    statementItem("balance_sheet", "liability", "Housing Loan", 200_000),
  ];

  const ratios = buildFinancialRatios(items, buildMonthlyCashFlow(items, 2026), 2026);
  const byId = new Map(ratios.map((ratio) => [ratio.id, ratio]));

  assert.equal(ratios.length, 8);
  assert.equal(byId.get("cash-flow-surplus")?.displayValue, "30.00%");
  assert.equal(byId.get("savings-investment")?.displayValue, "20.00%");
  assert.equal(byId.get("reserve")?.displayValue, "6.67 months");
  assert.equal(byId.get("debt")?.displayValue, "20.00%");
  assert.equal(byId.get("housing")?.displayValue, "25.00%");
  assert.equal(byId.get("solvency")?.displayValue, "62.26%");
  assert.equal(byId.get("protection")?.displayValue, "Not assessed");
  assert.equal(byId.get("goal-funding")?.displayValue, "Not assessed");
  assert.equal(byId.get("protection")?.status, "insufficient");
  assert.equal(byId.get("goal-funding")?.status, "insufficient");
});

test("projects recurring, annual, and one-time cash flow into the correct months", () => {
  const items = [
    statementItem("cash_flow", "income", "Salary", 1_200, {
      statement_date: "2026-03-01",
    }),
    statementItem("cash_flow", "expense", "Weekly spending", 120, {
      frequency: "weekly",
    }),
    statementItem("cash_flow", "expense", "Quarterly bill", 300, {
      frequency: "quarterly",
    }),
    statementItem("cash_flow", "expense", "Annual premium", 1_200, {
      frequency: "annual",
      statement_date: "2026-09-01",
    }),
    statementItem("cash_flow", "expense", "One-time purchase", 600, {
      frequency: "one_time",
      statement_date: "2026-04-01",
    }),
  ];

  const cashFlow2026 = buildMonthlyCashFlow(items, 2026);
  const cashFlow2027 = buildMonthlyCashFlow(items, 2027);

  assert.equal(cashFlow2026[1].income, 0);
  assert.equal(cashFlow2026[2].income, 1_200);
  assert.equal(cashFlow2026[1].expenses, 620);
  assert.equal(cashFlow2026[3].expenses, 1_220);
  assert.equal(cashFlow2026[8].expenses, 1_820);
  assert.equal(cashFlow2027[3].expenses, 620);
  assert.equal(cashFlow2027[8].expenses, 1_820);
  assert.equal(cashFlowAmountForMonth(items[4], 2027, 3), 0);
  assert.deepEqual(
    statementItemsForMonth(items, 2026, 1).map((item) => item.category),
    ["Weekly spending", "Quarterly bill"],
  );
});

test("uses structured planning classifications before description matching", () => {
  const items = [
    statementItem("cash_flow", "income", "Income", 10_000),
    statementItem("cash_flow", "expense", "General transfer", 1_000, {
      cash_flow_nature: "debt_repayment",
    }),
    statementItem("cash_flow", "expense", "General household", 2_000, {
      cash_flow_nature: "essential",
    }),
    statementItem("cash_flow", "expense", "Future allocation", 1_500, {
      cash_flow_nature: "savings_investment",
    }),
    statementItem("cash_flow", "expense", "Lifestyle", 500, {
      cash_flow_nature: "discretionary",
    }),
    statementItem("balance_sheet", "asset", "Emergency reserve", 24_000, {
      liquidity_class: "liquid",
    }),
    statementItem("balance_sheet", "asset", "Cash held in trust", 99_999, {
      liquidity_class: "restricted",
    }),
  ];

  const ratios = buildFinancialRatios(items, buildMonthlyCashFlow(items, 2026), 2026);
  const byId = new Map(ratios.map((ratio) => [ratio.id, ratio]));

  assert.equal(byId.get("savings-investment")?.displayValue, "15.00%");
  assert.equal(byId.get("reserve")?.displayValue, "8.00 months");
  assert.equal(byId.get("debt")?.displayValue, "10.00%");
});

test("keeps precise ratio classifications visible immediately around thresholds", () => {
  function ratioFor(monthlyExpense, liquidAssets = 0) {
    const items = [
      statementItem("cash_flow", "income", "Salary", 10_000),
      statementItem("cash_flow", "expense", "Groceries / Food", monthlyExpense, {
        cash_flow_nature: "essential",
      }),
      ...(liquidAssets
        ? [statementItem("balance_sheet", "asset", "Cash", liquidAssets, { liquidity_class: "liquid" })]
        : []),
    ];
    return new Map(
      buildFinancialRatios(items, buildMonthlyCashFlow(items, 2026), 2026)
        .map((ratio) => [ratio.id, ratio]),
    );
  }

  const ordinaryBelow = ratioFor(8_004).get("cash-flow-surplus");
  const roundedBelow = ratioFor(8_000.1).get("cash-flow-surplus");
  const exact = ratioFor(8_000).get("cash-flow-surplus");
  const roundedAbove = ratioFor(7_999.9).get("cash-flow-surplus");

  assert.deepEqual(
    [ordinaryBelow.displayValue, ordinaryBelow.status],
    ["19.96%", "watch"],
  );
  assert.deepEqual(
    [roundedBelow.displayValue, roundedBelow.status],
    ["<20.00%", "watch"],
  );
  assert.deepEqual([exact.displayValue, exact.status], ["20.00%", "good"]);
  assert.deepEqual(
    [roundedAbove.displayValue, roundedAbove.status],
    [">20.00%", "good"],
  );

  const reserveBelow = ratioFor(1_000, 5_999).get("reserve");
  const reserveExact = ratioFor(1_000, 6_000).get("reserve");
  const reserveAbove = ratioFor(1_000, 6_001).get("reserve");
  assert.deepEqual([reserveBelow.displayValue, reserveBelow.status], ["<6.00 months", "watch"]);
  assert.deepEqual([reserveExact.displayValue, reserveExact.status], ["6.00 months", "good"]);
  assert.deepEqual([reserveAbove.displayValue, reserveAbove.status], [">6.00 months", "good"]);
});

test("returns unassessed ratios when recorded data has no usable denominator", () => {
  const ratios = buildFinancialRatios([], buildMonthlyCashFlow([], 2026), 2026);

  assert.equal(ratios.length, 8);
  assert.ok(ratios.every((ratio) => ratio.status === "insufficient"));
  assert.ok(ratios.every((ratio) => ratio.displayValue === "Not assessed"));
});

test("normalizes monthly, weekly, and quarterly business entries by reporting month", () => {
  const items = [
    statementItem("profit_loss", "revenue", "Monthly sales", 10_000),
    statementItem("profit_loss", "expense", "Monthly operating expenses", 2_000),
    statementItem("profit_loss", "expense", "Weekly payroll", 120, {
      frequency: "weekly",
    }),
    statementItem("profit_loss", "cost", "Quarterly supplies", 300, {
      frequency: "quarterly",
    }),
  ];

  const months = buildMonthlyProfitAndLoss(items, 2026);

  assert.deepEqual(
    {
      revenue: months[0].revenue,
      costs: months[0].costs,
      profit: months[0].profit,
    },
    { revenue: 10_000, costs: 2_620, profit: 7_380 },
  );
  assert.deepEqual(
    {
      revenue: months[11].revenue,
      costs: months[11].costs,
      profit: months[11].profit,
    },
    { revenue: 10_000, costs: 2_620, profit: 7_380 },
  );
});

test("places annual and one-time business items in their dated reporting periods", () => {
  const items = [
    statementItem("profit_loss", "revenue", "Annual contract", 1_200, {
      frequency: "annual",
      statement_date: "2026-09-01",
    }),
    statementItem("profit_loss", "cost", "One-time setup", 600, {
      frequency: "one_time",
      statement_date: "2026-04-01",
    }),
    statementItem("profit_loss", "expense", "Prior-year one-time cost", 900, {
      frequency: "one_time",
      statement_date: "2025-04-01",
    }),
    statementItem("profit_loss", "revenue", "Future monthly sales", 5_000, {
      frequency: "monthly",
      statement_date: "2027-01-01",
    }),
  ];

  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 3), {
    revenue: 0,
    costs: 600,
    profit: -600,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 8), {
    revenue: 1_200,
    costs: 0,
    profit: 1_200,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026), {
    revenue: 1_200,
    costs: 600,
    profit: 600,
  });
});

test("calculates mixed-frequency monthly and annual business profit for the selected year", () => {
  const items = [
    statementItem("profit_loss", "revenue", "Monthly sales", 10_000),
    statementItem("profit_loss", "expense", "Monthly operating expenses", 2_000),
    statementItem("profit_loss", "expense", "Weekly payroll", 120, {
      frequency: "weekly",
    }),
    statementItem("profit_loss", "cost", "Quarterly supplies", 300, {
      frequency: "quarterly",
    }),
    statementItem("profit_loss", "revenue", "Annual contract", 1_200, {
      frequency: "annual",
      statement_date: "2026-09-01",
    }),
    statementItem("profit_loss", "cost", "One-time setup", 600, {
      frequency: "one_time",
      statement_date: "2026-04-01",
    }),
    statementItem("profit_loss", "expense", "Prior-year one-time cost", 900, {
      frequency: "one_time",
      statement_date: "2025-04-01",
    }),
    statementItem("profit_loss", "revenue", "Future monthly sales", 5_000, {
      frequency: "monthly",
      statement_date: "2027-01-01",
    }),
    statementItem("cash_flow", "expense", "Personal spending", 9_000),
  ];

  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 3), {
    revenue: 10_000,
    costs: 3_220,
    profit: 6_780,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 8), {
    revenue: 11_200,
    costs: 2_620,
    profit: 8_580,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026), {
    revenue: 121_200,
    costs: 32_040,
    profit: 89_160,
  });
});

test("keeps overview and report calculations identical across monthly, annual, and quarterly income", () => {
  const items = [
    statementItem("cash_flow", "income", "Monthly salary", 8_000, {
      frequency: "monthly",
      statement_date: "2026-06-15",
    }),
    statementItem("cash_flow", "income", "Annual bonus", 12_000, {
      frequency: "annual",
      statement_date: "2026-09-15",
    }),
    statementItem("cash_flow", "income", "Quarterly distribution", 900, {
      frequency: "quarterly",
      statement_date: "2026-06-15",
    }),
    statementItem("profit_loss", "revenue", "Monthly sales", 10_000, {
      frequency: "monthly",
      statement_date: "2026-06-15",
    }),
    statementItem("profit_loss", "revenue", "Annual contract", 12_000, {
      frequency: "annual",
      statement_date: "2026-09-15",
    }),
    statementItem("profit_loss", "cost", "Quarterly supplies", 300, {
      frequency: "quarterly",
      statement_date: "2026-06-15",
    }),
  ];

  const overview = buildMonthlyFinancialOverview(items, 2026, 8);

  assert.deepEqual(overview.cashFlow, buildMonthlyCashFlow(items, 2026)[8]);
  assert.deepEqual(
    overview.profitAndLoss,
    buildProfitAndLossSummary(items, 2026, 8),
  );
  assert.equal(overview.cashFlow.income, 20_300);
  assert.equal(overview.cashFlow.expenses, 0);
  assert.equal(overview.cashFlow.surplus, 20_300);
  assert.equal(overview.profitAndLoss.revenue, 22_000);
  assert.equal(overview.profitAndLoss.costs, 100);
  assert.equal(overview.profitAndLoss.profit, 21_900);
  assert.equal(buildMonthlyFinancialOverview(items, 2026, 4).cashFlow.income, 0);
  assert.equal(
    buildMonthlyFinancialOverview(items, 2026, 4).profitAndLoss.revenue,
    0,
  );
});

test("keeps date-only boundaries and mixed frequencies invariant across timezones", () => {
  const items = [
    statementItem("profit_loss", "revenue", "Mid-year monthly revenue", 1_000, {
      frequency: "monthly",
      statement_date: "2026-06-15",
    }),
    statementItem("profit_loss", "expense", "Mid-year weekly cost", 120, {
      frequency: "weekly",
      statement_date: "2026-06-15",
    }),
    statementItem("profit_loss", "cost", "Mid-year quarterly cost", 300, {
      frequency: "quarterly",
      statement_date: "2026-06-15",
    }),
    statementItem("profit_loss", "revenue", "January annual revenue", 1_200, {
      frequency: "annual",
      statement_date: "2026-01-01",
    }),
    statementItem("profit_loss", "cost", "January one-time cost", 500, {
      frequency: "one_time",
      statement_date: "2026-01-01",
    }),
    statementItem("profit_loss", "revenue", "December one-time revenue", 700, {
      frequency: "one_time",
      statement_date: "2026-12-31",
    }),
    statementItem("profit_loss", "revenue", "Future monthly revenue", 9_999, {
      frequency: "monthly",
      statement_date: "2027-01-01",
    }),
  ];

  assert.deepEqual(statementCalendarDate(items[3]), {
    year: 2026,
    monthIndex: 0,
    day: 1,
  });
  assert.deepEqual(statementCalendarDate(items[5]), {
    year: 2026,
    monthIndex: 11,
    day: 31,
  });
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDate("2026-12-31"), "Dec 31, 2026");

  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 0), {
    revenue: 1_200,
    costs: 500,
    profit: 700,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 4), {
    revenue: 0,
    costs: 0,
    profit: 0,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 5), {
    revenue: 1_000,
    costs: 620,
    profit: 380,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026, 11), {
    revenue: 1_700,
    costs: 620,
    profit: 1_080,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2026), {
    revenue: 8_900,
    costs: 4_840,
    profit: 4_060,
  });
  assert.deepEqual(buildProfitAndLossSummary(items, 2027, 0), {
    revenue: 12_199,
    costs: 620,
    profit: 11_579,
  });
});

test("uses the configured planning calendar when a statement date falls back to its timestamp", () => {
  const fallbackItem = statementItem("cash_flow", "income", "Timestamp fallback", 1_000, {
    statement_date: null,
    created_at: "2025-12-31T16:30:00.000Z",
  });

  assert.deepEqual(statementCalendarDate(fallbackItem), {
    year: 2026,
    monthIndex: 0,
    day: 1,
  });
});
