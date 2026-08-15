import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  financialStatementErrorMessage,
  financialStatementItemSelect,
  statementPlanningColumns,
  statementPlanningMigration,
} from "../lib/cfp/financial-statement-schema.ts";

const expectedPlanningColumns = [
  "ownership_type",
  "valuation_basis",
  "liquidity_class",
  "evidence_status",
  "evidence_note",
  "interest_rate",
  "monthly_payment",
  "maturity_date",
  "cash_flow_nature",
  "budget_amount",
  "tax_deductible",
  "cash_treatment",
];

test("migration 0029 contains every statement planning column used by the app", () => {
  const migration = readFileSync(
    new URL(`../supabase/migrations/${statementPlanningMigration}`, import.meta.url),
    "utf8",
  );

  assert.deepEqual(statementPlanningColumns, expectedPlanningColumns);
  for (const column of expectedPlanningColumns) {
    assert.match(migration, new RegExp(`add column if not exists\\s+${column}\\b`, "i"));
    assert.ok(financialStatementItemSelect.split(",").includes(column));
  }
});

test("missing planning schema errors produce deployment guidance", () => {
  const message = financialStatementErrorMessage({
    code: "PGRST204",
    message: "Could not find the 'cash_flow_nature' column in the schema cache",
  });

  assert.match(message, /required database schema is missing or out of date/i);
  assert.match(message, /0029_statement_planning_metadata\.sql/);
});

test("ordinary statement query errors remain visible", () => {
  assert.equal(
    financialStatementErrorMessage({ message: "Database connection timed out" }),
    "Database connection timed out",
  );
});
