import { useState } from "react";
import type { InputProps } from "../../components/ui/FormControls";
import { Input, Select } from "../../components/ui";
import {
  asciiPhoneDigits,
  normalizeMobile,
  phoneCountries,
  phoneCountryFor,
  validateNationalMobile
} from "./mobile";
import styles from "./phone.module.css";

const names = new Intl.DisplayNames(["fa"], { type: "region" });
const options = [...phoneCountries]
  .sort((a, b) =>
    a.country === "IR"
      ? -1
      : b.country === "IR"
        ? 1
        : (names.of(a.country) ?? a.country).localeCompare(names.of(b.country) ?? b.country, "fa")
  )
  .map((item) => ({
    value: item.country,
    label: `${names.of(item.country) ?? item.country} (+${item.callingCode})`
  }));

interface PhoneNumberInputProps extends Omit<InputProps, "onChange" | "value" | "type"> {
  value: string;
  country?: string;
  onCountryChange?: (country: string) => void;
  onValueChange: (value: string) => void;
}

export function PhoneNumberInput({
  value,
  country,
  onCountryChange,
  onValueChange,
  id,
  disabled,
  invalid,
  ...props
}: PhoneNumberInputProps) {
  const [selectedCountry, setSelectedCountry] = useState(() => country ?? phoneCountryFor(value));
  const selected = country ?? selectedCountry;
  const info =
    phoneCountries.find((item) => item.country === selected) ??
    phoneCountries.find((item) => item.country === "IR")!;
  const prefix = `+${info.callingCode}`;
  let canonical = value;
  if (value && !value.startsWith("+")) {
    try {
      canonical = normalizeMobile(value);
    } catch {
      /* Keep invalid edits visible. */
    }
  }
  const national = canonical.startsWith(prefix) ? canonical.slice(prefix.length) : canonical;
  const error = national ? validateNationalMobile(national, selected) : undefined;
  const helpId = `${id}-national-help`;
  return (
    <div className={styles.field}>
      <Select
        aria-label="کشور شماره موبایل"
        disabled={disabled}
        options={options}
        value={selected}
        onChange={(event) => {
          setSelectedCountry(event.target.value);
          onCountryChange?.(event.target.value);
          // A country change starts a fresh number; never reinterpret an existing account's digits.
          onValueChange("");
        }}
      />
      <div className={styles.number} dir="ltr">
        <span className={styles.prefix} aria-label="پیش‌شماره کشور">
          {prefix}
        </span>
        <Input
          {...props}
          id={id}
          disabled={disabled}
          invalid={invalid || Boolean(error)}
          value={national}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          dir="ltr"
          placeholder={`مثلاً ${info.example}`}
          aria-describedby={[props["aria-describedby"], helpId].filter(Boolean).join(" ")}
          onChange={(event) => {
            const digits = asciiPhoneDigits(event.target.value).replace(/[\s\-().]+/g, "");
            onValueChange(digits ? `${prefix}${digits}` : "");
          }}
        />
      </div>
      <small id={helpId}>
        {info.example.startsWith("0")
          ? "شماره را دقیقاً مطابق نمونه، بدون کد کشور وارد کنید؛ صفرِ موجود در نمونه بخشی از شماره است."
          : "فقط شمارهٔ موبایل را بدون صفر اول و بدون کد کشور وارد کنید؛ پیش‌شماره خودکار اضافه می‌شود."}
      </small>
      {error ? (
        <small className={styles.error} role="status">
          {error}
        </small>
      ) : null}
    </div>
  );
}
