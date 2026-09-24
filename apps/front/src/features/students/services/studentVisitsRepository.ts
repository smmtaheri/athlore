import { appConfig } from "../../../app/config/appConfig";
import { createApiVisitsRepository } from "../../../shared/api/repositories";
import { studentVisitFixtures } from "../fixtures/studentVisits";
import type { StudentVisit, StudentVisitInput, VisitAnswerRevision } from "../types/monthlyVisit";
import { sortVisitsNewestFirst } from "../utils/visitDates";

export const STUDENT_VISITS_STORAGE_KEY = "coach-assistant.student-visits.v1";

export interface StudentVisitsRepository {
  create(studentId: string, input: StudentVisitInput): Promise<StudentVisit>;
  finalize(studentId: string, visitId: string): Promise<StudentVisit>;
  getById(studentId: string, visitId: string): Promise<StudentVisit | null>;
  list?(): Promise<StudentVisit[]>;
  listAnswerRevisions(
    studentId: string,
    visitId: string,
    fieldKey?: string
  ): Promise<VisitAnswerRevision[]>;
  listByStudent(studentId: string): Promise<StudentVisit[]>;
  remove(studentId: string, visitId: string): Promise<void>;
  reset(): Promise<StudentVisit[]>;
  sendToStudent(studentId: string, visitId: string, expiresInDays?: number): Promise<StudentVisit>;
  startCoachReview(studentId: string, visitId: string): Promise<StudentVisit>;
  update(studentId: string, visitId: string, input: StudentVisitInput): Promise<StudentVisit>;
}

function cloneVisits(visits: StudentVisit[]): StudentVisit[] {
  return visits.map((visit) => ({
    ...visit,
    adherence: { ...visit.adherence },
    answers: { ...visit.answers },
    formTemplateSnapshot: {
      ...visit.formTemplateSnapshot,
      sections: visit.formTemplateSnapshot.sections
        ? visit.formTemplateSnapshot.sections.map((section) => ({
            ...section,
            fields: section.fields.map((field) => ({
              ...field,
              options: field.options.map((option) => ({ ...option }))
            }))
          }))
        : undefined
    },
    measurements: { ...visit.measurements }
  }));
}

function isVisitArray(value: unknown): value is StudentVisit[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as StudentVisit).id === "string" &&
        typeof (item as StudentVisit).studentId === "string"
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

function createVisitId(visits: StudentVisit[], studentId: string): string {
  let index = visits.length + 1;
  let nextId = `visit-${studentId}-${index}`;

  while (visits.some((visit) => visit.id === nextId)) {
    index += 1;
    nextId = `visit-${studentId}-${index}`;
  }

  return nextId;
}

export function createStudentVisitsRepository(storage = getStorage()): StudentVisitsRepository {
  const read = (): StudentVisit[] => {
    if (!storage) {
      return cloneVisits(studentVisitFixtures);
    }

    const raw = storage.getItem(STUDENT_VISITS_STORAGE_KEY);

    if (!raw) {
      const initialVisits = cloneVisits(studentVisitFixtures);
      storage.setItem(STUDENT_VISITS_STORAGE_KEY, JSON.stringify(initialVisits));
      return initialVisits;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isVisitArray(parsed)) {
        return cloneVisits(parsed);
      }
    } catch {
      // Invalid local data should never leak into UI state.
    }

    const fallbackVisits = cloneVisits(studentVisitFixtures);
    storage.setItem(STUDENT_VISITS_STORAGE_KEY, JSON.stringify(fallbackVisits));
    return fallbackVisits;
  };

  const write = (visits: StudentVisit[]) => {
    if (storage) {
      storage.setItem(STUDENT_VISITS_STORAGE_KEY, JSON.stringify(visits));
    }
  };

  return {
    async create(studentId, input) {
      const visits = read();
      const now = new Date().toISOString();
      const visit: StudentVisit = {
        ...input,
        answers: { ...(input.answers ?? {}) },
        coachPrivateNotes: input.coachPrivateNotes ?? "",
        createdAt: now,
        formTemplateId: input.formTemplateId ?? null,
        formTemplateKey: "",
        formTemplateName: "",
        formTemplateSnapshot: {},
        formTemplateVersion: 1,
        id: createVisitId(visits, studentId),
        status: input.status ?? "draft",
        studentId,
        updatedAt: now
      };
      const nextVisits = [visit, ...visits];
      write(nextVisits);
      return cloneVisits([visit])[0];
    },
    async finalize(studentId, visitId) {
      const visits = read();
      const index = visits.findIndex(
        (visit) => visit.studentId === studentId && visit.id === visitId
      );
      if (index === -1) {
        throw new Error("Visit was not found.");
      }
      const current = visits[index];
      if (current.status !== "draft" && current.status !== "coach_review") {
        throw new Error("Visit cannot be finalized from this status.");
      }
      const updated: StudentVisit = {
        ...current,
        finalizedAt: new Date().toISOString(),
        status: "finalized",
        updatedAt: new Date().toISOString()
      };
      const nextVisits = [...visits];
      nextVisits[index] = updated;
      write(nextVisits);
      return cloneVisits([updated])[0];
    },
    async startCoachReview(studentId, visitId) {
      const visits = read();
      const index = visits.findIndex(
        (visit) => visit.studentId === studentId && visit.id === visitId
      );
      if (index === -1) {
        throw new Error("Visit was not found.");
      }
      const current = visits[index];
      if (current.status !== "student_submitted") {
        throw new Error("Visit cannot enter coach review from this status.");
      }
      const updated: StudentVisit = {
        ...current,
        status: "coach_review",
        updatedAt: new Date().toISOString()
      };
      const nextVisits = [...visits];
      nextVisits[index] = updated;
      write(nextVisits);
      return cloneVisits([updated])[0];
    },
    async getById(studentId, visitId) {
      return read().find((visit) => visit.studentId === studentId && visit.id === visitId) ?? null;
    },
    async list() {
      return read();
    },
    async listAnswerRevisions() {
      return [];
    },
    async listByStudent(studentId) {
      return sortVisitsNewestFirst(read().filter((visit) => visit.studentId === studentId));
    },
    async remove(studentId, visitId) {
      const visits = read();
      const nextVisits = visits.filter(
        (visit) => !(visit.studentId === studentId && visit.id === visitId)
      );

      if (nextVisits.length === visits.length) {
        throw new Error("Visit was not found.");
      }

      write(nextVisits);
    },
    async reset() {
      const initialVisits = cloneVisits(studentVisitFixtures);
      write(initialVisits);
      return initialVisits;
    },
    async sendToStudent(studentId, visitId, expiresInDays = 30) {
      const visits = read();
      const index = visits.findIndex(
        (visit) => visit.studentId === studentId && visit.id === visitId
      );
      if (index === -1) {
        throw new Error("Visit was not found.");
      }
      const now = new Date();
      const expires = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
      const current = visits[index];
      const updated: StudentVisit = {
        ...current,
        expiresAt: expires.toISOString(),
        sentAt: now.toISOString(),
        status: "waiting_for_student",
        updatedAt: now.toISOString()
      };
      const nextVisits = [...visits];
      nextVisits[index] = updated;
      write(nextVisits);
      return cloneVisits([updated])[0];
    },
    async update(studentId, visitId, input) {
      const visits = read();
      const index = visits.findIndex(
        (visit) => visit.studentId === studentId && visit.id === visitId
      );

      if (index === -1) {
        throw new Error("Visit was not found.");
      }

      const current = visits[index];
      const updatedVisit: StudentVisit = {
        ...current,
        ...input,
        answers: input.answers !== undefined ? { ...input.answers } : current.answers,
        coachPrivateNotes: input.coachPrivateNotes ?? current.coachPrivateNotes,
        createdAt: current.createdAt,
        formTemplateId:
          input.formTemplateId !== undefined ? input.formTemplateId : current.formTemplateId,
        id: visitId,
        status: input.status ?? current.status,
        studentId,
        updatedAt: new Date().toISOString()
      };
      const nextVisits = [...visits];
      nextVisits[index] = updatedVisit;
      write(nextVisits);
      return cloneVisits([updatedVisit])[0];
    }
  };
}

export const studentVisitsRepository = appConfig.useMockRepositories
  ? createStudentVisitsRepository()
  : createApiVisitsRepository();
