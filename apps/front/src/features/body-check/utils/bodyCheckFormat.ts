/** Format minutes as Persian-friendly "Xh Ym". */
export function formatSleepDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} دقیقه`;
  if (m === 0) return `${h} ساعت`;
  return `${h} ساعت و ${m} دقیقه`;
}

function localDateFromIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const result = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Format a Body Check calendar day in the Persian calendar without changing its ISO value. */
export function formatBodyCheckDate(value: string | null | undefined, short = false): string {
  if (!value) return "—";
  const date = localDateFromIso(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: short ? "numeric" : "long",
    year: "numeric"
  }).format(date);
}

export function formatClockTime(value: string | null | undefined): string {
  if (!value) return "ثبت نشده";
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit"
  }).format(date);
}

export function formatKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلو`;
}

export function formatDeltaKg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلو`;
}

export function weekLabel(weekNumber: number): string {
  switch (weekNumber) {
    case 1:
      return "هفته ۱ (روز ۱ تا ۷)";
    case 2:
      return "هفته ۲ (روز ۸ تا ۱۴)";
    case 3:
      return "هفته ۳ (روز ۱۵ تا ۲۱)";
    case 4:
      return "هفته ۴ (روز ۲۲ تا ۳۰)";
    default:
      return `هفته ${weekNumber}`;
  }
}

export function scoreOptions(max = 10): { label: string; value: string }[] {
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    return { label: String(n), value: String(n) };
  });
}
