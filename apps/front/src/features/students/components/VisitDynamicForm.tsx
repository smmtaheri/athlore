import { ClipboardList } from "lucide-react";
import type {
  VisitFormAnswers,
  VisitFormAnswerValue,
  VisitFormFieldDefinition,
  VisitFormSectionDefinition
} from "../types/visitForm";
import type { VisitFormTheme } from "../types/visitForm";
import { Checkbox, FormField, Input, Select, Switch, Textarea } from "../../../components/ui";
import { formatAnswerDisplay } from "./visitFormUtils";
import { StudentFormSection } from "./StudentFormSection";
import { formatCalendarDate } from "../../../shared/dates/calendar";
import { CalendarDateInput } from "../../../shared/dates/CalendarDateInput";
import styles from "./students.module.css";

export interface VisitDynamicFormProps {
  answers: VisitFormAnswers;
  coachNotes?: string;
  disabled?: boolean;
  notesLabel?: string;
  notesTitle?: string;
  onAnswersChange: (answers: VisitFormAnswers) => void;
  onCoachNotesChange?: (notes: string) => void;
  /** When true, fields without studentEditable stay read-only even if the form is open. */
  respectStudentEditable?: boolean;
  /** When true, coach-uneditable fields stay read-only in the coach form. */
  respectCoachEditable?: boolean;
  sections: VisitFormSectionDefinition[];
  showCoachHelpText?: boolean;
  showNotes?: boolean;
  theme?: VisitFormTheme;
}

export function VisitDynamicForm({
  answers,
  coachNotes = "",
  disabled = false,
  notesLabel = "یادداشت خصوصی مربی",
  notesTitle = "یادداشت خصوصی مربی",
  onAnswersChange,
  onCoachNotesChange,
  respectCoachEditable = false,
  respectStudentEditable = false,
  sections,
  showCoachHelpText = false,
  showNotes = false,
  theme = "athlore"
}: VisitDynamicFormProps) {
  const setAnswer = (key: string, value: VisitFormAnswerValue) => {
    onAnswersChange({ ...answers, [key]: value });
  };

  return (
    <div
      className={`${styles.tabContentStack} ${
        theme === "athlore_compact" ? styles.visitFormCompact : styles.visitFormStandard
      }`}
    >
      {sections.map((section) => (
        <StudentFormSection
          icon={ClipboardList}
          key={section.key}
          theme={theme}
          title={section.label}
        >
          <div className={styles.formGrid}>
            {section.fields.map((field) => {
              const fieldDisabled =
                disabled ||
                (respectStudentEditable && field.studentEditable !== true) ||
                (respectCoachEditable && field.coachEditable === false);
              return (
                <VisitFormFieldControl
                  disabled={fieldDisabled}
                  field={field}
                  key={field.key}
                  onChange={(value) => setAnswer(field.key, value)}
                  showCoachHelpText={showCoachHelpText}
                  value={answers[field.key]}
                />
              );
            })}
          </div>
        </StudentFormSection>
      ))}

      {showNotes && onCoachNotesChange ? (
        <StudentFormSection icon={ClipboardList} title={notesTitle}>
          <FormField htmlFor="visit-coach-private-notes" label={notesLabel}>
            <Textarea
              disabled={disabled}
              id="visit-coach-private-notes"
              onChange={(event) => onCoachNotesChange(event.target.value)}
              rows={4}
              value={coachNotes}
            />
          </FormField>
        </StudentFormSection>
      ) : null}
    </div>
  );
}

/** @deprecated Use VisitDynamicForm */
export const AssessmentDynamicForm = VisitDynamicForm;

export function VisitAnswersReadonly({
  answers,
  coachNotes,
  sections
}: {
  answers: VisitFormAnswers;
  coachNotes?: string;
  sections: VisitFormSectionDefinition[];
}) {
  return (
    <div className={styles.tabContentStack}>
      {sections.map((section) => {
        const answeredFields = section.fields.filter((field) => {
          const value = answers[field.key];
          return (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (!Array.isArray(value) || value.length > 0)
          );
        });
        if (answeredFields.length === 0) return null;

        return (
          <details className={styles.readonlyAnswerSection} key={section.key}>
            <summary>
              {section.label}
              <span>{answeredFields.length.toLocaleString("fa-IR")} پاسخ</span>
            </summary>
            <div className={styles.detailMetricGrid}>
              {answeredFields.map((field) => (
                <div className={styles.readonlyDetail} key={field.key}>
                  <span>{field.label}</span>
                  <p>{formatAnswerDisplay(field, answers[field.key])}</p>
                </div>
              ))}
            </div>
          </details>
        );
      })}
      {coachNotes?.trim() ? (
        <div className={styles.readonlyDetail}>
          <span>یادداشت خصوصی مربی</span>
          <p>{coachNotes}</p>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use VisitAnswersReadonly */
export const AssessmentAnswersReadonly = VisitAnswersReadonly;

interface VisitFormFieldControlProps {
  disabled?: boolean;
  field: VisitFormFieldDefinition;
  onChange: (value: VisitFormAnswerValue) => void;
  showCoachHelpText?: boolean;
  value: VisitFormAnswerValue | undefined;
}

function VisitFormFieldControl({
  disabled = false,
  field,
  onChange,
  showCoachHelpText = false,
  value
}: VisitFormFieldControlProps) {
  const fieldId = `visit-field-${field.key}`;
  const hint = [
    field.helpText,
    showCoachHelpText && field.coachHelpText ? `یادداشت مربی: ${field.coachHelpText}` : ""
  ]
    .filter(Boolean)
    .join(" · ");

  if (field.type === "boolean") {
    return (
      <FormField
        hint={hint || undefined}
        htmlFor={fieldId}
        label={field.label}
        required={field.required}
      >
        <Switch
          checked={value === true}
          disabled={disabled}
          label={value === true ? "بله" : "خیر"}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </FormField>
    );
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <FormField hint={hint || undefined} label={field.label} required={field.required}>
        <div className={styles.checkboxList}>
          {field.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <Checkbox
                checked={checked}
                disabled={disabled}
                key={option.value}
                label={option.label}
                onChange={() => {
                  if (checked) {
                    onChange(selected.filter((item) => item !== option.value));
                  } else {
                    onChange([...selected, option.value]);
                  }
                }}
              />
            );
          })}
        </div>
      </FormField>
    );
  }

  if (field.type === "single_select") {
    return (
      <FormField
        hint={hint || undefined}
        htmlFor={fieldId}
        label={field.label}
        required={field.required}
      >
        <Select
          disabled={disabled}
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          options={field.options}
          placeholder="انتخاب کنید"
          value={value == null ? "" : String(value)}
        />
      </FormField>
    );
  }

  if (field.type === "textarea") {
    return (
      <FormField
        hint={hint || undefined}
        htmlFor={fieldId}
        label={field.label}
        required={field.required}
      >
        <Textarea
          disabled={disabled}
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          value={value == null ? "" : String(value)}
        />
      </FormField>
    );
  }

  if (field.type === "number") {
    return (
      <FormField
        hint={hint || undefined}
        htmlFor={fieldId}
        label={field.label}
        required={field.required}
      >
        <Input
          disabled={disabled}
          id={fieldId}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
          type="number"
          value={value == null || value === "" ? "" : String(value)}
        />
      </FormField>
    );
  }

  return (
    <FormField
      hint={hint || undefined}
      htmlFor={fieldId}
      label={field.label}
      required={field.required}
    >
      {field.type === "date" && !disabled ? (
        <CalendarDateInput
          id={fieldId}
          required={field.required}
          value={value == null ? "" : String(value)}
          onChange={onChange}
        />
      ) : (
        <Input
          disabled={disabled}
          id={fieldId}
          type="text"
          onChange={(event) => onChange(event.target.value)}
          value={
            value == null
              ? ""
              : field.type === "date"
                ? formatCalendarDate(String(value))
                : String(value)
          }
        />
      )}
    </FormField>
  );
}
