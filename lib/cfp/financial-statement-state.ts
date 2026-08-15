export type FinancialStatementState<T> =
  | {
      status: "error";
      error: string;
      items: null;
    }
  | {
      status: "empty" | "ready";
      error: null;
      items: T[];
    };

export function resolveFinancialStatementState<T>(
  items: T[] | null | undefined,
  error: string | null | undefined,
): FinancialStatementState<T> {
  if (error) {
    return { status: "error", error, items: null };
  }

  const availableItems = items ?? [];
  return {
    status: availableItems.length === 0 ? "empty" : "ready",
    error: null,
    items: availableItems,
  };
}
