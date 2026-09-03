export const portfolioFoundationMigration = "0030_portfolio_analysis.sql";

export type PortfolioDatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type PortfolioDatabaseErrorCategory =
  | "schema"
  | "validation"
  | "unavailable"
  | "conflict"
  | "unexpected";

function isMissingPortfolioSchema(error: PortfolioDatabaseError) {
  const code = (error.code || "").toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  if (code) return false;

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /could not find (?:the )?(?:table|relation|function)\b.*\bschema cache\b/.test(
    message,
  );
}

export function portfolioDatabaseErrorCategory(
  error: PortfolioDatabaseError,
): PortfolioDatabaseErrorCategory {
  const code = (error.code || "").toUpperCase();
  if (code === "23505") return "conflict";
  if (["42501", "P0002", "PGRST116", "PGRST301", "PGRST302"].includes(code)) {
    return "unavailable";
  }
  if (
    code.startsWith("22") ||
    ["23502", "23503", "23514", "PGRST100", "PGRST102"].includes(code)
  ) {
    return "validation";
  }
  if (isMissingPortfolioSchema(error)) return "schema";
  return "unexpected";
}

export function portfolioDatabaseErrorMessage(
  error: PortfolioDatabaseError,
  operation: "load" | "save" = "load",
) {
  const category = portfolioDatabaseErrorCategory(error);
  if (category === "schema") {
    return `Portfolio data is unavailable because the required database schema is missing or out of date. Apply migration ${portfolioFoundationMigration}, then retry.`;
  }
  if (operation === "load") {
    return category === "unavailable"
      ? "Portfolio data is unavailable or you do not have permission to view it."
      : "Portfolio data could not be loaded. Please retry. If the problem continues, contact support.";
  }
  if (category === "validation") {
    return "Portfolio details could not be saved because one or more values are invalid. Review the form and try again.";
  }
  if (category === "unavailable") {
    return "This portfolio record is unavailable or you are not authorized to change it.";
  }
  if (category === "conflict") {
    return "This portfolio entry conflicts with an existing record. Review the current portfolio history and try again.";
  }
  return "Portfolio data could not be saved. Please retry. If the problem continues, contact support.";
}

export function logPortfolioDatabaseError(
  context: string,
  error: PortfolioDatabaseError,
) {
  console.error("[investment-portfolios] database operation failed", {
    context,
    code: error.code || "unknown",
    category: portfolioDatabaseErrorCategory(error),
  });
}
