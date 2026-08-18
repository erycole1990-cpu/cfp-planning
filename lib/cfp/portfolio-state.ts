export type PortfolioCollectionState<T> =
  | { status: "error"; error: string; records: null }
  | { status: "empty" | "ready"; error: null; records: T[] };

export function resolvePortfolioCollectionState<T>(
  records: T[] | null | undefined,
  error: string | null | undefined,
): PortfolioCollectionState<T> {
  if (error) return { status: "error", error, records: null };
  const availableRecords = records ?? [];
  return {
    status: availableRecords.length ? "ready" : "empty",
    error: null,
    records: availableRecords,
  };
}

export type PortfolioFoundationState<T> =
  | { status: "error"; error: string; data: null }
  | { status: "ready"; error: null; data: T };

export function resolvePortfolioFoundationState<T>(
  data: T | null | undefined,
  error: string | null | undefined,
): PortfolioFoundationState<T> {
  if (error) return { status: "error", error, data: null };
  if (data === null || data === undefined) {
    return { status: "error", error: "Portfolio data was unavailable.", data: null };
  }
  return { status: "ready", error: null, data };
}
