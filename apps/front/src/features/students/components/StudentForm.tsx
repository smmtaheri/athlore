import type { FormEvent } from "react";
import { useState } from "react";
import {
  Activity,
  ClipboardPenLine,
  Dumbbell,
  HeartPulse,
  Save,
  ShieldAlert,
  Star,
  Target,
  UserRound,
  Utensils
} from "lucide-react";
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Radio,
  Select,
  Textarea
} from "../../../components/ui";
import type { Student, StudentFormValues, StudentInput } from "../types/student";
import {
  activityOptions,
  familiarityOptions,
  genderOptions,
  goalOptions,
  muscleOptions,
  statusOptions,
  trainingLevelOptions
} from "../types/options";
import {
  emptyStudentFormValues,
  formValuesToStudentInput,
  getFirstErrorField,
  studentToFormValues,
  validateStudentForm
} from "../validation/studentValidation";
import { ApiError, firstFieldError, persianMessageForApiError } from "../../../shared/api/errors";
import { StudentFormSection } from "./StudentFormSection";
import styles from "./students.module.css";

export interface StudentFormProps {
  initialStudent?: Student;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (input: StudentInput) => Promise<void>;
}

export function StudentForm({ initialStudent, mode, onCancel, onSubmit }: StudentFormProps) {
  const [values, setValues] = useState<StudentFormValues>(
    initialStudent ? studentToFormValues(initialStudent) : { ...emptyStudentFormValues }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const updateField = <TField extends keyof StudentFormValues>(
    field: TField,
    value: StudentFormValues[TField]
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateStudentForm(values);
    setErrors(nextErrors);
    setSubmitError("");

    const firstErrorField = getFirstErrorField(nextErrors);

    if (firstErrorField) {
      window.requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(
          `[data-student-field="${firstErrorField}"]`
        );
        field?.focus();
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(formValuesToStudentInput(values, initialStudent));
    } catch (error) {
      if (error instanceof ApiError) {
        const phoneField = firstFieldError(error, "phone_number", "phoneNumber");
        if (phoneField) {
          setErrors((current) => ({ ...current, phoneNumber: phoneField }));
        }
        setSubmitError(persianMessageForApiError(error));
      } else {
        setSubmitError("ذخیره شاگرد انجام نشد. لطفا دوباره تلاش کنید.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      {submitError ? (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          {submitError}
        </div>
      ) : null}

      <StudentFormSection icon={UserRound} title="اطلاعات پایه">
        <div className={styles.formGrid}>
          <FormField error={errors.fullName} htmlFor="student-full-name" label="نام شاگرد" required>
            <Input
              data-student-field="fullName"
              id="student-full-name"
              invalid={Boolean(errors.fullName)}
              onChange={(event) => updateField("fullName", event.target.value)}
              value={values.fullName}
            />
          </FormField>

          <FormField error={errors.age} htmlFor="student-age" label="سن" required>
            <Input
              data-student-field="age"
              id="student-age"
              inputMode="numeric"
              invalid={Boolean(errors.age)}
              onChange={(event) => updateField("age", event.target.value)}
              type="number"
              value={values.age}
            />
          </FormField>

          <FormField htmlFor="student-gender" label="جنسیت" required>
            <Select
              id="student-gender"
              onChange={(event) =>
                updateField("gender", event.target.value as StudentFormValues["gender"])
              }
              options={genderOptions}
              value={values.gender}
            />
          </FormField>

          <FormField
            error={errors.heightCm}
            htmlFor="student-height"
            label="قد (سانتی متر)"
            required
          >
            <Input
              data-student-field="heightCm"
              id="student-height"
              inputMode="numeric"
              invalid={Boolean(errors.heightCm)}
              onChange={(event) => updateField("heightCm", event.target.value)}
              type="number"
              value={values.heightCm}
            />
          </FormField>

          <FormField
            error={errors.weightKg}
            htmlFor="student-weight"
            label="وزن (کیلوگرم)"
            required
          >
            <Input
              data-student-field="weightKg"
              id="student-weight"
              inputMode="decimal"
              invalid={Boolean(errors.weightKg)}
              onChange={(event) => updateField("weightKg", event.target.value)}
              type="number"
              value={values.weightKg}
            />
          </FormField>

          <FormField
            error={errors.phoneNumber}
            htmlFor="student-phone"
            label="شماره موبایل"
            required
          >
            <Input
              data-student-field="phoneNumber"
              id="student-phone"
              inputMode="tel"
              invalid={Boolean(errors.phoneNumber)}
              onChange={(event) => updateField("phoneNumber", event.target.value)}
              placeholder="مثلا ۰۹۱۲۱۲۳۴۵۶۷"
              value={values.phoneNumber}
            />
          </FormField>

          <FormField htmlFor="student-status" label="وضعیت شاگرد">
            <Select
              id="student-status"
              onChange={(event) =>
                updateField("status", event.target.value as StudentFormValues["status"])
              }
              options={statusOptions}
              value={values.status}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Target} title="هدف اصلی شاگرد">
        <div className={styles.formGrid}>
          <FormField
            error={errors.primaryGoal}
            htmlFor="student-primary-goal"
            label="هدف اصلی"
            required
          >
            <Select
              data-student-field="primaryGoal"
              id="student-primary-goal"
              invalid={Boolean(errors.primaryGoal)}
              onChange={(event) =>
                updateField("primaryGoal", event.target.value as StudentFormValues["primaryGoal"])
              }
              options={goalOptions}
              placeholder="انتخاب کنید"
              value={values.primaryGoal}
            />
          </FormField>

          <FormField className={styles.wideField} htmlFor="student-secondary-goal" label="هدف فرعی">
            <Input
              id="student-secondary-goal"
              onChange={(event) => updateField("secondaryGoal", event.target.value)}
              value={values.secondaryGoal}
            />
          </FormField>

          <CheckboxChipGroup
            label="اولویت عضلات"
            onChange={(items) => updateField("musclePriorities", items)}
            options={muscleOptions}
            value={values.musclePriorities}
          />
          <CheckboxChipGroup
            label="عضلات ضعیف"
            onChange={(items) => updateField("weakMuscles", items)}
            options={muscleOptions}
            value={values.weakMuscles}
          />
          <CheckboxChipGroup
            label="عضلات قوی"
            onChange={(items) => updateField("strongMuscles", items)}
            options={muscleOptions}
            value={values.strongMuscles}
          />
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Activity} title="سطح تمرینی">
        <div className={styles.formGrid}>
          <FormField htmlFor="student-training-experience" label="سابقه تمرین">
            <Input
              id="student-training-experience"
              onChange={(event) => updateField("trainingExperience", event.target.value)}
              value={values.trainingExperience}
            />
          </FormField>

          <FormField
            error={errors.trainingLevel}
            htmlFor="student-training-level"
            label="سطح فعلی"
            required
          >
            <Select
              data-student-field="trainingLevel"
              id="student-training-level"
              invalid={Boolean(errors.trainingLevel)}
              onChange={(event) =>
                updateField(
                  "trainingLevel",
                  event.target.value as StudentFormValues["trainingLevel"]
                )
              }
              options={trainingLevelOptions}
              placeholder="انتخاب کنید"
              value={values.trainingLevel}
            />
          </FormField>

          <FormField htmlFor="student-basic-movement" label="آشنایی با فرم حرکات پایه">
            <Select
              id="student-basic-movement"
              onChange={(event) => updateField("basicMovementFamiliarity", event.target.value)}
              options={familiarityOptions}
              value={values.basicMovementFamiliarity}
            />
          </FormField>

          <BooleanRadioGroup
            label="تا حالا با وزنه آزاد کار کرده؟"
            name="free-weight"
            onChange={(checked) => updateField("hasFreeWeightExperience", checked)}
            value={values.hasFreeWeightExperience}
          />
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Dumbbell} title="شرایط تمرین">
        <div className={styles.formGrid}>
          <FormField
            error={errors.trainingDaysPerWeek}
            htmlFor="student-training-days"
            label="روزهای تمرین در هفته"
            required
          >
            <Input
              data-student-field="trainingDaysPerWeek"
              id="student-training-days"
              inputMode="numeric"
              invalid={Boolean(errors.trainingDaysPerWeek)}
              onChange={(event) => updateField("trainingDaysPerWeek", event.target.value)}
              type="number"
              value={values.trainingDaysPerWeek}
            />
          </FormField>

          <FormField
            error={errors.sessionDurationMinutes}
            htmlFor="student-session-duration"
            label="مدت هر جلسه"
            required
          >
            <Input
              data-student-field="sessionDurationMinutes"
              id="student-session-duration"
              inputMode="numeric"
              invalid={Boolean(errors.sessionDurationMinutes)}
              onChange={(event) => updateField("sessionDurationMinutes", event.target.value)}
              type="number"
              value={values.sessionDurationMinutes}
            />
          </FormField>

          <FormField htmlFor="student-training-preference" label="ترجیح تمرین">
            <Input
              id="student-training-preference"
              onChange={(event) => updateField("trainingPreference", event.target.value)}
              value={values.trainingPreference}
            />
          </FormField>

          <FormField htmlFor="student-heavy-interest" label="علاقه به تمرین سنگین">
            <Input
              id="student-heavy-interest"
              onChange={(event) => updateField("heavyTrainingInterest", event.target.value)}
              value={values.heavyTrainingInterest}
            />
          </FormField>

          <FormField htmlFor="student-cardio-interest" label="علاقه به هوازی">
            <Input
              id="student-cardio-interest"
              onChange={(event) => updateField("cardioInterest", event.target.value)}
              value={values.cardioInterest}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={ShieldAlert} title="آسیب ها و محدودیت ها">
        <div className={styles.formGrid}>
          <BooleanRadioGroup
            label="آسیب دیدگی دارد؟"
            name="has-injury"
            onChange={(checked) => updateField("hasInjury", checked)}
            value={values.hasInjury}
          />

          {values.hasInjury ? (
            <>
              <FormField
                error={errors.injuryType}
                htmlFor="student-injury-type"
                label="نوع آسیب"
                required
              >
                <Input
                  data-student-field="injuryType"
                  id="student-injury-type"
                  invalid={Boolean(errors.injuryType)}
                  onChange={(event) => updateField("injuryType", event.target.value)}
                  value={values.injuryType}
                />
              </FormField>

              <FormField
                className={styles.wideField}
                error={errors.aggravatingMovements}
                htmlFor="student-aggravating-movements"
                label="حرکات آزاردهنده"
                required
              >
                <Textarea
                  data-student-field="aggravatingMovements"
                  id="student-aggravating-movements"
                  invalid={Boolean(errors.aggravatingMovements)}
                  onChange={(event) => updateField("aggravatingMovements", event.target.value)}
                  value={values.aggravatingMovements}
                />
              </FormField>

              <FormField
                className={styles.fullField}
                htmlFor="student-disallowed-exercises"
                label="تمرین های نامطلوب یا ممنوع"
              >
                <Textarea
                  id="student-disallowed-exercises"
                  onChange={(event) => updateField("disallowedExercises", event.target.value)}
                  value={values.disallowedExercises}
                />
              </FormField>
            </>
          ) : (
            <p className={`${styles.actionHint} ${styles.fullField}`}>
              با انتخاب «خیر»، جزئیات آسیب هنگام ذخیره از خروجی حذف می شود.
            </p>
          )}
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Dumbbell} title="تجهیزات در دسترس">
        <fieldset className={styles.choiceFieldset}>
          <legend className={styles.choiceLegend}>تجهیزات</legend>
          <div className={styles.choiceRow}>
            <Checkbox
              checked={values.hasFullGym}
              label="باشگاه کامل"
              onChange={(event) => updateField("hasFullGym", event.target.checked)}
            />
            <Checkbox
              checked={values.hasDumbbell}
              label="دمبل"
              onChange={(event) => updateField("hasDumbbell", event.target.checked)}
            />
            <Checkbox
              checked={values.hasBarbell}
              label="هالتر"
              onChange={(event) => updateField("hasBarbell", event.target.checked)}
            />
            <Checkbox
              checked={values.hasMachines}
              label="دستگاه"
              onChange={(event) => updateField("hasMachines", event.target.checked)}
            />
            <Checkbox
              checked={values.hasCable}
              label="کابل"
              onChange={(event) => updateField("hasCable", event.target.checked)}
            />
          </div>
        </fieldset>
      </StudentFormSection>

      <StudentFormSection icon={Utensils} title="ایمنی تغذیه و مکمل">
        <p className={styles.actionHint}>
          این فیلدها اختیاری‌اند و هیچ‌کدام روی موتور تولید برنامه اثر مستقیم ندارند؛ فقط برای مرجع
          مربی، نمایش در پروفایل و PDF شاگرد ذخیره می‌شوند.
        </p>
        <div className={styles.formGrid}>
          <FormField
            className={styles.wideField}
            hint="با کاما یا خط جدید جدا کنید."
            htmlFor="student-food-allergies"
            label="حساسیت‌های غذایی"
          >
            <Textarea
              id="student-food-allergies"
              onChange={(event) => updateField("foodAllergies", event.target.value)}
              value={values.foodAllergies}
            />
          </FormField>

          <FormField
            className={styles.wideField}
            hint="با کاما یا خط جدید جدا کنید."
            htmlFor="student-food-intolerances"
            label="عدم تحمل‌های غذایی"
          >
            <Textarea
              id="student-food-intolerances"
              onChange={(event) => updateField("foodIntolerances", event.target.value)}
              value={values.foodIntolerances}
            />
          </FormField>

          <FormField
            className={styles.wideField}
            hint="با کاما یا خط جدید جدا کنید."
            htmlFor="student-dietary-restrictions"
            label="محدودیت‌های غذایی"
          >
            <Textarea
              id="student-dietary-restrictions"
              onChange={(event) => updateField("dietaryRestrictions", event.target.value)}
              value={values.dietaryRestrictions}
            />
          </FormField>

          <FormField
            className={styles.wideField}
            hint="با کاما یا خط جدید جدا کنید."
            htmlFor="student-dietary-preferences"
            label="ترجیحات غذایی"
          >
            <Textarea
              id="student-dietary-preferences"
              onChange={(event) => updateField("dietaryPreferences", event.target.value)}
              value={values.dietaryPreferences}
            />
          </FormField>

          <FormField
            className={styles.wideField}
            hint="با کاما یا خط جدید جدا کنید."
            htmlFor="student-supplement-restrictions"
            label="محدودیت‌های مکمل"
          >
            <Textarea
              id="student-supplement-restrictions"
              onChange={(event) => updateField("supplementRestrictions", event.target.value)}
              value={values.supplementRestrictions}
            />
          </FormField>

          <FormField
            className={styles.fullField}
            htmlFor="student-relevant-medical-notes"
            label="یادداشت‌های پزشکی مرتبط"
          >
            <Textarea
              id="student-relevant-medical-notes"
              onChange={(event) => updateField("relevantMedicalNotes", event.target.value)}
              value={values.relevantMedicalNotes}
            />
          </FormField>

          <FormField
            className={styles.fullField}
            htmlFor="student-nutrition-notes"
            label="یادداشت‌های تغذیه"
          >
            <Textarea
              id="student-nutrition-notes"
              onChange={(event) => updateField("nutritionNotes", event.target.value)}
              value={values.nutritionNotes}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={HeartPulse} title="سبک زندگی">
        <div className={styles.formGrid}>
          <FormField htmlFor="student-occupation" label="شغل">
            <Input
              id="student-occupation"
              onChange={(event) => updateField("occupation", event.target.value)}
              value={values.occupation}
            />
          </FormField>

          <FormField htmlFor="student-activity" label="میزان فعالیت روزانه">
            <Select
              id="student-activity"
              onChange={(event) => updateField("dailyActivityLevel", event.target.value)}
              options={activityOptions}
              placeholder="انتخاب کنید"
              value={values.dailyActivityLevel}
            />
          </FormField>

          <FormField htmlFor="student-sleep" label="خواب">
            <Input
              id="student-sleep"
              onChange={(event) => updateField("sleepQuality", event.target.value)}
              value={values.sleepQuality}
            />
          </FormField>

          <FormField htmlFor="student-stress" label="استرس">
            <Input
              id="student-stress"
              onChange={(event) => updateField("stressLevel", event.target.value)}
              value={values.stressLevel}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={Star} title="ترجیحات شخصی شاگرد">
        <div className={styles.formGrid}>
          <FormField htmlFor="student-favorite-exercises" label="تمرین مورد علاقه">
            <Input
              id="student-favorite-exercises"
              onChange={(event) => updateField("favoriteExercises", event.target.value)}
              value={values.favoriteExercises}
            />
          </FormField>

          <FormField htmlFor="student-disliked-training" label="تمرین هایی که دوست ندارد">
            <Input
              id="student-disliked-training"
              onChange={(event) => updateField("dislikedTrainingStyles", event.target.value)}
              value={values.dislikedTrainingStyles}
            />
          </FormField>

          <FormField htmlFor="student-variety" label="ترجیح تنوع">
            <Input
              id="student-variety"
              onChange={(event) => updateField("varietyPreference", event.target.value)}
              value={values.varietyPreference}
            />
          </FormField>

          <FormField htmlFor="student-intensity" label="ترجیح شدت">
            <Input
              id="student-intensity"
              onChange={(event) => updateField("intensityPreference", event.target.value)}
              value={values.intensityPreference}
            />
          </FormField>
        </div>
      </StudentFormSection>

      <StudentFormSection icon={ClipboardPenLine} title="یادداشت مربی">
        <FormField htmlFor="student-coach-notes" label="توضیحات آزاد مربی">
          <Textarea
            id="student-coach-notes"
            onChange={(event) => updateField("coachNotes", event.target.value)}
            value={values.coachNotes}
          />
        </FormField>
      </StudentFormSection>

      <div className={styles.actionBar}>
        <span className={styles.actionHint}>
          اطلاعات فقط در repository موقت مرورگر ذخیره می شود.
        </span>
        <div className={styles.actionBarButtons}>
          <Button onClick={onCancel} type="button" variant="secondary">
            انصراف
          </Button>
          <Button iconStart={<Save size={18} />} isLoading={isSubmitting} type="submit">
            {mode === "edit" ? "ذخیره تغییرات" : "ذخیره شاگرد"}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface CheckboxChipGroupProps {
  label: string;
  onChange: (items: string[]) => void;
  options: readonly string[];
  value: string[];
}

function CheckboxChipGroup({ label, onChange, options, value }: CheckboxChipGroupProps) {
  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((item) => item !== option));
      return;
    }

    onChange([...value, option]);
  };

  return (
    <fieldset className={styles.choiceFieldset}>
      <legend className={styles.choiceLegend}>{label}</legend>
      <div className={styles.checkboxGrid}>
        {options.map((option) => (
          <label className={styles.chipCheckbox} key={option}>
            <input
              checked={value.includes(option)}
              onChange={() => toggle(option)}
              type="checkbox"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
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
