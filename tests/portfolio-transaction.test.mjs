import assert from "node:assert/strict";
import test from "node:test";

import {
  portfolioTransactionDisplayAmounts,
  portfolioTransactionScopeRules,
  validatePortfolioTransactionSemantics,
} from "../lib/cfp/portfolio.ts";

const base = {
  holdingId: null,
  quantity: null,
  unitPrice: null,
  grossAmount: 0,
  feeAmount: 0,
  taxAmount: 0,
};

test("transaction type and cash-flow scope rules are explicit", () => {
  assert.deepEqual(portfolioTransactionScopeRules, {
    opening_balance: ["non_cash"],
    buy: ["internal"],
    sell: ["internal"],
    contribution: ["external_in"],
    withdrawal: ["external_out"],
    distribution: ["internal", "external_out"],
    interest: ["internal", "external_out"],
    fee: ["internal"],
    tax: ["internal"],
    reinvestment: ["internal"],
  });
  assert.match(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "contribution",
    cashFlowScope: "external_out",
    grossAmount: 100,
  }), /scope is incompatible/i);
});

test("standalone fees and taxes have one canonical amount field", () => {
  assert.equal(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "fee",
    cashFlowScope: "internal",
    feeAmount: 25,
  }), null);
  assert.equal(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "tax",
    cashFlowScope: "internal",
    taxAmount: 15,
  }), null);
  assert.match(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "fee",
    cashFlowScope: "internal",
    grossAmount: 25,
    feeAmount: 25,
  }), /zero gross/i);
  assert.match(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "tax",
    cashFlowScope: "internal",
    feeAmount: 1,
    taxAmount: 15,
  }), /zero gross and fee/i);

  assert.deepEqual(portfolioTransactionDisplayAmounts({
    gross_amount: "0",
    fee_amount: "25.00",
    tax_amount: "0",
  }), [{ label: "Fee", value: "25.00" }]);
  assert.deepEqual(portfolioTransactionDisplayAmounts({
    gross_amount: "0",
    fee_amount: "0",
    tax_amount: "8.00",
  }), [{ label: "Tax", value: "8.00" }]);
});

test("transaction presentation preserves gross, fee, and tax details", () => {
  assert.deepEqual(portfolioTransactionDisplayAmounts({
    gross_amount: "1000.00",
    fee_amount: "10.00",
    tax_amount: "2.00",
  }), [
    { label: "Gross", value: "1000.00" },
    { label: "Fee", value: "10.00" },
    { label: "Tax", value: "2.00" },
  ]);
});

test("trade-like transactions require a holding, quantity, and consideration", () => {
  for (const transactionType of ["buy", "sell", "reinvestment"]) {
    assert.equal(validatePortfolioTransactionSemantics({
      ...base,
      transactionType,
      cashFlowScope: "internal",
      holdingId: "holding-1",
      quantity: 2,
      unitPrice: 50,
      grossAmount: 100,
      feeAmount: 1,
      taxAmount: 2,
    }), null);
    assert.match(validatePortfolioTransactionSemantics({
      ...base,
      transactionType,
      cashFlowScope: "internal",
      grossAmount: 100,
    }), /requires a holding/i);
  }
});

test("non-trade cash flows cannot hide separate fee or tax amounts", () => {
  assert.equal(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "interest",
    cashFlowScope: "external_out",
    grossAmount: 100,
  }), null);
  assert.match(validatePortfolioTransactionSemantics({
    ...base,
    transactionType: "withdrawal",
    cashFlowScope: "external_out",
    grossAmount: 100,
    feeAmount: 5,
  }), /zero fee and tax/i);
});
