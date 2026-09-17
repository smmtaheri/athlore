/** Format minutes as Persian-friendly "Xh Ym". */
export function formatSleepDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} دقیقه`;
  if (m === 0) return `${h} ساعت`;
  return `${h} ساعت و ${m} دقیقه`;
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
