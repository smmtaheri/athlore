import { describe, expect, it } from "vitest";
import {
  formatVisitDatePersian,
  persianVisitDateToIso,
  sortVisitsNewestFirst,
  todayPersianVisitDate
} from "./visitDates";

describe("monthly visit dates", () => {
  it("converts valid Jalali input to the Gregorian date expected by the API", () => {
    expect(persianVisitDateToIso("۱۴۰۵/۰۳/۰۵")).toBe("2026-05-26");
    expect(persianVisitDateToIso("1405-07-02")).toBe("2026-09-24");
    expect(persianVisitDateToIso("۱۴۰۵/۱۳/۰۵")).toBeNull();
    expect(persianVisitDateToIso("۱۴۰۵/۱۲/۳۰")).toBeNull();
  });

  it("formats stored ISO dates as Jalali without changing the calendar day", () => {
    expect(formatVisitDatePersian("2026-05-26")).toBe("۱۴۰۵/۰۳/۰۵");
    expect(formatVisitDatePersian("2026-09-24")).toBe("۱۴۰۵/۰۷/۰۲");
  });

  it("uses Tehran's current day for the default date", () => {
    expect(todayPersianVisitDate(new Date("2026-09-24T20:00:00.000Z"))).toBe("۱۴۰۵/۰۷/۰۲");
  });

  it("sorts visit dates newest first, including Jalali fixture dates", () => {
    const visits = [
      { createdAt: "2026-05-27T10:00:00.000Z", id: "older", visitDate: "2026-05-26" },
      { createdAt: "2026-09-20T10:00:00.000Z", id: "newer", visitDate: "2026-09-21" },
      { createdAt: "2026-09-20T09:00:00.000Z", id: "jalali", visitDate: "۱۴۰۵/۰۶/۳۰" }
    ];

    expect(sortVisitsNewestFirst(visits).map((visit) => visit.id)).toEqual([
      "newer",
      "jalali",
      "older"
    ]);
  });
});
