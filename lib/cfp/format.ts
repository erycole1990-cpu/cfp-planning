export const DEFAULT_PLANNING_TIME_ZONE = "Asia/Kuala_Lumpur";

export type CalendarDate = {
  isoDate: string;
  year: number;
  monthIndex: number;
  day: number;
  timeZone: string;
};

export type DateOnlyParts = Omit<CalendarDate, "isoDate" | "timeZone">;

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function planningTimeZone(
  configuredTimeZone = process.env.NEXT_PUBLIC_CFP_PLANNING_TIME_ZONE,
) {
  const candidate = configuredTimeZone?.trim() || DEFAULT_PLANNING_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_PLANNING_TIME_ZONE;
  }
}

export function parseDateOnly(value: string): DateOnlyParts | null {
  const match = dateOnlyPattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, monthIndex, day));
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== monthIndex ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, monthIndex, day };
}

function dateOnlyValue({ year, monthIndex, day }: DateOnlyParts) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calendarParts(instant: Date, timeZone: string, includeTime = false) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23" as const,
        }
      : {}),
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    monthIndex: Number(values.month) - 1,
    day: Number(values.day),
    hour: includeTime ? Number(values.hour) : 0,
    minute: includeTime ? Number(values.minute) : 0,
    second: includeTime ? Number(values.second) : 0,
  };
}

export function planningCalendarDate(
  instant: Date | string | number = new Date(),
  timeZone = planningTimeZone(),
): CalendarDate {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("Planning calendar requires a valid instant.");
  const resolvedTimeZone = planningTimeZone(timeZone);
  const parts = calendarParts(date, resolvedTimeZone);
  return {
    isoDate: dateOnlyValue(parts),
    year: parts.year,
    monthIndex: parts.monthIndex,
    day: parts.day,
    timeZone: resolvedTimeZone,
  };
}

export function planningToday(
  instant: Date | string | number = new Date(),
  timeZone = planningTimeZone(),
) {
  return planningCalendarDate(instant, timeZone).isoDate;
}

function dateOnlyDayNumber(parts: DateOnlyParts) {
  return Date.UTC(parts.year, parts.monthIndex, parts.day) / millisecondsPerDay;
}

export function planningDayNumber(
  value: string | Date,
  timeZone = planningTimeZone(),
) {
  const dateOnly = typeof value === "string" ? parseDateOnly(value) : null;
  const parts = dateOnly ?? planningCalendarDate(value, timeZone);
  return dateOnlyDayNumber(parts);
}

export function isPlanningDateBeforeToday(
  dateOnly: string,
  instant: Date | string | number = new Date(),
  timeZone = planningTimeZone(),
) {
  const target = parseDateOnly(dateOnly);
  if (!target) return false;
  const today = planningCalendarDate(instant, timeZone);
  return dateOnlyDayNumber(target) < dateOnlyDayNumber(today);
}

export function isPlanningDateWithinDays(
  dateOnly: string | null,
  days: number,
  instant: Date | string | number = new Date(),
  timeZone = planningTimeZone(),
) {
  if (!dateOnly || !Number.isInteger(days) || days < 0) return false;
  const target = parseDateOnly(dateOnly);
  if (!target) return false;
  const today = planningCalendarDate(instant, timeZone);
  const difference = dateOnlyDayNumber(target) - dateOnlyDayNumber(today);
  return difference >= 0 && difference <= days;
}

export function planningYearsUntil(
  targetDate: string,
  instant: Date | string | number = new Date(),
  timeZone = planningTimeZone(),
) {
  const target = parseDateOnly(targetDate);
  if (!target) return 0;
  const today = planningCalendarDate(instant, timeZone);
  const years = (dateOnlyDayNumber(target) - dateOnlyDayNumber(today)) / 365.25;
  return Math.max(0, Math.round(years * 10) / 10);
}

export function planningDateTimeIso(
  dateOnly: string,
  hour: number,
  minute = 0,
  timeZone = planningTimeZone(),
) {
  const target = parseDateOnly(dateOnly);
  if (!target || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Planning date and time are invalid.");
  }

  const resolvedTimeZone = planningTimeZone(timeZone);
  const desiredUtc = Date.UTC(target.year, target.monthIndex, target.day, hour, minute);
  let candidateUtc = desiredUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = calendarParts(new Date(candidateUtc), resolvedTimeZone, true);
    const observedUtc = Date.UTC(
      observed.year,
      observed.monthIndex,
      observed.day,
      observed.hour,
      observed.minute,
    );
    candidateUtc += desiredUtc - observedUtc;
  }

  return new Date(candidateUtc).toISOString();
}

export function formatMoney(
  value: number | string | null | undefined,
  currencyCode = "MYR",
) {
  const amount = Number(value ?? 0);
  const currency = currencyCode.trim().toUpperCase();
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrency(value: number | string | null | undefined) {
  return formatMoney(value, "MYR");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const dateOnly = parseDateOnly(value);
  const date = dateOnly
    ? new Date(Date.UTC(dateOnly.year, dateOnly.monthIndex, dateOnly.day))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: dateOnly ? "UTC" : planningTimeZone(),
  }).format(date);
}

export function dateTimeValue(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function toDateInputValue(
  date: Date,
  timeZone = planningTimeZone(),
) {
  return planningToday(date, timeZone);
}
