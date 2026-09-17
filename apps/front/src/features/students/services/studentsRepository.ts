import { appConfig } from "../../../app/config/appConfig";
import { createApiStudentsRepository } from "../../../shared/api/repositories";
import { studentFixtures } from "../fixtures/students";
import type { StudentActivateLoginResult } from "../types/monthlyVisit";
import type { Student, StudentInput } from "../types/student";

export const STUDENTS_STORAGE_KEY = "coach-assistant.students.v1";

export interface StudentsRepository {
  activateLogin?(
    id: string,
    rotatePassword?: boolean,
    initialPassword?: string
  ): Promise<StudentActivateLoginResult>;
  create(input: StudentInput): Promise<Student>;
  deactivatePortal?(id: string): Promise<StudentActivateLoginResult | { studentId: string }>;
  getById(id: string): Promise<Student | undefined>;
  list(): Promise<Student[]>;
  reactivatePortal?(id: string): Promise<{ studentId: string }>;
  reset(): Promise<Student[]>;
  resetPortalPassword?(id: string, initialPassword: string): Promise<StudentActivateLoginResult>;
  setPortalInitialPassword?(
    id: string,
    username: string,
    initialPassword: string
  ): Promise<StudentActivateLoginResult>;
  setPortalUsername?(id: string, username: string): Promise<{ studentId: string; username: string }>;
  update(id: string, input: StudentInput): Promise<Student>;
}

function cloneStudents(students: Student[]): Student[] {
  return students.map((student) => ({
    ...student,
    equipment: { ...student.equipment },
    goals: {
      ...student.goals,
      musclePriorities: [...student.goals.musclePriorities],
      strongMuscles: [...student.goals.strongMuscles],
      weakMuscles: [...student.goals.weakMuscles]
    },
    injuries: {
      ...student.injuries,
      aggravatingMovements: [...student.injuries.aggravatingMovements],
      disallowedExercises: [...student.injuries.disallowedExercises]
    },
    lifestyle: { ...student.lifestyle },
    preferences: { ...student.preferences },
    summary: { ...student.summary },
    trainingBackground: { ...student.trainingBackground },
    trainingConditions: { ...student.trainingConditions }
  }));
}

function createSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "student";
}

function createUniqueId(students: Student[], fullName: string): string {
  const base = createSlug(fullName);
  let index = 1;
  let nextId = base;

  while (students.some((student) => student.id === nextId)) {
    index += 1;
    nextId = `${base}-${index}`;
  }

  return nextId;
}

function isStudentArray(value: unknown): value is Student[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Student).id === "string" &&
        typeof (item as Student).fullName === "string"
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

export function createStudentsRepository(storage = getStorage()): StudentsRepository {
  const read = (): Student[] => {
    if (!storage) {
      return cloneStudents(studentFixtures);
    }

    const raw = storage.getItem(STUDENTS_STORAGE_KEY);

    if (!raw) {
      const initialStudents = cloneStudents(studentFixtures);
      storage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(initialStudents));
      return initialStudents;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isStudentArray(parsed)) {
        return cloneStudents(parsed);
      }
    } catch {
      // Invalid local data should never leak into UI state.
    }

    const fallbackStudents = cloneStudents(studentFixtures);
    storage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(fallbackStudents));
    return fallbackStudents;
  };

  const write = (students: Student[]) => {
    if (storage) {
      storage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(students));
    }
  };

  return {
    async activateLogin(id, rotatePassword = false, initialPassword = "123456") {
      if (rotatePassword && !initialPassword) {
        // keep signature compatible with older callers
      }
      const student = read().find((item) => item.id === id);
      if (!student) {
        throw new Error("Student was not found.");
      }
      return {
        initialPassword,
        portalAccess: {
          accountActivated: false,
          hasPendingInitialPassword: true,
          mustChangePassword: true,
          portalEnabled: true,
          status: "pending_activation" as const,
          username: "mock_student"
        },
        purpose: "first_activation",
        studentId: id,
        temporaryPassword: initialPassword,
        username: "mock_student"
      };
    },
    async setPortalInitialPassword(id, username, initialPassword) {
      return {
        initialPassword,
        portalAccess: {
          accountActivated: false,
          hasPendingInitialPassword: true,
          mustChangePassword: true,
          portalEnabled: true,
          status: "pending_activation" as const,
          username
        },
        purpose: "first_activation",
        studentId: id,
        temporaryPassword: initialPassword,
        username
      };
    },
    async setPortalUsername(id, username) {
      return { studentId: id, username };
    },
    async resetPortalPassword(id, initialPassword) {
      return {
        initialPassword,
        portalAccess: {
          accountActivated: true,
          hasPendingInitialPassword: true,
          mustChangePassword: true,
          portalEnabled: true,
          status: "password_reset_required" as const,
          username: "student"
        },
        purpose: "password_reset",
        studentId: id,
        temporaryPassword: initialPassword,
        username: "student"
      };
    },
    async deactivatePortal(id) {
      return { studentId: id };
    },
    async reactivatePortal(id) {
      return { studentId: id };
    },
    async create(input) {
      const students = read();
      const now = new Date().toISOString();
      const student: Student = {
        ...input,
        createdAt: now,
        id: createUniqueId(students, input.fullName),
        updatedAt: now
      };
      const nextStudents = [student, ...students];
      write(nextStudents);
      return cloneStudents([student])[0];
    },
    async getById(id) {
      return read().find((student) => student.id === id);
    },
    async list() {
      return read();
    },
    async reset() {
      const initialStudents = cloneStudents(studentFixtures);
      write(initialStudents);
      return initialStudents;
    },
    async update(id, input) {
      const students = read();
      const index = students.findIndex((student) => student.id === id);

      if (index === -1) {
        throw new Error("Student was not found.");
      }

      const updatedStudent: Student = {
        ...input,
        createdAt: students[index].createdAt,
        id,
        updatedAt: new Date().toISOString()
      };
      const nextStudents = [...students];
      nextStudents[index] = updatedStudent;
      write(nextStudents);
      return cloneStudents([updatedStudent])[0];
    }
  };
}

export const studentsRepository = appConfig.useMockRepositories
  ? createStudentsRepository()
  : createApiStudentsRepository();
