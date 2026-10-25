import metadata from "./countries.json";
import { normalizeIranMobile } from "./iranMobile";

export const phoneCountries = metadata.countries;

export function asciiPhoneDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));
}

export function normalizeMobile(raw: string): string {
  const text = asciiPhoneDigits(raw)
    .trim()
    .replace(/[\s\-().]+/g, "");
  if (!text) throw new Error("شماره موبایل الزامی است.");
  if (!/^\+?[0-9]+$/.test(text))
    throw new Error("فقط رقم‌های شماره و پیش‌شمارهٔ انتخاب‌شده مجاز هستند.");
  if (!text.startsWith("+") || text.startsWith("+98")) return normalizeIranMobile(text);
  if (!/^\+[1-9][0-9]{7,14}$/.test(text)) throw new Error("شماره موبایل معتبر نیست.");
  const matches = phoneCountries.filter(
    (item) =>
      text.startsWith(`+${item.callingCode}`) &&
      item.lengths.includes(text.length - item.callingCode.length - 1)
  );
  if (!matches.length) throw new Error("تعداد رقم‌های شماره برای این کشور معتبر نیست.");
  return text;
}

export function validateMobileInput(value: string): string | undefined {
  try {
    normalizeMobile(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "شماره موبایل معتبر نیست.";
  }
}

export function phoneCountryFor(value: string): string {
  let canonical: string;
  try {
    canonical = normalizeMobile(value);
  } catch {
    return "IR";
  }
  const matches = phoneCountries.filter((item) => canonical.startsWith(`+${item.callingCode}`));
  return (matches.find((item) => item.main) ?? matches[0])?.country ?? "IR";
}

export function validateNationalMobile(value: string, country: string): string | undefined {
  const info = phoneCountries.find((item) => item.country === country);
  if (!info) return "کشور معتبر را انتخاب کنید.";
  if (!value) return "شماره موبایل الزامی است.";
  if (value.startsWith("0") && !info.example.startsWith("0"))
    return "صفر ابتدای شماره را وارد نکنید؛ پیش‌شمارهٔ کشور جداگانه درج شده است.";
  if (!/^[0-9]+$/.test(value)) return "فقط رقم‌های شماره را بدون + و کد کشور وارد کنید.";
  if (!info.lengths.includes(value.length))
    return `شماره را بدون صفر و بدون تکرار کد کشور ${info.callingCode} وارد کنید؛ نمونه: ${info.example}`;
  return validateMobileInput(`+${info.callingCode}${value}`);
}
