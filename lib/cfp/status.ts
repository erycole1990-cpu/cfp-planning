import { planningDayNumber, planningTimeZone } from "./format.ts";

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
  timeZone?: string;
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

  const now = input.now ?? new Date();
  const progressRatio = currentAmount / targetAmount;
  const progressPercent = percent(progressRatio);

  let createdDay: number;
  let targetDay: number;
  let currentDay: number;
  try {
    const timeZone = planningTimeZone(input.timeZone);
    createdDay = planningDayNumber(input.createdAt, timeZone);
    targetDay = planningDayNumber(input.targetDate, timeZone);
    currentDay = planningDayNumber(now, timeZone);
  } catch {
    return {
      status: "unreviewed",
      score: null,
      progressPercent,
      expectedPercent: null,
      reasons: ["Add valid creation and target dates before goal health can be assessed."],
    };
  }

  const totalDays = targetDay - createdDay;
  if (totalDays <= 0) {
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

  const elapsedDays = Math.max(0, currentDay - createdDay);
  const timeRatio = clamp(elapsedDays / totalDays, 0, 1);
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
