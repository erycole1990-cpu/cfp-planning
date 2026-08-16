import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityWindowPresentation,
  resolveActivityLoadState,
} from "../lib/cfp/activity-window.ts";
import { resolveFinancialStatementReportState } from "../lib/cfp/financial-statement-state.ts";

test("statement query failure prevents every financial report calculation", () => {
  let buildCalls = 0;
  const state = resolveFinancialStatementReportState(
    [{ id: "statement-1", amount: 10_000 }],
    "Database connection timed out",
    () => {
      buildCalls += 1;
      return { balances: 10_000, ratios: ["invalid"] };
    },
  );

  assert.deepEqual(state, {
    status: "error",
    error: "Database connection timed out",
    items: null,
    report: null,
  });
  assert.equal(buildCalls, 0);
});

test("successful query with no statements builds a valid empty report", () => {
  let buildCalls = 0;
  const state = resolveFinancialStatementReportState([], null, (items) => {
    buildCalls += 1;
    return { balances: items.length, ratios: [] };
  });

  assert.deepEqual(state, {
    status: "empty",
    error: null,
    items: [],
    report: { balances: 0, ratios: [] },
  });
  assert.equal(buildCalls, 1);
});

test("successful statement data remains available to its report builder", () => {
  const items = [{ id: "statement-1", amount: 10_000 }];
  const state = resolveFinancialStatementReportState(items, null, (availableItems) => ({
    total: availableItems.reduce((sum, item) => sum + item.amount, 0),
  }));

  assert.equal(state.status, "ready");
  assert.equal(state.error, null);
  assert.equal(state.items, items);
  assert.deepEqual(state.report, { total: 10_000 });
});

test("successful empty activity is distinct from an activity load failure", () => {
  assert.deepEqual(
    resolveActivityLoadState({
      records: [],
      recordError: null,
      totalCount: 0,
      countError: null,
    }),
    {
      status: "empty",
      error: null,
      records: [],
      totalCount: 0,
      countError: null,
    },
  );
});

test("loaded activity remains usable when only the exact count fails", () => {
  const records = [{ id: "audit-1" }];
  assert.deepEqual(
    resolveActivityLoadState({
      records,
      recordError: null,
      totalCount: 50,
      countError: "Count query timed out",
    }),
    {
      status: "ready",
      error: null,
      records,
      totalCount: null,
      countError: "Count query timed out",
    },
  );
});

test("activity record failure cannot become an empty or counted history", () => {
  assert.deepEqual(
    resolveActivityLoadState({
      records: [],
      recordError: "Activity history could not be loaded. Please retry.",
      totalCount: 83,
      countError: null,
    }),
    {
      status: "error",
      error: "Activity history could not be loaded. Please retry.",
      records: null,
      totalCount: null,
      countError: null,
    },
  );
});

test("successful activity records and exact count remain available together", () => {
  const records = [{ id: "audit-1" }, { id: "audit-2" }];
  const state = resolveActivityLoadState({
    records,
    recordError: null,
    totalCount: 83,
    countError: null,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.records, records);
  assert.equal(state.totalCount, 83);
  assert.equal(state.countError, null);
});

test("activity count failure keeps the latest-window disclosure open", () => {
  const state = resolveActivityLoadState({
    records: Array.from({ length: 50 }, (_, index) => ({ id: `audit-${index}` })),
    recordError: null,
    totalCount: 50,
    countError: "Count query timed out",
  });
  assert.notEqual(state.status, "error");
  const presentation = buildActivityWindowPresentation({
    loadedCount: state.records.length,
    filteredCount: 12,
    totalCount: state.totalCount,
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
