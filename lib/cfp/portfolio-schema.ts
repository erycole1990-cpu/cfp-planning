export const portfolioFoundationMigration = "0030_portfolio_analysis.sql";

export type PortfolioDatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isMissingPortfolioSchema(error: PortfolioDatabaseError) {
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("investment_portfolios") ||
    message.includes("schema cache")
  );
}

export function portfolioDatabaseErrorMessage(
  error: PortfolioDatabaseError,
  operation: "load" | "save" = "load",
) {
  if (isMissingPortfolioSchema(error)) {
    return `Portfolio data is unavailable because the required database schema is missing or out of date. Apply migration ${portfolioFoundationMigration}, then retry.`;
  }
  return operation === "save"
    ? "Portfolio data could not be saved. Please retry. If the problem continues, contact support."
    : "Portfolio data could not be loaded. Please retry. If the problem continues, contact support.";
}

export function logPortfolioDatabaseError(
  context: string,
  error: PortfolioDatabaseError,
) {
  console.error("[investment-portfolios] database operation failed", {
    context,
    code: error.code || "unknown",
  });
}
