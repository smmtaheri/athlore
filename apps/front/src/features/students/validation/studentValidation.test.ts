import { describe, expect, it } from "vitest";
import { studentFixtures } from "../fixtures/students";
import {
  emptyStudentFormValues,
  formValuesToStudentInput,
  studentToFormValues,
  validateStudentForm
} from "./studentValidation";

const validValues = {
  ...emptyStudentFormValues,
  age: "27",
  fullName: "شاگرد تستی",
  heightCm: "180",
  phoneNumber: "09121234567",
  primaryGoal: "hypertrophy" as const,
  sessionDurationMinutes: "60",
  trainingDaysPerWeek: "4",
  trainingLevel: "intermediate" as const,
  weightKg: "80"
};

describe("student nutrition/supplement safety fields", () => {
  it("does not require any nutrition safety field to pass validation", () => {
    const errors = validateStudentForm(validValues);
    expect(errors).toEqual({});
  });

  it("splits comma/newline separated safety fields into arrays on submit", () => {
    const input = formValuesToStudentInput({
      ...validValues,
      dietaryPreferences: "کم‌کربوهیدرات، پروتئین بالا",
      dietaryRestrictions: "گیاهی\nبدون گلوتن",
      foodAllergies: "بادام زمینی، صدف",
      foodIntolerances: "لاکتوز",
      nutritionNotes: "ترجیح وعده کوچک و پرتعداد",
      relevantMedicalNotes: "کلسترول بالا",
      supplementRestrictions: "کافئین"
    });

    expect(input.foodAllergies).toEqual(["بادام زمینی", "صدف"]);
    expect(input.foodIntolerances).toEqual(["لاکتوز"]);
    expect(input.dietaryRestrictions).toEqual(["گیاهی", "بدون گلوتن"]);
    expect(input.dietaryPreferences).toEqual(["کم‌کربوهیدرات", "پروتئین بالا"]);
    expect(input.supplementRestrictions).toEqual(["کافئین"]);
    expect(input.relevantMedicalNotes).toBe("کلسترول بالا");
    expect(input.nutritionNotes).toBe("ترجیح وعده کوچک و پرتعداد");
  });

  it("defaults every nutrition safety field to an empty value when left blank", () => {
    const input = formValuesToStudentInput(validValues);

    expect(input.foodAllergies).toEqual([]);
    expect(input.foodIntolerances).toEqual([]);
    expect(input.dietaryRestrictions).toEqual([]);
    expect(input.dietaryPreferences).toEqual([]);
    expect(input.supplementRestrictions).toEqual([]);
    expect(input.relevantMedicalNotes).toBe("");
    expect(input.nutritionNotes).toBe("");
  });

  it("round-trips nutrition safety fields through studentToFormValues", () => {
    const student = {
      ...studentFixtures[0],
      dietaryPreferences: ["کم‌چرب"],
      dietaryRestrictions: ["گیاهی"],
      foodAllergies: ["بادام زمینی"],
      foodIntolerances: ["لاکتوز"],
      nutritionNotes: "یادداشت تغذیه",
      relevantMedicalNotes: "یادداشت پزشکی",
      supplementRestrictions: ["کافئین"]
    };

    const values = studentToFormValues(student);
    expect(values.foodAllergies).toBe("بادام زمینی");
    expect(values.foodIntolerances).toBe("لاکتوز");
    expect(values.dietaryRestrictions).toBe("گیاهی");
    expect(values.dietaryPreferences).toBe("کم‌چرب");
    expect(values.supplementRestrictions).toBe("کافئین");
    expect(values.relevantMedicalNotes).toBe("یادداشت پزشکی");
    expect(values.nutritionNotes).toBe("یادداشت تغذیه");
  });

  it("handles students without any nutrition safety data (legacy fixtures)", () => {
    const values = studentToFormValues(studentFixtures[1]);
    expect(values.foodAllergies).toBe("");
    expect(values.relevantMedicalNotes).toBe("");
  });
});
