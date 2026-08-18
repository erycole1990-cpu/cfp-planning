import "server-only";

import {
  canAccessCustomer,
  canManageCustomer,
  requireCurrentAccess,
} from "./access";
import {
  type InvestmentHolding,
  type InvestmentPortfolio,
  type InvestmentTransaction,
  type InvestmentValuation,
} from "./portfolio";
import {
  logPortfolioDatabaseError,
  portfolioDatabaseErrorMessage,
} from "./portfolio-schema";
import {
  resolvePortfolioCollectionState,
  resolvePortfolioFoundationState,
} from "./portfolio-state";
import { createCfpServerClient, type Customer } from "./supabase";

export const portfolioTransactionPageSize = 20;

async function loadAccessibleCustomer(customerId: string) {
  const access = await requireCurrentAccess();
  const supabase = await createCfpServerClient();
  if (!supabase) return { access, supabase: null, customer: null, error: null };

  const result = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (result.error) {
    logPortfolioDatabaseError("loadAccessibleCustomer", result.error);
    return {
      access,
      supabase,
      customer: null,
      error: "Customer data could not be loaded. Please retry. If the problem continues, contact support.",
    };
  }
  const customer = result.data as Customer | null;
  if (!customer || !canAccessCustomer(access, customer)) {
    return { access, supabase, customer: null, error: "Customer was not found or is not available to this login." };
  }
  return { access, supabase, customer, error: null };
}

export async function getCustomerPortfolioData(customerId: string) {
  const context = await loadAccessibleCustomer(customerId);
  if (!context.supabase) {
    return {
      configured: false,
      customer: context.customer,
      canManage: false,
      portfolios: resolvePortfolioCollectionState<InvestmentPortfolio>(null, "Portfolio database is not configured."),
    };
  }
  if (!context.customer || context.error) {
    return {
      configured: true,
      customer: context.customer,
      canManage: false,
      portfolios: resolvePortfolioCollectionState<InvestmentPortfolio>(null, context.error),
    };
  }

  const result = await context.supabase
    .from("investment_portfolios")
    .select("*")
    .eq("customer_id", customerId)
    .order("status", { ascending: true })
    .order("name", { ascending: true });
  if (result.error) {
    logPortfolioDatabaseError("getCustomerPortfolioData", result.error);
  }
  return {
    configured: true,
    customer: context.customer,
    canManage: canManageCustomer(context.access, context.customer),
    portfolios: resolvePortfolioCollectionState(
      result.data as InvestmentPortfolio[] | null,
      result.error ? portfolioDatabaseErrorMessage(result.error) : null,
    ),
  };
}

export async function getPortfolioDetailData(
  customerId: string,
  portfolioId: string,
  requestedPage: number,
) {
  const context = await loadAccessibleCustomer(customerId);
  if (!context.supabase) {
    return {
      configured: false,
      customer: context.customer,
      canManage: false,
      detail: resolvePortfolioFoundationState(null, "Portfolio database is not configured."),
    };
  }
  if (!context.customer || context.error) {
    return {
      configured: true,
      customer: context.customer,
      canManage: false,
      detail: resolvePortfolioFoundationState(null, context.error),
    };
  }

  const portfolioResult = await context.supabase
    .from("investment_portfolios")
    .select("*")
    .eq("id", portfolioId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (portfolioResult.error) {
    logPortfolioDatabaseError("getPortfolioDetailData.portfolio", portfolioResult.error);
    return {
      configured: true,
      customer: context.customer,
      canManage: canManageCustomer(context.access, context.customer),
      detail: resolvePortfolioFoundationState(
        null,
        portfolioDatabaseErrorMessage(portfolioResult.error),
      ),
    };
  }
  if (!portfolioResult.data) {
    return {
      configured: true,
      customer: context.customer,
      canManage: canManageCustomer(context.access, context.customer),
      detail: resolvePortfolioFoundationState(null, "Portfolio was not found for this customer."),
    };
  }

  const requestedTransactionPage = Math.max(1, Math.floor(requestedPage) || 1);
  const [holdingsResult, transactionCountResult, valuationsResult] = await Promise.all([
    context.supabase
      .from("investment_holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .order("status", { ascending: true })
      .order("name", { ascending: true }),
    context.supabase
      .from("investment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolioId),
    context.supabase
      .from("investment_valuations")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .order("valuation_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const initialQueryError =
    holdingsResult.error || transactionCountResult.error || valuationsResult.error;
  if (initialQueryError) {
    logPortfolioDatabaseError("getPortfolioDetailData.children", initialQueryError);
    return {
      configured: true,
      customer: context.customer,
      canManage: canManageCustomer(context.access, context.customer),
      detail: resolvePortfolioFoundationState(
        null,
        portfolioDatabaseErrorMessage(initialQueryError),
      ),
    };
  }

  const transactionCount = transactionCountResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(transactionCount / portfolioTransactionPageSize));
  const resolvedPage = Math.min(requestedTransactionPage, totalPages);
  const from = (resolvedPage - 1) * portfolioTransactionPageSize;
  const to = from + portfolioTransactionPageSize - 1;
  const transactionsResult = await context.supabase
    .from("investment_transactions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const queryError = transactionsResult.error;
  if (queryError) {
    logPortfolioDatabaseError("getPortfolioDetailData.transactions", queryError);
  }

  return {
    configured: true,
    customer: context.customer,
    canManage: canManageCustomer(context.access, context.customer),
    detail: resolvePortfolioFoundationState(
      queryError
        ? null
        : {
            portfolio: portfolioResult.data as InvestmentPortfolio,
            holdings: holdingsResult.data as InvestmentHolding[],
            transactions: transactionsResult.data as InvestmentTransaction[],
            valuations: valuationsResult.data as InvestmentValuation[],
            transactionPage: resolvedPage,
            transactionTotalPages: totalPages,
            transactionCount,
          },
      queryError ? portfolioDatabaseErrorMessage(queryError) : null,
    ),
  };
}
