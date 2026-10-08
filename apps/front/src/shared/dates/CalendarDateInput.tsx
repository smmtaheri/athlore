import { type ComponentProps, useState } from "react";
import { Input } from "../../components/ui";
import {
  calendarInputToIso,
  calendarInputValue,
  calendarName,
  calendarPlaceholder
} from "./calendar";

type Props = Omit<ComponentProps<typeof Input>, "onChange" | "value" | "type"> & {
  value: string;
  onChange: (iso: string) => void;
};
export function CalendarDateInput({ value, onChange, ...props }: Props) {
  const [draft, setDraft] = useState({ source: value, text: calendarInputValue(value) });
  const text = draft.source === value ? draft.text : calendarInputValue(value);
  const valid = !text || Boolean(calendarInputToIso(text));
  return (
    <>
      <Input
        {...props}
        dir="ltr"
        inputMode="numeric"
        type="text"
        value={text}
        placeholder={calendarPlaceholder()}
        invalid={!valid || props.invalid}
        onChange={(event) => {
          const next = event.target.value;
          const iso = next ? calendarInputToIso(next) : "";
          setDraft({ source: iso === null ? value : iso, text: next });
          event.currentTarget.setCustomValidity(
            iso === null ? `تاریخ ${calendarName()} معتبر وارد کنید.` : ""
          );
          if (iso !== null) onChange(iso);
        }}
      />
      {!valid ? (
        <span role="alert">تاریخ {calendarName()} معتبر به شکل سال/ماه/روز وارد کنید.</span>
      ) : null}
    </>
  );
}
