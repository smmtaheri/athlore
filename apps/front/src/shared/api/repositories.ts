import { apiRequest } from "./client";
import {
  coachRulesFromApi,
  coachRulesToApi,
  dashboardFromApi,
  generationEvidenceFromApi,
  paginatedFromApi,
  programDetailFromApi,
  programPatchToApi,
  programSummaryFromApi,
  studentActivateLoginFromApi,
  studentFromApi,
  studentInputToApi,
  visitAnswerRevisionFromApi,
  visitFormTemplateFromApi,
  visitFormTemplateToApi,
  visitFromApi,
  visitInputToApi
} from "../adapters/apiAdapters";
import type { CoachRules } from "../../features/coach-rules/types/coachRules";
import type { CoachRulesRepository } from "../../features/coach-rules/services/coachRulesRepository";
import type { DashboardMetrics } from "../../features/dashboard/services/dashboardMetrics";
import type {
  GeneratedProgram,
  GenerationEvidence,
  ProgramGenerationInput
} from "../../features/programs/types/generatedProgram";
import type { ProgramsRepository } from "../../features/programs/services/programsRepository";
import type { VisitFormTemplatesRepository } from "../../features/students/services/visitFormTemplatesRepository";
import type {
  StudentActivateLoginResult,
  StudentVisitInput
} from "../../features/students/types/monthlyVisit";
import type { StudentProgramSummary } from "../../features/students/types/studentProgram";
import type {
  Student,
  StudentInput,
  StudentsListFilters
} from "../../features/students/types/student";
import type { StudentsRepository } from "../../features/students/services/studentsRepository";
import type { StudentVisitsRepository } from "../../features/students/services/studentVisitsRepository";
import type { StudentProgramsRepository } from "../../features/students/services/studentProgramsRepository";
import { sortVisitsNewestFirst } from "../../features/students/utils/visitDates";

type DraftMeta = { draftVersionId?: string; latestFinalizedVersionId?: string };

const draftMeta = new Map<string, DraftMeta>();

function rememberDraftMeta(program: GeneratedProgram & Record<string, unknown>) {
  const meta: DraftMeta = {};
  if (typeof program.draftId === "string") {
    meta.draftVersionId = program.draftId;
  }
  const latest = program.latestFinalizedVersion as { id?: string } | undefined;
  if (latest?.id) {
    meta.latestFinalizedVersionId = latest.id;
  }
  draftMeta.set(program.id, meta);
  return program;
}

function stripMeta(program: GeneratedProgram): GeneratedProgram {
  const copy = { ...(program as GeneratedProgram & Record<string, unknown>) };
  delete copy.draftId;
  delete copy.versions;
  delete copy.provenance;
  delete copy.latestFinalizedVersion;
  // `evidence` / `generationRunId` are kept — they power the generation evidence panel.
  return copy as GeneratedProgram;
}

export function createApiStudentsRepository(): StudentsRepository & {
  activateLogin(id: string, rotatePassword?: boolean): Promise<StudentActivateLoginResult>;
  archive(id: string): Promise<Student>;
  listPage(filters: StudentsListFilters & { page: number; pageSize: number }): Promise<{
    count: number;
    items: Student[];
  }>;
} {
  return {
    async create(input: StudentInput) {
      const dto = await apiRequest<Record<string, unknown>>("/students/", {
        method: "POST",
        body: studentInputToApi(input)
      });
      return studentFromApi(dto);
    },
    async getById(id: string) {
      try {
        const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/`);
        return studentFromApi(dto);
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return undefined;
        }
        throw error;
      }
    },
    async list() {
      const dto = await apiRequest<Record<string, unknown>>("/students/", {
        query: { limit: 100, offset: 0, ordering: "-updated_at" }
      });
      return paginatedFromApi(dto, studentFromApi).results;
    },
    async listPage(filters) {
      const offset = (filters.page - 1) * filters.pageSize;
      const dto = await apiRequest<Record<string, unknown>>("/students/", {
        query: {
          limit: filters.pageSize,
          offset,
          search: filters.search || undefined,
          status: filters.status === "all" ? undefined : filters.status,
          level: filters.level === "all" ? undefined : filters.level,
          goal: filters.goal === "all" ? undefined : filters.goal,
          ordering: "-updated_at"
        }
      });
      const page = paginatedFromApi(dto, studentFromApi);
      return { count: page.count, items: page.results };
    },
    async reset() {
      return this.list();
    },
    async update(id: string, input: StudentInput) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/`, {
        method: "PATCH",
        body: studentInputToApi(input)
      });
      return studentFromApi(dto);
    },
    async archive(id: string) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/archive/`, {
        method: "POST",
        body: {}
      });
      return studentFromApi(dto);
    },
    async activateLogin(id: string, rotatePassword = false, initialPassword?: string) {
      if (!initialPassword) {
        throw new Error("initial_password is required");
      }
      const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/activate-login/`, {
        method: "POST",
        body: { rotate_password: rotatePassword, initial_password: initialPassword }
      });
      return studentActivateLoginFromApi(dto);
    },
    async setPortalInitialPassword(id: string, username: string, initialPassword: string) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${id}/portal/set-initial-password/`,
        {
          method: "POST",
          body: { username: username.trim(), initial_password: initialPassword }
        }
      );
      return studentActivateLoginFromApi(dto);
    },
    async setPortalUsername(id: string, username: string) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${id}/portal/set-username/`,
        { method: "POST", body: { username: username.trim() } }
      );
      return {
        studentId: strId(dto.student_id) || id,
        username: String(dto.username || username.trim())
      };
    },
    async resetPortalPassword(id: string, initialPassword: string) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${id}/portal/reset-password/`,
        { method: "POST", body: { initial_password: initialPassword } }
      );
      return studentActivateLoginFromApi(dto);
    },
    async deactivatePortal(id: string) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/portal/deactivate/`, {
        method: "POST",
        body: {}
      });
      return { studentId: strId(dto.student_id) || id };
    },
    async reactivatePortal(id: string) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${id}/portal/reactivate/`, {
        method: "POST",
        body: {}
      });
      return { studentId: strId(dto.student_id) || id };
    }
  };
}

function strId(value: unknown): string {
  return value == null ? "" : String(value);
}

export function createApiVisitsRepository(): StudentVisitsRepository {
  return {
    async create(studentId, input: StudentVisitInput) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${studentId}/visits/`, {
        method: "POST",
        body: visitInputToApi(input)
      });
      return visitFromApi(dto);
    },
    async finalize(studentId, visitId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/visits/${visitId}/finalize/`,
        { method: "POST", body: {} }
      );
      return visitFromApi(dto);
    },
    async startCoachReview(studentId, visitId) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/visits/${visitId}/start-coach-review/`,
        { method: "POST", body: {} }
      );
      return visitFromApi(dto);
    },
    async getById(studentId, visitId) {
      try {
        const dto = await apiRequest<Record<string, unknown>>(
          `/students/${studentId}/visits/${visitId}/`
        );
        return visitFromApi(dto);
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return null;
        }
        throw error;
      }
    },
    async list() {
      return [];
    },
    async listAnswerRevisions(studentId, visitId, fieldKey) {
      const dto = await apiRequest<{ results?: Record<string, unknown>[] }>(
        `/students/${studentId}/visits/${visitId}/answer-revisions/`,
        { query: fieldKey ? { field_key: fieldKey } : undefined }
      );
      return (dto.results ?? []).map(visitAnswerRevisionFromApi);
    },
    async listByStudent(studentId: string) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${studentId}/visits/`, {
        query: { limit: 100, offset: 0 }
      });
      return sortVisitsNewestFirst(paginatedFromApi(dto, visitFromApi).results);
    },
    async remove(studentId, visitId) {
      await apiRequest(`/students/${studentId}/visits/${visitId}/`, { method: "DELETE" });
    },
    async reset() {
      return [];
    },
    async sendToStudent(studentId, visitId, expiresInDays) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/visits/${visitId}/send-to-student/`,
        {
          method: "POST",
          body: expiresInDays == null ? {} : { expires_in_days: expiresInDays }
        }
      );
      return visitFromApi(dto);
    },
    async update(studentId, visitId, input: StudentVisitInput) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/students/${studentId}/visits/${visitId}/`,
        { method: "PATCH", body: visitInputToApi(input) }
      );
      return visitFromApi(dto);
    }
  };
}

export function createApiVisitFormTemplatesRepository(): VisitFormTemplatesRepository {
  return {
    async archive(id) {
      const dto = await apiRequest<Record<string, unknown>>(`/visit-form-templates/${id}/`, {
        method: "PATCH",
        body: { is_active: false }
      });
      return visitFormTemplateFromApi(dto);
    },
    async create(input) {
      const dto = await apiRequest<Record<string, unknown>>("/visit-form-templates/", {
        method: "POST",
        body: visitFormTemplateToApi(input)
      });
      return visitFormTemplateFromApi(dto);
    },
    async duplicate(id, newKey) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/visit-form-templates/${id}/duplicate/`,
        {
          method: "POST",
          body: newKey ? { key: newKey } : {}
        }
      );
      return visitFormTemplateFromApi(dto);
    },
    async getById(id) {
      try {
        const dto = await apiRequest<Record<string, unknown>>(`/visit-form-templates/${id}/`);
        return visitFormTemplateFromApi(dto);
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return null;
        }
        throw error;
      }
    },
    async getDefault() {
      const dto = await apiRequest<Record<string, unknown>>("/visit-form-templates/default/");
      if (dto.template === null || (dto.detail && !dto.id)) {
        return null;
      }
      if (!dto.id) {
        return null;
      }
      return visitFormTemplateFromApi(dto);
    },
    async list() {
      const dto = await apiRequest<Record<string, unknown>>("/visit-form-templates/");
      const results = Array.isArray(dto.results) ? dto.results : [];
      return results.map((item) =>
        visitFormTemplateFromApi((item as Record<string, unknown>) || {})
      );
    },
    async reset() {
      return this.list();
    },
    async setDefault(id) {
      const dto = await apiRequest<Record<string, unknown>>(
        `/visit-form-templates/${id}/set-default/`,
        { method: "POST", body: {} }
      );
      return visitFormTemplateFromApi(dto);
    },
    async update(id, input) {
      const dto = await apiRequest<Record<string, unknown>>(`/visit-form-templates/${id}/`, {
        method: "PATCH",
        body: visitFormTemplateToApi(input)
      });
      return visitFormTemplateFromApi(dto);
    }
  };
}

export function createApiCoachRulesRepository(): CoachRulesRepository {
  return {
    async get() {
      const dto = await apiRequest<Record<string, unknown>>("/coach-rules/");
      return coachRulesFromApi(dto);
    },
    async reset() {
      return this.get();
    },
    async save(rules: CoachRules) {
      const dto = await apiRequest<Record<string, unknown>>("/coach-rules/", {
        method: "PUT",
        body: coachRulesToApi(rules)
      });
      return coachRulesFromApi(dto);
    }
  };
}

export interface GenerateProgramResult {
  generationRunId: string;
  generatorVersion: string;
  program: GeneratedProgram;
  warnings: string[];
}

export function createApiProgramsRepository(): ProgramsRepository & {
  archive(id: string): Promise<void>;
  finalize(id: string): Promise<GeneratedProgram>;
  generate(input: ProgramGenerationInput): Promise<GenerateProgramResult>;
  listSummaries(query?: Record<string, string | number | undefined>): Promise<{
    count: number;
    items: StudentProgramSummary[];
  }>;
} {
  const loadDetail = async (id: string) => {
    const dto = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
    const program = rememberDraftMeta(
      programDetailFromApi(dto) as GeneratedProgram & Record<string, unknown>
    );
    return program;
  };

  return {
    async create(program) {
      // Empty draft create — rarely used; prefer generate.
      const dto = await apiRequest<Record<string, unknown>>("/programs/", {
        method: "POST",
        body: {
          student_id: program.studentId,
          title: program.title,
          program_type: program.programType,
          date_range_label: program.dateRange
        }
      });
      return stripMeta(
        rememberDraftMeta(programDetailFromApi(dto) as GeneratedProgram & Record<string, unknown>)
      );
    },
    async generate(input) {
      const body: Record<string, unknown> = {
        student_id: input.studentId,
        template_id: input.templateId,
        program_type: input.programType,
        title: input.title,
        level: input.level,
        days_per_week: input.daysPerWeek,
        duration_weeks: input.durationWeeks,
        goals: input.goal,
        muscle_priorities: input.musclePriorities,
        custom_instructions: input.customInstructions,
        apply_injury_rules: input.applyInjuryRules,
        apply_level_rules: input.applyLevelRules,
        apply_muscle_priority_rules: input.applyMusclePriorityRules,
        apply_exercise_bank: input.applyExerciseBank,
        apply_general_rules: input.applyGeneralRules,
        engine: "rules_v1"
      };
      if (input.targetMuscle) {
        body.target_muscle = input.targetMuscle;
      }
      if (input.targetRegion) {
        body.target_region = input.targetRegion;
      }
      if (input.targetMuscle && input.targetRegion && input.targetExerciseCount) {
        body.exercise_count = input.targetExerciseCount;
      }
      const dto = await apiRequest<Record<string, unknown>>("/programs/generate/", {
        method: "POST",
        body
      });
      const programDto = dto.program as Record<string, unknown>;
      const program = rememberDraftMeta(
        programDetailFromApi(programDto) as GeneratedProgram & Record<string, unknown>
      );
      return {
        generationRunId: String(dto.generation_run_id ?? ""),
        generatorVersion: String(dto.generator_version ?? "rules_v1"),
        program: stripMeta(program),
        warnings: Array.isArray(dto.warnings) ? dto.warnings.map(String) : []
      };
    },
    async createVersion(id) {
      const meta = draftMeta.get(id);
      let sourceVersionId = meta?.latestFinalizedVersionId || meta?.draftVersionId;
      if (!sourceVersionId) {
        const detail = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
        const latest = detail.latest_finalized_version as { id?: string } | null;
        const draft = detail.current_draft as { id?: string } | null;
        sourceVersionId = latest?.id || draft?.id;
      }
      if (!sourceVersionId) {
        throw new Error("No version available for new-version.");
      }
      const dto = await apiRequest<Record<string, unknown>>(
        `/programs/${id}/versions/${sourceVersionId}/new-version/`,
        { method: "POST", body: {} }
      );
      return stripMeta(
        rememberDraftMeta(programDetailFromApi(dto) as GeneratedProgram & Record<string, unknown>)
      );
    },
    async duplicate(id) {
      const meta = draftMeta.get(id);
      let sourceVersionId = meta?.latestFinalizedVersionId || meta?.draftVersionId;
      if (!sourceVersionId) {
        const detail = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
        const latest = detail.latest_finalized_version as { id?: string } | null;
        const draft = detail.current_draft as { id?: string } | null;
        sourceVersionId = latest?.id || draft?.id;
      }
      if (!sourceVersionId) {
        throw new Error("No version available to duplicate.");
      }
      const dto = await apiRequest<Record<string, unknown>>(
        `/programs/${id}/versions/${sourceVersionId}/duplicate/`,
        { method: "POST", body: {} }
      );
      return stripMeta(
        rememberDraftMeta(programDetailFromApi(dto) as GeneratedProgram & Record<string, unknown>)
      );
    },
    async getById(id) {
      try {
        return stripMeta(await loadDetail(id));
      } catch (error) {
        if ((error as { code?: string }).code === "not_found") {
          return null;
        }
        throw error;
      }
    },
    async list() {
      const dto = await apiRequest<Record<string, unknown>>("/programs/", {
        query: { limit: 100, offset: 0, ordering: "-updated_at" }
      });
      // List returns summaries — hydrate lightly for list UIs that expect GeneratedProgram
      const summaries = paginatedFromApi(dto, programSummaryFromApi).results;
      return summaries.map((summary) => ({
        createdAt: summary.createdAt,
        dateRange: summary.dateRange,
        id: summary.id,
        pdfSettings: {
          contactInfo: "",
          fileTitle: summary.title,
          includeCoachName: true,
          includeCoachNotes: true,
          includeNutrition: true,
          includeStudentName: true,
          includeSupplements: true,
          includeTraining: true,
          pageSize: "A4" as const,
          style: "modern" as const
        },
        programType: summary.programType,
        status: summary.status === "expired" ? "archived" : summary.status,
        studentId: summary.studentId,
        title: summary.title,
        updatedAt: summary.updatedAt,
        version: Number(String(summary.version).replace(/[^\d]/g, "")) || 1
      }));
    },
    async listSummaries(query = {}) {
      const dto = await apiRequest<Record<string, unknown>>("/programs/", {
        query: { limit: 20, offset: 0, ordering: "-updated_at", ...query }
      });
      const page = paginatedFromApi(dto, programSummaryFromApi);
      return { count: page.count, items: page.results };
    },
    async listByStudent(studentId) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${studentId}/programs/`, {
        query: { limit: 100, offset: 0 }
      });
      const summaries = paginatedFromApi(dto, programSummaryFromApi).results;
      return Promise.all(summaries.map(async (s) => (await this.getById(s.id))!));
    },
    async remove(id) {
      await apiRequest(`/programs/${id}/archive/`, { method: "POST", body: {} });
    },
    async archive(id) {
      await apiRequest(`/programs/${id}/archive/`, { method: "POST", body: {} });
    },
    async reset() {
      return [];
    },
    async finalize(id) {
      const meta = draftMeta.get(id);
      let versionId = meta?.draftVersionId;
      if (!versionId) {
        const detail = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
        versionId = (detail.current_draft as { id?: string } | null)?.id;
      }
      if (!versionId) {
        throw new Error("No draft to finalize.");
      }
      await apiRequest(`/programs/${id}/versions/${versionId}/finalize/`, {
        method: "POST",
        body: {}
      });
      return stripMeta(await loadDetail(id));
    },
    async update(id, program) {
      // Lineage title
      await apiRequest(`/programs/${id}/`, {
        method: "PATCH",
        body: {
          title: program.title,
          date_range_label: program.dateRange
        }
      });

      const meta = draftMeta.get(id) || {};
      let draftId = meta.draftVersionId;
      let finalizedId = meta.latestFinalizedVersionId;
      if (!draftId || !finalizedId) {
        const detail = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
        draftId = draftId || (detail.current_draft as { id?: string } | null)?.id;
        finalizedId =
          finalizedId || (detail.latest_finalized_version as { id?: string } | null)?.id;
        rememberDraftMeta(
          programDetailFromApi(detail) as GeneratedProgram & Record<string, unknown>
        );
      }

      const patchBody = programPatchToApi(program);

      if (program.status === "ready" || program.status === "active") {
        if (draftId) {
          // Save content first if draft exists
          await apiRequest(`/programs/${id}/versions/${draftId}/`, {
            method: "PATCH",
            body: patchBody
          });
          await apiRequest(`/programs/${id}/versions/${draftId}/finalize/`, {
            method: "POST",
            body: {}
          });
        } else if (finalizedId && patchBody.pdf_settings) {
          // Finalized programs: still allow PDF include-flag updates.
          await apiRequest(`/programs/${id}/versions/${finalizedId}/`, {
            method: "PATCH",
            body: { pdf_settings: patchBody.pdf_settings }
          });
        }
        if (program.status === "active") {
          const detail = await apiRequest<Record<string, unknown>>(`/programs/${id}/`);
          const finalized =
            (detail.latest_finalized_version as { id?: string } | null)?.id ||
            (detail.versions as { id: string; status: string }[] | undefined)?.find(
              (v) => v.status === "finalized"
            )?.id;
          if (finalized) {
            await apiRequest(`/programs/${id}/activate/`, {
              method: "POST",
              body: { version_id: finalized }
            });
          }
        }
        return stripMeta(await loadDetail(id));
      }

      if (draftId) {
        await apiRequest(`/programs/${id}/versions/${draftId}/`, {
          method: "PATCH",
          body: patchBody
        });
        return stripMeta(await loadDetail(id));
      }

      if (finalizedId && patchBody.pdf_settings) {
        await apiRequest(`/programs/${id}/versions/${finalizedId}/`, {
          method: "PATCH",
          body: { pdf_settings: patchBody.pdf_settings }
        });
        return stripMeta(await loadDetail(id));
      }

      throw new Error("Finalized program content cannot be edited; create a new version.");
    }
  };
}

export function createApiStudentProgramsRepository(
  programsApi = createApiProgramsRepository()
): StudentProgramsRepository {
  return {
    async activate(programId) {
      const detail = await apiRequest<Record<string, unknown>>(`/programs/${programId}/`);
      const finalized =
        (detail.latest_finalized_version as { id?: string } | null)?.id ||
        (detail.versions as { id: string; status: string }[] | undefined)?.find(
          (v) => v.status === "finalized"
        )?.id;
      if (!finalized) {
        throw new Error("No finalized version to activate.");
      }
      await apiRequest(`/programs/${programId}/activate/`, {
        method: "POST",
        body: { version_id: finalized }
      });
      const summary = await this.getById(programId);
      if (!summary) {
        throw new Error("Program was not found.");
      }
      return summary;
    },
    async duplicate(id) {
      const program = await programsApi.duplicate(id);
      return {
        createdAt: program.createdAt,
        dateRange: program.dateRange,
        generatedAt: program.createdAt,
        id: program.id,
        isCurrent: false,
        programType: program.programType,
        status: program.status,
        studentId: program.studentId,
        title: program.title,
        updatedAt: program.updatedAt,
        version: `v${program.version}`
      };
    },
    async getById(id) {
      const program = await programsApi.getById(id);
      if (!program) return null;
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
    },
    async list() {
      const result = await programsApi.listSummaries({ limit: 100 });
      return result.items;
    },
    async listByStudent(studentId) {
      const dto = await apiRequest<Record<string, unknown>>(`/students/${studentId}/programs/`, {
        query: { limit: 100, offset: 0 }
      });
      return paginatedFromApi(dto, programSummaryFromApi).results;
    },
    async remove(id) {
      await programsApi.archive(id);
    },
    async reset() {
      return [];
    },
    async upsert(summary) {
      return summary;
    }
  };
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const dto = await apiRequest<Record<string, unknown>>("/dashboard/");
  return dashboardFromApi(dto);
}

/** Full generation provenance for the evidence panel — `GET /generation-runs/{id}/`. */
export async function fetchGenerationRunEvidence(
  generationRunId: string
): Promise<GenerationEvidence> {
  const dto = await apiRequest<Record<string, unknown>>(`/generation-runs/${generationRunId}/`);
  return generationEvidenceFromApi(dto);
}
