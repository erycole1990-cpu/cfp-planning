import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildActivityWindowPresentation,
  resolveActivityTotalCount,
} from "../lib/cfp/activity-window.ts";
import { resolveFinancialStatementState } from "../lib/cfp/financial-statement-state.ts";

test("statement query failure blocks financial calculation input", () => {
  const state = resolveFinancialStatementState(
    [{ id: "statement-1", amount: 10_000 }],
    "Database connection timed out",
  );

  assert.deepEqual(state, {
    status: "error",
    error: "Database connection timed out",
    items: null,
  });
});

test("successful query with no statements remains a valid empty state", () => {
  const state = resolveFinancialStatementState([], null);

  assert.deepEqual(state, {
    status: "empty",
    error: null,
    items: [],
  });
});

test("successful statement data remains available for calculation", () => {
  const items = [{ id: "statement-1", amount: 10_000 }];
  const state = resolveFinancialStatementState(items, null);

  assert.equal(state.status, "ready");
  assert.equal(state.error, null);
  assert.equal(state.items, items);
});

test("statements page returns the error state before financial calculations", () => {
  const pageSource = readFileSync(
    new URL("../app/customers/[id]/statements/page.tsx", import.meta.url),
    "utf8",
  );
  const errorGuard = pageSource.indexOf('if (statementState.status === "error")');
  const overviewCalculation = pageSource.indexOf(
    "buildMonthlyFinancialOverview(items, year, monthIndex)",
  );
  const ratioCalculation = pageSource.indexOf(
    "buildFinancialRatios(items, monthlyCashFlow, year)",
  );

  assert.ok(errorGuard >= 0);
  assert.ok(overviewCalculation > errorGuard);
  assert.ok(ratioCalculation > errorGuard);
  assert.match(pageSource, /no balances, ratios, or profit figures are being shown/i);
  assert.match(pageSource, /valid empty planning view, not a database failure/i);
});

test("activity count failure keeps the latest-window disclosure open", () => {
  const totalCount = resolveActivityTotalCount(50, "Count query timed out");
  const presentation = buildActivityWindowPresentation({
    loadedCount: 50,
    filteredCount: 12,
    totalCount,
    windowLimit: 50,
    filterIsAll: false,
  });

  assert.match(presentation.countLabel, /12 matches in latest 50 records/i);
  assert.match(presentation.countLabel, /total count unavailable/i);
  assert.match(presentation.disclosure ?? "", /filters and pages.*latest 50 loaded records/i);
  assert.match(presentation.disclosure ?? "", /older records may exist/i);
  assert.doesNotMatch(presentation.countLabel, /^50 records$/i);
});

test("available activity total reports the bounded latest window accurately", () => {
  const presentation = buildActivityWindowPresentation({
    loadedCount: 50,
    filteredCount: 50,
    totalCount: 83,
    windowLimit: 50,
    filterIsAll: true,
  });

  assert.equal(presentation.countLabel, "Latest 50 of 83 records");
  assert.match(presentation.disclosure ?? "", /full audit history contains 83 records/i);
});
