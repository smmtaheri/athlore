import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodeResendCooldown } from "./useCodeResendCooldown";

describe("code resend cooldown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down without allowing a negative remainder", () => {
    const { result } = renderHook(() => useCodeResendCooldown());
    act(() => result.current.setSecondsRemaining(60));
    act(() => vi.advanceTimersByTime(59000));
    expect(result.current.secondsRemaining).toBe(1);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.secondsRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the interval when the phone or method changes", () => {
    const { result } = renderHook(() => useCodeResendCooldown());
    act(() => result.current.setSecondsRemaining(60));
    act(() => result.current.setSecondsRemaining(0));
    expect(vi.getTimerCount()).toBe(0);
  });
});
