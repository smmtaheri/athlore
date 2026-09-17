import { appConfig } from "../../../app/config/appConfig";
import { createApiStudentProgramsRepository } from "../../../shared/api/repositories";
import { studentProgramFixtures } from "../fixtures/studentPrograms";
import type { StudentProgramSummary } from "../types/studentProgram";

export const STUDENT_PROGRAMS_STORAGE_KEY = "coach-assistant.student-programs.v1";

export interface StudentProgramsRepository {
  activate(programId: string): Promise<StudentProgramSummary>;
  duplicate(programId: string): Promise<StudentProgramSummary>;
  getById(programId: string): Promise<StudentProgramSummary | null>;
  list?(): Promise<StudentProgramSummary[]>;
  listByStudent(studentId: string): Promise<StudentProgramSummary[]>;
  remove(programId: string): Promise<void>;
  reset(): Promise<StudentProgramSummary[]>;
  upsert?(program: StudentProgramSummary): Promise<StudentProgramSummary>;
}

function clonePrograms(programs: StudentProgramSummary[]): StudentProgramSummary[] {
  return programs.map((program) => ({ ...program }));
}

function isProgramArray(value: unknown): value is StudentProgramSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as StudentProgramSummary).id === "string" &&
        typeof (item as StudentProgramSummary).studentId === "string"
    )
  );
}

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function createDuplicateId(programs: StudentProgramSummary[], sourceId: string): string {
  let index = 1;
  let nextId = `${sourceId}-copy-${index}`;

  while (programs.some((program) => program.id === nextId)) {
    index += 1;
    nextId = `${sourceId}-copy-${index}`;
  }

  return nextId;
}

export function createStudentProgramsRepository(storage = getStorage()): StudentProgramsRepository {
  const read = (): StudentProgramSummary[] => {
    if (!storage) {
      return clonePrograms(studentProgramFixtures);
    }

    const raw = storage.getItem(STUDENT_PROGRAMS_STORAGE_KEY);

    if (!raw) {
      const initialPrograms = clonePrograms(studentProgramFixtures);
      storage.setItem(STUDENT_PROGRAMS_STORAGE_KEY, JSON.stringify(initialPrograms));
      return initialPrograms;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isProgramArray(parsed)) {
        return clonePrograms(parsed);
      }
    } catch {
      // Invalid local data should never leak into UI state.
    }

    const fallbackPrograms = clonePrograms(studentProgramFixtures);
    storage.setItem(STUDENT_PROGRAMS_STORAGE_KEY, JSON.stringify(fallbackPrograms));
    return fallbackPrograms;
  };

  const write = (programs: StudentProgramSummary[]) => {
    if (storage) {
      storage.setItem(STUDENT_PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
    }
  };

  return {
    async activate(programId) {
      const programs = read();
      const selected = programs.find((program) => program.id === programId);

      if (!selected) {
        throw new Error("Program was not found.");
      }

      const nextPrograms = programs.map((program) => {
        if (program.studentId !== selected.studentId) {
          return program;
        }

        if (program.id === programId) {
          return {
            ...program,
            isCurrent: true,
            status: "active" as const,
            updatedAt: new Date().toISOString()
          };
        }

        return {
          ...program,
          isCurrent: false,
          status: program.status === "active" ? ("ready" as const) : program.status
        };
      });

      write(nextPrograms);
      return clonePrograms([nextPrograms.find((program) => program.id === programId)!])[0];
    },
    async duplicate(programId) {
      const programs = read();
      const source = programs.find((program) => program.id === programId);

      if (!source) {
        throw new Error("Program was not found.");
      }

      const now = new Date().toISOString();
      const duplicated: StudentProgramSummary = {
        ...source,
        createdAt: now,
        id: createDuplicateId(programs, programId),
        isCurrent: false,
        status: "draft",
        title: `${source.title} - کپی`,
        updatedAt: now
      };
      const nextPrograms = [duplicated, ...programs];
      write(nextPrograms);
      return clonePrograms([duplicated])[0];
    },
    async getById(programId) {
      return read().find((program) => program.id === programId) ?? null;
    },
    async list() {
      return read();
    },
    async listByStudent(studentId) {
      return read().filter((program) => program.studentId === studentId);
    },
    async remove(programId) {
      const programs = read();
      const nextPrograms = programs.filter((program) => program.id !== programId);

      if (nextPrograms.length === programs.length) {
        throw new Error("Program was not found.");
      }

      write(nextPrograms);
    },
    async reset() {
      const initialPrograms = clonePrograms(studentProgramFixtures);
      write(initialPrograms);
      return initialPrograms;
    },
    async upsert(program) {
      const programs = read();
      const nextPrograms = [{ ...program }, ...programs.filter((item) => item.id !== program.id)];
      write(nextPrograms);
      return clonePrograms([program])[0];
    }
  };
}

export const studentProgramsRepository = appConfig.useMockRepositories
  ? createStudentProgramsRepository()
  : createApiStudentProgramsRepository();
