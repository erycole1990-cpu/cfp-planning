export type ActivityWindowPresentation = {
  countLabel: string;
  disclosure: string | null;
};

export type ActivityLoadState<T> =
  | {
      status: "error";
      error: string;
      records: null;
      totalCount: null;
      countError: string | null;
    }
  | {
      status: "empty" | "ready";
      error: null;
      records: T[];
      totalCount: number | null;
      countError: string | null;
    };

export function resolveActivityTotalCount(
  count: number | null,
  countError: string | null,
) {
  return countError === null && typeof count === "number" ? count : null;
}

export function resolveActivityLoadState<T>({
  records,
  recordError,
  totalCount,
  countError,
}: {
  records: T[] | null | undefined;
  recordError: string | null;
  totalCount: number | null;
  countError: string | null;
}): ActivityLoadState<T> {
  if (recordError) {
    return {
      status: "error",
      error: recordError,
      records: null,
      totalCount: null,
      countError,
    };
  }

  const availableRecords = records ?? [];
  return {
    status: availableRecords.length === 0 ? "empty" : "ready",
    error: null,
    records: availableRecords,
    totalCount: resolveActivityTotalCount(totalCount, countError),
    countError,
  };
}

export function buildActivityWindowPresentation({
  loadedCount,
  filteredCount,
  totalCount,
  windowLimit,
  filterIsAll,
}: {
  loadedCount: number;
  filteredCount: number;
  totalCount: number | null;
  windowLimit: number;
  filterIsAll: boolean;
}): ActivityWindowPresentation {
  if (totalCount === null) {
    const countLabel = filterIsAll
      ? `Latest ${loadedCount} records · Total count unavailable`
      : `${filteredCount} matches in latest ${loadedCount} records · Total count unavailable`;
    return {
      countLabel,
      disclosure: `Filters and pages on this screen cover the latest ${loadedCount} loaded records. The total activity count is unavailable, so older records may exist and are not included in this view. This view loads at most ${windowLimit} records.`,
    };
  }

  if (totalCount > loadedCount) {
    return {
      countLabel: filterIsAll
        ? `Latest ${loadedCount} of ${totalCount} records`
        : `${filteredCount} matches in latest ${loadedCount} of ${totalCount} records`,
      disclosure: `Filters and pages on this screen cover the latest ${loadedCount} records. The full audit history contains ${totalCount} records; older records remain retained but are not included in this customer view. This view is capped at ${windowLimit} records.`,
    };
  }

  return {
    countLabel: `${filteredCount} records`,
    disclosure: null,
  };
}
