import { appConfig } from "../../../app/config/appConfig";
import { paginatedFromApi, visitFromApi } from "../../../shared/adapters/apiAdapters";
import { apiRequest } from "../../../shared/api/client";
import { studentsRepository } from "../../students/services/studentsRepository";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import type { VisitStatus } from "../../students/types/visitForm";

export interface CoachVisit extends StudentVisit {
  studentName: string;
}

export interface CoachVisitFilters {
  ordering: "-visit_date" | "-created_at";
  search: string;
  status: VisitStatus | "all";
}

export const COACH_VISITS_PAGE_SIZE = 20;

export const coachVisitsRepository = {
  async listPage(
    filters: CoachVisitFilters,
    page: number
  ): Promise<{ count: number; items: CoachVisit[] }> {
    const offset = (page - 1) * COACH_VISITS_PAGE_SIZE;
    if (!appConfig.useMockRepositories) {
      const dto = await apiRequest<Record<string, unknown>>("/visits/", {
        query: { ...filters, limit: COACH_VISITS_PAGE_SIZE, offset }
      });
      const result = paginatedFromApi(dto, (item) => ({
        ...visitFromApi(item),
        studentName: String(item.student_name ?? "شاگرد")
      }));
      return { count: result.count, items: result.results };
    }
    if (!studentVisitsRepository.list) {
      throw new Error("Visit history is unavailable.");
    }
    const [students, visits] = await Promise.all([
      studentsRepository.list(),
      studentVisitsRepository.list()
    ]);
    const names = new Map(students.map((student) => [student.id, student.fullName]));
    const items = visits
      .map((visit) => ({ ...visit, studentName: names.get(visit.studentId) ?? "شاگرد" }))
      .filter(
        (visit) =>
          (filters.status === "all" || visit.status === filters.status) &&
          visit.studentName.includes(filters.search.trim())
      )
      .sort((a, b) => {
        const dateKey = filters.ordering === "-created_at" ? "createdAt" : "visitDate";
        return (
          b[dateKey].localeCompare(a[dateKey]) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id)
        );
      });
    return { count: items.length, items: items.slice(offset, offset + COACH_VISITS_PAGE_SIZE) };
  }
};
