import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialRatios,
  buildMonthlyCashFlow,
  buildProfitAndLossSummary,
  cashFlowAmountForMonth,
  statementItemsForMonth,
} from "../lib/cfp/financial-analysis.ts";

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
    frequency: statementType === "cash_flow" ? "monthly" : "current_value",
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
  assert.equal(byId.get("cash-flow-surplus")?.displayValue, "30.0%");
  assert.equal(byId.get("savings-investment")?.displayValue, "20.0%");
  assert.equal(byId.get("reserve")?.displayValue, "6.7 months");
  assert.equal(byId.get("debt")?.displayValue, "20.0%");
  assert.equal(byId.get("housing")?.displayValue, "25.0%");
  assert.equal(byId.get("solvency")?.displayValue, "62.3%");
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

  assert.equal(byId.get("savings-investment")?.displayValue, "15.0%");
  assert.equal(byId.get("reserve")?.displayValue, "8.0 months");
  assert.equal(byId.get("debt")?.displayValue, "10.0%");
});

test("returns unassessed ratios when recorded data has no usable denominator", () => {
  const ratios = buildFinancialRatios([], buildMonthlyCashFlow([], 2026), 2026);

  assert.equal(ratios.length, 8);
  assert.ok(ratios.every((ratio) => ratio.status === "insufficient"));
  assert.ok(ratios.every((ratio) => ratio.displayValue === "Not assessed"));
});

test("subtracts both direct costs and operating expenses from business revenue", () => {
  const summary = buildProfitAndLossSummary([
    statementItem("profit_loss", "revenue", "Sales", 20_000),
    statementItem("profit_loss", "cost", "Cost of goods", 7_000),
    statementItem("profit_loss", "expense", "Operating expenses", 3_000),
    statementItem("cash_flow", "expense", "Personal spending", 9_000),
  ]);

  assert.deepEqual(summary, {
    revenue: 20_000,
    costs: 10_000,
    profit: 10_000,
  });
});
