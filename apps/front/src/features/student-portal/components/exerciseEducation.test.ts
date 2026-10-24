import { describe, expect, it } from "vitest";
import type { ExerciseMedia, TrainingExercise } from "../../programs/types/generatedProgram";
import { exerciseEducation } from "./exerciseEducation";

const media: ExerciseMedia = {
  key: "bench",
  title: "Bench",
  preview_url: "",
  poster_url: "",
  reel_url: "",
  attribution: { author: "", source_url: "", license: "", license_url: "", changes: "" },
  education: {
    description: "Default description",
    steps: [{ title: "Default execution", text: "Default instruction", at_seconds: 8 }],
    tips: ["Default tip"],
    mistakes: [{ title: "Default mistake", text: "Avoid this" }]
  }
};
const exercise = { media } as TrainingExercise;

describe("exercise education", () => {
  it("retains the licensed default lesson and its actual cue timings when not overridden", () => {
    const result = exerciseEducation(exercise);
    expect(result.steps).toEqual(media.education.steps);
    expect(result.cues[0].at_seconds).toBe(8);
    expect(result.tips).toEqual(["Default tip"]);
  });
  it("uses independent coach sections and does not invent video timestamps", () => {
    const result = exerciseEducation({
      ...exercise,
      execution_guide: {
        execution: "First\r\n\nSecond",
        tips: "Custom tip"
      }
    });
    expect(result.steps.map((step) => step.text)).toEqual(["First", "Second"]);
    expect(result.tips).toEqual(["Custom tip"]);
    expect(result.mistakes).toEqual(media.education.mistakes);
    expect(result.cues).toEqual([]);
    expect(result.description).toBe("");
  });
  it("honors explicit deletion instead of resurrecting default educational text", () => {
    const result = exerciseEducation({
      ...exercise,
      execution_guide: {
        execution: "",
        tips: "  ",
        mistakes: ""
      }
    });
    expect(result.steps).toEqual([]);
    expect(result.tips).toEqual([]);
    expect(result.mistakes).toEqual([]);
  });
});
