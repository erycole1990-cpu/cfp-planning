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

type StatementDatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function financialStatementErrorMessage(error: StatementDatabaseError) {
  const sourceMessage = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedMessage = sourceMessage.toLowerCase();
  const missingPlanningColumn = statementPlanningColumns.some((column) =>
    normalizedMessage.includes(column),
  );
  const schemaUnavailable =
    error.code === "PGRST204" ||
    error.code === "42703" ||
    normalizedMessage.includes("schema cache") ||
    missingPlanningColumn;

  if (schemaUnavailable) {
    return `Financial statement planning data is unavailable because the required database schema is missing or out of date. Apply migration ${statementPlanningMigration}, then retry.`;
  }

  return sourceMessage || "Financial statement data could not be loaded. Please retry.";
}
