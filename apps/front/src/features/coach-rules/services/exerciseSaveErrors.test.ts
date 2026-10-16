import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { exerciseSaveErrorMessage } from "./exerciseSaveErrors";

describe("exerciseSaveErrorMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["exercise_duplicate", "exercise_validation_error"])(
    "preserves the explicit server message for %s",
    (code) => {
      const message = "حرکتی با این نام برای این عضله قبلاً ثبت شده است.";
      expect(exerciseSaveErrorMessage(new ApiError({ code, message, status: 400 }))).toBe(
        `ذخیره حرکت انجام نشد؛ ${message}`
      );
    }
  );

  it("shows the server log reference for unclassified backend failures", () => {
    const errorId = "0123456789abcdef0123456789abcdef";
    const result = exerciseSaveErrorMessage(
      new ApiError({
        code: "exercise_save_unknown",
        message: "خطای ناشناخته‌ای رخ داد؛ لاگ بررسی شود.",
        status: 500,
        details: { error_id: errorId }
      })
    );
    expect(result).toContain("خطای ناشناخته");
    expect(result).toContain(`کد پیگیری: ${errorId}`);
  });

  it.each([
    ["network_error", 0, "اتصال اینترنت"],
    ["token_expired", 401, "دوباره وارد شوید"],
    ["permission_denied", 403, "دسترسی حساب مربی"],
    ["not_found", 404, "این حرکت پیدا نشد"],
    ["rate_limited", 429, "کمی صبر کنید"]
  ])("explains %s separately", (code, status, expected) => {
    const message = "Internal message";
    expect(exerciseSaveErrorMessage(new ApiError({ code, message, status }))).toContain(expected);
  });

  it.each([
    new Error("Unexpected client failure"),
    new ApiError({ code: "malformed_response", message: "Unreadable response", status: 502 }),
    new ApiError({ code: "validation_error", message: "Unclassified validation", status: 400 })
  ])("explicitly marks and logs unrecognized failures", (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = exerciseSaveErrorMessage(error);
    expect(result).toContain("خطای ناشناخته");
    expect(result).toContain("زمان خطا");
    expect(log).toHaveBeenCalledOnce();
    expect(result).not.toContain(error.message);
  });
});
