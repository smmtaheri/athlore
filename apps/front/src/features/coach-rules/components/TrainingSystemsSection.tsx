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
import type { TrainingSystem } from "../types/coachRules";
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

const partialModes = [
  { key: "one_and_half", label: "تکرار یک‌ونیم" },
  { key: "after_failure", label: "نیم‌تکرار پس از ناتوانی" },
  { key: "partial_only", label: "کل ست در دامنهٔ نیمه" }
];

type Draft = TrainingSystemInput & {
  id: string | null;
  handler_key: string;
  source: TrainingSystem["source"];
};

function schemaDefaults(system: TrainingSystem): Record<string, unknown> {
  const schema = system.parameter_schema ?? system.public_definition?.parameter_schema ?? {};
  const defaults = Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) =>
      value && typeof value === "object" && "default" in value
        ? [[key, (value as { default: unknown }).default]]
        : []
    )
  );
  return { ...defaults, ...(system.parameters ?? {}) };
}

function draftFrom(system: TrainingSystem): Draft {
  return {
    id: system.id,
    key: system.key,
    name: system.name,
    description: system.description,
    execution_method: system.execution_method,
    allowed_levels: [...(system.allowed_levels ?? [])],
    max_per_session: system.max_per_session || (system.handler_key === "partial_reps" ? 2 : 0),
    parameters: schemaDefaults(system),
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
    enabled: true,
    base_technique_key: null,
    handler_key: "",
    source: "coach_private"
  };
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

  const save = async () => {
    if (!draft?.name.trim()) {
      setFeedback("نام سیستم تمرینی را وارد کنید.");
      return;
    }
    if (draft.handler_key === "partial_reps" && !Array.isArray(draft.parameters.variants)) {
      setFeedback("حداقل یک روش تکرار نیمه را انتخاب کنید.");
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
          parameters: draft.parameters
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
      setFeedback("سیستم تمرینی ذخیره شد.");
    } catch {
      setFeedback("ذخیره سیستم انجام نشد؛ نام و تنظیمات را بررسی کنید.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget?.id) return;
    try {
      await repository.remove(deleteTarget.id);
      setSystems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(undefined);
      setFeedback(
        deleteTarget.source === "coach_override"
          ? "تنظیم شخصی حذف شد و تعریف عمومی سیستم باقی ماند."
          : "سیستم تمرینی حذف شد."
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

  const togglePartialMode = (key: string, checked: boolean) => {
    if (!draft) return;
    const current = Array.isArray(draft.parameters.variants)
      ? (draft.parameters.variants as string[])
      : partialModes.map((item) => item.key);
    const variants = checked
      ? [...new Set([...current, key])]
      : current.filter((item) => item !== key);
    updateDraft({ parameters: { ...draft.parameters, variants } });
  };

  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.header}>
          <div>
            <h2>سیستم‌های تمرینی</h2>
            <p>
              اینجا سیستم را تعریف و مدیریت کنید؛ هنگام ساخت برنامه از «برنامه‌ها ← ساخت برنامه»
              روش‌های قابل اجرا را برای همان دوره انتخاب کنید.
            </p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={() => setDraft(newDraft())}>
            سیستم جدید
          </Button>
        </div>
        <p className={styles.notice}>
          سیستم «تکرار نیمه» از ویدئو استخراج شده است. تعداد و جزئیات خوانا نبودند؛ مقادیر اولیه
          پیشنهادی‌اند و مربی می‌تواند آن‌ها را بازبینی و ویرایش کند. سیستم‌های سفارشی فعلاً
          به‌عنوان دستور مربی در روزهای برنامه ثبت می‌شوند؛ اجرای خودکار هر روش جدید به منطق اختصاصی
          موتور نیاز دارد.
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
                  {system.handler_status === "implemented" ? "قابل استفاده در تولید" : "دستور دستی"}
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
              htmlFor="training-system-name"
              hint="برای سیستم‌های سفارشی، کلید فنی خودکار ساخته می‌شود."
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
            <FormField htmlFor="training-system-description" label="توضیح کوتاه">
              <Textarea
                id="training-system-description"
                value={draft.description}
                onChange={(event) => updateDraft({ description: event.target.value })}
              />
            </FormField>
            <FormField htmlFor="training-system-execution" label="روش اجرا / نکته برای شاگرد">
              <Textarea
                id="training-system-execution"
                value={draft.execution_method}
                onChange={(event) => updateDraft({ execution_method: event.target.value })}
              />
            </FormField>
            {draft.handler_key === "partial_reps" ? (
              <div className={styles.full}>
                <strong>روش‌های قابل انتخاب برای این سیستم</strong>
                <div className={styles.checks}>
                  {partialModes.map((mode) => (
                    <Checkbox
                      checked={
                        Array.isArray(draft.parameters.variants) &&
                        (draft.parameters.variants as string[]).includes(mode.key)
                      }
                      key={mode.key}
                      label={mode.label}
                      onChange={(event) => togglePartialMode(mode.key, event.target.checked)}
                    />
                  ))}
                </div>
                <FormField
                  htmlFor="partial-rep-count"
                  hint="عدد آغازین از روی ویدئو قابل تأیید نبود؛ این مقدار صرفاً پیش‌فرض است."
                  label="نیم‌تکرار پس از ناتوانی فنی"
                >
                  <Input
                    id="partial-rep-count"
                    max={10}
                    min={1}
                    type="number"
                    value={Number(draft.parameters.after_failure_reps ?? 3)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: {
                          ...draft.parameters,
                          after_failure_reps: Number(event.target.value)
                        }
                      })
                    }
                  />
                </FormField>
                <p className={styles.notice}>
                  جهت یا بخش دامنهٔ نیمه باید برای هر حرکت توسط مربی مشخص شود؛ موتور آن را حدس
                  نمی‌زند.
                </p>
              </div>
            ) : null}
            {draft.handler_key === "drop_set" ? (
              <div className={styles.twoColumns}>
                <FormField htmlFor="drop-set-count" label="تعداد دراپ">
                  <Input
                    id="drop-set-count"
                    max={3}
                    min={1}
                    type="number"
                    value={Number(draft.parameters.drops ?? 1)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: { ...draft.parameters, drops: Number(event.target.value) }
                      })
                    }
                  />
                </FormField>
                <FormField htmlFor="drop-set-reduction" label="درصد کاهش بار">
                  <Input
                    id="drop-set-reduction"
                    max={80}
                    min={1}
                    type="number"
                    value={Number(draft.parameters.reduction_percent ?? 20)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: {
                          ...draft.parameters,
                          reduction_percent: Number(event.target.value)
                        }
                      })
                    }
                  />
                </FormField>
              </div>
            ) : null}
            {draft.handler_key === "superset" ? (
              <div className={styles.twoColumns}>
                <FormField htmlFor="superset-pairing-mode" label="نوع جفت‌سازی">
                  <select
                    id="superset-pairing-mode"
                    className={styles.select}
                    value={String(draft.parameters.pairing_mode ?? "same_muscle_isolation")}
                    onChange={(event) =>
                      updateDraft({
                        parameters: { ...draft.parameters, pairing_mode: event.target.value }
                      })
                    }
                  >
                    <option value="same_muscle_isolation">ایزوله‌های هم‌عضله</option>
                    <option value="same_muscle">حرکات هم‌عضله</option>
                    <option value="antagonist">عضلات مخالف</option>
                    <option value="any_eligible">هر دو حرکت مجاز</option>
                  </select>
                </FormField>
                <FormField htmlFor="superset-max-pairs" label="حداکثر جفت در هر جلسه">
                  <Input
                    id="superset-max-pairs"
                    max={10}
                    min={1}
                    type="number"
                    value={Number(draft.parameters.max_pairs ?? 1)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: { ...draft.parameters, max_pairs: Number(event.target.value) }
                      })
                    }
                  />
                </FormField>
                <FormField htmlFor="superset-rest-between" label="استراحت بین دو حرکت (ثانیه)">
                  <Input
                    id="superset-rest-between"
                    min={0}
                    type="number"
                    value={Number(draft.parameters.rest_between_exercises_seconds ?? 0)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: {
                          ...draft.parameters,
                          rest_between_exercises_seconds: Number(event.target.value)
                        }
                      })
                    }
                  />
                </FormField>
                <FormField htmlFor="superset-rest-after" label="استراحت پس از جفت (ثانیه)">
                  <Input
                    id="superset-rest-after"
                    min={0}
                    type="number"
                    value={Number(draft.parameters.rest_after_pair_seconds ?? 90)}
                    onChange={(event) =>
                      updateDraft({
                        parameters: {
                          ...draft.parameters,
                          rest_after_pair_seconds: Number(event.target.value)
                        }
                      })
                    }
                  />
                </FormField>
                <Checkbox
                  checked={Boolean(draft.parameters.allow_compound)}
                  label="اجازهٔ حرکت ترکیبی"
                  onChange={(event) =>
                    updateDraft({
                      parameters: { ...draft.parameters, allow_compound: event.target.checked }
                    })
                  }
                />
              </div>
            ) : null}
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
              hint="صفر یعنی بدون سقف جداگانه؛ مقدار تکرار نیمه از ۲ حرکت در جلسه شروع می‌شود."
              label="حداکثر استفاده در هر جلسه"
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
            {draft.handler_key !== "partial_reps" &&
            draft.handler_key !== "superset" &&
            draft.handler_key !== "drop_set" ? (
              <p className={styles.notice}>
                سیستم‌های جدید در این فرم ذخیره و برای مربی مستند می‌شوند؛ برای اجرای خودکار یک
                سیستم تازه باید منطق آن به موتور تولید اضافه شود.
              </p>
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
