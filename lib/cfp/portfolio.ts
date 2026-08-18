export type InvestmentPortfolio = {
  id: string;
  agency_id: string;
  customer_id: string;
  name: string;
  portfolio_type: "general" | "retirement" | "education" | "income" | "other";
  objective: string | null;
  base_currency: string;
  custodian_provider: string | null;
  account_reference: string | null;
  inception_date: string | null;
  status: "active" | "archived" | "closed";
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentHolding = {
  id: string;
  portfolio_id: string;
  name: string;
  instrument_type: string;
  asset_class: string;
  geography_code: string | null;
  provider_name: string | null;
  symbol: string | null;
  isin: string | null;
  currency_code: string;
  quantity_mode: "units" | "notional" | "manual_value";
  risk_rating: number | null;
  risk_source: string | null;
  risk_assessed_on: string | null;
  status: "active" | "closed" | "archived";
  opened_on: string | null;
  closed_on: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentTransaction = {
  id: string;
  portfolio_id: string;
  holding_id: string | null;
  transaction_date: string;
  transaction_type: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  gross_amount: number | string;
  fee_amount: number | string;
  tax_amount: number | string;
  currency_code: string;
  fx_rate_to_base: number | string;
  fx_rate_date: string | null;
  fx_source: string | null;
  cash_flow_scope: "external_in" | "external_out" | "internal" | "non_cash";
  event_group_id: string | null;
  transfer_group_id: string | null;
  counterparty_portfolio_id: string | null;
  reversal_of_transaction_id: string | null;
  source_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type InvestmentValuation = {
  id: string;
  portfolio_id: string;
  holding_id: string | null;
  valuation_scope: "holding" | "portfolio";
  valuation_date: string;
  market_value: number | string;
  units: number | string | null;
  unit_price: number | string | null;
  currency_code: string;
  fx_rate_to_base: number | string;
  fx_rate_date: string | null;
  fx_source: string | null;
  source: "manual" | "provider_statement" | "import";
  evidence_status: "unverified" | "client_provided" | "adviser_verified";
  evidence_note: string | null;
  supersedes_valuation_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type PortfolioTransactionDisplayAmount = {
  label: "Gross" | "Fee" | "Tax";
  value: number | string;
};

export function portfolioTransactionDisplayAmounts(
  transaction: Pick<InvestmentTransaction, "gross_amount" | "fee_amount" | "tax_amount">,
): PortfolioTransactionDisplayAmount[] {
  const gross = Number(transaction.gross_amount);
  const fee = Number(transaction.fee_amount);
  const tax = Number(transaction.tax_amount);
  const amounts: PortfolioTransactionDisplayAmount[] = [];

  if (gross !== 0 || (fee === 0 && tax === 0)) {
    amounts.push({ label: "Gross", value: transaction.gross_amount });
  }
  if (fee !== 0) amounts.push({ label: "Fee", value: transaction.fee_amount });
  if (tax !== 0) amounts.push({ label: "Tax", value: transaction.tax_amount });

  return amounts;
}

export const portfolioTransactionTypes = [
  "opening_balance",
  "buy",
  "sell",
  "contribution",
  "withdrawal",
  "distribution",
  "interest",
  "fee",
  "tax",
  "reinvestment",
] as const;

export const portfolioCashFlowScopes = [
  "external_in",
  "external_out",
  "internal",
  "non_cash",
] as const;

export type PortfolioTransactionType = (typeof portfolioTransactionTypes)[number];
export type PortfolioCashFlowScope = (typeof portfolioCashFlowScopes)[number];

export const portfolioTransactionScopeRules: Record<
  PortfolioTransactionType,
  readonly PortfolioCashFlowScope[]
> = {
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
};

type TransactionSemanticsInput = {
  transactionType: PortfolioTransactionType;
  cashFlowScope: PortfolioCashFlowScope;
  holdingId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  grossAmount: number;
  feeAmount: number;
  taxAmount: number;
};

export function validatePortfolioTransactionSemantics({
  transactionType,
  cashFlowScope,
  holdingId,
  quantity,
  unitPrice,
  grossAmount,
  feeAmount,
  taxAmount,
}: TransactionSemanticsInput) {
  if (!portfolioTransactionScopeRules[transactionType].includes(cashFlowScope)) {
    return "Cash-flow scope is incompatible with the transaction type.";
  }

  if (transactionType === "fee") {
    return grossAmount === 0 && feeAmount > 0 && taxAmount === 0 && quantity === null && unitPrice === null
      ? null
      : "A fee transaction requires zero gross and tax amounts, a positive fee amount, and no quantity or unit price.";
  }
  if (transactionType === "tax") {
    return grossAmount === 0 && feeAmount === 0 && taxAmount > 0 && quantity === null && unitPrice === null
      ? null
      : "A tax transaction requires zero gross and fee amounts, a positive tax amount, and no quantity or unit price.";
  }
  if (["buy", "sell", "reinvestment"].includes(transactionType)) {
    return holdingId && quantity !== null && quantity > 0 && grossAmount > 0
      ? null
      : "This trade transaction requires a holding, positive quantity, and positive gross amount.";
  }
  if (transactionType === "opening_balance") {
    return holdingId && quantity !== null && quantity > 0 && grossAmount > 0 && feeAmount === 0 && taxAmount === 0
      ? null
      : "An opening balance requires a holding, positive quantity and gross amount, and zero fee and tax amounts.";
  }
  return grossAmount > 0 && feeAmount === 0 && taxAmount === 0
    ? null
    : "This transaction type requires a positive gross amount and separate zero fee and tax amounts.";
}
