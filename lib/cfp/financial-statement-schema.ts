export const statementPlanningColumns = [
  "ownership_type",
  "valuation_basis",
  "liquidity_class",
  "evidence_status",
  "evidence_note",
  "interest_rate",
  "monthly_payment",
  "maturity_date",
  "cash_flow_nature",
  "budget_amount",
  "tax_deductible",
  "cash_treatment",
] as const;

export const financialStatementItemSelect =
  "id,created_at,customer_id,statement_type,item_type,category,description,amount,frequency,statement_date,ownership_type,valuation_basis,liquidity_class,evidence_status,evidence_note,interest_rate,monthly_payment,maturity_date,cash_flow_nature,budget_amount,tax_deductible,cash_treatment";

export const statementPlanningMigration = "0029_statement_planning_metadata.sql";

export type StatementDatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function financialStatementErrorCategory(error: StatementDatabaseError) {
  const sourceMessage = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedMessage = sourceMessage.toLowerCase();
  const missingPlanningColumn = statementPlanningColumns.some((column) =>
    normalizedMessage.includes(column),
  );
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    normalizedMessage.includes("schema cache") ||
    missingPlanningColumn
  )
    ? "missing_statement_planning_schema"
    : "statement_database_failure";
}

export function logFinancialStatementDatabaseError(
  context: string,
  error: StatementDatabaseError,
) {
  console.error("[financial-statements] database operation failed", {
    context,
    code: error.code || "unknown",
    category: financialStatementErrorCategory(error),
  });
}

export function financialStatementErrorMessage(
  error: StatementDatabaseError,
  operation: "load" | "save" = "load",
) {
  const schemaUnavailable =
    financialStatementErrorCategory(error) === "missing_statement_planning_schema";

  if (schemaUnavailable) {
    return `Financial statement planning data is unavailable because the required database schema is missing or out of date. Apply migration ${statementPlanningMigration}, then retry.`;
  }

  return operation === "save"
    ? "Financial statement data could not be saved. Please retry. If the problem continues, contact support."
    : "Financial statement data could not be loaded. Please retry. If the problem continues, contact support.";
}
