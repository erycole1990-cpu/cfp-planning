import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePortfolioCollectionState,
  resolvePortfolioFoundationState,
} from "../lib/cfp/portfolio-state.ts";

test("successful empty portfolio data remains distinct from failure", () => {
  assert.deepEqual(resolvePortfolioCollectionState([], null), {
    status: "empty",
    error: null,
    records: [],
  });
});

test("portfolio load failure cannot become an empty list", () => {
  assert.deepEqual(resolvePortfolioCollectionState([], "Database timed out"), {
    status: "error",
    error: "Database timed out",
    records: null,
  });
});

test("populated portfolio records remain available", () => {
  const records = [{ id: "portfolio-1" }];
  const state = resolvePortfolioCollectionState(records, null);
  assert.equal(state.status, "ready");
  assert.equal(state.records, records);
});

test("detail query failure invalidates the entire foundation report", () => {
  const state = resolvePortfolioFoundationState(
    { portfolio: { id: "portfolio-1" }, holdings: [], transactions: [], valuations: [] },
    "Transaction query failed",
  );
  assert.deepEqual(state, {
    status: "error",
    error: "Transaction query failed",
    data: null,
  });
});

test("missing detail data is never treated as a legitimate zero report", () => {
  assert.deepEqual(resolvePortfolioFoundationState(null, null), {
    status: "error",
    error: "Portfolio data was unavailable.",
    data: null,
  });
});

test("complete detail data remains available without calculations", () => {
  const detail = { portfolio: { id: "portfolio-1" }, holdings: [], transactions: [], valuations: [] };
  assert.deepEqual(resolvePortfolioFoundationState(detail, null), {
    status: "ready",
    error: null,
    data: detail,
  });
});
