"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAccessCustomer, canManageCustomer, requireCurrentAccess } from "@/lib/cfp/access";
import {
  buildInvestmentHoldingPayload,
  buildInvestmentTransactionPayload,
  buildInvestmentValuationPayload,
  PortfolioActionError,
  portfolioChoice,
  portfolioFormText,
  portfolioRequiredText,
  portfolioTypes,
} from "@/lib/cfp/portfolio-input";
import {
  logPortfolioDatabaseError,
  portfolioDatabaseErrorCategory,
  portfolioDatabaseErrorMessage,
  type PortfolioDatabaseError,
} from "@/lib/cfp/portfolio-schema";
import { createCfpServerClient, type Customer } from "@/lib/cfp/supabase";

function errorMessage(error: unknown) {
  return error instanceof PortfolioActionError
    ? error.message
    : "Portfolio data could not be saved. Please retry. If the problem continues, contact support.";
}

function errorDestination(path: string, context: string, error: unknown) {
  console.error("[investment-portfolios] action rejected", {
    context,
    category: error instanceof PortfolioActionError ? error.category : "unexpected",
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return `${path}?error=${encodeURIComponent(errorMessage(error))}`;
}

async function requirePortfolioSupabase() {
  const supabase = await createCfpServerClient();
  if (!supabase) {
    throw new PortfolioActionError("unavailable", "Portfolio database is not configured.");
  }
  return supabase;
}

async function requireManagedCustomer(customerId: string) {
  const access = await requireCurrentAccess();
  const supabase = await requirePortfolioSupabase();
  const result = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (result.error) {
    logPortfolioDatabaseError("portfolioAction.customer", result.error);
    throw new PortfolioActionError("unavailable", "Customer access could not be verified.");
  }
  const customer = result.data as Customer | null;
  if (!customer || !canAccessCustomer(access, customer) || !canManageCustomer(access, customer)) {
    throw new PortfolioActionError(
      "unavailable",
      "This customer is unavailable or you are not allowed to manage their portfolios.",
    );
  }
  return { supabase, customer };
}

async function requireManagedPortfolio(customerId: string, portfolioId: string) {
  const context = await requireManagedCustomer(customerId);
  const result = await context.supabase
    .from("investment_portfolios")
    .select("id,customer_id,base_currency")
    .eq("id", portfolioId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (result.error) {
    logPortfolioDatabaseError("portfolioAction.portfolio", result.error);
    const category = portfolioDatabaseErrorCategory(result.error);
    throw new PortfolioActionError(
      category === "schema" ? "unavailable" : category,
      portfolioDatabaseErrorMessage(result.error),
    );
  }
  if (!result.data) {
    throw new PortfolioActionError(
      "unavailable",
      "This portfolio is unavailable or does not belong to the selected customer.",
    );
  }
  return { ...context, portfolio: result.data };
}

function assertRpcSucceeded(
  context: string,
  error: PortfolioDatabaseError | null,
) {
  if (!error) return;
  logPortfolioDatabaseError(context, error);
  const category = portfolioDatabaseErrorCategory(error);
  throw new PortfolioActionError(
    category === "schema" ? "unavailable" : category,
    portfolioDatabaseErrorMessage(error, "save"),
  );
}

function portfolioPath(customerId: string, portfolioId?: string) {
  return portfolioId
    ? `/customers/${customerId}/portfolios/${portfolioId}`
    : `/customers/${customerId}/portfolios`;
}

export async function createInvestmentPortfolio(formData: FormData) {
  const customerId = portfolioFormText(formData, "customer_id") || "";
  const path = portfolioPath(customerId);
  try {
    if (!customerId) throw new PortfolioActionError("validation", "Customer is required.");
    const { supabase } = await requireManagedCustomer(customerId);
    const result = await supabase.rpc("cfp_create_investment_portfolio", {
      target_customer_id: customerId,
      portfolio_payload: {
        name: portfolioRequiredText(formData, "name", "Portfolio name"),
        portfolio_type: portfolioChoice(formData, "portfolio_type", "Portfolio type", portfolioTypes),
        objective: portfolioFormText(formData, "objective"),
        base_currency: portfolioRequiredText(formData, "base_currency", "Base currency").toUpperCase(),
        custodian_provider: portfolioFormText(formData, "custodian_provider"),
        account_reference: portfolioFormText(formData, "account_reference"),
        inception_date: portfolioFormText(formData, "inception_date"),
      },
    });
    assertRpcSucceeded("createInvestmentPortfolio", result.error);
  } catch (error) {
    redirect(errorDestination(path, "createInvestmentPortfolio", error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=portfolio`);
}

export async function createInvestmentHolding(formData: FormData) {
  const customerId = portfolioFormText(formData, "customer_id") || "";
  const portfolioId = portfolioFormText(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) {
      throw new PortfolioActionError("validation", "Customer and portfolio are required.");
    }
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const result = await supabase.rpc("cfp_create_investment_holding", {
      target_portfolio_id: portfolioId,
      holding_payload: buildInvestmentHoldingPayload(formData),
    });
    assertRpcSucceeded("createInvestmentHolding", result.error);
  } catch (error) {
    redirect(errorDestination(path, "createInvestmentHolding", error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=holding`);
}

export async function recordInvestmentTransaction(formData: FormData) {
  const customerId = portfolioFormText(formData, "customer_id") || "";
  const portfolioId = portfolioFormText(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) {
      throw new PortfolioActionError("validation", "Customer and portfolio are required.");
    }
    const { supabase, portfolio } = await requireManagedPortfolio(customerId, portfolioId);
    const result = await supabase.rpc("cfp_record_investment_transaction", {
      target_portfolio_id: portfolioId,
      transaction_payload: buildInvestmentTransactionPayload(formData, portfolio.base_currency),
    });
    assertRpcSucceeded("recordInvestmentTransaction", result.error);
  } catch (error) {
    redirect(errorDestination(path, "recordInvestmentTransaction", error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=transaction`);
}

export async function reverseInvestmentTransaction(formData: FormData) {
  const customerId = portfolioFormText(formData, "customer_id") || "";
  const portfolioId = portfolioFormText(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) {
      throw new PortfolioActionError("validation", "Customer and portfolio are required.");
    }
    const { supabase } = await requireManagedPortfolio(customerId, portfolioId);
    const transactionId = portfolioRequiredText(formData, "transaction_id", "Transaction");
    const belongs = await supabase
      .from("investment_transactions")
      .select("id")
      .eq("id", transactionId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (belongs.error) {
      logPortfolioDatabaseError("reverseInvestmentTransaction.lookup", belongs.error);
      throw new PortfolioActionError(
        "unavailable",
        "The transaction is unavailable or you are not authorized to reverse it.",
      );
    }
    if (!belongs.data) {
      throw new PortfolioActionError(
        "unavailable",
        "The transaction is unavailable or you are not authorized to reverse it.",
      );
    }
    const result = await supabase.rpc("cfp_reverse_investment_transaction", {
      original_transaction_id: transactionId,
      reversal_date: portfolioRequiredText(formData, "reversal_date", "Reversal date"),
      reversal_notes: portfolioFormText(formData, "reversal_notes"),
    });
    assertRpcSucceeded("reverseInvestmentTransaction", result.error);
  } catch (error) {
    redirect(errorDestination(path, "reverseInvestmentTransaction", error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=reversal`);
}

export async function recordInvestmentValuation(formData: FormData) {
  const customerId = portfolioFormText(formData, "customer_id") || "";
  const portfolioId = portfolioFormText(formData, "portfolio_id") || "";
  const path = portfolioPath(customerId, portfolioId);
  try {
    if (!customerId || !portfolioId) {
      throw new PortfolioActionError("validation", "Customer and portfolio are required.");
    }
    const { supabase, portfolio } = await requireManagedPortfolio(customerId, portfolioId);
    const valuationPayload = buildInvestmentValuationPayload(formData, portfolio.base_currency);
    if (valuationPayload.holding_id) {
      const holding = await supabase
        .from("investment_holdings")
        .select("id")
        .eq("id", valuationPayload.holding_id)
        .eq("portfolio_id", portfolioId)
        .maybeSingle();
      if (holding.error) {
        logPortfolioDatabaseError("recordInvestmentValuation.holding", holding.error);
        throw new PortfolioActionError(
          "unavailable",
          "The selected holding is unavailable or does not belong to this portfolio.",
        );
      }
      if (!holding.data) {
        throw new PortfolioActionError(
          "unavailable",
          "The selected holding is unavailable or does not belong to this portfolio.",
        );
      }
    }
    const result = await supabase.rpc("cfp_record_investment_valuation", {
      target_portfolio_id: portfolioId,
      valuation_payload: valuationPayload,
    });
    assertRpcSucceeded("recordInvestmentValuation", result.error);
  } catch (error) {
    redirect(errorDestination(path, "recordInvestmentValuation", error));
  }
  revalidatePath(path);
  redirect(`${path}?saved=valuation`);
}
