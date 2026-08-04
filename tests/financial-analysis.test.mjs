import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialRatios,
  buildMonthlyCashFlow,
} from "../lib/cfp/financial-analysis.ts";

let itemId = 0;

function statementItem(statementType, itemType, category, amount) {
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
