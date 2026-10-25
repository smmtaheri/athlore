import { describe, expect, it } from "vitest";
import { studentPdfFileFixtures } from "../../students/fixtures/studentPdfFiles";
import { studentProgramFixtures } from "../../students/fixtures/studentPrograms";
import { studentVisitFixtures } from "../../students/fixtures/studentVisits";
import { studentFixtures } from "../../students/fixtures/students";
import { calculateDashboardMetrics } from "./dashboardMetrics";

describe("calculateDashboardMetrics", () => {
  it("keeps ten recent non-draft visits including repeat visits for the same student", () => {
    const visits = Array.from({ length: 13 }, (_, index) => ({
      ...studentVisitFixtures[0],
      id: `recent-${index}`,
      visitDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
      status: index === 12 ? ("draft" as const) : ("finalized" as const)
    }));
    const metrics = calculateDashboardMetrics({
      students: studentFixtures,
      programs: [],
      pdfFiles: [],
      visits
    });
    expect(metrics.latestVisits).toHaveLength(10);
    expect(metrics.latestVisits[0].id).toBe("recent-11");
    expect(new Set(metrics.latestVisits.map((visit) => visit.studentId)).size).toBe(1);
  });
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
