import { persianVisitDateToIso } from "./persianCalendar";

export type Calendar = "persian" | "gregory";
export const DATE_TIME_ZONE = "Asia/Tehran";
let calendar: Calendar = "persian";
const listeners = new Set<() => void>();

export function getCalendar(): Calendar {
  return calendar;
}
export function setCalendar(value: Calendar) {
  if (calendar === value) return;
  calendar = value;
  listeners.forEach((listener) => listener());
}
export function subscribeCalendar(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function calendarName() {
  return calendar === "persian" ? "شمسی" : "میلادی";
}
export function calendarPlaceholder() {
  return calendar === "persian" ? "۱۴۰۵/۰۷/۰۲" : "۲۰۲۶/۰۹/۲۴";
}

function digits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}
function isoDate(value: string): string | null {
  const normalized = digits(value).trim().replace(/[/.]/g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(m) ||
    date.getUTCDate() !== Number(d)
  )
    return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
export function calendarInputToIso(value: string): string | null {
  return calendar === "persian" ? persianVisitDateToIso(value) : isoDate(value);
}
function parsedDate(value: string): { date: Date; dateOnly: boolean } | null {
  // Legacy Jalali display strings are converted before applying the selected calendar.
  const jalali = /^1[34]\d{2}[/.]/.test(digits(value)) ? persianVisitDateToIso(value) : null;
  if (jalali) return { date: new Date(`${jalali}T12:00:00Z`), dateOnly: true };
  const iso = isoDate(value);
  if (iso) return { date: new Date(`${iso}T12:00:00Z`), dateOnly: true };
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = parsedDate(value);
  if (!parsed) return value;
  const parts = new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: parsed.dateOnly ? "UTC" : DATE_TIME_ZONE
  }).formatToParts(parsed.date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const pad = (part: string) => (part.length === 1 ? `۰${part}` : part);
  return `${fields.year}/${pad(fields.month)}/${pad(fields.day)}`;
}
export function formatCalendarDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = parsedDate(value);
  if (!parsed) return value;
  if (parsed.dateOnly) return formatCalendarDate(value);
  return new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DATE_TIME_ZONE
  }).format(parsed.date);
}
export function calendarInputValue(value: string): string {
  const parsed = parsedDate(value);
  if (!parsed) return value;
  const parts = new Intl.DateTimeFormat(`en-US-u-ca-${calendar}-nu-latn`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: parsed.dateOnly ? "UTC" : DATE_TIME_ZONE
  }).formatToParts(parsed.date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}/${fields.month}/${fields.day}`.replace(
    /[0-9]/g,
    (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]
  );
}
export function todayCalendarInput(now = new Date()) {
  return calendarInputValue(now.toISOString());
}
export function formatCalendarText(value: string): string {
  const formattedIso = value.replace(
    /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g,
    (match) => (match.includes("T") ? formatCalendarDateTime(match) : formatCalendarDate(match))
  );
  return formattedIso.replace(/(?<!\d)(1[34]\d{2})[/.](\d{1,2})[/.](\d{1,2})(?!\d)/g, (match) => {
    const iso = persianVisitDateToIso(match);
    return iso ? formatCalendarDate(iso) : match;
  });
}
