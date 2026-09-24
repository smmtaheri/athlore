export type VisitFormFieldType =
  "text" | "number" | "boolean" | "single_select" | "multi_select" | "textarea" | "date";

export interface VisitFormFieldOption {
  label: string;
  value: string;
}

export interface VisitFormFieldDefinition {
  coachHelpText?: string;
  coachEditable?: boolean;
  enabled: boolean;
  helpText: string;
  key: string;
  label: string;
  options: VisitFormFieldOption[];
  order: number;
  prefillFrom: string;
  required: boolean;
  semanticKey: string;
  studentEditable?: boolean;
  studentVisible?: boolean;
  /** After finalize; defaults to studentVisible when omitted (legacy). */
  studentVisibleWhenFinalized?: boolean;
  type: VisitFormFieldType;
}

export interface VisitFormSectionDefinition {
  fields: VisitFormFieldDefinition[];
  key: string;
  label: string;
  order: number;
}

export interface VisitFormTemplate {
  createdAt?: string;
  description: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  key: string;
  name: string;
  sections: VisitFormSectionDefinition[];
  updatedAt?: string;
  version: number;
}

export type VisitFormAnswerValue = string | number | boolean | string[] | null;

export type VisitFormAnswers = Record<string, VisitFormAnswerValue>;

/** Snapshot stored on a visit — may be a partial template shape. */
export interface VisitFormTemplateSnapshot {
  id?: string;
  key?: string;
  name?: string;
  sections?: VisitFormSectionDefinition[];
  version?: number;
}

export type VisitStatus =
  "draft" | "waiting_for_student" | "student_submitted" | "coach_review" | "finalized";

export const visitStatusLabels: Record<VisitStatus, string> = {
  coach_review: "در حال بررسی مربی",
  draft: "پیش‌نویس",
  finalized: "نهایی",
  student_submitted: "ارسال‌شده توسط شاگرد",
  waiting_for_student: "در انتظار شاگرد"
};

export function isVisitStatus(value: unknown): value is VisitStatus {
  return (
    value === "draft" ||
    value === "waiting_for_student" ||
    value === "student_submitted" ||
    value === "coach_review" ||
    value === "finalized"
  );
}
