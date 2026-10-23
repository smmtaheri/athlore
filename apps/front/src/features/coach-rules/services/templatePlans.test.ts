import { describe, expect, it } from "vitest";
import { coachRulesFixture } from "../fixtures/coachRules";
import {
  convertTemplate,
  newBlock,
  newExecutionPlan,
  validateTemplatePlans,
  withExecutionPlan
} from "./templatePlans";

describe("structured template plans", () => {
  it("preserves unknown legacy instructions as description without executing unknown day text", () => {
    const old = structuredClone(coachRulesFixture.templates[0]);
    old.split = Array(old.daysPerWeek).fill("چیزی که اسم عضله نیست");
    old.specialRules = ["Unknown instructions"];
    const plan = convertTemplate(old);
    expect(plan.description).toBe("Unknown instructions");
    expect(plan.days.every((day) => day.muscles.length === 0 && day.blocks.length === 0)).toBe(
      true
    );
    expect(validateTemplatePlans([withExecutionPlan(old, plan)])).toContain("عضلات و بلوک‌های");
  });

  it("uses typed days and validates numeric prescription bounds before saving", () => {
    const old = structuredClone(coachRulesFixture.templates[0]);
    const plan = newExecutionPlan();
    plan.days = [{ muscles: ["chest"], blocks: [newBlock("chest")] }];
    const template = withExecutionPlan(old, plan);
    expect(template.daysPerWeek).toBe(1);
    expect(template.split).toEqual(["سینه"]);
    expect(validateTemplatePlans([template])).toBeNull();
    plan.days[0].blocks[0].sets = -1;
    expect(validateTemplatePlans([withExecutionPlan(old, plan)])).toContain("ست یا استراحت");
  });
});
