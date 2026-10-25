import { describe, expect, it } from "vitest";
import { studentFixtures } from "../fixtures/students";
import { studentVisitFixtures } from "../fixtures/studentVisits";
import type { VisitFormFieldDefinition } from "../types/visitForm";
import {
  createEmptyVisitFormValues,
  studentVisitToFormValues,
  validateStudentVisitForm,
  visitFormValuesToInput
} from "../validation/studentVisitValidation";
import { visitFromApi } from "../../../shared/adapters/apiAdapters";
import {
  prefillVisitAnswers,
  reconcileWeakMuscleAnswers,
  visitFormLayout
} from "./visitFormLayout";

function field(
  key: string,
  semanticKey = "",
  extras: Partial<VisitFormFieldDefinition> = {}
): VisitFormFieldDefinition {
  return {
    key,
    semanticKey,
    label: key,
    enabled: true,
    helpText: "",
    order: 0,
    options: [],
    prefillFrom: "",
    required: false,
    type: "text",
    ...extras
  };
}
const fields = [
  field("weight_kg"),
  field("full_name"),
  field("free_text_plan"),
  field("goal", "goal", {
    type: "single_select",
    options: [{ value: "gain_weight", label: "حجم" }]
  }),
  field("sessions", "sessions_per_week", { type: "number" }),
  field("weak", "weak_muscles", {
    type: "multi_select",
    options: [
      { value: "chest", label: "سینه" },
      { value: "back", label: "پشت" }
    ]
  }),
  field("muscle_detail.chest.upper", "muscle_detail"),
  field("muscle_detail.back.width", "muscle_detail"),
  field("coach_custom_question")
];
const sections = [{ key: "core", label: "فرم", order: 0, fields }];

describe("unified visit composition", () => {
  it("separates standard duplicates from executable fields without discarding history or custom questions", () => {
    const layout = visitFormLayout(sections, "arman_visit_v1", { weight_kg: 80, weak: ["chest"] });
    expect(layout.general.map((item) => item.key)).toEqual(["goal", "sessions"]);
    expect(layout.historical.flatMap((section) => section.fields).map((item) => item.key)).toEqual([
      "weight_kg"
    ]);
    expect(layout.additional.flatMap((section) => section.fields).map((item) => item.key)).toEqual([
      "coach_custom_question"
    ]);
    expect(
      layout.muscleDetails.flatMap((section) => section.fields).map((item) => item.key)
    ).toEqual(["muscle_detail.chest.upper"]);
    const customLayout = visitFormLayout(sections, "coach-created-template", {});
    expect(
      customLayout.additional
        .flatMap((section) => section.fields)
        .some((item) => item.key === "full_name")
    ).toBe(true);
  });

  it("clears executable details of deselected muscles and keeps retained answers", () => {
    const previous = {
      weak: ["chest", "back"],
      "muscle_detail.chest.upper": "weak",
      "muscle_detail.back.width": "weak"
    };
    const next = reconcileWeakMuscleAnswers(previous, { ...previous, weak: ["back"] }, fields);
    expect(next["muscle_detail.chest.upper"]).toBeNull();
    expect(next["muscle_detail.back.width"]).toBe("weak");
    expect(
      visitFormLayout(sections, "arman_visit_v1", next).muscleDetails[0].fields.map(
        (item) => item.key
      )
    ).toEqual(["muscle_detail.back.width"]);
  });

  it("prefills empty selections when the profile has no active injuries", () => {
    const result = prefillVisitAnswers(studentFixtures[1], [
      {
        ...sections[0],
        fields: [
          ...fields,
          field("injuries", "injuries", {
            type: "multi_select",
            options: [
              { value: "neck", label: "گردن" },
              { value: "back", label: "کمر" },
              { value: "knee", label: "زانو" }
            ]
          })
        ]
      }
    ]);
    expect(result.sessions).toBe(studentFixtures[1].trainingConditions.trainingDaysPerWeek);
    expect(result.goal).toBeUndefined();
    expect(result.injuries).toEqual([]);
    expect(result.full_name).toBeUndefined();
  });

  it("prefills matching profile weaknesses and injuries for the coach to review", () => {
    const result = prefillVisitAnswers(studentFixtures[0], [
      {
        ...sections[0],
        fields: [
          field("weak", "weak_muscles", {
            type: "multi_select",
            options: [
              { value: "chest", label: "سینه" },
              { value: "triceps", label: "پشت بازو" }
            ]
          }),
          field("injuries", "injuries", {
            type: "multi_select",
            options: [
              { value: "neck", label: "گردن" },
              { value: "back", label: "کمر" },
              { value: "other", label: "سایر" }
            ]
          })
        ]
      }
    ]);
    expect(result.weak).toEqual(["chest", "triceps"]);
    expect(result.injuries).toEqual(["neck"]);
  });

  it("retains required custom details and clears deselected athlete-editable details without writing private answers", () => {
    const athleteFields = fields.map((item) => ({
      ...item,
      studentEditable: item.key !== "muscle_detail.back.width",
      required: item.key === "muscle_detail.chest.upper"
    }));
    const previous = {
      weak: ["chest", "back"],
      "muscle_detail.chest.upper": "weak",
      "muscle_detail.back.width": "weak"
    };
    const next = reconcileWeakMuscleAnswers(
      previous,
      { ...previous, weak: [] },
      athleteFields,
      "athlete"
    );
    expect(next["muscle_detail.chest.upper"]).toBeNull();
    expect(next["muscle_detail.back.width"]).toBe("weak");
    const layout = visitFormLayout(
      [{ ...sections[0], fields: athleteFields }],
      "arman_visit_v1",
      next
    );
    expect(
      layout.muscleDetails.flatMap((section) => section.fields).map((item) => item.key)
    ).toContain("muscle_detail.chest.upper");
    const payload = Object.fromEntries(
      Object.entries(next).filter(([key]) =>
        layout.liveFields.some((item) => item.key === key && item.studentEditable)
      )
    );
    expect(payload["muscle_detail.chest.upper"]).toBeNull();
    expect(payload["muscle_detail.back.width"]).toBeUndefined();
  });

  it("records untouched optional measurements as unknown and preserves explicit historical values", () => {
    const input = visitFormValuesToInput(createEmptyVisitFormValues(studentFixtures[0]));
    expect(input.sleepQuality).toBeNull();
    expect(input.stressLevel).toBeNull();
    expect(input.dailyEnergyLevel).toBeNull();
    expect(Object.values(input.adherence)).toEqual([null, null, null, null]);
    const edited = visitFormValuesToInput(studentVisitToFormValues(studentVisitFixtures[0]));
    expect(edited.adherence).toEqual(studentVisitFixtures[0].adherence);
    expect(edited.coachAssessment).toBe(studentVisitFixtures[0].coachAssessment);
    const adapted = visitFromApi({
      adherence: { overall_percent: null, training_percent: "0" },
      sleep_quality: null
    });
    expect(adapted.adherence.overallPercent).toBeNull();
    expect(adapted.adherence.trainingPercent).toBe(0);
    expect(adapted.sleepQuality).toBeNull();
    const historicalForm = studentVisitToFormValues(studentVisitFixtures[0]);
    historicalForm.hasNewInjury = true;
    historicalForm.newInjuryNotes = "";
    expect(validateStudentVisitForm(historicalForm).newInjuryNotes).toBeUndefined();
  });
});
