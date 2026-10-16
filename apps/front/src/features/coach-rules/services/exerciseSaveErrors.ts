import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";

export function exerciseSaveErrorMessage(error: unknown): string {
  const prefix = "ذخیره حرکت انجام نشد؛ ";
  if (error instanceof ApiError) {
    if (
      ["exercise_duplicate", "exercise_validation_error", "exercise_save_unknown"].includes(
        error.code
      )
    ) {
      const errorId = error.details.error_id;
      const reference =
        typeof errorId === "string" && /^[a-f0-9]{32}$/.test(errorId)
          ? ` کد پیگیری: ${errorId}`
          : "";
      return `${prefix}${error.message}${reference}`;
    }
    if (["network_error", "authentication_required", "token_expired"].includes(error.code)) {
      return `${prefix}${persianMessageForApiError(error)}`;
    }
    if (error.code === "permission_denied") {
      return `${prefix}اجازه ثبت یا ویرایش حرکت برای این حساب فعال نیست؛ وضعیت دسترسی حساب مربی را بررسی کنید.`;
    }
    if (error.status === 404) {
      return `${prefix}این حرکت پیدا نشد؛ فهرست حرکات را تازه کنید و دوباره تلاش کنید.`;
    }
    if (error.status === 429) {
      return `${prefix}تعداد درخواست‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.`;
    }
  }

  console.error("Unrecognized exercise save failure", {
    code: error instanceof ApiError ? error.code : "unexpected_client_error",
    status: error instanceof ApiError ? error.status : undefined,
    error
  });
  return `${prefix}خطای ناشناخته‌ای رخ داد. زمان خطا را به پشتیبانی اعلام کنید تا علت آن در لاگ بررسی شود.`;
}
