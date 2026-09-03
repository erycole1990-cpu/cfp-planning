import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildInvestmentHoldingPayload,
  buildInvestmentTransactionPayload,
  buildInvestmentValuationPayload,
  PortfolioActionError,
} from "../lib/cfp/portfolio-input.ts";

const holdingId = "11111111-1111-4111-8111-111111111111";

function formData(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function baseTransaction(overrides = {}) {
  return formData({
    transaction_date: "2026-08-19",
    transaction_type: "contribution",
    cash_flow_scope: "external_in",
    holding_id: "",
    quantity: "",
    unit_price: "",
    gross_amount: "1000",
    fee_amount: "0",
    tax_amount: "0",
    currency_code: "MYR",
    fx_rate_to_base: "1",
    fx_rate_date: "",
    fx_source: "",
    source_reference: "statement-1",
    notes: "Synthetic entry",
    ...overrides,
  });
}

function baseValuation(overrides = {}) {
  return formData({
    valuation_scope: "portfolio",
    holding_id: "",
    valuation_date: "2026-08-19",
    market_value: "125000",
    units: "",
    unit_price: "",
    currency_code: "MYR",
    fx_rate_to_base: "1",
    fx_rate_date: "",
    fx_source: "",
    source: "manual",
    evidence_status: "unverified",
    evidence_note: "Synthetic valuation",
    supersedes_valuation_id: "",
    ...overrides,
  });
}

test("Holding form fields produce the exact authenticated RPC payload", () => {
  const payload = buildInvestmentHoldingPayload(formData({
    name: " Global Balanced Fund ",
    instrument_type: "unit_trust",
    asset_class: "mixed",
    geography_code: "MY",
    provider_name: "Synthetic Provider",
    symbol: "GBF",
    isin: "MY0000000001",
    currency_code: "myr",
    quantity_mode: "units",
    risk_rating: "4",
    risk_source: "Synthetic questionnaire",
    risk_assessed_on: "2026-08-19",
    opened_on: "2026-01-15",
  }));

  assert.deepEqual(payload, {
    name: "Global Balanced Fund",
    instrument_type: "unit_trust",
    asset_class: "mixed",
    geography_code: "MY",
    provider_name: "Synthetic Provider",
    symbol: "GBF",
    isin: "MY0000000001",
    currency_code: "MYR",
    quantity_mode: "units",
    risk_rating: "4",
    risk_source: "Synthetic questionnaire",
    risk_assessed_on: "2026-08-19",
    opened_on: "2026-01-15",
  });
});

test("Holding input rejects a risk rating without its required source before RPC", () => {
  assert.throws(
    () => buildInvestmentHoldingPayload(formData({
      name: "Rated Fund",
      instrument_type: "unit_trust",
      asset_class: "mixed",
      currency_code: "MYR",
      quantity_mode: "units",
      risk_rating: "4",
      risk_source: "",
    })),
    (error) => error instanceof PortfolioActionError &&
      error.category === "validation" &&
      /risk source is required/i.test(error.message),
  );
});

test("same-currency transactions are normalized to FX 1 without FX evidence", () => {
  const payload = buildInvestmentTransactionPayload(baseTransaction({
    currency_code: "myr",
    fx_rate_to_base: "4",
    fx_rate_date: "2026-08-19",
    fx_source: "Stale browser value",
  }), "MYR");

  assert.equal(payload.currency_code, "MYR");
  assert.equal(payload.fx_rate_to_base, "1");
  assert.equal(payload.fx_rate_date, null);
  assert.equal(payload.fx_source, null);
});

test("cross-currency transactions preserve explicit FX evidence", () => {
  const payload = buildInvestmentTransactionPayload(baseTransaction({
    currency_code: "USD",
    fx_rate_to_base: "4.4",
    fx_rate_date: "2026-08-18",
    fx_source: "Synthetic rate sheet",
  }), "MYR");

  assert.equal(payload.currency_code, "USD");
  assert.equal(payload.fx_rate_to_base, "4.4");
  assert.equal(payload.fx_rate_date, "2026-08-18");
  assert.equal(payload.fx_source, "Synthetic rate sheet");
});

test("portfolio-scope valuations represent the whole portfolio only", () => {
  const payload = buildInvestmentValuationPayload(baseValuation(), "MYR");
  assert.equal(payload.valuation_scope, "portfolio");
  assert.equal(payload.holding_id, null);
  assert.equal(payload.fx_rate_to_base, "1");
});

test("same-currency valuations discard unrelated FX values and evidence", () => {
  const payload = buildInvestmentValuationPayload(baseValuation({
    currency_code: "MYR",
    fx_rate_to_base: "4",
    fx_rate_date: "2026-08-18",
    fx_source: "Stale browser value",
  }), "MYR");

  assert.equal(payload.fx_rate_to_base, "1");
  assert.equal(payload.fx_rate_date, null);
  assert.equal(payload.fx_source, null);
});

test("cross-currency valuations preserve explicit FX evidence", () => {
  const payload = buildInvestmentValuationPayload(baseValuation({
    currency_code: "USD",
    fx_rate_to_base: "4.4",
    fx_rate_date: "2026-08-18",
    fx_source: "Synthetic valuation source",
  }), "MYR");

  assert.equal(payload.fx_rate_to_base, "4.4");
  assert.equal(payload.fx_rate_date, "2026-08-18");
  assert.equal(payload.fx_source, "Synthetic valuation source");
});

test("holding-scope valuations require a selected holding", () => {
  const payload = buildInvestmentValuationPayload(baseValuation({
    valuation_scope: "holding",
    holding_id: holdingId,
  }), "MYR");
  assert.equal(payload.valuation_scope, "holding");
  assert.equal(payload.holding_id, holdingId);

  assert.throws(
    () => buildInvestmentValuationPayload(baseValuation({
      valuation_scope: "holding",
      holding_id: "",
    }), "MYR"),
    /select a holding/i,
  );
});

test("whole-portfolio scope rejects an individual holding", () => {
  assert.throws(
    () => buildInvestmentValuationPayload(baseValuation({
      valuation_scope: "portfolio",
      holding_id: holdingId,
    }), "MYR"),
    /cannot select an individual holding/i,
  );
});

test("client fields prevent ambiguous risk, FX, and valuation combinations", () => {
  const source = readFileSync(
    new URL("../app/customers/[id]/portfolios/[portfolioId]/portfolio-entry-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /required=\{Boolean\(riskRating\)\}/);
  assert.match(source, /readOnly=\{isBaseCurrency\}/);
  assert.match(source, /Base-currency entries always use an FX rate of 1/);
  assert.match(source, /scope === "portfolio"[\s\S]*type="hidden" name="holding_id" value=""/);
  assert.match(source, /<option value="" disabled>Select a holding<\/option>/);
});
