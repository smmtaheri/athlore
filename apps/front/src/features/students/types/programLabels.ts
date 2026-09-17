import type { StudentProgramStatus, StudentProgramType } from "./studentProgram";

export const programTypeLabels: Record<StudentProgramType, string> = {
  complete: "کامل",
  nutrition: "غذایی",
  supplement: "مکمل",
  workout: "تمرینی"
};

export const programStatusLabels: Record<StudentProgramStatus, string> = {
  active: "فعال",
  archived: "آرشیوشده",
  draft: "پیش نویس",
  expired: "منقضی",
  ready: "آماده"
};
