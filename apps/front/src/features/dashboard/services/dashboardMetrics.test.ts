import { describe, expect, it } from "vitest";
import { studentPdfFileFixtures } from "../../students/fixtures/studentPdfFiles";
import { studentProgramFixtures } from "../../students/fixtures/studentPrograms";
import { studentVisitFixtures } from "../../students/fixtures/studentVisits";
import { studentFixtures } from "../../students/fixtures/students";
import { calculateDashboardMetrics } from "./dashboardMetrics";

describe("calculateDashboardMetrics", () => {
  it("calculates dashboard counters from fixtures", () => {
    const metrics = calculateDashboardMetrics({
      pdfFiles: studentPdfFileFixtures,
      programs: studentProgramFixtures,
      students: studentFixtures,
      visits: studentVisitFixtures
    });

    expect(metrics.totalStudents).toBe(studentFixtures.length);
    expect(metrics.activeStudents).toBeGreaterThan(0);
    expect(metrics.draftPrograms).toBeGreaterThan(0);
    expect(metrics.readyPdfFiles).toBeGreaterThan(0);
    expect(metrics.latestPrograms.length).toBeGreaterThan(0);
  });
});
