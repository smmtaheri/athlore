import { describe, expect, it } from "vitest";
import {
  coachRulesFromApi,
  coachRulesToApi,
  dashboardFromApi,
  programSummaryFromApi,
  studentFromApi,
  studentInputToApi
} from "../adapters/apiAdapters";
import type { StudentInput } from "../../features/students/types/student";

describe("api adapters", () => {
  it("round-trips student fields", () => {
    const input: StudentInput = {
      age: 27,
      coachNotes: "n",
      equipment: {
        hasBarbell: true,
        hasCable: true,
        hasDumbbell: true,
        hasFullGym: true,
        hasMachines: true
      },
      fullName: "محمد",
      gender: "male",
      goals: {
        musclePriorities: ["chest"],
        primaryGoal: "hypertrophy",
        secondaryGoal: "",
        strongMuscles: [],
        weakMuscles: ["chest"]
      },
      heightCm: 182,
      injuries: {
        aggravatingMovements: [],
        disallowedExercises: [],
        hasInjury: true,
        injuryType: "mild_neck"
      },
      lifestyle: {
        dailyActivityLevel: "low",
        occupation: "office",
        sleepQuality: "medium",
        stressLevel: "medium"
      },
      phoneNumber: "0912",
      preferences: {
        dislikedTrainingStyles: "",
        favoriteExercises: "",
        intensityPreference: "",
        varietyPreference: ""
      },
      status: "active",
      summary: { currentProgramTitle: "", lastVisitDate: "", medicalNote: "" },
      trainingBackground: {
        basicMovementFamiliarity: "good",
        hasFreeWeightExperience: true,
        level: "intermediate",
        trainingExperience: "years"
      },
      trainingConditions: {
        cardioInterest: "low",
        heavyTrainingInterest: "medium",
        sessionDurationMinutes: 75,
        trainingDaysPerWeek: 4,
        trainingPreference: "gym"
      },
      weightKg: 86
    };

    const api = studentInputToApi(input);
    expect(api.full_name).toBe("محمد");
    expect((api.goals as { primary_goal: string }).primary_goal).toBe("hypertrophy");

    const view = studentFromApi({
      ...api,
      id: "uuid",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      summary: {
        current_program_title: "p",
        last_visit_date: "2026-07-15",
        medical_note: "گردن"
      }
    });
    expect(view.fullName).toBe("محمد");
    expect(view.goals.primaryGoal).toBe("hypertrophy");
    expect(view.summary.medicalNote).toBe("گردن");
  });

  it("maps coach rules aggregate", () => {
    const rules = coachRulesFromApi({
      updated_at: "2026-08-01T00:00:00Z",
      templates: [
        {
          id: "t1",
          name: "T",
          days_per_week: 3,
          level: "beginner",
          split: ["A", "B", "C"],
          muscle_priority_order: [],
          special_rules: [],
          is_active: true
        }
      ],
      levels: [],
      injuries: [],
      muscle_priorities: [],
      exercise_bank: [],
      general_rules: { extra_notes: "x", items: [] }
    });
    expect(rules.templates[0].daysPerWeek).toBe(3);
    const body = coachRulesToApi(rules);
    expect((body.templates as { days_per_week: number }[])[0].days_per_week).toBe(3);
  });

  it("maps dashboard PDF counts from Backend", () => {
    const metrics = dashboardFromApi({
      total_students: 2,
      active_students: 1,
      this_month_visits: 3,
      draft_programs: 1,
      final_programs: 1,
      pdf_files_ready: 4,
      ready_pdf_files: 4,
      pdf_generation_available: true,
      pdf_files_failed: 1,
      pdf_files_pending: 0,
      latest_programs: [],
      latest_visits: [],
      overdue_visits: [],
      follow_up_students: [],
      today_tasks: ["a"]
    });
    expect(metrics.readyPdfFiles).toBe(4);
    expect(metrics.pdfGenerationAvailable).toBe(true);
    expect(metrics.pdfFilesFailed).toBe(1);
    expect(metrics.todayTasks).toEqual(["a"]);
  });

  it("maps program summary version label", () => {
    const summary = programSummaryFromApi({
      id: "p1",
      student_id: "s1",
      title: "Prog",
      program_type: "complete",
      status: "draft",
      version: 2,
      date_range: "۴ هفته",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z"
    });
    expect(summary.version).toBe("v2");
  });
});
