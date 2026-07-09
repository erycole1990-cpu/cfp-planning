export type RagStatus = "on_track" | "at_risk" | "off_track" | "unreviewed";

export function calculateOnTrackStatus(input: {
  currentAmount: number;
  targetAmount: number;
  createdAt: string | Date;
  targetDate: string | Date;
  now?: Date;
}): RagStatus {
  const targetAmount = Number(input.targetAmount);
  const currentAmount = Number(input.currentAmount);

  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return "unreviewed";
  if (!Number.isFinite(currentAmount)) return "unreviewed";

  const createdAt = new Date(input.createdAt);
  const targetDate = new Date(input.targetDate);
  const now = input.now ?? new Date();

  const totalMs = targetDate.getTime() - createdAt.getTime();
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return currentAmount >= targetAmount ? "on_track" : "off_track";
  }

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const pctTimeElapsed = Math.min(1, elapsedMs / totalMs);
  const pctAmountAchieved = currentAmount / targetAmount;

  if (pctAmountAchieved >= pctTimeElapsed) return "on_track";
  if (pctAmountAchieved >= pctTimeElapsed - 0.1) return "at_risk";
  return "off_track";
}

export function statusLabel(status: RagStatus | string | null | undefined) {
  switch (status) {
    case "on_track":
      return "On Track";
    case "at_risk":
      return "At Risk";
    case "off_track":
      return "Off Track";
    default:
      return "Unreviewed";
  }
}

export function statusRank(status: string | null | undefined) {
  switch (status) {
    case "off_track":
      return 0;
    case "at_risk":
      return 1;
    case "on_track":
      return 2;
    default:
      return 3;
  }
}
