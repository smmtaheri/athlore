import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Modal,
  StatusBadge,
  Switch,
  Textarea
} from "../../../components/ui";
import type { TrainingRecipe, TrainingRecipeStep, TrainingSystem } from "../types/coachRules";
import {
  trainingSystemsRepository,
  type TrainingSystemInput,
  type TrainingSystemsRepository
} from "../services/trainingSystemsRepository";
import styles from "./trainingSystems.module.css";

const levels = [
  { key: "beginner", label: "مبتدی" },
  { key: "intermediate", label: "نیمه‌حرفه‌ای" },
  { key: "advanced", label: "حرفه‌ای" }
];

const targets = [
  { value: "all", label: "همهٔ حرکت‌های واجد شرایط" },
  { value: "last_exercise", label: "آخرین حرکت جلسه" },
  { value: "last_isolation", label: "آخرین حرکت ایزولهٔ جلسه" },
  { value: "last_set", label: "فقط ست پایانی حرکت هدف" }
] as const;

const operationOptions = [
  { value: "prescribe", label: "تنظیم ست، تکرار و استراحت" },
  { value: "rest", label: "مکث / استراحت درون روش" },
  { value: "load_change", label: "تغییر بار" },
  { value: "partial_range", label: "تکرار نیمه / دامنه حرکت" },
  { value: "tempo", label: "تمپو / مکث ایزومتریک" },
  { value: "repeat", label: "تکرار یک توالی" },
  { value: "instruction", label: "دستور متنی برای شاگرد" }
] as const;

const makeRecipe = (): TrainingRecipe => ({ version: 1, target: "all", steps: [] });

type Draft = TrainingSystemInput & {
  id: string | null;
  handler_key: string;
  recipe: TrainingRecipe;
  source: TrainingSystem["source"];
};

function copyRecipe(system: TrainingSystem): TrainingRecipe {
  if (system.recipe?.version === 1) return structuredClone(system.recipe);
  if (system.handler_key === "partial_reps") {
    return {
      version: 1,
      target: "last_isolation",
      steps: [{ op: "partial_range", mode: "after_failure", count: 3 }]
    };
  }
  if (system.handler_key === "superset") {
    return {
      version: 1,
      target: "all",
      grouping: {
        size: 2,
        mode: "same_muscle_isolation",
        max_groups_per_session: 1,
        rest_between_seconds: 0,
        rest_after_seconds: 90
      },
      steps: [{ op: "instruction", title: "اجرا", text: "حرکت‌ها را پشت‌سرهم اجرا کن." }]
    };
  }
  return makeRecipe();
}

function draftFrom(system: TrainingSystem): Draft {
  return {
    id: system.id,
    key: system.key,
    name: system.name,
    description: system.description,
    execution_method: system.execution_method,
    allowed_levels: [...(system.allowed_levels ?? [])],
    max_per_session: system.max_per_session || 0,
    parameters: structuredClone(system.parameters ?? {}),
    recipe: copyRecipe(system),
    enabled: system.source === "platform" ? true : system.enabled,
    base_technique_key:
      system.base_technique_key ?? (system.source === "platform" ? system.key : null),
    handler_key: system.handler_key ?? "",
    source: system.source
  };
}

function newDraft(): Draft {
  const suffix = Math.random().toString(36).slice(2, 9);
  return {
    id: null,
    key: `coach-system-${suffix}`,
    name: "",
    description: "",
    execution_method: "",
    allowed_levels: [],
    max_per_session: 0,
    parameters: {},
    recipe: makeRecipe(),
    enabled: true,
    base_technique_key: null,
    handler_key: "recipe",
    source: "coach_private"
  };
}

function freshStep(): TrainingRecipeStep {
  return { op: "instruction", title: "", text: "" };
}

function RecipeStepsEditor({
  steps,
  onChange,
  depth = 0
}: {
  steps: TrainingRecipeStep[];
  onChange: (steps: TrainingRecipeStep[]) => void;
  depth?: number;
}) {
  const update = (index: number, patch: Record<string, unknown>) =>
    onChange(steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  const remove = (index: number) => onChange(steps.filter((_, stepIndex) => stepIndex !== index));

  return (
    <div className={styles.recipeSteps}>
      {steps.map((step, index) => (
        <div className={styles.recipeStep} key={`${depth}-${index}`}>
          <div className={styles.recipeStepHead}>
            <strong>مرحله {index + 1}</strong>
            <Button
              iconStart={<Trash2 size={15} />}
              onClick={() => remove(index)}
              size="sm"
              variant="danger"
            >
              حذف مرحله
            </Button>
          </div>
          <FormField htmlFor={`recipe-op-${depth}-${index}`} label="نوع مرحله">
            <select
              className={styles.select}
              id={`recipe-op-${depth}-${index}`}
              value={step.op}
              onChange={(event) => {
                const next = freshStep();
                next.op = event.target.value;
                if (next.op === "prescribe")
                  Object.assign(next, { sets: 3, reps: "۸ تا ۱۲", rest_seconds: 90 });
                if (next.op === "rest") Object.assign(next, { seconds: 20 });
                if (next.op === "load_change")
                  Object.assign(next, { direction: "down", percent: 20 });
                if (next.op === "partial_range")
                  Object.assign(next, { mode: "after_failure", count: 3 });
                if (next.op === "tempo") Object.assign(next, { pattern: "3-1-2" });
                if (next.op === "repeat") Object.assign(next, { count: 2, steps: [freshStep()] });
                if (next.op === "instruction") Object.assign(next, { title: "", text: "" });
                update(index, next);
              }}
            >
              {operationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          {step.op === "prescribe" ? (
            <div className={styles.twoColumns}>
              <FormField htmlFor={`recipe-sets-${depth}-${index}`} label="تعداد ست">
                <Input
                  id={`recipe-sets-${depth}-${index}`}
                  min={1}
                  type="number"
                  value={Number(step.sets ?? 3)}
                  onChange={(event) => update(index, { sets: Number(event.target.value) })}
                />
              </FormField>
              <FormField htmlFor={`recipe-reps-${depth}-${index}`} label="تکرار / الگو">
                <Input
                  id={`recipe-reps-${depth}-${index}`}
                  value={String(step.reps ?? "")}
                  onChange={(event) => update(index, { reps: event.target.value })}
                />
              </FormField>
              <FormField
                htmlFor={`recipe-rest-${depth}-${index}`}
                label="استراحت بین ست‌ها (ثانیه)"
              >
                <Input
                  id={`recipe-rest-${depth}-${index}`}
                  min={0}
                  type="number"
                  value={Number(step.rest_seconds ?? 90)}
                  onChange={(event) => update(index, { rest_seconds: Number(event.target.value) })}
                />
              </FormField>
              <FormField htmlFor={`recipe-rpe-${depth}-${index}`} label="شدت / RPE (اختیاری)">
                <Input
                  id={`recipe-rpe-${depth}-${index}`}
                  value={String(step.rpe ?? "")}
                  onChange={(event) => update(index, { rpe: event.target.value })}
                />
              </FormField>
            </div>
          ) : null}

          {step.op === "rest" ? (
            <FormField htmlFor={`recipe-seconds-${depth}-${index}`} label="مکث این مرحله (ثانیه)">
              <Input
                id={`recipe-seconds-${depth}-${index}`}
                min={0}
                type="number"
                value={Number(step.seconds ?? 20)}
                onChange={(event) => update(index, { seconds: Number(event.target.value) })}
              />
            </FormField>
          ) : null}

          {step.op === "load_change" ? (
            <div className={styles.twoColumns}>
              <FormField htmlFor={`recipe-direction-${depth}-${index}`} label="جهت تغییر بار">
                <select
                  className={styles.select}
                  id={`recipe-direction-${depth}-${index}`}
                  value={String(step.direction ?? "down")}
                  onChange={(event) => update(index, { direction: event.target.value })}
                >
                  <option value="down">کاهش</option>
                  <option value="up">افزایش</option>
                </select>
              </FormField>
              <FormField htmlFor={`recipe-percent-${depth}-${index}`} label="درصد تغییر">
                <Input
                  id={`recipe-percent-${depth}-${index}`}
                  max={80}
                  min={1}
                  type="number"
                  value={Number(step.percent ?? 20)}
                  onChange={(event) => update(index, { percent: Number(event.target.value) })}
                />
              </FormField>
            </div>
          ) : null}

          {step.op === "partial_range" ? (
            <div className={styles.twoColumns}>
              <FormField htmlFor={`recipe-partial-mode-${depth}-${index}`} label="روش">
                <select
                  className={styles.select}
                  id={`recipe-partial-mode-${depth}-${index}`}
                  value={String(step.mode ?? "after_failure")}
                  onChange={(event) => update(index, { mode: event.target.value })}
                >
                  <option value="one_and_half">تکرار یک‌ونیم</option>
                  <option value="after_failure">نیم‌تکرار پس از ناتوانی</option>
                  <option value="partial_only">کل ست در دامنهٔ نیمه</option>
                </select>
              </FormField>
              <FormField htmlFor={`recipe-partial-count-${depth}-${index}`} label="تعداد (اختیاری)">
                <Input
                  id={`recipe-partial-count-${depth}-${index}`}
                  max={30}
                  min={1}
                  type="number"
                  value={Number(step.count ?? 3)}
                  onChange={(event) => update(index, { count: Number(event.target.value) })}
                />
              </FormField>
              <FormField
                className={styles.full}
                htmlFor={`recipe-partial-range-${depth}-${index}`}
                label="دامنهٔ حرکت (اختیاری)"
              >
                <Input
                  id={`recipe-partial-range-${depth}-${index}`}
                  value={String(step.range ?? "")}
                  onChange={(event) => update(index, { range: event.target.value })}
                />
              </FormField>
            </div>
          ) : null}

          {step.op === "tempo" ? (
            <div className={styles.twoColumns}>
              <FormField htmlFor={`recipe-tempo-${depth}-${index}`} label="تمپو (مثلاً ۳-۱-۲)">
                <Input
                  id={`recipe-tempo-${depth}-${index}`}
                  value={String(step.pattern ?? "3-1-2")}
                  onChange={(event) => update(index, { pattern: event.target.value })}
                />
              </FormField>
              <FormField
                htmlFor={`recipe-hold-${depth}-${index}`}
                label="مکث ایزومتریک (ثانیه، اختیاری)"
              >
                <Input
                  id={`recipe-hold-${depth}-${index}`}
                  min={1}
                  type="number"
                  value={Number(step.hold_seconds ?? "")}
                  onChange={(event) => update(index, { hold_seconds: Number(event.target.value) })}
                />
              </FormField>
            </div>
          ) : null}

          {step.op === "instruction" ? (
            <div className={styles.twoColumns}>
              <FormField htmlFor={`recipe-title-${depth}-${index}`} label="عنوان دستور">
                <Input
                  id={`recipe-title-${depth}-${index}`}
                  value={String(step.title ?? "")}
                  onChange={(event) => update(index, { title: event.target.value })}
                />
              </FormField>
              <FormField
                className={styles.full}
                htmlFor={`recipe-text-${depth}-${index}`}
                label="توضیح برای شاگرد"
              >
                <Textarea
                  id={`recipe-text-${depth}-${index}`}
                  value={String(step.text ?? "")}
                  onChange={(event) => update(index, { text: event.target.value })}
                />
              </FormField>
            </div>
          ) : null}

          {step.op === "repeat" ? (
            <div className={styles.full}>
              <FormField htmlFor={`recipe-repeat-${depth}-${index}`} label="چند بار تکرار شود؟">
                <Input
                  id={`recipe-repeat-${depth}-${index}`}
                  max={10}
                  min={1}
                  type="number"
                  value={Number(step.count ?? 2)}
                  onChange={(event) => update(index, { count: Number(event.target.value) })}
                />
              </FormField>
              <strong>مراحل داخل هر دور</strong>
              <RecipeStepsEditor
                depth={depth + 1}
                onChange={(nested) => update(index, { steps: nested })}
                steps={Array.isArray(step.steps) ? (step.steps as TrainingRecipeStep[]) : []}
              />
              {depth < 1 ? (
                <Button
                  iconStart={<Plus size={15} />}
                  onClick={() => {
                    const nested = Array.isArray(step.steps)
                      ? [...(step.steps as TrainingRecipeStep[])]
                      : [];
                    update(index, { steps: [...nested, freshStep()] });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  افزودن مرحلهٔ تکرارشونده
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <Button
        iconStart={<Plus size={16} />}
        onClick={() => onChange([...steps, freshStep()])}
        size="sm"
        variant="secondary"
      >
        افزودن مرحله
      </Button>
    </div>
  );
}

export function TrainingSystemsSection({
  repository = trainingSystemsRepository
}: {
  repository?: TrainingSystemsRepository;
}) {
  const [systems, setSystems] = useState<TrainingSystem[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [deleteTarget, setDeleteTarget] = useState<TrainingSystem>();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setSystems(await repository.list());
      setError(false);
    } catch {
      setError(true);
      setFeedback("دریافت سیستم‌های تمرینی انجام نشد.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize remote catalog state on mount.
    void load();
    // Repository identity is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const updateRecipe = (patch: Partial<TrainingRecipe>) =>
    setDraft((current) =>
      current?.recipe ? { ...current, recipe: { ...current.recipe, ...patch } } : current
    );

  const save = async () => {
    if (!draft?.name.trim()) {
      setFeedback("نام سیستم تمرینی را وارد کنید.");
      return;
    }
    if (!draft.recipe.steps.length) {
      setFeedback("حداقل یک مرحله برای سیستم تمرینی تعریف کنید.");
      return;
    }
    if (
      draft.recipe.steps.some(
        (step) =>
          step.op === "instruction" &&
          (!String(step.title ?? "").trim() || !String(step.text ?? "").trim())
      )
    ) {
      setFeedback("عنوان و متن دستور هر مرحلهٔ متنی را کامل کنید.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const saved = await repository.save(
        {
          allowed_levels: draft.allowed_levels,
          base_technique_key: draft.base_technique_key,
          description: draft.description,
          enabled: draft.enabled,
          execution_method: draft.execution_method,
          key: draft.key,
          max_per_session: draft.max_per_session,
          name: draft.name.trim(),
          parameters: draft.parameters,
          recipe: draft.recipe
        },
        draft.id
      );
      setSystems((current) => {
        const index = current.findIndex((item) => item.id === saved.id || item.key === saved.key);
        return index < 0
          ? [...current, saved].sort((a, b) => a.name.localeCompare(b.name, "fa"))
          : current.map((item, itemIndex) => (itemIndex === index ? saved : item));
      });
      setDraft(undefined);
      setFeedback("سیستم تمرینی ذخیره شد؛ تعریف شخصی شما در تولید برنامه استفاده می‌شود.");
    } catch {
      setFeedback("ذخیره سیستم انجام نشد؛ مراحل و تنظیمات را بررسی کنید.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget?.id) return;
    try {
      await repository.remove(deleteTarget.id);
      const wasOverride = deleteTarget.source === "coach_override";
      if (wasOverride) await load();
      else setSystems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(undefined);
      setFeedback(
        wasOverride ? "تنظیم شخصی حذف شد و تعریف عمومی سیستم باقی ماند." : "سیستم تمرینی حذف شد."
      );
    } catch {
      setFeedback("حذف سیستم تمرینی انجام نشد.");
    }
  };

  const toggleLevel = (key: string, checked: boolean) => {
    if (!draft) return;
    updateDraft({
      allowed_levels: checked
        ? [...draft.allowed_levels, key]
        : draft.allowed_levels.filter((item) => item !== key)
    });
  };

  const setGroupingSize = (size: number) => {
    if (!draft?.recipe) return;
    const previous = draft.recipe.grouping?.exercise_prescriptions ?? [];
    const prescriptions = Array.from(
      { length: size },
      (_, index) => previous[index] ?? { sets: 3, reps: "۸ تا ۱۲" }
    );
    updateRecipe({
      grouping: {
        size,
        mode: draft.recipe.grouping?.mode ?? "same_muscle",
        max_groups_per_session: draft.recipe.grouping?.max_groups_per_session ?? 1,
        rest_between_seconds: draft.recipe.grouping?.rest_between_seconds ?? 0,
        rest_after_seconds: draft.recipe.grouping?.rest_after_seconds ?? 90,
        exercise_order: draft.recipe.grouping?.exercise_order ?? "generated",
        allow_compound: draft.recipe.grouping?.allow_compound ?? false,
        exercise_prescriptions: prescriptions
      }
    });
  };

  const updateGroupPrescription = (index: number, key: string, value: unknown) => {
    if (!draft?.recipe?.grouping) return;
    const prescriptions = [...(draft.recipe.grouping.exercise_prescriptions ?? [])];
    prescriptions[index] = { ...(prescriptions[index] ?? {}), [key]: value };
    updateRecipe({ grouping: { ...draft.recipe.grouping, exercise_prescriptions: prescriptions } });
  };

  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.header}>
          <div>
            <h2>سیستم‌های تمرینی</h2>
            <p>
              روش آماده را برای خودتان تنظیم کنید یا سیستم تازه‌ای بسازید. در ساخت برنامه کافی است
              روش را انتخاب کنید؛ مراحل recipe به نسخهٔ برنامه و دستور شاگرد اضافه می‌شود.
            </p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={() => setDraft(newDraft())}>
            سیستم جدید
          </Button>
        </div>
        <p className={styles.notice}>
          تعریف عمومیِ روش‌ها فقط نقطهٔ شروع است. تغییر نسخهٔ مربی مستقل است. برای «ماموت‌ست» و
          روش‌های وابسته به انتخاب حرکت، مراحل و گروه‌بندی را پیش از استفاده بازبینی کنید.
        </p>
        {feedback ? (
          <div className={error ? styles.error : styles.feedback} role={error ? "alert" : "status"}>
            {feedback}
          </div>
        ) : null}
        {loading ? <p>در حال بارگذاری سیستم‌ها…</p> : null}
        {!loading && systems.length === 0 ? (
          <EmptyState description="هنوز سیستمی ثبت نشده است." title="فهرست خالی است" />
        ) : null}
        <div className={styles.list}>
          {systems.map((system) => (
            <article className={styles.systemCard} key={system.id ?? system.key}>
              <div className={styles.systemHead}>
                <div>
                  <h3>{system.name}</h3>
                  <p>{system.description || "بدون توضیح"}</p>
                </div>
                <StatusBadge
                  variant={system.handler_status === "implemented" ? "success" : "warning"}
                >
                  {system.handler_status === "implemented"
                    ? "قابل استفاده در تولید"
                    : "نیازمند تعریف مراحل"}
                </StatusBadge>
              </div>
              {system.execution_method ? (
                <p className={styles.method}>{system.execution_method}</p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    setFeedback("");
                    setDraft(draftFrom(system));
                  }}
                  variant="secondary"
                >
                  {system.source === "platform" ? "تنظیم برای من" : "ویرایش"}
                </Button>
                {system.id ? (
                  <Button
                    iconStart={<Trash2 size={16} />}
                    onClick={() => setDeleteTarget(system)}
                    variant="danger"
                  >
                    {system.source === "coach_override" ? "حذف تنظیم" : "حذف"}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Card>

      {draft ? (
        <Modal
          footer={
            <>
              <Button
                disabled={saving}
                iconStart={<Save size={17} />}
                isLoading={saving}
                onClick={() => void save()}
              >
                ذخیره سیستم
              </Button>
              <Button onClick={() => setDraft(undefined)} variant="secondary">
                انصراف
              </Button>
            </>
          }
          onClose={() => setDraft(undefined)}
          open
          title={draft.id ? `ویرایش ${draft.name}` : "سیستم تمرینی جدید"}
        >
          <div className={styles.editor}>
            <FormField
              className={styles.full}
              htmlFor="training-system-name"
              label="نام سیستم"
              required
            >
              <Input
                id="training-system-name"
                autoFocus
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
              />
            </FormField>
            <FormField
              className={styles.full}
              htmlFor="training-system-description"
              label="توضیح کوتاه"
            >
              <Textarea
                id="training-system-description"
                value={draft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
              />
            </FormField>
            <FormField
              className={styles.full}
              htmlFor="training-system-execution"
              label="روش اجرا / نکته برای شاگرد"
            >
              <Textarea
                id="training-system-execution"
                value={draft.execution_method}
                onChange={(event) => updateDraft({ execution_method: event.target.value })}
              />
            </FormField>

            <div className={`${styles.full} ${styles.recipePanel}`}>
              <div>
                <strong>هدف و ساختار اجرا</strong>
                <p className={styles.method}>
                  تنظیم‌های این بخش روی انتخاب حرکت‌ها و نحوهٔ اجرای recipe در هر جلسه اثر
                  می‌گذارند.
                </p>
              </div>
              <FormField htmlFor="recipe-target" label="روی کدام حرکت‌ها اعمال شود؟">
                <select
                  className={styles.select}
                  id="recipe-target"
                  value={draft.recipe.target}
                  onChange={(event) =>
                    updateRecipe({ target: event.target.value as TrainingRecipe["target"] })
                  }
                >
                  {targets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <Checkbox
                checked={Boolean(draft.recipe.grouping)}
                label="چند حرکت را به‌صورت یک گروه متوالی اجرا کن"
                onChange={(event) => {
                  if (event.target.checked) setGroupingSize(draft.recipe.grouping?.size ?? 2);
                  else updateRecipe({ grouping: undefined });
                }}
              />
              {draft.recipe.grouping ? (
                <div className={styles.full}>
                  <div className={styles.twoColumns}>
                    <FormField htmlFor="recipe-group-size" label="تعداد حرکت در گروه">
                      <Input
                        id="recipe-group-size"
                        max={8}
                        min={2}
                        type="number"
                        value={draft.recipe.grouping.size}
                        onChange={(event) => setGroupingSize(Number(event.target.value))}
                      />
                    </FormField>
                    <FormField htmlFor="recipe-group-mode" label="قانون انتخاب گروه">
                      <select
                        className={styles.select}
                        id="recipe-group-mode"
                        value={draft.recipe.grouping.mode}
                        onChange={(event) =>
                          updateRecipe({
                            grouping: {
                              ...draft.recipe.grouping!,
                              mode: event.target.value as NonNullable<
                                TrainingRecipe["grouping"]
                              >["mode"]
                            }
                          })
                        }
                      >
                        <option value="same_muscle">هم‌عضله</option>
                        <option value="same_muscle_isolation">ایزوله‌های هم‌عضله</option>
                        <option value="antagonist">عضلات مخالف</option>
                        <option value="any_eligible">حرکت‌های واجد شرایط</option>
                        <option value="alternating">عضلهٔ متفاوت در هر حرکت</option>
                      </select>
                    </FormField>
                    <FormField htmlFor="recipe-group-limit" label="حداکثر گروه در هر جلسه">
                      <Input
                        id="recipe-group-limit"
                        max={10}
                        min={1}
                        type="number"
                        value={draft.recipe.grouping.max_groups_per_session}
                        onChange={(event) =>
                          updateRecipe({
                            grouping: {
                              ...draft.recipe.grouping!,
                              max_groups_per_session: Number(event.target.value)
                            }
                          })
                        }
                      />
                    </FormField>
                    <FormField htmlFor="recipe-group-between" label="مکث بین حرکت‌ها (ثانیه)">
                      <Input
                        id="recipe-group-between"
                        min={0}
                        type="number"
                        value={draft.recipe.grouping.rest_between_seconds}
                        onChange={(event) =>
                          updateRecipe({
                            grouping: {
                              ...draft.recipe.grouping!,
                              rest_between_seconds: Number(event.target.value)
                            }
                          })
                        }
                      />
                    </FormField>
                    <FormField htmlFor="recipe-group-after" label="استراحت پس از گروه (ثانیه)">
                      <Input
                        id="recipe-group-after"
                        min={0}
                        type="number"
                        value={draft.recipe.grouping.rest_after_seconds}
                        onChange={(event) =>
                          updateRecipe({
                            grouping: {
                              ...draft.recipe.grouping!,
                              rest_after_seconds: Number(event.target.value)
                            }
                          })
                        }
                      />
                    </FormField>
                    <FormField htmlFor="recipe-group-order" label="ترتیب حرکات">
                      <select
                        className={styles.select}
                        id="recipe-group-order"
                        value={draft.recipe.grouping.exercise_order ?? "generated"}
                        onChange={(event) =>
                          updateRecipe({
                            grouping: {
                              ...draft.recipe.grouping!,
                              exercise_order: event.target.value as NonNullable<
                                TrainingRecipe["grouping"]
                              >["exercise_order"]
                            }
                          })
                        }
                      >
                        <option value="generated">ترتیب تولید برنامه</option>
                        <option value="isolation_first">ایزوله، سپس چندمفصلی</option>
                        <option value="compound_first">چندمفصلی، سپس ایزوله</option>
                      </select>
                    </FormField>
                  </div>
                  <Checkbox
                    checked={Boolean(draft.recipe.grouping.allow_compound)}
                    label="اجازهٔ حرکت چندمفصلی در گروه"
                    onChange={(event) =>
                      updateRecipe({
                        grouping: {
                          ...draft.recipe.grouping!,
                          allow_compound: event.target.checked
                        }
                      })
                    }
                  />
                  {draft.recipe.grouping.exercise_prescriptions?.length ? (
                    <div className={styles.groupPrescriptions}>
                      <strong>نسخهٔ هر حرکت در گروه</strong>
                      {draft.recipe.grouping.exercise_prescriptions.map((prescription, index) => (
                        <div className={styles.twoColumns} key={index}>
                          <FormField
                            htmlFor={`group-reps-${index}`}
                            label={`حرکت ${index + 1} · تکرار`}
                          >
                            <Input
                              id={`group-reps-${index}`}
                              value={String(prescription.reps ?? "")}
                              onChange={(event) =>
                                updateGroupPrescription(index, "reps", event.target.value)
                              }
                            />
                          </FormField>
                          <FormField htmlFor={`group-sets-${index}`} label="تعداد ست">
                            <Input
                              id={`group-sets-${index}`}
                              min={1}
                              type="number"
                              value={Number(prescription.sets ?? 3)}
                              onChange={(event) =>
                                updateGroupPrescription(index, "sets", Number(event.target.value))
                              }
                            />
                          </FormField>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className={styles.full}>
              <strong>مراحل recipe — به همین ترتیب روی برنامه اعمال می‌شوند</strong>
              <RecipeStepsEditor
                steps={draft.recipe.steps}
                onChange={(steps) => updateRecipe({ steps })}
              />
            </div>

            <div className={styles.full}>
              <strong>سطح مجاز؛ هیچ گزینه‌ای یعنی همهٔ سطح‌ها</strong>
              <div className={styles.checks}>
                {levels.map((level) => (
                  <Checkbox
                    checked={draft.allowed_levels.includes(level.key)}
                    key={level.key}
                    label={level.label}
                    onChange={(event) => toggleLevel(level.key, event.target.checked)}
                  />
                ))}
              </div>
            </div>
            <FormField
              htmlFor="training-system-max-per-session"
              hint="صفر یعنی بدون سقف جداگانه."
              label="حداکثر اعمال در هر جلسه"
            >
              <Input
                id="training-system-max-per-session"
                min={0}
                type="number"
                value={draft.max_per_session}
                onChange={(event) => updateDraft({ max_per_session: Number(event.target.value) })}
              />
            </FormField>
            {draft.source !== "platform" || !draft.id ? (
              <Switch
                checked={draft.enabled}
                label="فعال برای انتخاب در برنامه‌ها"
                onCheckedChange={(enabled) => updateDraft({ enabled })}
              />
            ) : null}
            {feedback ? (
              <div className={styles.error} role="alert">
                {feedback}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <Modal
        footer={
          <>
            <Button onClick={() => setDeleteTarget(undefined)} variant="secondary">
              انصراف
            </Button>
            <Button iconStart={<Trash2 size={16} />} onClick={() => void remove()} variant="danger">
              تأیید حذف
            </Button>
          </>
        }
        onClose={() => setDeleteTarget(undefined)}
        open={Boolean(deleteTarget)}
        title="حذف سیستم تمرینی"
      >
        {deleteTarget?.source === "coach_override"
          ? "فقط تنظیمات شخصی این سیستم حذف می‌شود و تعریف عمومی باقی می‌ماند."
          : `«${deleteTarget?.name}» از سیستم‌های شخصی مربی حذف می‌شود.`}
      </Modal>
    </div>
  );
}
