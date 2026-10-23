import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck,
  Dumbbell,
  HeartPulse,
  History,
  ImagePlus,
  MessageSquare,
  Ruler,
  Save,
  Scale,
  Send,
  ShieldAlert,
  Target
} from "lucide-react";
import { Button, FormField, Input, Select, StatusBadge, Textarea } from "../../../components/ui";
import {
  formatCalendarDateTime,
  formatCalendarText,
  calendarName,
  calendarPlaceholder
} from "../../../shared/dates/calendar";
import type { ProgramRequest } from "../../program-requests/types/programRequest";
import type { StudentVisit, StudentVisitInput, VisitAnswerRevision } from "../types/monthlyVisit";
import type { Student } from "../types/student";
import type {
  VisitFormAnswers,
  VisitFormFieldDefinition,
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
import { VisitAnswersReadonly, VisitDynamicFields, VisitDynamicForm } from "./VisitDynamicForm";
import { enabledSectionsFromTemplate } from "./visitFormUtils";
import {
  prefillVisitAnswers,
  reconcileWeakMuscleAnswers,
  visitFormLayout
} from "./visitFormLayout";
import { StudentFormSection } from "./StudentFormSection";
import styles from "./students.module.css";

export type VisitSubmitIntent =
  "generate-program" | "save" | "finalize" | "send-to-student" | "start-coach-review";

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
  photoPanel?: ReactNode;
  photosUploading?: boolean;
  programRequest?: ProgramRequest | null;
  onSubmit: (input: StudentVisitInput, intent: VisitSubmitIntent) => Promise<void>;
  student: Student;
}

const levelOptions = [
  { label: "ثبت نشده", value: "" },
  { label: "کم", value: "low" },
  { label: "متوسط", value: "medium" },
  { label: "خوب", value: "good" },
  { label: "زیاد", value: "high" }
];

function formatExpiry(value?: string | null): string {
  return value ? formatCalendarDateTime(value) : "";
}

function formatRevisionValue(value: unknown): string {
  if (value == null) return "ثبت نشده";
  if (typeof value === "string") return formatCalendarText(value);
  return JSON.stringify(value);
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
  photoPanel,
  photosUploading = false,
  programRequest,
  onSubmit,
  student
}: StudentVisitFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
      formTemplates.find((item) => item.isDefault)?.id ??
      formTemplates[0]?.id ??
      ""
  );
  const selectedTemplate = formTemplates.find((item) => item.id === formTemplateId);
  const templateForSections =
    mode === "edit" &&
    initialVisit?.formTemplateSnapshot.sections?.length &&
    formTemplateId === initialVisit.formTemplateId
      ? initialVisit.formTemplateSnapshot
      : (selectedTemplate ?? initialVisit?.formTemplateSnapshot);
  const dynamicSections = useMemo(
    () => enabledSectionsFromTemplate(templateForSections),
    [templateForSections]
  );
  const [answers, setAnswers] = useState<VisitFormAnswers>(() =>
    initialVisit
      ? (initialAnswers ?? initialVisit.answers)
      : { ...prefillVisitAnswers(student, dynamicSections, programRequest), ...initialAnswers }
  );
  const layout = visitFormLayout(dynamicSections, templateForSections?.key ?? "", answers);
  const fields = dynamicSections.flatMap((section) => section.fields);
  const status = initialVisit?.status ?? initialStatus;
  const isFinalized = status === "finalized";
  const answersReadOnly = status === "waiting_for_student" || status === "student_submitted";
  const canSend = !isFinalized;
  const canFinalize = status === "draft" || status === "coach_review";
  const showRevisions = answerRevisions.length > 0;
  const templateOptions = formTemplates
    .filter((item) => item.isActive || item.id === formTemplateId)
    .map((item) => ({
      label: item.isDefault ? `${item.name} (پیش‌فرض)` : item.name,
      value: item.id
    }));

  useEffect(() => {
    if (!submitError) return;
    const frame = window.requestAnimationFrame(() =>
      submitErrorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [submitError]);

  const updateField = <TField extends keyof typeof values>(
    field: TField,
    value: (typeof values)[TField]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const changeAnswers = (next: VisitFormAnswers) =>
    setAnswers(reconcileWeakMuscleAnswers(answers, next, fields));
  const renderFields = (items: VisitFormFieldDefinition[]) =>
    items.length ? (
      <VisitDynamicFields
        answers={answers}
        disabled={answersReadOnly}
        fields={items}
        onAnswersChange={changeAnswers}
        respectCoachEditable
        showCoachHelpText
      />
    ) : null;

  const submit = async (intent: VisitSubmitIntent) => {
    if (photosUploading || submitIntent) return;
    const nextErrors = validateStudentVisitForm(values);
    setErrors(nextErrors);
    setSubmitError("");
    const firstError = getFirstVisitErrorField(nextErrors);
    if (firstError) {
      window.requestAnimationFrame(() => {
        const field = formRef.current?.querySelector<HTMLElement>(
          `[data-visit-field="${firstError}"]`
        );
        field?.closest("details")?.setAttribute("open", "");
        field?.focus();
      });
      return;
    }
    setSubmitIntent(intent);
    try {
      const payload: StudentVisitInput = {
        ...visitFormValuesToInput(values),
        formTemplateId: formTemplateId || null,
        status
      };
      if (!answersReadOnly) {
        const writableKeys = new Set(
          fields.filter((field) => field.coachEditable !== false).map((field) => field.key)
        );
        payload.answers = Object.fromEntries(
          Object.entries(answers).filter(([key]) => writableKeys.has(key))
        );
      }
      await onSubmit(payload, intent);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "ذخیره ویزیت انجام نشد. دوباره تلاش کنید."
      );
    } finally {
      setSubmitIntent("");
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit("save");
  };
  const oldNotes = [
    ["ارزیابی قبلی مربی", initialVisit?.coachAssessment],
    ["یادداشت قبلی مربی", initialVisit?.coachNotes],
    ["هدف متنی دوره بعد", initialVisit?.nextCycleGoal],
    ["تغییرات متنی شرایط تمرین", initialVisit?.trainingConditionChanges],
    ["شرح قبلی آسیب", initialVisit?.newInjuryNotes],
    ["احساس کلی ثبت‌شده", initialVisit?.bodyFeeling]
  ].filter(([, value]) => Boolean(value));

  return (
    <form className={styles.visitForm} noValidate onSubmit={handleSubmit} ref={formRef}>
      <div className={styles.visitFormMeta}>
        <StatusBadge variant={isFinalized ? "success" : status === "draft" ? "neutral" : "info"}>
          {visitStatusLabels[status]}
        </StatusBadge>
        <span>{templateForSections?.name ?? "فرم ویزیت"}</span>
        {initialVisit?.expiresAt ? (
          <span>مهلت پاسخ: {formatExpiry(initialVisit.expiresAt)}</span>
        ) : null}
        <details>
          <summary>تغییر قالب ویزیت</summary>
          <FormField htmlFor="visit-form-template" label="قالب فرم ویزیت">
            <Select
              disabled={isFinalized || !templateOptions.length}
              id="visit-form-template"
              options={
                templateOptions.length
                  ? templateOptions
                  : [{ label: "قالبی تعریف نشده", value: "" }]
              }
              onChange={(event) => {
                const id = event.target.value;
                setFormTemplateId(id);
                if (mode === "create")
                  setAnswers(
                    prefillVisitAnswers(
                      student,
                      enabledSectionsFromTemplate(formTemplates.find((item) => item.id === id)),
                      programRequest
                    )
                  );
              }}
              value={formTemplateId}
            />
          </FormField>
        </details>
      </div>
      {answersReadOnly ? (
        <p className={styles.actionHint} role="status">
          {status === "student_submitted"
            ? "شاگرد پاسخ داده است؛ برای تغییر پاسخ‌ها «شروع بررسی مربی» را بزنید."
            : "فرم برای شاگرد باز است؛ پاسخ‌های مشترک تا شروع بررسی قابل تغییر نیستند."}
        </p>
      ) : null}

      <StudentFormSection
        icon={Scale}
        title="۱. ارزیابی کلی"
        description="تاریخ و وزن فعلی را ثبت کنید و مقادیر پیشنهادی هدف، سطح و تعداد جلسه را بررسی کنید."
      >
        <div className={styles.formGrid}>
          <FormField
            error={errors.visitDate}
            hint={`تاریخ ${calendarName()} به شکل سال/ماه/روز`}
            htmlFor="visit-date"
            label="تاریخ ویزیت"
            required
          >
            <Input
              data-visit-field="visitDate"
              dir="ltr"
              id="visit-date"
              inputMode="numeric"
              invalid={Boolean(errors.visitDate)}
              onChange={(event) => updateField("visitDate", event.target.value)}
              placeholder={calendarPlaceholder()}
              value={values.visitDate}
            />
          </FormField>
          <FormField
            error={errors.currentWeightKg}
            hint={`وزن ویزیت قبلی: ${values.previousWeightKg} کیلوگرم`}
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
        </div>
        {renderFields(layout.general)}
        {programRequest?.goal ? (
          <p className={styles.actionHint}>هدف اعلام‌شده در درخواست شاگرد: {programRequest.goal}</p>
        ) : null}
      </StudentFormSection>

      {layout.conditions.length || layout.injuries.length ? (
        <StudentFormSection
          icon={ShieldAlert}
          title="۲. شرایط و محدودیت‌های تمرین"
          description="انتخاب‌های این بخش در تولید برنامه استفاده می‌شوند؛ شرح متنی فقط برای بررسی مربی است."
        >
          {renderFields(layout.conditions)}
          {student.injuries.hasInjury ? (
            <p className={styles.visitContextNote}>
              محدودیت ثبت‌شده در پروفایل: {student.injuries.injuryType || "آسیب یا محدودیت ثبت شده"}{" "}
              — وضعیت فعلی را بررسی کنید.
            </p>
          ) : null}
          {programRequest?.injuryNotes ? (
            <p className={styles.visitContextNote}>
              گزارش شاگرد: {programRequest.injuryNotes} — محدودیت فعال را در گزینه‌های زیر تأیید
              کنید.
            </p>
          ) : null}
          {renderFields(layout.injuries)}
          {layout.injuries.length ? (
            <p className={styles.actionHint}>
              اگر وضعیت تغییر نکرده، انتخاب خالی اطلاعات پروفایل را حفظ می‌کند؛ «بدون آسیب فعال»
              یعنی محدودیت قبلی دیگر فعال نیست.
            </p>
          ) : null}
        </StudentFormSection>
      ) : null}

      {photoPanel || layout.weakness.length || layout.muscleDetails.length ? (
        <StudentFormSection
          icon={Target}
          title="۳. ارزیابی بدن و نقاط ضعف"
          description="عضلاتی که نیاز به تمرکز دارند را مشخص کنید؛ جزئیات فقط برای همان عضلات باز می‌شوند."
        >
          {photoPanel ? (
            <details className={styles.visitPhotoDisclosure}>
              <summary>
                <ImagePlus aria-hidden size={18} />
                عکس‌های ارزیابی (اختیاری)
              </summary>
              <p className={styles.actionHint}>
                عکس برای مشاهده مربی است؛ تحلیل تصویری خودکار انجام نمی‌شود.
              </p>
              {photoPanel}
            </details>
          ) : null}
          {student.goals.weakMuscles.length ? (
            <p className={styles.visitContextNote}>
              نقاط ضعف ثبت‌شده در پروفایل: {student.goals.weakMuscles.join("، ")}
            </p>
          ) : null}
          {renderFields(layout.weakness)}
          {layout.weakness.length ? (
            <p className={styles.actionHint}>
              انتخاب خالی، اولویت‌های پروفایل را حفظ می‌کند؛ «بدون ضعف مشخص» آن‌ها را برای این دوره
              کنار می‌گذارد.
            </p>
          ) : null}
          {layout.muscleDetails.length ? (
            <VisitDynamicForm
              answers={answers}
              collapsibleSections
              disabled={answersReadOnly}
              onAnswersChange={changeAnswers}
              respectCoachEditable
              sections={layout.muscleDetails}
              showCoachHelpText
            />
          ) : null}
        </StudentFormSection>
      ) : null}

      {layout.methods.length ? (
        <StudentFormSection
          collapsible
          description="اختیاری؛ این انتخاب‌ها در صفحه تولید برنامه پیشنهاد می‌شوند و قابل تغییرند."
          icon={Dumbbell}
          title="۴. سیستم‌های تمرینی دوره"
        >
          {renderFields(layout.methods)}
        </StudentFormSection>
      ) : null}

      <StudentFormSection
        collapsible
        description="اختیاری؛ فقط اندازه‌های واقعاً اندازه‌گیری‌شده را وارد کنید. خواب و استرس برای پیگیری مربی ثبت می‌شوند."
        icon={Ruler}
        title="۵. اندازه‌گیری و پیگیری دوره قبل"
      >
        <div className={styles.formGrid}>
          <FormField error={errors.bodyFatPercentage} htmlFor="body-fat" label="درصد چربی">
            <Input
              data-visit-field="bodyFatPercentage"
              id="body-fat"
              inputMode="decimal"
              invalid={Boolean(errors.bodyFatPercentage)}
              type="number"
              onChange={(event) => updateField("bodyFatPercentage", event.target.value)}
              value={values.bodyFatPercentage}
            />
          </FormField>
          {(
            [
              ["chestCm", "دور سینه"],
              ["waistCm", "دور کمر"],
              ["armCm", "دور بازو"],
              ["thighCm", "دور ران"],
              ["hipCm", "دور باسن"]
            ] as const
          ).map(([key, label]) => (
            <FormField
              error={errors[key]}
              htmlFor={`visit-${key}`}
              key={key}
              label={`${label} (سانتی‌متر)`}
            >
              <Input
                data-visit-field={key}
                id={`visit-${key}`}
                inputMode="decimal"
                invalid={Boolean(errors[key])}
                type="number"
                onChange={(event) => updateField(key, event.target.value)}
                value={values[key]}
              />
            </FormField>
          ))}
          {(
            [
              ["sleepQuality", "کیفیت خواب"],
              ["stressLevel", "سطح استرس"],
              ["dailyEnergyLevel", "سطح انرژی"]
            ] as const
          ).map(([key, label]) => (
            <FormField htmlFor={`visit-${key}`} key={key} label={label}>
              <Select
                id={`visit-${key}`}
                options={levelOptions}
                onChange={(event) =>
                  updateField(key, event.target.value as (typeof values)[typeof key])
                }
                value={values[key]}
              />
            </FormField>
          ))}
        </div>
      </StudentFormSection>

      {layout.additional.length ? (
        <StudentFormSection
          collapsible
          icon={HeartPulse}
          title="اطلاعات تکمیلی ارزیابی"
          description="داروها، مکمل‌های فعلی، مشاهدات وضعیتی و پرسش‌های اختصاصی قالب؛ متن آزاد دستور تولید برنامه نیست."
        >
          <VisitDynamicForm
            answers={answers}
            collapsibleSections
            disabled={answersReadOnly}
            onAnswersChange={changeAnswers}
            respectCoachEditable
            sections={layout.additional}
            showCoachHelpText
          />
        </StudentFormSection>
      ) : null}

      <StudentFormSection
        collapsible
        icon={MessageSquare}
        title="۶. بازخورد و یادداشت مربی"
        description="بازخورد شاگرد و برداشت خصوصی مربی؛ این متن‌ها خودکار به دستور تولید برنامه تبدیل نمی‌شوند."
      >
        <FormField htmlFor="student-feedback" label="بازخورد شاگرد">
          <Textarea
            id="student-feedback"
            onChange={(event) => updateField("studentFeedback", event.target.value)}
            value={values.studentFeedback}
          />
        </FormField>
        <FormField
          hint="فقط مربی می‌بیند؛ به شاگرد نمایش داده نمی‌شود."
          htmlFor="coach-private-notes"
          label="یادداشت خصوصی مربی"
        >
          <Textarea
            id="coach-private-notes"
            onChange={(event) => updateField("coachPrivateNotes", event.target.value)}
            value={values.coachPrivateNotes}
          />
        </FormField>
      </StudentFormSection>

      {oldNotes.length || layout.historical.length ? (
        <StudentFormSection
          collapsible
          icon={History}
          title="اطلاعات ثبت‌شده قبلی"
          description="اطلاعات فرم‌های قبلی حفظ شده‌اند؛ این فیلدهای تکراری دیگر محل تنظیم برنامه جدید نیستند."
        >
          {oldNotes.map(([label, value]) => (
            <div className={styles.readonlyDetail} key={label}>
              <span>{label}</span>
              <p>{value}</p>
            </div>
          ))}
          <VisitAnswersReadonly answers={answers} sections={layout.historical} />
          {initialVisit?.adherence.overallPercent != null ? (
            <p className={styles.actionHint}>
              اجرای برنامه در سابقه: {initialVisit.adherence.overallPercent}٪
            </p>
          ) : null}
        </StudentFormSection>
      ) : null}
      {showRevisions ? (
        <StudentFormSection collapsible icon={History} title="تاریخچه پاسخ‌ها">
          <ul className={styles.profileSummaryGrid}>
            {answerRevisions.map((revision) => (
              <li key={revision.id}>
                <strong>{revision.fieldKey}</strong> · {formatExpiry(revision.createdAt)}
                <div>{formatRevisionValue(revision.value)}</div>
              </li>
            ))}
          </ul>
        </StudentFormSection>
      ) : null}

      <div className={styles.actionBar}>
        {submitError ? (
          <div className={`${styles.alert} ${styles.alertError}`} ref={submitErrorRef} role="alert">
            {submitError}
          </div>
        ) : null}
        <span className={styles.actionHint}>
          {photosUploading
            ? "عکس در حال آپلود است؛ پس از پایان می‌توانید ثبت کنید."
            : "ثبت پیش‌نویس فقط ویزیت را ذخیره می‌کند؛ «ثبت و ادامه برای تولید برنامه» صفحه ساخت برنامه را باز می‌کند."}
        </span>
        <div className={styles.actionBarButtons}>
          <Button
            disabled={photosUploading || Boolean(submitIntent)}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            انصراف
          </Button>
          <Button
            disabled={photosUploading || Boolean(submitIntent)}
            iconStart={<Save size={18} />}
            isLoading={submitIntent === "save"}
            type="submit"
            variant="secondary"
          >
            {mode === "edit" ? "ذخیره ویزیت" : "ثبت پیش‌نویس"}
          </Button>
          {canSend ? (
            <Button
              disabled={photosUploading || Boolean(submitIntent)}
              iconStart={<Send size={18} />}
              isLoading={submitIntent === "send-to-student"}
              onClick={() => void submit("send-to-student")}
              type="button"
              variant="secondary"
            >
              ارسال برای شاگرد
            </Button>
          ) : null}
          {status === "student_submitted" ? (
            <Button
              disabled={photosUploading || Boolean(submitIntent)}
              iconStart={<ClipboardCheck size={18} />}
              isLoading={submitIntent === "start-coach-review"}
              onClick={() => void submit("start-coach-review")}
              type="button"
            >
              شروع بررسی مربی
            </Button>
          ) : null}
          {canFinalize ? (
            <Button
              disabled={photosUploading || Boolean(submitIntent)}
              iconStart={<ClipboardCheck size={18} />}
              isLoading={submitIntent === "finalize"}
              onClick={() => void submit("finalize")}
              type="button"
            >
              ذخیره و نهایی‌سازی
            </Button>
          ) : null}
          {!answersReadOnly ? (
            <Button
              disabled={photosUploading || Boolean(submitIntent)}
              iconStart={<Target size={18} />}
              isLoading={submitIntent === "generate-program"}
              onClick={() => void submit("generate-program")}
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
