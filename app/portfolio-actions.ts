"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAccessCustomer, canManageCustomer, requireCurrentAccess } from "@/lib/cfp/access";
import {
  type PortfolioCashFlowScope,
  type PortfolioTransactionType,
  portfolioCashFlowScopes,
  portfolioTransactionTypes,
  validatePortfolioTransactionSemantics,
} from "@/lib/cfp/portfolio";
import {
  logPortfolioDatabaseError,
  portfolioDatabaseErrorMessage,
  type PortfolioDatabaseError,
} from "@/lib/cfp/portfolio-schema";
import { createCfpServerClient, type Customer } from "@/lib/cfp/supabase";

const portfolioTypes = ["general", "retirement", "education", "income", "other"] as const;
const instrumentTypes = [
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
const assetClasses = [
  "cash",
  "fixed_income",
  "equity",
  "property",
  "alternatives",
  "mixed",
  "other",
] as const;
const quantityModes = ["units", "notional", "manual_value"] as const;
const valuationScopes = ["holding", "portfolio"] as const;
const valuationSources = ["manual", "provider_statement", "import"] as const;
const evidenceStatuses = ["unverified", "client_provided", "adviser_verified"] as const;

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function choice(
  formData: FormData,
  key: string,
  label: string,
  allowed: readonly string[],
) {
  const value = requiredText(formData, key, label);
  if (!allowed.includes(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function nonNegativeNumber(
  formData: FormData,
  key: string,
  label: string,
  options: { optional?: boolean; positive?: boolean } = {},
) {
  const raw = text(formData, key);
  if (raw === null && options.optional) return null;
  if (raw === null) throw new Error(`${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (options.positive && value <= 0)) {
    throw new Error(`${label} must be ${options.positive ? "a positive" : "a non-negative"} number.`);
  }
  return raw;
}

function optionalRiskRating(formData: FormData) {
  const raw = text(formData, "risk_rating");
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    throw new Error("Risk rating must be a whole number from 1 to 7.");
  }
  return raw;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Portfolio data could not be saved.";
}

function errorDestination(path: string, error: unknown) {
  return `${path}?error=${encodeURIComponent(errorMessage(error))}`;
}

async function requirePortfolioSupabase() {
  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("Portfolio database is not configured.");
  return supabase;
}

async function requireManagedCustomer(customerId: string) {
  const access = await requireCurrentAccess();
  const supabase = await requirePortfolioSupabase();
  const result = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (result.error) {
    logPortfolioDatabaseError("portfolioAction.customer", result.error);
    throw new Error("Customer access could not be verified.");
  }
  const customer = result.data as Customer | null;
  if (!customer || !canAccessCustomer(access, customer) || !canManageCustomer(access, customer)) {
    throw new Error("You are not allowed to manage this customer's portfolios.");
  }
  return { supabase, customer };
}

async function requireManagedPortfolio(customerId: string, portfolioId: string) {
  const context = await requireManagedCustomer(customerId);
  const result = await context.supabase
    .from("investment_portfolios")
    .select("id,customer_id")
    .eq("id", portfolioId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (result.error) {
    logPortfolioDatabaseError("portfolioAction.portfolio", result.error);
    throw new Error(portfolioDatabaseErrorMessage(result.error));
  }
  if (!result.data) throw new Error("Portfolio was not found for this customer.");
  return context;
}

function assertRpcSucceeded(
  context: string,
  error: PortfolioDatabaseError | null,
) {
  if (!error) return;
  logPortfolioDatabaseError(context, error);
  throw new Error(portfolioDatabaseErrorMessage(error, "save"));
}

function portfolioPath(customerId: string, portfolioId?: string) {
  return portfolioId
    ? `/customers/${customerId}/portfolios/${portfolioId}`
    : `/customers/${customerId}/portfolios`;
}

export async function createInvestmentPortfolio(formData: FormData) {
  const customerId = text(formData, "customer_id") || "";
  const path = portfolioPath(customerId);
  try {
    if (!customerId) throw new Error("Customer is required.");
    const { supabase } = await requireManagedCustomer(customerId);
    const result = await supabase.rpc("cfp_create_investment_portfolio", {
      target_customer_id: customerId,
      portfolio_payload: {
        name: requiredText(formData, "name", "Portfolio name"),
        portfolio_type: choice(formData, "portfolio_type", "Portfolio type", portfolioTypes),
        objective: text(formData, "objective"),
        base_currency: requiredText(formData, "base_currency", "Base currency").toUpperCase(),
        custodian_provider: text(formData, "custodian_provider"),
        account_reference: text(formData, "account_reference"),
        inception_date: text(formData, "inception_date"),
      },
    });
    assertRpcSucceeded("createInvestmentPortfolio", result.error);
  } catch (error) {
    redirect(errorDestination(path, error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=portfolio`);
}

export async function createInvestmentHolding(formData: FormData) {
  const customerId = text(formData, "customer_id") || "";
  const portfolioId = text(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) throw new Error("Customer and portfolio are required.");
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const result = await supabase.rpc("cfp_create_investment_holding", {
      target_portfolio_id: portfolioId,
      holding_payload: {
        name: requiredText(formData, "name", "Holding name"),
        instrument_type: choice(formData, "instrument_type", "Instrument type", instrumentTypes),
        asset_class: choice(formData, "asset_class", "Asset class", assetClasses),
        geography_code: text(formData, "geography_code"),
        provider_name: text(formData, "provider_name"),
        symbol: text(formData, "symbol"),
        isin: text(formData, "isin"),
        currency_code: requiredText(formData, "currency_code", "Currency").toUpperCase(),
        quantity_mode: choice(formData, "quantity_mode", "Quantity mode", quantityModes),
        risk_rating: optionalRiskRating(formData),
        risk_source: text(formData, "risk_source"),
        risk_assessed_on: text(formData, "risk_assessed_on"),
        opened_on: text(formData, "opened_on"),
      },
    });
    assertRpcSucceeded("createInvestmentHolding", result.error);
  } catch (error) {
    redirect(errorDestination(path, error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=holding`);
}

export async function recordInvestmentTransaction(formData: FormData) {
  const customerId = text(formData, "customer_id") || "";
  const portfolioId = text(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) throw new Error("Customer and portfolio are required.");
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const transactionType = choice(
      formData,
      "transaction_type",
      "Transaction type",
      portfolioTransactionTypes,
    ) as PortfolioTransactionType;
    const cashFlowScope = choice(
      formData,
      "cash_flow_scope",
      "Cash-flow scope",
      portfolioCashFlowScopes,
    ) as PortfolioCashFlowScope;
    const holdingId = text(formData, "holding_id");
    const quantity = nonNegativeNumber(formData, "quantity", "Quantity", { optional: true });
    const unitPrice = nonNegativeNumber(formData, "unit_price", "Unit price", { optional: true });
    const grossAmount = nonNegativeNumber(formData, "gross_amount", "Gross amount", { optional: true }) ?? "0";
    const feeAmount = nonNegativeNumber(formData, "fee_amount", "Fee amount", { optional: true }) ?? "0";
    const taxAmount = nonNegativeNumber(formData, "tax_amount", "Tax amount", { optional: true }) ?? "0";
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
    if (semanticsError) throw new Error(semanticsError);
    const result = await supabase.rpc("cfp_record_investment_transaction", {
      target_portfolio_id: portfolioId,
      transaction_payload: {
        holding_id: holdingId,
        transaction_date: requiredText(formData, "transaction_date", "Transaction date"),
        transaction_type: transactionType,
        quantity,
        unit_price: unitPrice,
        gross_amount: grossAmount,
        fee_amount: feeAmount,
        tax_amount: taxAmount,
        currency_code: requiredText(formData, "currency_code", "Currency").toUpperCase(),
        fx_rate_to_base: nonNegativeNumber(formData, "fx_rate_to_base", "FX rate", { positive: true }),
        fx_rate_date: text(formData, "fx_rate_date"),
        fx_source: text(formData, "fx_source"),
        cash_flow_scope: cashFlowScope,
        source_reference: text(formData, "source_reference"),
        notes: text(formData, "notes"),
      },
    });
    assertRpcSucceeded("recordInvestmentTransaction", result.error);
  } catch (error) {
    redirect(errorDestination(path, error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=transaction`);
}

export async function reverseInvestmentTransaction(formData: FormData) {
  const customerId = text(formData, "customer_id") || "";
  const portfolioId = text(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) throw new Error("Customer and portfolio are required.");
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const transactionId = requiredText(formData, "transaction_id", "Transaction");
    const belongs = await supabase
      .from("investment_transactions")
      .select("id")
      .eq("id", transactionId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (belongs.error || !belongs.data) throw new Error("Transaction was not found for this portfolio.");
    const result = await supabase.rpc("cfp_reverse_investment_transaction", {
      original_transaction_id: transactionId,
      reversal_date: requiredText(formData, "reversal_date", "Reversal date"),
      reversal_notes: text(formData, "reversal_notes"),
    });
    assertRpcSucceeded("reverseInvestmentTransaction", result.error);
  } catch (error) {
    redirect(errorDestination(path, error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=reversal`);
}

export async function recordInvestmentValuation(formData: FormData) {
  const customerId = text(formData, "customer_id") || "";
  const portfolioId = text(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) throw new Error("Customer and portfolio are required.");
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const result = await supabase.rpc("cfp_record_investment_valuation", {
      target_portfolio_id: portfolioId,
      valuation_payload: {
        valuation_scope: choice(formData, "valuation_scope", "Valuation scope", valuationScopes),
        holding_id: text(formData, "holding_id"),
        valuation_date: requiredText(formData, "valuation_date", "Valuation date"),
        market_value: nonNegativeNumber(formData, "market_value", "Market value"),
        units: nonNegativeNumber(formData, "units", "Units", { optional: true }),
        unit_price: nonNegativeNumber(formData, "unit_price", "Unit price", { optional: true }),
        currency_code: requiredText(formData, "currency_code", "Currency").toUpperCase(),
        fx_rate_to_base: nonNegativeNumber(formData, "fx_rate_to_base", "FX rate", { positive: true }),
        fx_rate_date: text(formData, "fx_rate_date"),
        fx_source: text(formData, "fx_source"),
        source: choice(formData, "source", "Valuation source", valuationSources),
        evidence_status: choice(
          formData,
          "evidence_status",
          "Evidence status",
          evidenceStatuses,
        ),
        evidence_note: text(formData, "evidence_note"),
        supersedes_valuation_id: text(formData, "supersedes_valuation_id"),
      },
    });
    assertRpcSucceeded("recordInvestmentValuation", result.error);
  } catch (error) {
    redirect(errorDestination(path, error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=valuation`);
}
