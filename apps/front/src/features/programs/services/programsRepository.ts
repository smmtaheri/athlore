import { appConfig } from "../../../app/config/appConfig";
import { createApiProgramsRepository } from "../../../shared/api/repositories";
import { studentProgramFixtures } from "../../students/fixtures/studentPrograms";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import type { GeneratedProgram, ProgramGenerationInput } from "../types/generatedProgram";

export const GENERATED_PROGRAMS_STORAGE_KEY = "coach-assistant.generated-programs.v1";

export interface ProgramsRepository {
  create(program: GeneratedProgram): Promise<GeneratedProgram>;
  createVersion?(id: string): Promise<GeneratedProgram>;
  remove?(id: string): Promise<void>;
  duplicate(id: string): Promise<GeneratedProgram>;
  finalize?(id: string): Promise<GeneratedProgram>;
  generate?(
    input: ProgramGenerationInput
  ): Promise<{ program: GeneratedProgram; warnings: string[]; generatorVersion?: string }>;
  getById(id: string): Promise<GeneratedProgram | null>;
  list(): Promise<GeneratedProgram[]>;
  listByStudent(studentId: string): Promise<GeneratedProgram[]>;
  reset(): Promise<GeneratedProgram[]>;
  update(id: string, program: GeneratedProgram): Promise<GeneratedProgram>;
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

export function cloneProgram(program: GeneratedProgram): GeneratedProgram {
  return JSON.parse(JSON.stringify(program)) as GeneratedProgram;
}

function clonePrograms(programs: GeneratedProgram[]): GeneratedProgram[] {
  return programs.map(cloneProgram);
}

function isProgramArray(value: unknown): value is GeneratedProgram[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as GeneratedProgram).id === "string" &&
        typeof (item as GeneratedProgram).studentId === "string"
    )
  );
}

function createDuplicateId(programs: GeneratedProgram[], sourceId: string) {
  let index = 1;
  let nextId = `${sourceId}-copy-${index}`;

  while (programs.some((program) => program.id === nextId)) {
    index += 1;
    nextId = `${sourceId}-copy-${index}`;
  }

  return nextId;
}

export function createProgramSummary(program: GeneratedProgram): StudentProgramSummary {
  return {
    createdAt: program.createdAt,
    dateRange: program.dateRange,
    generatedAt: program.createdAt,
    id: program.id,
    isCurrent: program.status === "active",
    programType: program.programType,
    status: program.status,
    studentId: program.studentId,
    title: program.title,
    updatedAt: program.updatedAt,
    version: `v${program.version}`
  };
}

export function createProgramsRepository(storage = getStorage()): ProgramsRepository {
  const read = (): GeneratedProgram[] => {
    if (!storage) {
      return [];
    }

    const raw = storage.getItem(GENERATED_PROGRAMS_STORAGE_KEY);

    if (!raw) {
      storage.setItem(GENERATED_PROGRAMS_STORAGE_KEY, JSON.stringify([]));
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isProgramArray(parsed)) {
        return clonePrograms(parsed);
      }
    } catch {
      // Invalid generated program data should be cleared locally.
    }

    storage.setItem(GENERATED_PROGRAMS_STORAGE_KEY, JSON.stringify([]));
    return [];
  };

  const write = (programs: GeneratedProgram[]) => {
    if (storage) {
      storage.setItem(GENERATED_PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
    }
  };

  return {
    async create(program) {
      const programs = read();
      const nextProgram = cloneProgram(program);
      const nextPrograms = [nextProgram, ...programs.filter((item) => item.id !== program.id)];
      write(nextPrograms);
      return cloneProgram(nextProgram);
    },
    async createVersion(id) {
      const source = await this.getById(id);

      if (!source) {
        throw new Error("Program was not found.");
      }

      const now = new Date().toISOString();
      const nextVersion: GeneratedProgram = {
        ...cloneProgram(source),
        createdAt: now,
        id: `${source.id}-v${source.version + 1}-${Date.now()}`,
        status: "draft",
        title: `${source.title} - نسخه جدید`,
        updatedAt: now,
        version: source.version + 1
      };
      const programs = read();
      write([nextVersion, ...programs]);
      return cloneProgram(nextVersion);
    },
    async duplicate(id) {
      const programs = read();
      const source = programs.find((program) => program.id === id) ?? (await this.getById(id));

      if (!source) {
        throw new Error("Program was not found.");
      }

      const now = new Date().toISOString();
      const duplicate: GeneratedProgram = {
        ...cloneProgram(source),
        createdAt: now,
        id: createDuplicateId(programs, id),
        status: "draft",
        title: `${source.title} - کپی`,
        updatedAt: now,
        version: source.version + 1
      };
      write([duplicate, ...programs]);
      return cloneProgram(duplicate);
    },
    async getById(id) {
      const generatedProgram = read().find((program) => program.id === id);

      if (generatedProgram) {
        return generatedProgram;
      }

      const summary = studentProgramFixtures.find((program) => program.id === id);
      return summary ? createGeneratedProgramFromSummary(summary) : null;
    },
    async list() {
      return read();
    },
    async listByStudent(studentId) {
      return read().filter((program) => program.studentId === studentId);
    },
    async remove(id) {
      const programs = read();
      const nextPrograms = programs.filter((program) => program.id !== id);

      if (nextPrograms.length === programs.length) {
        return;
      }

      write(nextPrograms);
    },
    async reset() {
      write([]);
      return [];
    },
    async update(id, program) {
      const programs = read();
      const index = programs.findIndex((item) => item.id === id);

      const nextProgram: GeneratedProgram = {
        ...cloneProgram(program),
        id,
        updatedAt: new Date().toISOString()
      };
      const nextPrograms =
        index === -1
          ? [nextProgram, ...programs]
          : programs.map((item) => (item.id === id ? nextProgram : item));
      write(nextPrograms);
      return cloneProgram(nextProgram);
    }
  };
}

export const programsRepository = appConfig.useMockRepositories
  ? createProgramsRepository()
  : createApiProgramsRepository();

export function createGeneratedProgramFromSummary(
  summary: StudentProgramSummary
): GeneratedProgram {
  const includesTraining = summary.programType === "workout" || summary.programType === "complete";
  const includesNutrition =
    summary.programType === "nutrition" || summary.programType === "complete";
  const includesSupplements =
    summary.programType === "supplement" || summary.programType === "complete";

  return {
    createdAt: summary.createdAt,
    dateRange: summary.dateRange,
    id: summary.id,
    nutrition: includesNutrition
      ? {
          dailyWater: "۲.۸ لیتر",
          meals: [
            {
              foods: [
                {
                  amount: "۱ وعده",
                  alternatives: "جایگزین قابل ویرایش",
                  id: "fixture-food-1",
                  name: "وعده نمونه"
                }
              ],
              id: "fixture-meal-1",
              notes: "نمونه وارد شده از summary قدیمی برای preview.",
              order: 1,
              title: "وعده نمونه"
            }
          ],
          notes: "این داده fallback برای سازگاری با fixtureهای قبلی است."
        }
      : undefined,
    pdfSettings: {
      contactInfo: "شماره تماس مربی",
      fileTitle: summary.title,
      includeCoachName: true,
      includeCoachNotes: true,
      includeNutrition: includesNutrition,
      includeStudentName: true,
      includeSupplements: includesSupplements,
      includeTraining: includesTraining,
      pageSize: "A4",
      style: "modern"
    },
    programType: summary.programType,
    status: summary.status === "expired" ? "archived" : summary.status,
    studentId: summary.studentId,
    supplements: includesSupplements
      ? {
          items: [
            {
              amount: "نمونه",
              id: "fixture-supplement-1",
              name: "مکمل نمونه",
              notes: "قابل ویرایش",
              order: 1,
              timing: "بعد تمرین"
            }
          ],
          medicalNote: "نمونه قابل ویرایش و غیرپزشکی.",
          summary: "داده fallback"
        }
      : undefined,
    title: summary.title,
    training: includesTraining
      ? {
          days: [
            {
              exercises: [
                {
                  id: "fixture-exercise-1",
                  name: "پرس سینه هالتر",
                  notes: "حرکت نمونه قابل ویرایش",
                  order: 1,
                  reps: "۱۰-۱۲",
                  rest: "۹۰ ثانیه",
                  rpe: "متوسط",
                  sets: 3,
                  targetMuscle: "سینه"
                }
              ],
              id: "fixture-day-1",
              notes: "روز نمونه",
              order: 1,
              targetMuscles: ["سینه"],
              title: "روز اول"
            }
          ],
          summary: "برنامه fallback از summary قدیمی"
        }
      : undefined,
    updatedAt: summary.updatedAt,
    version: parseSummaryVersion(summary.version)
  };
}

function parseSummaryVersion(value: string): number {
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
