import { useEffect, useState } from "react";
import { Button, Checkbox, FormField, Input, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import type { GenerationRules, VolumeProfile } from "../types/coachRules";
import type { ExerciseTaxonomy } from "./exerciseTaxonomyTypes";
import styles from "../../programs/components/programFlow.module.css";

const muscles: Record<string, string> = {
  chest: "سینه",
  back: "زیربغل",
  shoulders: "سرشانه",
  quadriceps: "چهارسر ران",
  hamstrings: "پشت پا",
  glutes: "باسن",
  biceps: "جلو بازو",
  triceps: "پشت بازو",
  calves: "ساق",
  forearms: "ساعد",
  core: "شکم",
  traps: "کول"
};
const levels = [
  { value: "beginner", label: "مبتدی" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "پیشرفته" }
];
const injuries = [
  { value: "neck", label: "گردن" },
  { value: "back", label: "کمر" },
  { value: "shoulder", label: "شانه" },
  { value: "knee", label: "زانو" },
  { value: "elbow", label: "آرنج" },
  { value: "wrist", label: "مچ دست" },
  { value: "hip", label: "لگن" },
  { value: "ankle", label: "مچ پا" },
  { value: "other", label: "سایر" }
];
const fields: Array<[keyof VolumeProfile, string]> = [
  ["maintenance", "حفظ عضله؛ ست هفتگی"],
  ["growth_start", "شروع رشد؛ ست هفتگی"],
  ["target_min", "هدف عادی؛ ست هفتگی"],
  ["target_max", "هدف عضلهٔ مورد تمرکز؛ ست هفتگی"],
  ["weekly_cap", "سقف ست هفتگی"],
  ["session_cap", "سقف ست در هر جلسه"]
];

export function GenerationVolumeFields({
  value,
  onChange
}: {
  value: GenerationRules;
  onChange: (next: Partial<GenerationRules>) => void;
}) {
  const [level, setLevel] = useState("intermediate");
  const [muscle, setMuscle] = useState("chest");
  const [taxonomy, setTaxonomy] = useState<ExerciseTaxonomy>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<ExerciseTaxonomy>("/exercise-taxonomy/")
      .then((data) => {
        if (active) setTaxonomy(data);
      })
      .catch(() => {
        if (active) setError("دریافت گزینه‌های الگو و مفصل انجام نشد؛ صفحه را دوباره باز کنید.");
      });
    return () => {
      active = false;
    };
  }, []);
  const profile = value.volume_profiles?.[level]?.[muscle];
  const restrictions = value.movement_restrictions ?? [];
  return (
    <>
      <details>
        <summary>نسخهٔ قدرتی؛ حرکت اصلی و کمکی</summary>
        <p>
          فقط برای هدف «افزایش قدرت» استفاده می‌شود. حرکات اصلی چندمفصلی و حرکات کمکی نسخهٔ جدا
          دارند؛ حرکت زمان‌دار همچنان با ثانیه تجویز می‌شود.
        </p>
        {(["main", "accessory"] as const).map((kind) => {
          const prescription = value.strength_prescriptions?.[kind];
          if (!prescription) return null;
          return (
            <fieldset key={kind}>
              <legend>{kind === "main" ? "حرکت اصلی" : "حرکت کمکی"}</legend>
              <div className={styles.threeColumnGrid}>
                {(
                  [
                    ["reps_min", "حداقل تکرار", 1, 30],
                    ["reps_max", "حداکثر تکرار", 1, 30],
                    ["rest_seconds", "استراحت (ثانیه)", 30, 300],
                    ["rir", "تکرار باقی‌مانده (RIR)", 1, 5]
                  ] as const
                ).map(([key, label, min, max]) => (
                  <FormField key={key} label={label} htmlFor={`strength-${kind}-${key}`}>
                    <Input
                      id={`strength-${kind}-${key}`}
                      type="number"
                      min={min}
                      max={max}
                      value={prescription[key]}
                      onChange={(event) => {
                        if (!value.strength_prescriptions) return;
                        onChange({
                          strength_prescriptions: {
                            ...value.strength_prescriptions,
                            [kind]: { ...prescription, [key]: Number(event.target.value) }
                          }
                        });
                      }}
                    />
                  </FormField>
                ))}
              </div>
            </fieldset>
          );
        })}
      </details>
      <details>
        <summary>حجم هفتگی عضلات و سقف هر جلسه</summary>
        <p>
          مقادیر پیش‌فرض، برآورد شروع برای عضله‌سازی‌اند. موتور بر اساس تمرکز، تعداد جلسات و زمان،
          ست‌ها را تقسیم می‌کند. ست مستقیم شمرده می‌شود؛ مشارکت عضلات کمکی جدا گزارش می‌شود.
        </p>
        <div className={styles.threeColumnGrid}>
          <FormField label="سطح ورزشکار" htmlFor="volume-profile-level">
            <Select
              id="volume-profile-level"
              options={levels}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            />
          </FormField>
          <FormField label="عضله" htmlFor="volume-profile-muscle">
            <Select
              id="volume-profile-muscle"
              options={Object.entries(muscles).map(([value, label]) => ({ value, label }))}
              value={muscle}
              onChange={(event) => setMuscle(event.target.value)}
            />
          </FormField>
        </div>
        {profile ? (
          <div className={styles.threeColumnGrid}>
            {fields.map(([key, label]) => (
              <FormField key={key} label={label} htmlFor={`volume-profile-${key}`}>
                <Input
                  id={`volume-profile-${key}`}
                  type="number"
                  min={0}
                  max={50}
                  value={profile[key]}
                  onChange={(event) =>
                    onChange({
                      volume_profiles: {
                        ...value.volume_profiles,
                        [level]: {
                          ...value.volume_profiles?.[level],
                          [muscle]: { ...profile, [key]: Number(event.target.value) }
                        }
                      }
                    })
                  }
                />
              </FormField>
            ))}
          </div>
        ) : (
          <p>پروفایل حجم هنوز از سرور دریافت نشده است.</p>
        )}
        <p>
          مقادیر حفظ، شروع رشد، هدف عادی، هدف تمرکز و سقف هفتگی باید به همین ترتیب از کم به زیاد
          باشند. این اعداد MRV واقعیِ اندازه‌گیری‌شدهٔ شاگرد نیستند.
        </p>
        <a
          href="https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth"
          target="_blank"
          rel="noreferrer"
        >
          مرجع مفاهیم حجم تمرین؛ پیش‌فرض اثلور نسخهٔ ۱
        </a>
      </details>
      <details>
        <summary>محدودیت حرکت بر اساس آسیب، مفصل و الگو</summary>
        <p>
          قانون فقط برای آسیب ثبت‌شده اعمال می‌شود. اگر مفصل و الگو را انتخاب کنید، حرکت باید هر دو
          شرط را داشته باشد تا حذف شود.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {restrictions.map((row, index) => {
          const change = (next: typeof row) =>
            onChange({
              movement_restrictions: restrictions.map((item, i) => (i === index ? next : item))
            });
          return (
            <div key={index} className={styles.pageStack}>
              <FormField label="آسیب ثبت‌شده" htmlFor={`movement-restriction-${index}`}>
                <Select
                  id={`movement-restriction-${index}`}
                  options={injuries}
                  value={row.injury_key}
                  onChange={(event) => change({ ...row, injury_key: event.target.value })}
                />
              </FormField>
              <div>
                <strong>مفاصل</strong>
                {(taxonomy?.joints ?? []).map((item) => (
                  <Checkbox
                    key={item.key}
                    label={item.name}
                    checked={row.joint_keys.includes(item.key)}
                    onChange={(event) =>
                      change({
                        ...row,
                        joint_keys: event.target.checked
                          ? [...row.joint_keys, item.key]
                          : row.joint_keys.filter((key) => key !== item.key)
                      })
                    }
                  />
                ))}
              </div>
              <FormField label="الگوی ممنوع" hint="خالی یعنی همهٔ الگوهای مفصل انتخاب‌شده.">
                <Select
                  placeholder="همهٔ الگوهای مفصل"
                  options={(taxonomy?.movement_patterns ?? []).map((item) => ({
                    value: item.key,
                    label: item.name
                  }))}
                  value={row.movement_patterns[0] ?? ""}
                  onChange={(event) =>
                    change({
                      ...row,
                      movement_patterns: event.target.value ? [event.target.value] : []
                    })
                  }
                />
              </FormField>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  onChange({ movement_restrictions: restrictions.filter((_, i) => i !== index) })
                }
              >
                حذف قانون
              </Button>
            </div>
          );
        })}
        <Button
          disabled={!taxonomy}
          onClick={() =>
            onChange({
              movement_restrictions: [
                ...restrictions,
                { injury_key: "knee", joint_keys: ["knee"], movement_patterns: ["knee_extension"] }
              ]
            })
          }
        >
          افزودن قانون محدودیت
        </Button>
      </details>
    </>
  );
}
