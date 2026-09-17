/** Iranian mobile normalization (mirrors Backend common/phone.py). */

const DIGIT_MAP: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9"
};

export function normalizeIranMobile(raw: string): string {
  let text = raw
    .trim()
    .split("")
    .map((ch) => DIGIT_MAP[ch] ?? ch)
    .join("");
  text = text.replace(/[\s\-()._,/]+/g, "");
  const hasPlus = text.startsWith("+");
  const digits = (hasPlus ? "+" : "") + text.replace(/\D/g, "").replace(/^\+/, "");

  let national: string | undefined;
  if (digits.startsWith("+98")) {
    national = digits.slice(3);
  } else if (digits.startsWith("0098")) {
    national = digits.slice(4);
  } else if (digits.startsWith("98") && digits.length >= 12) {
    national = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    national = digits.slice(1);
  } else if (digits.startsWith("9") && digits.length === 10) {
    national = digits;
  } else {
    throw new Error("شماره موبایل باید به صورت ۰۹۱۲۱۲۳۴۵۶۷ یا +۹۸۹۱۲۱۲۳۴۵۶۷ باشد.");
  }

  if (!/^9\d{9}$/.test(national)) {
    throw new Error("شماره موبایل ایران باید ۱۰ رقم و با ۹ شروع شود.");
  }

  return `+98${national}`;
}

export function formatIranMobileDisplay(canonical: string | undefined | null): string {
  if (!canonical) return "—";
  try {
    const normalized = normalizeIranMobile(canonical);
    // Display as 09xxxxxxxxx for coaches
    return `0${normalized.slice(3)}`;
  } catch {
    return canonical;
  }
}

export function validateIranMobileInput(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "شماره موبایل الزامی است.";
  }
  try {
    normalizeIranMobile(trimmed);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "شماره موبایل معتبر نیست.";
  }
}
