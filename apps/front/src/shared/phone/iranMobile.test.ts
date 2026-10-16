import { describe, expect, it } from "vitest";
import { normalizeIranMobile, validateIranMobileInput } from "./iranMobile";

describe("Iranian mobile normalization", () => {
  it.each([
    ["9121234567", "+989121234567"],
    ["09121234567", "+989121234567"],
    ["989121234567", "+989121234567"],
    ["+989121234567", "+989121234567"],
    ["00989121234567", "+989121234567"],
    ["۹۱۲۱۲۳۴۵۶۷", "+989121234567"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeIranMobile(input)).toBe(expected);
    expect(validateIranMobileInput(input)).toBeUndefined();
  });
});
