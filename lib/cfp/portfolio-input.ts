import {
  type PortfolioCashFlowScope,
  type PortfolioTransactionType,
  portfolioCashFlowScopes,
  portfolioTransactionTypes,
  validatePortfolioTransactionSemantics,
} from "./portfolio.ts";

export type PortfolioActionErrorCategory =
  | "validation"
  | "unavailable"
  | "conflict"
  | "unexpected";

export class PortfolioActionError extends Error {
  readonly category: PortfolioActionErrorCategory;

  constructor(category: PortfolioActionErrorCategory, message: string) {
    super(message);
    this.name = "PortfolioActionError";
    this.category = category;
  }
}

export const portfolioTypes = ["general", "retirement", "education", "income", "other"] as const;
export const portfolioInstrumentTypes = [
  "cash",
  "fixed_deposit",
  "bond",
  "equity",
  "etf",
  "unit_trust",
  "private_equity",
  "property_fund",
  "insurance_linked",
  "crypto",
  "commodity",
  "other",
] as const;
export const portfolioAssetClasses = [
  "cash",
  "fixed_income",
  "equity",
  "property",
  "alternatives",
  "mixed",
  "other",
] as const;
export const portfolioQuantityModes = ["units", "notional", "manual_value"] as const;
export const portfolioValuationScopes = ["holding", "portfolio"] as const;
export const portfolioValuationSources = ["manual", "provider_statement", "import"] as const;
export const portfolioEvidenceStatuses = ["unverified", "client_provided", "adviser_verified"] as const;

export function portfolioFormText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export function portfolioRequiredText(formData: FormData, key: string, label: string) {
  const value = portfolioFormText(formData, key);
  if (!value) throw new PortfolioActionError("validation", `${label} is required.`);
  return value;
}

export function portfolioChoice(
  formData: FormData,
  key: string,
  label: string,
  allowed: readonly string[],
) {
  const value = portfolioRequiredText(formData, key, label);
  if (!allowed.includes(value)) {
    throw new PortfolioActionError("validation", `${label} is invalid.`);
  }
  return value;
}

export function portfolioNonNegativeNumber(
  formData: FormData,
  key: string,
  label: string,
  options: { optional?: boolean; positive?: boolean } = {},
) {
  const raw = portfolioFormText(formData, key);
  if (raw === null && options.optional) return null;
  if (raw === null) throw new PortfolioActionError("validation", `${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (options.positive && value <= 0)) {
    throw new PortfolioActionError(
      "validation",
      `${label} must be ${options.positive ? "a positive" : "a non-negative"} number.`,
    );
  }
  return raw;
}

function portfolioCurrencyCode(formData: FormData, key: string, label: string) {
  const currency = portfolioRequiredText(formData, key, label).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new PortfolioActionError("validation", `${label} must be a three-letter currency code.`);
  }
  return currency;
}

function optionalRiskRating(formData: FormData) {
  const raw = portfolioFormText(formData, "risk_rating");
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    throw new PortfolioActionError(
      "validation",
      "Risk rating must be a whole number from 1 to 7.",
    );
  }
  return raw;
}

function optionalIdentifier(formData: FormData, key: string, label: string) {
  const value = portfolioFormText(formData, key);
  if (value === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PortfolioActionError("validation", `${label} is invalid.`);
  }
  return value;
}

function normalizedFxFields(formData: FormData, baseCurrency: string) {
  const currencyCode = portfolioCurrencyCode(formData, "currency_code", "Currency");
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();

  if (currencyCode === normalizedBaseCurrency) {
    return {
      currency_code: currencyCode,
      fx_rate_to_base: "1",
      fx_rate_date: null,
      fx_source: null,
    };
  }

  return {
    currency_code: currencyCode,
    fx_rate_to_base: portfolioNonNegativeNumber(
      formData,
      "fx_rate_to_base",
      "FX rate",
      { positive: true },
    ),
    fx_rate_date: portfolioRequiredText(formData, "fx_rate_date", "FX rate date"),
    fx_source: portfolioRequiredText(formData, "fx_source", "FX source"),
  };
}

export function buildInvestmentHoldingPayload(formData: FormData) {
  const riskRating = optionalRiskRating(formData);
  const riskSource = portfolioFormText(formData, "risk_source");
  if (riskRating !== null && riskSource === null) {
    throw new PortfolioActionError(
      "validation",
      "Risk source is required when a risk rating is provided.",
    );
  }

  return {
    name: portfolioRequiredText(formData, "name", "Holding name"),
    instrument_type: portfolioChoice(
      formData,
      "instrument_type",
      "Instrument type",
      portfolioInstrumentTypes,
    ),
    asset_class: portfolioChoice(
      formData,
      "asset_class",
      "Asset class",
      portfolioAssetClasses,
    ),
    geography_code: portfolioFormText(formData, "geography_code"),
    provider_name: portfolioFormText(formData, "provider_name"),
    symbol: portfolioFormText(formData, "symbol"),
    isin: portfolioFormText(formData, "isin"),
    currency_code: portfolioCurrencyCode(formData, "currency_code", "Currency"),
    quantity_mode: portfolioChoice(
      formData,
      "quantity_mode",
      "Quantity mode",
      portfolioQuantityModes,
    ),
    risk_rating: riskRating,
    risk_source: riskSource,
    risk_assessed_on: portfolioFormText(formData, "risk_assessed_on"),
    opened_on: portfolioFormText(formData, "opened_on"),
  };
}

export function buildInvestmentTransactionPayload(formData: FormData, baseCurrency: string) {
  const transactionType = portfolioChoice(
    formData,
    "transaction_type",
    "Transaction type",
    portfolioTransactionTypes,
  ) as PortfolioTransactionType;
  const cashFlowScope = portfolioChoice(
    formData,
    "cash_flow_scope",
    "Cash-flow scope",
    portfolioCashFlowScopes,
  ) as PortfolioCashFlowScope;
  const holdingId = optionalIdentifier(formData, "holding_id", "Holding");
  const quantity = portfolioNonNegativeNumber(formData, "quantity", "Quantity", { optional: true });
  const unitPrice = portfolioNonNegativeNumber(formData, "unit_price", "Unit price", { optional: true });
  const grossAmount = portfolioNonNegativeNumber(formData, "gross_amount", "Gross amount", { optional: true }) ?? "0";
  const feeAmount = portfolioNonNegativeNumber(formData, "fee_amount", "Fee amount", { optional: true }) ?? "0";
  const taxAmount = portfolioNonNegativeNumber(formData, "tax_amount", "Tax amount", { optional: true }) ?? "0";
  const semanticsError = validatePortfolioTransactionSemantics({
    transactionType,
    cashFlowScope,
    holdingId,
    quantity: quantity === null ? null : Number(quantity),
    unitPrice: unitPrice === null ? null : Number(unitPrice),
    grossAmount: Number(grossAmount),
    feeAmount: Number(feeAmount),
    taxAmount: Number(taxAmount),
  });
  if (semanticsError) throw new PortfolioActionError("validation", semanticsError);

  return {
    holding_id: holdingId,
    transaction_date: portfolioRequiredText(formData, "transaction_date", "Transaction date"),
    transaction_type: transactionType,
    quantity,
    unit_price: unitPrice,
    gross_amount: grossAmount,
    fee_amount: feeAmount,
    tax_amount: taxAmount,
    ...normalizedFxFields(formData, baseCurrency),
    cash_flow_scope: cashFlowScope,
    source_reference: portfolioFormText(formData, "source_reference"),
    notes: portfolioFormText(formData, "notes"),
  };
}

export function buildInvestmentValuationPayload(formData: FormData, baseCurrency: string) {
  const valuationScope = portfolioChoice(
    formData,
    "valuation_scope",
    "Valuation scope",
    portfolioValuationScopes,
  ) as (typeof portfolioValuationScopes)[number];
  const holdingId = optionalIdentifier(formData, "holding_id", "Holding");

  if (valuationScope === "portfolio" && holdingId !== null) {
    throw new PortfolioActionError(
      "validation",
      "Whole-portfolio valuations cannot select an individual holding.",
    );
  }
  if (valuationScope === "holding" && holdingId === null) {
    throw new PortfolioActionError(
      "validation",
      "Select a holding for a holding-level valuation.",
    );
  }

  return {
    valuation_scope: valuationScope,
    holding_id: holdingId,
    valuation_date: portfolioRequiredText(formData, "valuation_date", "Valuation date"),
    market_value: portfolioNonNegativeNumber(formData, "market_value", "Market value"),
    units: portfolioNonNegativeNumber(formData, "units", "Units", { optional: true }),
    unit_price: portfolioNonNegativeNumber(formData, "unit_price", "Unit price", { optional: true }),
    ...normalizedFxFields(formData, baseCurrency),
    source: portfolioChoice(formData, "source", "Valuation source", portfolioValuationSources),
    evidence_status: portfolioChoice(
      formData,
      "evidence_status",
      "Evidence status",
      portfolioEvidenceStatuses,
    ),
    evidence_note: portfolioFormText(formData, "evidence_note"),
    supersedes_valuation_id: optionalIdentifier(
      formData,
      "supersedes_valuation_id",
      "Superseded valuation",
    ),
  };
}
