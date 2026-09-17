import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  Activity,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  History,
  Ruler,
  Save,
  Scale,
  Send,
  ShieldAlert,
  Target
} from "lucide-react";
import { Button, FormField, Input, Radio, Select, StatusBadge, Textarea } from "../../../components/ui";
import type {
  StudentVisit,
  StudentVisitInput,
  VisitAnswerRevision
} from "../types/monthlyVisit";
import type { Student } from "../types/student";
import type {
  VisitFormAnswers,
  VisitFormTemplate,
  VisitStatus
} from "../types/visitForm";
import { visitStatusLabels } from "../types/visitForm";
import {
  createEmptyVisitFormValues,
  getFirstVisitErrorField,
  studentVisitToFormValues,
  validateStudentVisitForm,
  visitFormValuesToInput
} from "../validation/studentVisitValidation";
import { VisitDynamicForm } from "./VisitDynamicForm";
import { enabledSectionsFromTemplate } from "./visitFormUtils";
import { StudentFormSection } from "./StudentFormSection";
import styles from "./students.module.css";

export type VisitSubmitIntent =
  | "generate-program"
  | "save"
  | "finalize"
  | "send-to-student"
  | "start-coach-review";

export interface StudentVisitFormProps {
  answerRevisions?: VisitAnswerRevision[];
  formTemplates?: VisitFormTemplate[];
  initialAnswers?: VisitFormAnswers;
  initialFormTemplateId?: string | null;
  initialStatus?: VisitStatus;
  initialVisit?: StudentVisit;
  latestVisit?: StudentVisit;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (input: StudentVisitInput, intent: VisitSubmitIntent) => Promise<void>;
  student: Student;
}

const levelOptions = [
  { label: "کم", value: "low" },
  { label: "متوسط", value: "medium" },
  { label: "خوب", value: "good" },
  { label: "زیاد", value: "high" }
] as const;

const bodyFeelingOptions = [
  { label: "بهتر از قبل", value: "بهتر از قبل" },
  { label: "مشابه قبل", value: "مشابه قبل" },
  { label: "ضعیف تر از قبل", value: "ضعیف تر از قبل" }
] as const;

function visitStatusVariant(status: VisitStatus): "success" | "warning" | "neutral" | "info" {
  if (status === "finalized") return "success";
  if (status === "coach_review") return "info";
  if (status === "student_submitted") return "warning";
  if (status === "waiting_for_student") return "info";
  return "neutral";
}

function formatExpiry(value?: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("fa-IR");
  } catch {
    return value;
  }
}

function formatRevisionValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function StudentVisitForm({
  answerRevisions = [],
  formTemplates = [],
  initialAnswers,
  initialFormTemplateId,
  initialStatus = "draft",
  initialVisit,
  latestVisit,
  mode,
  onCancel,
  onSubmit,
  student
}: StudentVisitFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitIntent, setSubmitIntent] = useState<VisitSubmitIntent | "">("");
  const [values, setValues] = useState(() =>
    initialVisit
      ? studentVisitToFormValues(initialVisit)
      : createEmptyVisitFormValues(student, latestVisit)
  );
  const [formTemplateId, setFormTemplateId] = useState(
    () =>
      initialFormTemplateId ??
      initialVisit?.formTemplateId ??
      formTemplates.find((t) => t.isDefault)?.id ??
      formTemplates[0]?.id ??
      ""
  );
  const [answers, setAnswers] = useState<VisitFormAnswers>(
    () => initialAnswers ?? initialVisit?.answers ?? {}
  );
  const status: VisitStatus = initialVisit?.status ?? initialStatus ?? "draft";
  const isFinalized = status === "finalized";
  const canSend =
    !isFinalized &&
    (status === "draft" ||
      status === "waiting_for_student" ||
      status === "student_submitted" ||
      status === "coach_review");
  const canStartReview = status === "student_submitted";
  const canFinalize = !isFinalized && (status === "draft" || status === "coach_review");
  const answersReadOnly =
    status === "waiting_for_student" || status === "student_submitted" || isFinalized;
  const showRevisions =
    answerRevisions.length > 0 &&
    (status === "student_submitted" ||
      status === "coach_review" ||
      status === "waiting_for_student" ||
      status === "finalized");

  const selectedTemplate = useMemo(
    () => formTemplates.find((item) => item.id === formTemplateId) ?? null,
    [formTemplateId, formTemplates]
  );

  const templateForSections = useMemo(() => {
    if (
      mode === "edit" &&
      initialVisit?.formTemplateSnapshot?.sections?.length &&
      !selectedTemplate
    ) {
      return initialVisit.formTemplateSnapshot;
    }
    if (selectedTemplate) {
      return selectedTemplate;
    }
    return initialVisit?.formTemplateSnapshot;
  }, [initialVisit, mode, selectedTemplate]);

  const dynamicSections = useMemo(
    () => enabledSectionsFromTemplate(templateForSections),
    [templateForSections]
  );

  const templateOptions = formTemplates
    .filter((item) => item.isActive || item.id === formTemplateId)
    .map((item) => ({
      label: item.isDefault ? `${item.name} (پیش‌فرض)` : item.name,
      value: item.id
    }));

  const updateField = <TField extends keyof typeof values>(
    field: TField,
    value: (typeof values)[TField]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const handleTemplateChange = (nextId: string) => {
    setFormTemplateId(nextId);
    if (mode === "create") {
      setAnswers({});
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>, intent: VisitSubmitIntent) => {
    event.preventDefault();
    await submit(intent);
  };

  const submit = async (intent: VisitSubmitIntent) => {
    const nextErrors = validateStudentVisitForm(values);
    setErrors(nextErrors);
    setSubmitError("");
    setFeedback("");

    const firstErrorField = getFirstVisitErrorField(nextErrors);

    if (firstErrorField) {
      window.requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(
          `[data-visit-field="${firstErrorField}"]`
        );
        field?.focus();
      });
      return;
    }

    setSubmitIntent(intent);

    try {
      const base = visitFormValuesToInput(values);
      const payload: StudentVisitInput = {
        ...base,
        coachPrivateNotes: values.coachPrivateNotes,
        formTemplateId: formTemplateId || null,
        status
      };
      // Backend rejects coach answer edits while waiting_for_student / student_submitted.
      if (!answersReadOnly) {
        payload.answers = answers;
      }
      await onSubmit(payload, intent);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "ذخیره ویزیت انجام نشد. لطفا دوباره تلاش کنید."
      );
    } finally {
      setSubmitIntent("");
    }
  };

  const weightChange = Number(values.currentWeightKg || 0) - Number(values.previousWeightKg || 0);

  return (
    <form className={styles.visitForm} noValidate onSubmit={(event) => handleSubmit(event, "save")}>
      {submitError ? (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          {submitError}
        </div>
      ) : null}
      {feedback ? (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          {feedback}
        </div>
      ) : null}

      <StudentFormSection icon={ClipboardList} title="قالب فرم ویزیت">
        <div className={styles.formGrid}>
          <FormField htmlFor="visit-form-template" label="قالب فرم ویزیت">
            <Select
              disabled={templateOptions.length === 0 || isFinalized}
              id="visit-form-template"
              onChange={(event) => handleTemplateChange(event.target.value)}
              options={
                templateOptions.length > 0
                  ? templateOptions
                  : [{ label: "قالبی تعریف نشده", value: "" }]
              }
              value={formTemplateId}
            />
          </FormField>
          <FormField label="وضعیت ویزیت">
            <div className={styles.profileNameRow}>
              <StatusBadge variant={visitStatusVariant(status)}>
                {visitStatusLabels[status]}
              </StatusBadge>
              {initialVisit?.expiresAt ? (
                <span className={styles.actionHint}>
                  انقضا: {formatExpiry(initialVisit.expiresAt)}
                </span>
              ) : null}
            </div>
          </FormField>
        </div>
        {status === "waiting_for_student" ? (
          <p className={styles.actionHint}>
            فرم برای شاگرد باز است؛ برای جلوگیری از تداخل، پاسخ‌های مشترک تا زمان ارسال شاگرد یا
            شروع بررسی قفل هستند.
          </p>
        ) : null}
        {status === "student_submitted" ? (
          <p className={styles.actionHint}>
            شاگرد فرم را ارسال کرده است. برای قفل کامل فرم شاگرد و شروع ویرایش، «شروع بررسی مربی»
            را بزنید.
          </p>
        ) : null}
        {status === "coach_review" ? (
          <p className={styles.actionHint}>
            فرم شاگرد قفل است و شما در حال بررسی/ویرایش فیلدهای مجاز مربی هستید.
          </p>
        ) : null}
      </StudentFormSection>

      <StudentFormSection icon={Scale} title="۱. وضعیت فعلی و وزن جدید">
        <div className={styles.formGrid}>
          <FormField
            error={errors.visitDate}
            hint="فرمت میلادی: YYYY-MM-DD"
            htmlFor="visit-date"
            label="تاریخ ویزیت"
            required
          >
            <Input
              data-visit-field="visitDate"
              id="visit-date"
              invalid={Boolean(errors.visitDate)}
              onChange={(event) => updateField("visitDate", event.target.value)}
              placeholder="مثلاً 2026-08-09"
              value={values.visitDate}
            />
          </FormField>

          <FormField htmlFor="previous-weight" label="وزن قبلی">
            <Input
              disabled
              id="previous-weight"
              inputMode="decimal"
              readOnly
              type="number"
              value={values.previousWeightKg}
            />
          </FormField>

          <FormField
            error={errors.currentWeightKg}
            hint={`تغییر: ${formatSignedNumber(weightChange)} کیلوگرم`}
            htmlFor="current-weight"
            label="وزن جدید (کیلوگرم)"
            required
          >
            <Input
              data-visit-field="currentWeightKg"
              id="current-weight"
              inputMode="decimal"
              invalid={Boolean(errors.currentWeightKg)}
              onChange={(event) => updateField("currentWeightKg", event.target.value)}
              type="number"
              value={values.currentWeightKg}
            />
          </FormField>

          <FormField
            error={errors.bodyFatPercentage}
            hint={
              latestVisit?.bodyFatPercentage ? `قبلی: ${latestVisit.bodyFatPercentage}%` : undefined
            }
            htmlFor="body-fat"
            label="درصد چربی (در صورت اندازه گیری)"
          >
            <Input
              data-visit-field="bodyFatPercentage"
              id="body-fat"
              inputMode="decimal"
              invalid={Boolean(errors.bodyFatPercentage)}
              onChange={(event) => updateField("bodyFatPercentage", event.target.value)}
              type="number"
              value={values.bodyFatPercentage}
            />
          </FormField>

          <FormField htmlFor="body-feeling" label="احساس کلی نسبت به بدن">
            <Select
              id="body-feeling"
              onChange={(event) => updateField("bodyFeeling", event.target.value)}
              options={bodyFeelingOptions}
              value={values.bodyFeeling}
            />
          </FormField>

          <FormField htmlFor="overall-energy" label="سطح انرژی کلی">
            <Select
              id="overall-energy"
              onChange={(event) =>
                updateField(
                  "dailyEnergyLevel",
                  event.target.value as typeof values.dailyEnergyLevel
                )
              }
              options={levelOptions}
              value={values.dailyEnergyLevel}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Ruler} title="۲. اندازه های بدن (سانتی متر)">
        <div className={styles.formGrid}>
          <MeasurementField
            error={errors.chestCm}
            id="chest"
            label="دور سینه"
            onChange={(value) => updateField("chestCm", value)}
            previousValue={latestVisit?.measurements.chestCm}
            value={values.chestCm}
          />
          <MeasurementField
            error={errors.waistCm}
            id="waist"
            label="دور کمر"
            onChange={(value) => updateField("waistCm", value)}
            previousValue={latestVisit?.measurements.waistCm}
            value={values.waistCm}
          />
          <MeasurementField
            error={errors.armCm}
            id="arm"
            label="دور بازو"
            onChange={(value) => updateField("armCm", value)}
            previousValue={latestVisit?.measurements.armCm}
            value={values.armCm}
          />
          <MeasurementField
            error={errors.thighCm}
            id="thigh"
            label="دور ران"
            onChange={(value) => updateField("thighCm", value)}
            previousValue={latestVisit?.measurements.thighCm}
            value={values.thighCm}
          />
          <MeasurementField
            error={errors.hipCm}
            id="hip"
            label="دور باسن"
            onChange={(value) => updateField("hipCm", value)}
            previousValue={latestVisit?.measurements.hipCm}
            value={values.hipCm}
          />
        </div>
      </StudentFormSection>

      <StudentFormSection icon={HeartPulse} title="۳. خواب، استرس و انرژی">
        <div className={styles.formGrid}>
          <FormField htmlFor="sleep-quality" label="کیفیت خواب">
            <Select
              id="sleep-quality"
              onChange={(event) =>
                updateField("sleepQuality", event.target.value as typeof values.sleepQuality)
              }
              options={levelOptions}
              value={values.sleepQuality}
            />
          </FormField>
          <FormField htmlFor="stress-level" label="سطح استرس">
            <Select
              id="stress-level"
              onChange={(event) =>
                updateField("stressLevel", event.target.value as typeof values.stressLevel)
              }
              options={levelOptions}
              value={values.stressLevel}
            />
          </FormField>
          <FormField htmlFor="daily-energy" label="سطح انرژی روزانه">
            <Select
              id="daily-energy"
              onChange={(event) =>
                updateField(
                  "dailyEnergyLevel",
                  event.target.value as typeof values.dailyEnergyLevel
                )
              }
              options={levelOptions}
              value={values.dailyEnergyLevel}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={ClipboardCheck} title="۴. میزان اجرای برنامه قبلی">
        <div className={styles.formGrid}>
          <PercentField
            error={errors.overallPercent}
            id="overall-adherence"
            label="میزان پایبندی کلی به برنامه"
            onChange={(value) => updateField("overallPercent", value)}
            value={values.overallPercent}
          />
          <PercentField
            error={errors.trainingPercent}
            id="training-adherence"
            label="میزان رعایت تمرینات"
            onChange={(value) => updateField("trainingPercent", value)}
            value={values.trainingPercent}
          />
          <PercentField
            error={errors.nutritionPercent}
            id="nutrition-adherence"
            label="میزان رعایت تغذیه"
            onChange={(value) => updateField("nutritionPercent", value)}
            value={values.nutritionPercent}
          />
          <PercentField
            error={errors.supplementsPercent}
            id="supplements-adherence"
            label="میزان رعایت مکمل ها"
            onChange={(value) => updateField("supplementsPercent", value)}
            value={values.supplementsPercent}
          />
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Dumbbell} title="۵. تغییرات شرایط تمرین">
        <FormField htmlFor="training-condition-changes" label="تغییرات شرایط تمرین">
          <Textarea
            id="training-condition-changes"
            onChange={(event) => updateField("trainingConditionChanges", event.target.value)}
            value={values.trainingConditionChanges}
          />
        </FormField>
      </StudentFormSection>

      <StudentFormSection icon={ShieldAlert} title="۶. آسیب یا محدودیت جدید">
        <div className={styles.formGrid}>
          <BooleanRadioGroup
            label="آسیب یا محدودیت جدید وجود دارد؟"
            name="new-injury"
            onChange={(checked) => updateField("hasNewInjury", checked)}
            value={values.hasNewInjury}
          />

          {values.hasNewInjury ? (
            <FormField
              className={styles.wideField}
              error={errors.newInjuryNotes}
              htmlFor="new-injury-notes"
              label="شرح آسیب یا محدودیت جدید"
              required
            >
              <Textarea
                data-visit-field="newInjuryNotes"
                id="new-injury-notes"
                invalid={Boolean(errors.newInjuryNotes)}
                onChange={(event) => updateField("newInjuryNotes", event.target.value)}
                value={values.newInjuryNotes}
              />
            </FormField>
          ) : (
            <p className={`${styles.actionHint} ${styles.wideField}`}>
              با انتخاب «خیر»، مقدار این بخش به «بدون مورد جدید» ذخیره می شود.
            </p>
          )}
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Activity} title="۷. بازخورد و ارزیابی">
        <div className={styles.formGrid}>
          <FormField className={styles.wideField} htmlFor="student-feedback" label="بازخورد شاگرد">
            <Textarea
              id="student-feedback"
              onChange={(event) => updateField("studentFeedback", event.target.value)}
              value={values.studentFeedback}
            />
          </FormField>
          <FormField className={styles.wideField} htmlFor="coach-assessment" label="ارزیابی مربی">
            <Textarea
              id="coach-assessment"
              onChange={(event) => updateField("coachAssessment", event.target.value)}
              value={values.coachAssessment}
            />
          </FormField>
          <FormField
            className={styles.wideField}
            htmlFor="next-cycle-goal"
            label="هدف یا تصمیم دوره بعد"
          >
            <Textarea
              id="next-cycle-goal"
              onChange={(event) => updateField("nextCycleGoal", event.target.value)}
              value={values.nextCycleGoal}
            />
          </FormField>
          <FormField className={styles.wideField} htmlFor="coach-notes" label="یادداشت مربی">
            <Textarea
              id="coach-notes"
              onChange={(event) => updateField("coachNotes", event.target.value)}
              value={values.coachNotes}
            />
          </FormField>
          <FormField
            className={styles.wideField}
            htmlFor="coach-private-notes"
            label="یادداشت خصوصی مربی"
          >
            <Textarea
              id="coach-private-notes"
              onChange={(event) => updateField("coachPrivateNotes", event.target.value)}
              value={values.coachPrivateNotes}
            />
          </FormField>
        </div>
      </StudentFormSection>

      {dynamicSections.length > 0 ? (
        <VisitDynamicForm
          answers={answers}
          disabled={answersReadOnly || isFinalized}
          onAnswersChange={setAnswers}
          sections={dynamicSections}
        />
      ) : null}

      {showRevisions ? (
        <StudentFormSection icon={History} title="تاریخچه پاسخ‌ها">
          <ul className={styles.profileSummaryGrid}>
            {answerRevisions.map((revision) => (
              <li key={revision.id}>
                <strong>{revision.fieldKey}</strong>
                {" · "}
                <span>{revision.source}</span>
                {" · "}
                <span>{formatExpiry(revision.createdAt)}</span>
                <div>{formatRevisionValue(revision.value)}</div>
              </li>
            ))}
          </ul>
        </StudentFormSection>
      ) : null}

      <div className={styles.actionBar}>
        <span className={styles.actionHint}>
          {isFinalized
            ? "این ویزیت نهایی شده و فقط قابل مشاهده است."
            : status === "coach_review"
              ? "فرم شاگرد قفل است؛ پس از بررسی، ویزیت را نهایی کنید."
              : status === "student_submitted"
                ? "برای ویرایش پاسخ‌ها ابتدا بررسی مربی را شروع کنید."
                : mode === "edit"
                  ? "تغییرات روی ویزیت انتخاب شده ذخیره می شود."
                  : "پس از ثبت، ویزیت به صورت پیش‌نویس ذخیره می شود."}
        </span>
        <div className={styles.actionBarButtons}>
          <Button onClick={onCancel} type="button" variant="secondary">
            انصراف
          </Button>
          {!isFinalized ? (
            <Button
              iconStart={<Save size={18} />}
              isLoading={submitIntent === "save"}
              type="submit"
              variant="secondary"
            >
              {mode === "edit" ? "ذخیره ویزیت" : "ثبت پیش‌نویس"}
            </Button>
          ) : null}
          {canSend ? (
            <Button
              iconStart={<Send size={18} />}
              isLoading={submitIntent === "send-to-student"}
              onClick={() => submit("send-to-student")}
              type="button"
              variant="secondary"
            >
              ارسال برای شاگرد
            </Button>
          ) : null}
          {canStartReview ? (
            <Button
              iconStart={<ClipboardCheck size={18} />}
              isLoading={submitIntent === "start-coach-review"}
              onClick={() => submit("start-coach-review")}
              type="button"
            >
              شروع بررسی مربی
            </Button>
          ) : null}
          {canFinalize ? (
            <Button
              iconStart={<ClipboardCheck size={18} />}
              isLoading={submitIntent === "finalize"}
              onClick={() => submit("finalize")}
              type="button"
            >
              ذخیره و نهایی‌سازی
            </Button>
          ) : null}
          {!isFinalized ? (
            <Button
              iconStart={<Target size={18} />}
              isLoading={submitIntent === "generate-program"}
              onClick={() => submit("generate-program")}
              type="button"
              variant="success"
            >
              ثبت و ادامه برای تولید برنامه
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

interface NumberFieldProps {
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  previousValue?: number;
  value: string;
}

function MeasurementField({ error, id, label, onChange, previousValue, value }: NumberFieldProps) {
  return (
    <FormField
      error={error}
      hint={previousValue === undefined ? undefined : `قبلی: ${previousValue}`}
      htmlFor={`measurement-${id}`}
      label={label}
    >
      <Input
        data-visit-field={`${id}Cm`}
        id={`measurement-${id}`}
        inputMode="decimal"
        invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </FormField>
  );
}

function PercentField({ error, id, label, onChange, value }: NumberFieldProps) {
  return (
    <FormField error={error} htmlFor={id} label={label}>
      <Input
        data-visit-field={idToField(id)}
        id={id}
        inputMode="numeric"
        invalid={Boolean(error)}
        max={100}
        min={0}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </FormField>
  );
}

interface BooleanRadioGroupProps {
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
  value: boolean;
}

function BooleanRadioGroup({ label, name, onChange, value }: BooleanRadioGroupProps) {
  return (
    <fieldset className={styles.choiceFieldset}>
      <legend className={styles.choiceLegend}>{label}</legend>
      <div className={styles.choiceRow}>
        <Radio checked={value} label="بله" name={name} onChange={() => onChange(true)} />
        <Radio checked={!value} label="خیر" name={name} onChange={() => onChange(false)} />
      </div>
    </fieldset>
  );
}

function idToField(id: string) {
  return id
    .replace("overall-adherence", "overallPercent")
    .replace("training-adherence", "trainingPercent")
    .replace("nutrition-adherence", "nutritionPercent")
    .replace("supplements-adherence", "supplementsPercent");
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "۰";
  }

  if (value > 0) {
    return `+${value.toFixed(1)}`;
  }

  return value.toFixed(1);
}
