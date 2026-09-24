import type { StudentVisit } from "../types/monthlyVisit";

const DAY_MS = 24 * 60 * 60 * 1000;
const tehranDateFormatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Tehran",
  year: "numeric"
});
const persianDatePartsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
  year: "numeric"
});
const persianDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
  year: "numeric"
});

function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function toPersianDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function formatIsoParts(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function parseIsoDate(value: string): { day: number; month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function persianCalendarParts(date: Date): { day: number; month: number; year: number } | null {
  const parts = persianDatePartsFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? { day, month, year }
    : null;
}

/** Convert a Jalali date entered by the coach to the ISO date stored by the API. */
export function persianVisitDateToIso(value: string): string | null {
  const normalized = toEnglishDigits(value).trim().replace(/[.-]/g, "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Persian months are close to 30.44 days. Search around that estimate and
  // accept only the exact date reported by the platform's Persian calendar.
  const approximate =
    Date.UTC(year + 621, 2, 21, 12) + (Math.round((month - 1) * 30.436875) + day - 1) * DAY_MS;
  for (let offset = -9; offset <= 9; offset += 1) {
    const candidate = new Date(approximate + offset * DAY_MS);
    const parts = persianCalendarParts(candidate);
    if (parts?.year === year && parts.month === month && parts.day === day) {
      return formatIsoParts(
        candidate.getUTCFullYear(),
        candidate.getUTCMonth() + 1,
        candidate.getUTCDate()
      );
    }
  }

  return null;
}

/** Format an ISO calendar date as a Jalali date while preserving date-only semantics. */
export function formatVisitDatePersian(value: string | null | undefined): string {
  if (!value) return "—";

  const iso = parseIsoDate(value);
  if (iso) {
    return persianDateFormatter.format(new Date(Date.UTC(iso.year, iso.month - 1, iso.day, 12)));
  }

  const normalized = toEnglishDigits(value.trim()).replace(/[.-]/g, "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match || !persianVisitDateToIso(normalized)) return value;
  const formatted = `${match[1]}/${match[2].padStart(2, "0")}/${match[3].padStart(2, "0")}`;
  return toPersianDigits(formatted);
}

/** Return today's Jalali date using Tehran's calendar day. */
export function todayPersianVisitDate(now = new Date()): string {
  const parts = Object.fromEntries(
    tehranDateFormatter.formatToParts(now).map(({ type, value }) => [type, value])
  );
  const iso = formatIsoParts(Number(parts.year), Number(parts.month), Number(parts.day));
  return formatVisitDatePersian(iso);
}

/** Sort visit dates newest first, using creation time as a stable tie-breaker. */
export function sortVisitsNewestFirst<T extends Pick<StudentVisit, "createdAt" | "visitDate">>(
  visits: T[]
): T[] {
  return [...visits].sort((left, right) => {
    const leftIso = parseIsoDate(left.visitDate)
      ? left.visitDate
      : (persianVisitDateToIso(left.visitDate) ?? "");
    const rightIso = parseIsoDate(right.visitDate)
      ? right.visitDate
      : (persianVisitDateToIso(right.visitDate) ?? "");
    const dateOrder = rightIso.localeCompare(leftIso);
    if (dateOrder !== 0) return dateOrder;
    return right.createdAt.localeCompare(left.createdAt);
  });
}
