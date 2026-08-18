import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  portfolioDatabaseErrorMessage,
  portfolioFoundationMigration,
} from "../lib/cfp/portfolio-schema.ts";

const migration = readFileSync(
  new URL(`../supabase/migrations/${portfolioFoundationMigration}`, import.meta.url),
  "utf8",
);
const portfolioData = readFileSync(
  new URL("../lib/cfp/portfolio-data.ts", import.meta.url),
  "utf8",
);

const tables = [
  "investment_portfolios",
  "investment_holdings",
  "investment_transactions",
  "investment_valuations",
  "portfolio_benchmark_references",
  "portfolio_review_snapshots",
];

test("migration 0030 creates the approved Portfolio Analysis foundation", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.doesNotMatch(migration, /\b(real|double precision)\b/i);
  assert.match(migration, /base_currency text not null default 'MYR'/i);
  assert.ok(migration.includes("currency_code text not null check (currency_code ~ '^[A-Z]{3}$')"));
});

test("portfolio, holding, transaction, and valuation columns are complete", () => {
  const expectedColumns = {
    investment_portfolios: ["agency_id", "customer_id", "name", "portfolio_type", "objective", "base_currency", "custodian_provider", "account_reference", "inception_date", "status", "archived_at", "created_by", "created_at", "updated_at"],
    investment_holdings: ["portfolio_id", "name", "instrument_type", "asset_class", "geography_code", "provider_name", "symbol", "isin", "currency_code", "quantity_mode", "risk_rating", "risk_source", "risk_assessed_on", "status", "opened_on", "closed_on", "created_at", "updated_at"],
    investment_transactions: ["portfolio_id", "holding_id", "transaction_date", "transaction_type", "quantity", "unit_price", "gross_amount", "fee_amount", "tax_amount", "currency_code", "fx_rate_to_base", "fx_rate_date", "fx_source", "cash_flow_scope", "event_group_id", "transfer_group_id", "counterparty_portfolio_id", "reversal_of_transaction_id", "source_reference", "notes", "created_by", "created_at"],
    investment_valuations: ["portfolio_id", "holding_id", "valuation_scope", "valuation_date", "market_value", "units", "unit_price", "currency_code", "fx_rate_to_base", "fx_rate_date", "fx_source", "source", "evidence_status", "evidence_note", "supersedes_valuation_id", "created_by", "created_at"],
  };
  for (const [table, columns] of Object.entries(expectedColumns)) {
    const start = migration.indexOf(`create table if not exists public.${table}`);
    const end = migration.indexOf("\n);", start);
    const definition = migration.slice(start, end);
    for (const column of columns) assert.match(definition, new RegExp(`\\b${column}\\b`, "i"));
  }
});

test("database integrity uses composite child keys, checks, and useful indexes", () => {
  assert.match(migration, /unique \(id, portfolio_id\)/i);
  assert.match(migration, /foreign key \(holding_id, portfolio_id\)[\s\S]*references public\.investment_holdings\(id, portfolio_id\)/i);
  assert.match(migration, /gross_amount numeric\([^)]*\) not null[\s\S]*cfp_numeric_is_finite\(gross_amount\)[\s\S]*gross_amount >= 0/i);
  assert.match(migration, /market_value numeric\([^)]*\) not null[\s\S]*cfp_numeric_is_finite\(market_value\)[\s\S]*market_value >= 0/i);
  assert.match(migration, /check \(\(transaction_type = 'reversal'\) = \(reversal_of_transaction_id is not null\)\)/i);
  assert.match(migration, /investment_portfolios_customer_status_name_idx/i);
  assert.match(migration, /investment_transactions_portfolio_date_idx/i);
  assert.match(migration, /investment_valuations_portfolio_date_idx/i);
  assert.match(migration, /investment_valuations_one_superseding_idx/i);
  assert.match(migration, /foreign key \(reversal_of_transaction_id, portfolio_id\)[\s\S]*references public\.investment_transactions\(id, portfolio_id\) on delete restrict/i);
});

test("every portfolio numeric column rejects PostgreSQL non-finite values", () => {
  assert.match(migration, /create or replace function public\.cfp_numeric_is_finite\(requested_value numeric\)/i);
  for (const specialValue of ["NaN", "Infinity", "-Infinity"]) {
    assert.ok(migration.includes(`'${specialValue}'::numeric`));
  }

  const numericColumns = {
    investment_transactions: ["quantity", "unit_price", "gross_amount", "fee_amount", "tax_amount", "fx_rate_to_base"],
    investment_valuations: ["market_value", "units", "unit_price", "fx_rate_to_base"],
    portfolio_benchmark_references: ["weight_percent"],
    portfolio_review_snapshots: ["total_value", "simple_return_percent", "xirr_percent"],
  };
  for (const [table, columns] of Object.entries(numericColumns)) {
    const start = migration.indexOf(`create table if not exists public.${table}`);
    const end = migration.indexOf("\n);", start);
    const definition = migration.slice(start, end);
    for (const column of columns) {
      assert.match(
        definition,
        new RegExp(`\\b${column}\\s+numeric\\([^)]*\\)[\\s\\S]*?cfp_numeric_is_finite\\(${column}\\)`, "i"),
        `${table}.${column} lacks an explicit finite-number constraint`,
      );
    }
  }

  for (const value of ["clean_quantity", "clean_unit_price", "clean_gross", "clean_fee", "clean_tax", "clean_fx"]) {
    assert.match(migration, new RegExp(`not public\\.cfp_numeric_is_finite\\(${value}\\)`, "i"));
  }
  for (const value of ["clean_market_value", "clean_units", "clean_unit_price", "clean_fx"]) {
    assert.match(migration, new RegExp(`not public\\.cfp_numeric_is_finite\\(${value}\\)`, "i"));
  }
  assert.match(migration, /Transfer amount and FX rate must be finite numbers/i);
});

test("history-bearing foreign keys reject parent deletion", () => {
  assert.match(migration, /customer_id uuid not null references public\.customers\(id\) on delete restrict/i);
  for (const table of ["investment_holdings", "investment_transactions", "investment_valuations", "portfolio_review_snapshots"]) {
    const start = migration.indexOf(`create table if not exists public.${table}`);
    const end = migration.indexOf("\n);", start);
    assert.match(migration.slice(start, end), /portfolio_id uuid not null references public\.investment_portfolios\(id\) on delete restrict/i);
  }
  assert.equal((migration.match(/references public\.investment_holdings\(id, portfolio_id\) on delete restrict/gi) || []).length, 2);
});

test("transaction meaning is enforced by shared scope and amount predicates", () => {
  assert.match(migration, /check \(public\.cfp_investment_transaction_scope_is_valid\(transaction_type, cash_flow_scope\)\)/i);
  assert.match(migration, /check \(public\.cfp_investment_transaction_amounts_are_valid\(/i);
  assert.match(migration, /when requested_type = 'fee'[\s\S]*requested_gross = 0 and requested_fee > 0 and requested_tax = 0/i);
  assert.match(migration, /when requested_type = 'tax'[\s\S]*requested_gross = 0 and requested_fee = 0 and requested_tax > 0/i);
  assert.match(migration, /if not public\.cfp_investment_transaction_scope_is_valid\(clean_type, clean_scope\)/i);
  assert.match(migration, /if not public\.cfp_investment_transaction_amounts_are_valid\(/i);
});

test("active valuation creation is serialized before duplicate and superseding checks", () => {
  const start = migration.indexOf("create or replace function public.cfp_record_investment_valuation");
  const end = migration.indexOf("\n$$;", start);
  const valuationRpc = migration.slice(start, end);
  const lock = valuationRpc.indexOf("pg_catalog.pg_advisory_xact_lock");
  const supersedingCheck = valuationRpc.indexOf("if clean_supersedes is not null");
  const insert = valuationRpc.indexOf("insert into public.investment_valuations");
  assert.ok(lock > 0 && lock < supersedingCheck && supersedingCheck < insert);
  for (const keyPart of ["target_portfolio_id::text", "clean_scope", "clean_holding_id::text", "clean_date::text"]) {
    assert.ok(valuationRpc.includes(keyPart), `lock key is missing ${keyPart}`);
  }
});

test("transaction pagination has a unique tie-breaker and matching index", () => {
  assert.match(migration, /on public\.investment_transactions\(portfolio_id, transaction_date desc, created_at desc, id desc\)/i);
  assert.match(portfolioData, /\.order\("transaction_date", \{ ascending: false \}\)[\s\S]*\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.order\("id", \{ ascending: false \}\)[\s\S]*\.range\(from, to\)/i);
});

test("financial history is read-only outside fixed-search-path audited RPCs", () => {
  for (const table of ["investment_transactions", "investment_valuations", "portfolio_review_snapshots"]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
    assert.doesNotMatch(migration, new RegExp(`grant (insert|update|delete|all) on public\\.${table} to authenticated`, "i"));
  }
  for (const helper of [
    "cfp_can_access_investment_portfolio\\(uuid\\)",
    "cfp_can_manage_investment_portfolio\\(uuid\\)",
    "cfp_prepare_investment_portfolio\\(\\)",
    "cfp_prepare_investment_holding\\(\\)",
    "cfp_prepare_portfolio_benchmark\\(\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${helper} from public`, "i"));
  }
  for (const rpc of [
    "cfp_record_investment_transaction",
    "cfp_record_investment_transfer",
    "cfp_reverse_investment_transaction",
    "cfp_record_investment_valuation",
  ]) {
    const start = migration.indexOf(`create or replace function public.${rpc}`);
    const end = migration.indexOf("\n$$;", start);
    const definition = migration.slice(start, end);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = public/i);
    assert.match(definition, /insert into public\.audit_logs/i);
    assert.match(definition, /'customer_id'/i);
  }
});

test("paired portfolio transfers are recorded as internal cash flows", () => {
  const start = migration.indexOf("create or replace function public.cfp_record_investment_transfer");
  const end = migration.indexOf("create or replace function public.cfp_reverse_investment_transaction", start);
  const transfer = migration.slice(start, end);
  assert.equal((transfer.match(/clean_fx_source, 'internal', transfer_group/g) || []).length, 2);
  assert.doesNotMatch(transfer, /clean_fx_source, 'external_(in|out)', transfer_group/);
});

test("transaction audits preserve all canonical economic amount fields", () => {
  const start = migration.indexOf("create or replace function public.cfp_record_investment_transaction");
  const end = migration.indexOf("create or replace function public.cfp_record_investment_transfer", start);
  const transactionRpc = migration.slice(start, end);
  for (const field of ["transaction_type", "gross_amount", "fee_amount", "tax_amount", "cash_flow_scope", "currency_code"]) {
    assert.ok(transactionRpc.includes(`'${field}'`), `transaction audit is missing ${field}`);
  }
});

test("reversal and valuation lookups do not disclose foreign record existence", () => {
  const reversalStart = migration.indexOf("create or replace function public.cfp_reverse_investment_transaction");
  const valuationStart = migration.indexOf("create or replace function public.cfp_record_investment_valuation", reversalStart);
  const reversalRpc = migration.slice(reversalStart, valuationStart);
  assert.match(reversalRpc, /where t\.id = original_transaction_id[\s\S]*and public\.cfp_can_manage_investment_portfolio\(t\.portfolio_id\)/i);
  assert.match(reversalRpc, /if not found then[\s\S]*Transaction is unavailable for reversal/i);
  assert.doesNotMatch(reversalRpc, /select \* into strict original\b/i);

  const valuationEnd = migration.indexOf("revoke all on function public.cfp_numeric_is_finite", valuationStart);
  const valuationRpc = migration.slice(valuationStart, valuationEnd);
  assert.match(valuationRpc, /where v\.id = clean_supersedes[\s\S]*v\.portfolio_id = target_portfolio_id[\s\S]*v\.valuation_scope = clean_scope[\s\S]*v\.holding_id is not distinct from clean_holding_id[\s\S]*v\.valuation_date = clean_date/i);
  assert.match(valuationRpc, /if not found then[\s\S]*Superseding valuation is unavailable or does not match/i);
});

test("missing portfolio schema errors give deployment-safe guidance", () => {
  const message = portfolioDatabaseErrorMessage({
    code: "PGRST205",
    message: "Could not find the table public.investment_portfolios in the schema cache",
  });
  assert.match(message, /schema is missing or out of date/i);
  assert.match(message, /0030_portfolio_analysis\.sql/i);
});

test("ordinary database errors do not leak technical details", () => {
  const technical = { code: "42501", message: "permission denied", details: "secret_policy" };
  for (const message of [portfolioDatabaseErrorMessage(technical), portfolioDatabaseErrorMessage(technical, "save")]) {
    assert.match(message, /retry/i);
    assert.doesNotMatch(message, /permission|secret_policy|42501/i);
  }
});
