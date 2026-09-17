import type { Student, StudentsListFilters } from "../types/student";
import { goalLabels } from "../types/options";

export const defaultStudentFilters: StudentsListFilters = {
  goal: "all",
  level: "all",
  search: "",
  status: "all"
};

export function filterStudents(students: Student[], filters: StudentsListFilters): Student[] {
  const search = filters.search.trim().toLocaleLowerCase("fa-IR");

  return students.filter((student) => {
    const matchesSearch =
      !search ||
      [
        student.fullName,
        student.phoneNumber ?? "",
        student.summary.currentProgramTitle,
        goalLabels[student.goals.primaryGoal]
      ]
        .join(" ")
        .toLocaleLowerCase("fa-IR")
        .includes(search);

    const matchesLevel =
      filters.level === "all" || student.trainingBackground.level === filters.level;
    const matchesGoal = filters.goal === "all" || student.goals.primaryGoal === filters.goal;
    const matchesStatus = filters.status === "all" || student.status === filters.status;

    return matchesSearch && matchesLevel && matchesGoal && matchesStatus;
  });
}

export function paginateStudents<TItem>(items: TItem[], page: number, pageSize: number): TItem[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function hasActiveFilters(filters: StudentsListFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.goal !== "all" ||
    filters.level !== "all" ||
    filters.status !== "all"
  );
}
