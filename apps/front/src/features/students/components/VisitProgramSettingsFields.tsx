import { useEffect, useState } from "react";
import { Button, Checkbox, FormField, Input, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import { trainingSystemsRepository } from "../../coach-rules/services/trainingSystemsRepository";
import type { TrainingSystem } from "../../coach-rules/types/coachRules";
import type { VisitProgramSettings } from "../types/monthlyVisit";
import { CalendarDateInput } from "../../../shared/dates/CalendarDateInput";
import { coachRulesRepository } from "../../coach-rules/services/coachRulesRepository";

export function VisitProgramSettingsFields({
  value,
  onChange,
  disabled,
  sessions,
  level
}: {
  value: VisitProgramSettings;
  onChange: (value: VisitProgramSettings) => void;
  disabled: boolean;
  sessions: number;
  level: string;
}) {
  const [systems, setSystems] = useState<TrainingSystem[]>([]);
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; daysPerWeek: number }>
  >([]);
  useEffect(() => {
    let active = true;
    coachRulesRepository
      .get()
      .then((rules) => {
        if (active) setTemplates(rules.templates);
      })
      .catch(() => {
        if (active) setMessage("دریافت قالب‌های برنامه انجام نشد.");
      });
    trainingSystemsRepository
      .list()
      .then((items) => {
        if (active) setSystems(items);
      })
      .catch(() => {
        if (active) setMessage("دریافت سیستم‌های تمرینی انجام نشد؛ دوباره صفحه را باز کنید.");
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (changes: Partial<VisitProgramSettings>) => onChange({ ...value, ...changes });
  return (
    <>
      {message ? <p role="status">{message}</p> : null}
      <FormField label="بخش‌های برنامه">
        {(
          [
            ["workout", "تمرینی"],
            ["nutrition", "غذایی"],
            ["supplement", "مکمل"]
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            disabled={disabled}
            checked={(value.sections ?? ["workout"]).includes(key)}
            onChange={(e) =>
              update({
                sections: e.target.checked
                  ? [...(value.sections ?? ["workout"]), key]
                  : (value.sections ?? ["workout"]).filter((item) => item !== key)
              })
            }
          />
        ))}
      </FormField>
      <FormField
        label="سیستم‌های تمرینی این دوره"
        hint="انتخاب‌های همین ویزیت مبنای تولید هستند؛ خالی یعنی بدون سیستم خاص."
      >
        {systems.map((system) => (
          <Checkbox
            key={system.key}
            disabled={
              disabled ||
              Boolean(
                system.allowed_levels.length &&
                !(value.training_systems ?? []).some((item) => item.key === system.key) &&
                !system.allowed_levels.includes(
                  level === "professional" || level === "semi_professional" ? "advanced" : level
                )
              )
            }
            label={`${system.name}${system.allowed_levels.length && !system.allowed_levels.includes(level === "professional" || level === "semi_professional" ? "advanced" : level) ? " — نامناسب برای سطح فعلی" : ""}`}
            checked={(value.training_systems ?? []).some((item) => item.key === system.key)}
            onChange={(e) =>
              update({
                training_systems: e.target.checked
                  ? [...(value.training_systems ?? []), { key: system.key }]
                  : (value.training_systems ?? []).filter((item) => item.key !== system.key)
              })
            }
          />
        ))}
      </FormField>
      <details>
        <summary>تقسیم عضلات جلسات و قالب دقیق (اختیاری)</summary>
        {value.session_muscles && value.session_muscles.length !== sessions ? (
          <p role="alert">
            تعداد جلسه تغییر کرده؛ تقسیم قبلی را اصلاح کنید یا{" "}
            <Button
              type="button"
              disabled={disabled}
              onClick={() =>
                update({ session_muscles: Array.from({ length: sessions }, () => []) })
              }
            >
              تقسیم خودکار
            </Button>{" "}
            را انتخاب کنید.
          </p>
        ) : null}
        <FormField label="قالب دقیق" htmlFor="visit-program-template">
          <Select
            id="visit-program-template"
            disabled={disabled}
            value={value.template_id ?? ""}
            options={[
              { value: "", label: "بدون قالب؛ تقسیم خودکار" },
              ...templates
                .filter((template) => template.daysPerWeek === sessions)
                .map((template) => ({ value: template.id, label: template.name }))
            ]}
            onChange={(e) => update({ template_id: e.target.value })}
          />
        </FormField>
        {!value.template_id
          ? Array.from({ length: Math.max(1, Math.min(7, sessions || 4)) }, (_, dayIndex) => (
              <fieldset key={dayIndex}>
                <legend>جلسهٔ {dayIndex + 1} — خالی یعنی تقسیم خودکار</legend>
                {[
                  "سینه",
                  "زیربغل",
                  "پا",
                  "سرشانه",
                  "پشت بازو",
                  "جلو بازو",
                  "شکم",
                  "ساق",
                  "ساعد"
                ].map((muscle) => (
                  <Checkbox
                    key={muscle}
                    disabled={disabled}
                    label={muscle}
                    checked={value.session_muscles?.[dayIndex]?.includes(muscle) ?? false}
                    onChange={(e) => {
                      const split = Array.from({ length: sessions || 4 }, (_, i) => [
                        ...(value.session_muscles?.[i] ?? [])
                      ]);
                      split[dayIndex] = e.target.checked
                        ? [...split[dayIndex], muscle]
                        : split[dayIndex].filter((item) => item !== muscle);
                      update({ session_muscles: split });
                    }}
                  />
                ))}
              </fieldset>
            ))
          : null}
      </details>
      <FormField label="شروع برنامه" htmlFor="visit-program-start">
        <CalendarDateInput
          id="visit-program-start"
          disabled={disabled}
          value={value.start_date ?? ""}
          onChange={(start_date) => update({ start_date })}
        />
      </FormField>
      <FormField label="تنوع حرکت‌ها" htmlFor="visit-program-variety">
        <Select
          id="visit-program-variety"
          disabled={disabled}
          value={value.exercise_variety ?? "varied"}
          options={[
            { value: "stable", label: "ثابت" },
            { value: "balanced", label: "متعادل" },
            { value: "varied", label: "متنوع" }
          ]}
          onChange={(e) =>
            update({ exercise_variety: e.target.value as VisitProgramSettings["exercise_variety"] })
          }
        />
      </FormField>
      <FormField label="مدت دوره (هفته)" htmlFor="visit-program-weeks">
        <Input
          id="visit-program-weeks"
          disabled={disabled}
          type="number"
          min={1}
          max={52}
          value={value.duration_weeks ?? 4}
          onChange={(e) => update({ duration_weeks: Number(e.target.value) })}
        />
      </FormField>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          const defaults = { ...value };
          delete defaults.start_date;
          void apiRequest("/me/program-defaults/", { method: "PUT", body: defaults })
            .then(() => setMessage("این انتخاب‌ها به‌عنوان پیش‌فرض شما ذخیره شد."))
            .catch(() => setMessage("ذخیرهٔ پیش‌فرض انجام نشد."));
        }}
      >
        ذخیره به‌عنوان پیش‌فرض من
      </Button>
    </>
  );
}
