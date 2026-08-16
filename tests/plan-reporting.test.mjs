import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyFinancialOverview,
  buildPlanFinancialSnapshot,
} from "../lib/cfp/financial-analysis.ts";
import { planningCalendarDate } from "../lib/cfp/format.ts";

let itemId = 0;

function item(statementType, itemType, amount, statementDate, frequency = "monthly") {
  itemId += 1;
  return {
    id: `plan-item-${itemId}`,
    created_at: `${statementDate}T00:00:00.000Z`,
    customer_id: "customer-1",
    statement_type: statementType,
    item_type: itemType,
    category: "Test",
    description: "Test item",
    amount,
    frequency,
    statement_date: statementDate,
  };
}

function assertReconciles(items, period) {
  const snapshot = buildPlanFinancialSnapshot(items, period);
  const overview = buildMonthlyFinancialOverview(items, period.year, period.monthIndex);

  assert.deepEqual(snapshot.summary, {
    total_assets: 50_000,
    total_liabilities: 10_000,
    net_worth: 40_000,
    monthly_income: overview.cashFlow.income,
    monthly_expenses: overview.cashFlow.expenses,
    monthly_surplus: overview.cashFlow.surplus,
  });
  return { snapshot, overview };
}

test("plan snapshots reconcile ordinary, future, annual, and one-time items with reports", () => {
  const items = [
    item("balance_sheet", "asset", 50_000, "2025-12-01", "current"),
    item("balance_sheet", "liability", 10_000, "2025-12-01", "current"),
    item("cash_flow", "income", 10_000, "2025-12-01"),
    item("cash_flow", "expense", 2_000, "2025-12-01"),
    item("cash_flow", "income", 3_000, "2026-02-01"),
    item("cash_flow", "expense", 1_200, "2026-01-01", "annual"),
    item("cash_flow", "expense", 500, "2026-01-01", "one_time"),
    item("cash_flow", "expense", 700, "2025-12-01", "one_time"),
  ];
  const period = {
    asOfDate: "2026-01-01",
    year: 2026,
    monthIndex: 0,
    timeZone: "Asia/Kuala_Lumpur",
  };
  const { snapshot, overview } = assertReconciles(items, period);

  assert.equal(overview.cashFlow.income, 10_000);
  assert.equal(overview.cashFlow.expenses, 3_700);
  assert.equal(overview.cashFlow.surplus, 6_300);
  assert.deepEqual(snapshot.reporting_period, {
    as_of_date: "2026-01-01",
    year: 2026,
    month_index: 0,
    month: "January",
    time_zone: "Asia/Kuala_Lumpur",
  });
});

test("plan snapshots preserve and reconcile the reporting period across a year boundary", () => {
  const items = [
    item("balance_sheet", "asset", 50_000, "2025-12-01", "current"),
    item("balance_sheet", "liability", 10_000, "2025-12-01", "current"),
    item("cash_flow", "income", 8_000, "2025-12-01"),
    item("cash_flow", "expense", 600, "2025-12-31", "one_time"),
    item("cash_flow", "income", 4_000, "2026-01-01"),
    item("cash_flow", "expense", 1_200, "2026-01-01", "annual"),
  ];
  const planningDate = planningCalendarDate(
    "2025-12-31T16:30:00.000Z",
    "Asia/Kuala_Lumpur",
  );
  const period = {
    asOfDate: planningDate.isoDate,
    year: planningDate.year,
    monthIndex: planningDate.monthIndex,
    timeZone: planningDate.timeZone,
  };
  const { snapshot, overview } = assertReconciles(items, period);

  assert.equal(overview.cashFlow.income, 12_000);
  assert.equal(overview.cashFlow.expenses, 1_200);
  assert.equal(snapshot.reporting_period.year, 2026);
  assert.equal(snapshot.reporting_period.month_index, 0);
  assert.equal(snapshot.reporting_period.as_of_date, "2026-01-01");
});
