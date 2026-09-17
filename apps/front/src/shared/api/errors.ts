export type ApiErrorCode =
  | "authentication_required"
  | "token_expired"
  | "validation_error"
  | "not_found"
  | "conflict"
  | "permission_denied"
  | "invalid_state_transition"
  | "immutable_version"
  | "archived_student"
  | "archived_template"
  | "generation_failed"
  | "network_error"
  | "malformed_response"
  | "server_error"
  | "incompatible_template"
  | string;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly fieldErrors: Record<string, string[]>;

  constructor({
    code,
    message,
    status,
    details = {}
  }: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.fieldErrors = normalizeFieldErrors(details);
  }
}

function normalizeFieldErrors(details: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      out[key] = value.map(String);
    } else if (typeof value === "string") {
      out[key] = [value];
    } else if (value != null) {
      out[key] = [String(value)];
    }
  }
  return out;
}

/** Persian user-facing messages for known Backend error codes. */
export function persianMessageForApiError(error: ApiError): string {
  switch (error.code) {
    case "network_error":
      return "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.";
    case "authentication_required":
      return error.message.includes("ایمیل")
        ? error.message
        : "نشست شما منقضی شده است. دوباره وارد شوید.";
    case "token_expired":
      return "نشست شما منقضی شده است. دوباره وارد شوید.";
    case "validation_error":
      return error.message || "ورودی نامعتبر است.";
    case "not_found":
      return "مورد درخواستی پیدا نشد.";
    case "conflict":
      return error.message.includes("visit") || error.message.includes("date")
        ? "برای این تاریخ قبلاً ویزیت ثبت شده است."
        : "این عملیات با وضعیت فعلی تداخل دارد.";
    case "coach_phone_already_exists":
      return "این شماره موبایل قبلاً برای یک مربی ثبت شده است.";
    case "student_phone_already_exists":
      return "این شماره موبایل قبلاً برای یک شاگرد ثبت شده است.";
    case "registration_disabled":
      return "ثبت‌نام عمومی غیرفعال است. با مدیر سامانه تماس بگیرید.";
    case "invalid_state_transition":
      return "این تغییر وضعیت مجاز نیست.";
    case "immutable_version":
      return "نسخه نهایی‌شده قابل ویرایش نیست.";
    case "archived_student":
      return "شاگرد بایگانی شده است و امکان این عملیات وجود ندارد.";
    case "archived_template":
      return "قالب برنامه بایگانی یا غیرفعال است.";
    case "generation_failed":
      return "ساخت برنامه با خطا روبه‌رو شد.";
    case "incompatible_template":
      return "قالب انتخاب‌شده با سطح یا تنظیمات درخواستی سازگار نیست.";
    case "server_error":
      return "خطای داخلی سرور رخ داد. بعداً دوباره تلاش کنید.";
    case "malformed_response":
      return "پاسخ سرور قابل پردازش نبود.";
    default:
      return error.message || "خطای ناشناخته رخ داد.";
  }
}

export function firstFieldError(error: ApiError, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const list = error.fieldErrors[key];
    if (list?.[0]) {
      return list[0];
    }
  }
  return undefined;
}

const VISIT_FIELD_ERROR_KEYS = [
  "visit_date",
  "answers",
  "status",
  "form_template_id",
  "current_weight_kg",
  "previous_weight_kg",
  "non_field_errors"
] as const;

const VISIT_FIELD_ERROR_LABELS: Record<string, string> = {
  answers: "پاسخ‌های فرم",
  current_weight_kg: "وزن فعلی",
  form_template_id: "قالب فرم",
  previous_weight_kg: "وزن قبلی",
  status: "وضعیت ویزیت",
  visit_date: "تاریخ ویزیت"
};

function localizeFieldErrorMessage(key: string, message: string): string {
  const lower = message.toLowerCase();
  if (key === "visit_date" && (lower.includes("date") || lower.includes("invalid"))) {
    return "تاریخ ویزیت باید به صورت میلادی YYYY-MM-DD باشد (مثلاً 2026-08-09).";
  }
  if (key === "answers" && lower.includes("cannot edit answers while")) {
    return "در این وضعیت امکان ویرایش پاسخ‌های فرم وجود ندارد. فقط ارسال مجدد را بزنید.";
  }
  if (key === "answers" && lower.includes("not coach-editable")) {
    return "برخی فیلدهای فرم فقط برای شاگرد قابل ویرایش هستند و ذخیره نشدند.";
  }
  if (key === "status" && lower.includes("cannot send")) {
    return "از این وضعیت نمی‌توان فرم را برای شاگرد ارسال کرد.";
  }
  const label = VISIT_FIELD_ERROR_LABELS[key];
  if (label && !message.includes(label)) {
    return `${label}: ${message}`;
  }
  return message;
}

/** Prefer a concrete field detail over the generic validation_error banner. */
export function persianMessageForVisitApiError(error: ApiError): string {
  for (const key of VISIT_FIELD_ERROR_KEYS) {
    const msg = firstFieldError(error, key);
    if (msg) {
      return localizeFieldErrorMessage(key, msg);
    }
  }
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    if (messages[0]) {
      return localizeFieldErrorMessage(key, messages[0]);
    }
  }
  return persianMessageForApiError(error);
}
