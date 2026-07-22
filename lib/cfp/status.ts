export type RagStatus = "on_track" | "at_risk" | "off_track" | "unreviewed";

export type GoalHealthEvaluation = {
  status: RagStatus;
  score: number | null;
  progressPercent: number;
  expectedPercent: number | null;
  reasons: string[];
};

type GoalHealthInput = {
  currentAmount: number;
  targetAmount: number;
  createdAt: string | Date;
  targetDate: string | Date;
  now?: Date;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const percent = (ratio: number) => Math.round(clamp(ratio, 0, 1) * 100);

export function evaluateGoalHealth(input: GoalHealthInput): GoalHealthEvaluation {
  const targetAmount = Number(input.targetAmount);
  const currentAmount = Number(input.currentAmount);

  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return {
      status: "unreviewed",
      score: null,
      progressPercent: 0,
      expectedPercent: null,
      reasons: ["Add a valid target amount before goal health can be assessed."],
    };
  }
  if (!Number.isFinite(currentAmount) || currentAmount < 0) {
    return {
      status: "unreviewed",
      score: null,
      progressPercent: 0,
      expectedPercent: null,
      reasons: ["Add a valid current amount before goal health can be assessed."],
    };
  }

  const createdAt = new Date(input.createdAt);
  const targetDate = new Date(input.targetDate);
  const now = input.now ?? new Date();
  const progressRatio = currentAmount / targetAmount;
  const progressPercent = percent(progressRatio);

  const totalMs = targetDate.getTime() - createdAt.getTime();
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(targetDate.getTime())) {
    return {
      status: "unreviewed",
      score: null,
      progressPercent,
      expectedPercent: null,
      reasons: ["Add valid creation and target dates before goal health can be assessed."],
    };
  }

  if (totalMs <= 0) {
    const complete = currentAmount >= targetAmount;
    return {
      status: complete ? "on_track" : "off_track",
      score: complete ? 100 : progressPercent,
      progressPercent,
      expectedPercent: 100,
      reasons: [
        complete
          ? "The goal is fully funded."
          : `The target date has passed and the goal is ${progressPercent}% funded.`,
      ],
    };
  }

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const timeRatio = clamp(elapsedMs / totalMs, 0, 1);
  const expectedPercent = percent(timeRatio);
  const funded = progressRatio >= 1;
  const status: RagStatus = funded || progressRatio >= timeRatio ? "on_track" : progressRatio >= timeRatio - 0.1 ? "at_risk" : "off_track";
  const score = funded ? 100 : Math.round(clamp(75 + (progressRatio - timeRatio) * 125, 0, 99));
  const timingReason = `${progressPercent}% funded while ${expectedPercent}% of the available time has passed.`;
  const statusReason =
    status === "on_track"
      ? funded
        ? "The goal is fully funded."
        : "Funding progress is meeting or exceeding the time-based pace."
      : status === "at_risk"
        ? "Funding is behind pace, but by no more than 10 percentage points."
        : timeRatio >= 1
          ? "The target date has arrived and the goal is not fully funded."
          : "Funding is more than 10 percentage points behind the time-based pace.";

  return { status, score, progressPercent, expectedPercent, reasons: [timingReason, statusReason] };
}

export function calculateOnTrackStatus(input: GoalHealthInput): RagStatus {
  return evaluateGoalHealth(input).status;
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
