import { describe, expect, it } from "vitest";
import { operationStep, repBounds, tempoParts } from "./recipeInputs";

describe("structured recipe inputs", () => {
  it("reads Persian numeric prescriptions without inventing compound ranges", () => {
    expect(repBounds("۸-۱۲")).toEqual([8, 12]);
    expect(repBounds("5")).toEqual([5, 5]);
    expect(repBounds("12+10+8")).toBeNull();
  });

  it("keeps legacy tempo and explosive concentric phases", () => {
    expect(tempoParts("3-1-X")).toEqual(["3", "1", "X", "0"]);
    expect(tempoParts("۴-۰-۱-۰")).toEqual(["4", "0", "1", "0"]);
    expect(tempoParts("slow")).toBeNull();
  });

  it("switching operation does not send stale instruction fields", () => {
    expect(operationStep("prescribe")).not.toHaveProperty("text");
    expect(operationStep("tempo")).toEqual({ op: "tempo", pattern: "3-1-2-0" });
    expect(operationStep("repeat")).toHaveProperty("steps");
  });
});
