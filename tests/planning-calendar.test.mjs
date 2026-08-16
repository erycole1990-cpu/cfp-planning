import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PLANNING_TIME_ZONE,
  isPlanningDateWithinDays,
  planningCalendarDate,
  planningDateTimeIso,
  planningToday,
  toDateInputValue,
} from "../lib/cfp/format.ts";

const newYearInstant = new Date("2025-12-31T16:30:00.000Z");

test("uses the planning timezone for fixed New Year calendar defaults", () => {
  const malaysia = planningCalendarDate(newYearInstant, "Asia/Kuala_Lumpur");

  assert.deepEqual(malaysia, {
    isoDate: "2026-01-01",
    year: 2026,
    monthIndex: 0,
    day: 1,
    timeZone: "Asia/Kuala_Lumpur",
  });
  assert.equal(planningToday(newYearInstant, "Asia/Kuala_Lumpur"), "2026-01-01");
  assert.equal(toDateInputValue(newYearInstant, "Asia/Kuala_Lumpur"), "2026-01-01");
});

test("keeps Los Angeles on its previous calendar day for the same instant", () => {
  assert.deepEqual(planningCalendarDate(newYearInstant, "America/Los_Angeles"), {
    isoDate: "2025-12-31",
    year: 2025,
    monthIndex: 11,
    day: 31,
    timeZone: "America/Los_Angeles",
  });
});

test("planning date comparisons and local due times do not depend on machine timezone", () => {
  assert.equal(
    isPlanningDateWithinDays("2026-01-08", 7, newYearInstant, "Asia/Kuala_Lumpur"),
    true,
  );
  assert.equal(
    isPlanningDateWithinDays("2025-12-31", 7, newYearInstant, "Asia/Kuala_Lumpur"),
    false,
  );
  assert.equal(
    planningDateTimeIso("2026-01-01", 17, 0, "Asia/Kuala_Lumpur"),
    "2026-01-01T09:00:00.000Z",
  );
  assert.equal(DEFAULT_PLANNING_TIME_ZONE, "Asia/Kuala_Lumpur");
});
