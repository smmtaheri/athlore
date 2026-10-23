import { cloneElement, useEffect, useId, useState, type ReactElement } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button, Card, Checkbox, Input, Select, Switch, Textarea } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { apiRequest } from "../../../shared/api/client";
import { trainingSystemsRepository } from "../services/trainingSystemsRepository";
import {
  convertTemplate,
  newBlock,
  newExecutionPlan,
  newSlot,
  templateMuscles,
  withExecutionPlan
} from "../services/templatePlans";
import type {
  CoachRules,
  ProgramTemplate,
  TemplateBlock,
  TemplateExecutionPlan,
  TrainingSystem
} from "../types/coachRules";
import styles from "./programTemplates.module.css";

type Muscle = { key: string; name: string; is_active?: boolean };
type Exercise = {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  targets: Array<{ muscle_key: string; role: string }>;
};
export type TemplateReferences = {
  muscles: Muscle[];
  exercises: Exercise[];
  systems: TrainingSystem[];
};

async function loadTemplateReferences(): Promise<TemplateReferences> {
  if (appConfig.useMockRepositories)
    return {
      muscles: templateMuscles.map(([key, name]) => ({ key, name })),
      exercises: [],
      systems: await trainingSystemsRepository.list()
    };
  const catalog = async () => {
    const rows: Exercise[] = [];
    while (true) {
      const page = await apiRequest<{ results: Exercise[]; next?: string | null }>("/exercises/", {
        query: { limit: 100, offset: rows.length }
      });
      if (page.next && !page.results.length) throw new Error("Catalog pagination did not advance.");
      rows.push(...page.results);
      if (!page.next) return rows;
    }
  };
  const [taxonomy, exercises, systems] = await Promise.all([
    apiRequest<{ muscles: Muscle[] }>("/exercise-taxonomy/"),
    catalog(),
    trainingSystemsRepository.list()
  ]);
  return {
    muscles: taxonomy.muscles.filter((m) => m.is_active !== false),
    exercises: exercises.filter((e) => e.is_active && !e.is_archived),
    systems
  };
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

function Numeric({
  label,
  value,
  onChange,
  min = 0,
  max = 900
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}

function move<T>(items: T[], index: number, offset: number): T[] {
  const result = [...items];
  [result[index], result[index + offset]] = [result[index + offset], result[index]];
  return result;
}

function OrderActions({
  index,
  total,
  onMove
}: {
  index: number;
  total: number;
  onMove: (offset: number) => void;
}) {
  return (
    <div className={styles.actions}>
      <Button
        size="sm"
        variant="secondary"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label="انتقال به بالا"
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={index === total - 1}
        onClick={() => onMove(1)}
        aria-label="انتقال به پایین"
      >
        ↓
      </Button>
    </div>
  );
}

function BlockEditor({
  block,
  defaults,
  muscles,
  references,
  onChange
}: {
  block: TemplateBlock;
  defaults: TemplateExecutionPlan["defaults"];
  muscles: string[];
  references: TemplateReferences;
  onChange: (block: TemplateBlock) => void;
}) {
  const system = references.systems.find((item) => item.key === block.system_key);
  const grouping = system?.recipe?.grouping;
  const systemOptions = references.systems
    .filter((item) => item.recipe?.steps?.length && (item.source === "platform" || item.enabled))
    .map((item) => ({ value: item.key, label: item.name }));
  const setSystem = (key: string) => {
    const selected = references.systems.find((item) => item.key === key);
    const count = selected?.recipe?.grouping?.size ?? 1;
    onChange({
      ...block,
      system_key: key || null,
      sets: null,
      rest_seconds: null,
      between_seconds: null,
      slots: Array.from({ length: count }, (_, index) => ({
        ...(block.slots[index] ?? newSlot(muscles[0], defaults)),
        reps_source: key ? "system" : "default"
      }))
    });
  };
  return (
    <div className={styles.stack}>
      <Field label="نوع بلوک / سیستم تمرینی">
        <Select
          value={block.system_key ?? ""}
          options={[{ value: "", label: "حرکت تکی با ست معمولی" }, ...systemOptions]}
          onChange={(e) => setSystem(e.target.value)}
        />
      </Field>
      {block.system_key && !system ? (
        <p role="alert">سیستم این بلوک در دسترس نیست؛ سیستم معتبر انتخاب کنید.</p>
      ) : null}
      {system ? (
        <p className={styles.hint}>
          روش پایه: {system.execution_method || system.description} — تنظیمات همین بلوک تعریف اصلی
          سیستم را تغییر نمی‌دهد.
        </p>
      ) : null}
      <div className={styles.grid}>
        <div>
          <Checkbox
            label={
              block.system_key
                ? "تغییر تعداد ست / دور سیستم در همین بلوک"
                : "تعداد ست متفاوت از پیش‌فرض"
            }
            checked={block.sets !== null}
            onChange={(event) =>
              onChange({ ...block, sets: event.target.checked ? defaults.sets : null })
            }
          />
          {block.sets !== null ? (
            <Numeric
              label="تعداد ست / دور"
              value={block.sets}
              min={1}
              max={30}
              onChange={(sets) => onChange({ ...block, sets })}
            />
          ) : null}
        </div>
        <div>
          <Checkbox
            label="استراحت متفاوت در همین بلوک"
            checked={block.rest_seconds !== null}
            onChange={(event) =>
              onChange({
                ...block,
                rest_seconds: event.target.checked ? defaults.rest_seconds : null
              })
            }
          />
          {block.rest_seconds !== null ? (
            <Numeric
              label={grouping ? "استراحت بعد از دور (ثانیه)" : "استراحت بین ست‌ها (ثانیه)"}
              value={block.rest_seconds}
              onChange={(rest_seconds) => onChange({ ...block, rest_seconds })}
            />
          ) : null}
        </div>
        {grouping ? (
          <div>
            <Checkbox
              label="تغییر استراحت بین حرکت‌های گروه"
              checked={block.between_seconds !== null}
              onChange={(event) =>
                onChange({
                  ...block,
                  between_seconds: event.target.checked ? grouping.rest_between_seconds : null
                })
              }
            />
            {block.between_seconds !== null ? (
              <Numeric
                label="استراحت بین حرکت‌ها (ثانیه)"
                value={block.between_seconds}
                onChange={(between_seconds) => onChange({ ...block, between_seconds })}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {block.slots.map((slot, index) => {
        const update = (patch: Partial<typeof slot>) =>
          onChange({
            ...block,
            slots: block.slots.map((item, i) => (i === index ? { ...item, ...patch } : item))
          });
        const choices = references.exercises.filter((exercise) =>
          exercise.targets.some(
            (target) => target.role === "primary" && target.muscle_key === slot.muscle_key
          )
        );
        return (
          <fieldset className={styles.slot} key={index}>
            <legend>حرکت {index + 1}</legend>
            <div className={styles.actions}>
              <OrderActions
                index={index}
                total={block.slots.length}
                onMove={(offset) => onChange({ ...block, slots: move(block.slots, index, offset) })}
              />
            </div>
            <div className={styles.grid}>
              <Field label="عضلهٔ حرکت">
                <Select
                  value={slot.muscle_key}
                  options={[
                    { value: "", label: "انتخاب عضله" },
                    ...muscles.map((key) => ({
                      value: key,
                      label: references.muscles.find((m) => m.key === key)?.name ?? key
                    }))
                  ]}
                  onChange={(e) => update({ muscle_key: e.target.value, exercise_id: null })}
                />
              </Field>
              <Field label="انتخاب حرکت">
                <Select
                  value={slot.exercise_id ?? ""}
                  options={[
                    { value: "", label: "انتخاب خودکار از کاتالوگ مجاز" },
                    ...choices.map((e) => ({ value: e.id, label: e.name })),
                    ...(slot.exercise_id && !choices.some((e) => e.id === slot.exercise_id)
                      ? [
                          {
                            value: slot.exercise_id,
                            label: "حرکت قبلی در دسترس نیست؛ دوباره انتخاب کنید"
                          }
                        ]
                      : [])
                  ]}
                  onChange={(e) => update({ exercise_id: e.target.value || null })}
                />
              </Field>
              <Field label="منبع تکرار / زمان">
                <Select
                  value={slot.reps_source}
                  options={[
                    { value: "default", label: "پیش‌فرض قالب" },
                    ...(system ? [{ value: "system", label: "دستور خود سیستم" }] : []),
                    { value: "custom", label: "تنظیم اختصاصی این حرکت" }
                  ]}
                  onChange={(e) =>
                    update({ reps_source: e.target.value as typeof slot.reps_source })
                  }
                />
              </Field>
              {slot.reps_source === "custom" ? (
                <>
                  <Field label="واحد اجرا">
                    <Select
                      value={slot.unit}
                      options={[
                        { value: "reps", label: "تکرار" },
                        { value: "seconds", label: "ثانیه" }
                      ]}
                      onChange={(e) => update({ unit: e.target.value as typeof slot.unit })}
                    />
                  </Field>
                  <Numeric
                    label="حداقل تکرار / زمان"
                    value={slot.minimum}
                    min={1}
                    max={slot.unit === "seconds" ? 3600 : 300}
                    onChange={(minimum) => update({ minimum })}
                  />
                  <Numeric
                    label="حداکثر تکرار / زمان"
                    value={slot.maximum}
                    min={slot.minimum}
                    max={slot.unit === "seconds" ? 3600 : 300}
                    onChange={(maximum) => update({ maximum })}
                  />
                </>
              ) : null}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function ProgramTemplateEditor({
  rules,
  updateRules,
  references: provided
}: {
  rules: CoachRules;
  updateRules: (updater: (rules: CoachRules) => CoachRules) => void;
  references?: TemplateReferences;
}) {
  const [references, setReferences] = useState(provided);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (provided) return;
    let active = true;
    loadTemplateReferences()
      .then((data) => {
        if (active) {
          setReferences(data);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError("دریافت کاتالوگ و سیستم‌ها ناموفق بود؛ برای ویرایش ساختار دوباره تلاش کنید.");
      });
    return () => {
      active = false;
    };
  }, [provided, retry]);
  const update = (template: ProgramTemplate) =>
    updateRules((next) => ({
      ...next,
      templates: next.templates.map((item) => (item.id === template.id ? template : item))
    }));
  const add = () => {
    const plan = newExecutionPlan();
    const template: ProgramTemplate = {
      id: `template-${crypto.randomUUID()}`,
      name: "قالب جدید",
      level: "intermediate",
      daysPerWeek: 1,
      goal: "",
      mainGoal: "",
      intensity: "",
      volume: "",
      restTime: "",
      split: [""],
      specialRules: [],
      musclePriorityOrder: [],
      isActive: true
    };
    updateRules((next) => ({
      ...next,
      templates: [withExecutionPlan(template, plan), ...next.templates]
    }));
  };
  return (
    <Card className={styles.stack}>
      <div className={styles.header}>
        <div>
          <h2>قالب‌های برنامه</h2>
          <p className={styles.hint}>
            جلسه‌ها، بلوک‌ها و مقدار اجرای هر حرکت را مشخص کنید. نام و توضیح، دستور اجرایی نیستند.
          </p>
        </div>
        <Button iconStart={<Plus size={18} />} onClick={add} disabled={!references}>
          افزودن قالب
        </Button>
      </div>
      {error ? (
        <div role="alert">
          {error}
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            تلاش دوباره
          </Button>
        </div>
      ) : !references ? (
        <p role="status">دریافت کاتالوگ و سیستم‌های تمرینی…</p>
      ) : null}
      {rules.templates.map((template) => {
        const plan = template.executionPlan;
        const updatePlan = (next: TemplateExecutionPlan) =>
          update(withExecutionPlan(template, next));
        return (
          <section className={styles.template} key={template.id}>
            <div className={styles.header}>
              <h3>{template.name}</h3>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  variant="secondary"
                  iconStart={<Copy size={16} />}
                  onClick={() =>
                    updateRules((next) => ({
                      ...next,
                      templates: [
                        {
                          ...structuredClone(template),
                          id: `template-${crypto.randomUUID()}`,
                          name: `${template.name} - کپی`
                        },
                        ...next.templates
                      ]
                    }))
                  }
                >
                  تکثیر قالب
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  iconStart={<Trash2 size={16} />}
                  onClick={() =>
                    updateRules((next) => ({
                      ...next,
                      templates: next.templates.filter((t) => t.id !== template.id)
                    }))
                  }
                >
                  حذف قالب
                </Button>
              </div>
            </div>
            <div className={styles.grid}>
              <Field label="نام قالب">
                <Input
                  value={template.name}
                  onChange={(e) => update({ ...template, name: e.target.value })}
                />
              </Field>
              <Field label="سطح پیشنهادی">
                <Select
                  value={template.level}
                  options={[
                    { value: "beginner", label: "مبتدی" },
                    { value: "intermediate", label: "نیمه‌حرفه‌ای" },
                    { value: "advanced", label: "حرفه‌ای" }
                  ]}
                  onChange={(e) =>
                    update({ ...template, level: e.target.value as ProgramTemplate["level"] })
                  }
                />
              </Field>
            </div>
            <Switch
              label="قالب فعال است"
              checked={template.isActive}
              onCheckedChange={(isActive) => update({ ...template, isActive })}
            />
            {!plan ? (
              <div className={styles.notice}>
                <p>
                  این قالب ساختار قدیمی دارد و تا زمان تبدیل، تنظیمات قبلی آن حفظ می‌شود. تبدیل را
                  بازبینی و سپس «ذخیره قوانین» را بزنید.
                </p>
                <Button
                  variant="secondary"
                  disabled={!references}
                  onClick={() => updatePlan(convertTemplate(template))}
                >
                  بازبینی و تبدیل به قالب ساختاریافته
                </Button>
                <p>{template.split.join(" / ")}</p>
              </div>
            ) : references ? (
              <>
                <Field label="توضیحات قالب (بدون اثر اجرایی)">
                  <Textarea
                    value={plan.description}
                    maxLength={2000}
                    onChange={(e) => updatePlan({ ...plan, description: e.target.value })}
                  />
                </Field>
                <details>
                  <summary>پیش‌فرض‌های عددی قالب</summary>
                  <p className={styles.hint}>
                    برای حرکت معمولی و مقدارهایی که سیستم تمرینی تعیین نکرده است؛ هر بلوک می‌تواند
                    تنظیم اختصاصی داشته باشد.
                  </p>
                  <Field label="پرکردن سریع پیش‌فرض‌ها">
                    <Select
                      value=""
                      options={[
                        { value: "", label: "انتخاب مجموعهٔ پیشنهادی" },
                        { value: "strength", label: "قدرت: ۴ ست، ۴ تا ۶ تکرار، ۱۸۰ ثانیه" },
                        { value: "hypertrophy", label: "حجم: ۳ ست، ۸ تا ۱۲ تکرار، ۹۰ ثانیه" },
                        { value: "general", label: "عمومی: ۲ ست، ۱۰ تا ۱۵ تکرار، ۹۰ ثانیه" }
                      ]}
                      onChange={(e) => {
                        const presets = {
                          strength: { sets: 4, minimum: 4, maximum: 6, rest_seconds: 180, rir: 2 },
                          hypertrophy: {
                            sets: 3,
                            minimum: 8,
                            maximum: 12,
                            rest_seconds: 90,
                            rir: 2
                          },
                          general: { sets: 2, minimum: 10, maximum: 15, rest_seconds: 90, rir: 3 }
                        };
                        const defaults = presets[e.target.value as keyof typeof presets];
                        if (defaults) updatePlan({ ...plan, defaults });
                      }}
                    />
                  </Field>
                  <div className={styles.grid}>
                    {(
                      [
                        { key: "sets", label: "ست پیش‌فرض", min: 1, max: 30 },
                        { key: "minimum", label: "حداقل تکرار پیش‌فرض", min: 1, max: 300 },
                        { key: "maximum", label: "حداکثر تکرار پیش‌فرض", min: 1, max: 300 },
                        { key: "rest_seconds", label: "استراحت پیش‌فرض (ثانیه)", min: 0, max: 900 },
                        { key: "rir", label: "تکرار باقی‌مانده تا ناتوانی (RIR)", min: 0, max: 10 }
                      ] as const
                    ).map(({ key, label, min, max }) => (
                      <Numeric
                        key={key}
                        label={label}
                        value={plan.defaults[key]}
                        min={min}
                        max={max}
                        onChange={(value) =>
                          updatePlan({ ...plan, defaults: { ...plan.defaults, [key]: value } })
                        }
                      />
                    ))}
                  </div>
                </details>
                <Field label="تعداد جلسه در هفته">
                  <Select
                    value={String(plan.days.length)}
                    options={Array.from({ length: 7 }, (_, i) => ({
                      value: String(i + 1),
                      label: `${i + 1} جلسه`
                    }))}
                    onChange={(e) =>
                      updatePlan({
                        ...plan,
                        days: Array.from(
                          { length: Number(e.target.value) },
                          (_, i) => plan.days[i] ?? { muscles: [], blocks: [] }
                        )
                      })
                    }
                  />
                </Field>
                {plan.days.map((day, dayIndex) => {
                  const updateDay = (next: typeof day) =>
                    updatePlan({
                      ...plan,
                      days: plan.days.map((item, i) => (i === dayIndex ? next : item))
                    });
                  return (
                    <fieldset className={styles.day} key={dayIndex}>
                      <legend>جلسهٔ {dayIndex + 1}</legend>
                      <OrderActions
                        index={dayIndex}
                        total={plan.days.length}
                        onMove={(offset) =>
                          updatePlan({ ...plan, days: move(plan.days, dayIndex, offset) })
                        }
                      />
                      <div className={styles.muscles}>
                        {references.muscles.map((muscle) => (
                          <Checkbox
                            key={muscle.key}
                            label={muscle.name}
                            checked={day.muscles.includes(muscle.key)}
                            onChange={(event) =>
                              updateDay({
                                ...day,
                                muscles: event.target.checked
                                  ? [...day.muscles, muscle.key]
                                  : day.muscles.filter((key) => key !== muscle.key)
                              })
                            }
                          />
                        ))}
                      </div>
                      {day.muscles.some((key) => !references.muscles.some((m) => m.key === key)) ? (
                        <p role="alert">
                          یکی از عضلات قبلی غیرفعال است؛ عضلات جلسه را دوباره انتخاب کنید.
                        </p>
                      ) : null}
                      {day.blocks.map((block, blockIndex) => (
                        <section className={styles.block} key={blockIndex}>
                          <div className={styles.header}>
                            <strong>بلوک {blockIndex + 1}</strong>
                            <div className={styles.actions}>
                              <OrderActions
                                index={blockIndex}
                                total={day.blocks.length}
                                onMove={(offset) =>
                                  updateDay({
                                    ...day,
                                    blocks: move(day.blocks, blockIndex, offset)
                                  })
                                }
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  updateDay({
                                    ...day,
                                    blocks: [
                                      ...day.blocks.slice(0, blockIndex + 1),
                                      structuredClone(block),
                                      ...day.blocks.slice(blockIndex + 1)
                                    ]
                                  })
                                }
                              >
                                تکثیر بلوک
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  updateDay({
                                    ...day,
                                    blocks: day.blocks.filter((_, i) => i !== blockIndex)
                                  })
                                }
                              >
                                حذف بلوک
                              </Button>
                            </div>
                          </div>
                          <BlockEditor
                            block={block}
                            defaults={plan.defaults}
                            muscles={day.muscles}
                            references={references}
                            onChange={(next) =>
                              updateDay({
                                ...day,
                                blocks: day.blocks.map((item, i) =>
                                  i === blockIndex ? next : item
                                )
                              })
                            }
                          />
                        </section>
                      ))}
                      <Button
                        variant="secondary"
                        iconStart={<Plus size={16} />}
                        disabled={!day.muscles.length || day.blocks.length >= 30}
                        onClick={() =>
                          updateDay({
                            ...day,
                            blocks: [...day.blocks, newBlock(day.muscles[0], plan.defaults)]
                          })
                        }
                      >
                        افزودن بلوک
                      </Button>
                      {dayIndex > 0 ? (
                        <Button
                          variant="ghost"
                          onClick={() => updateDay(structuredClone(plan.days[dayIndex - 1]))}
                        >
                          کپی جلسهٔ قبل
                        </Button>
                      ) : null}
                    </fieldset>
                  );
                })}
                <p className={styles.hint}>
                  سیستم‌ها از «سیستم‌های تمرینی» و حرکت‌ها از «کاتالوگ حرکات» می‌آیند. اگر حرکت
                  سازگار پیدا نشود، تولید با علت مشخص متوقف می‌شود.
                </p>
              </>
            ) : null}
          </section>
        );
      })}
    </Card>
  );
}
