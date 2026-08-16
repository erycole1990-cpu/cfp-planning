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

export type FinancialStatementReportState<TItem, TReport> =
  | {
      status: "error";
      error: string;
      items: null;
      report: null;
    }
  | {
      status: "empty" | "ready";
      error: null;
      items: TItem[];
      report: TReport;
    };

export function resolveFinancialStatementReportState<TItem, TReport>(
  items: TItem[] | null | undefined,
  error: string | null | undefined,
  buildReport: (availableItems: TItem[]) => TReport,
): FinancialStatementReportState<TItem, TReport> {
  const state = resolveFinancialStatementState(items, error);
  if (state.status === "error") {
    return { ...state, report: null };
  }

  return {
    ...state,
    report: buildReport(state.items),
  };
}
