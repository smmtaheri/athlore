import { appConfig } from "../../../app/config/appConfig";
import { apiRequest } from "../../../shared/api/client";
import type { TrainingSystem } from "../types/coachRules";

export interface TrainingSystemInput {
  allowed_levels: string[];
  base_technique_key?: string | null;
  description: string;
  enabled: boolean;
  execution_method: string;
  key: string;
  max_per_session: number;
  name: string;
  parameters: Record<string, unknown>;
}

export interface TrainingSystemsRepository {
  list(): Promise<TrainingSystem[]>;
  save(input: TrainingSystemInput, id?: string | null): Promise<TrainingSystem>;
  remove(id: string): Promise<void>;
}

export function createTrainingSystemsRepository(): TrainingSystemsRepository {
  if (appConfig.useMockRepositories) {
    let items: TrainingSystem[] = [
      {
        id: null,
        key: "partial_reps",
        name: "تکرار نیمه",
        description: "تکرار یک‌ونیم، پس از ناتوانی یا کل ست در دامنهٔ نیمه.",
        execution_method: "مقادیر نمونه برای بازبینی مربی.",
        allowed_levels: [],
        max_per_session: 0,
        parameters: {},
        enabled: false,
        source: "platform",
        base_technique_key: "partial_reps",
        handler_key: "partial_reps",
        handler_status: "implemented",
        parameter_schema: {
          variants: {
            default: ["one_and_half", "after_failure", "partial_only"]
          },
          after_failure_reps: { default: 3 }
        }
      }
    ];
    return {
      async list() {
        return structuredClone(items);
      },
      async save(input, id) {
        const current = id ? items.find((item) => item.id === id) : undefined;
        const next: TrainingSystem = {
          ...input,
          id: current?.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: input.base_technique_key ? "coach_override" : "coach_private",
          base_technique_key: input.base_technique_key ?? null,
          handler_key: input.base_technique_key ?? undefined,
          handler_status: input.base_technique_key ? "implemented" : "manual_only"
        };
        items = current ? items.map((item) => (item.id === id ? next : item)) : [...items, next];
        return structuredClone(next);
      },
      async remove(id) {
        items = items.filter((item) => item.id !== id);
      }
    };
  }

  return {
    list: () => apiRequest<TrainingSystem[]>("/training-techniques/"),
    save: (input, id) =>
      apiRequest<TrainingSystem>(id ? `/training-techniques/${id}/` : "/training-techniques/", {
        body: input,
        method: id ? "PATCH" : "POST"
      }),
    async remove(id) {
      await apiRequest(`/training-techniques/${id}/`, { method: "DELETE" });
    }
  };
}

export const trainingSystemsRepository = createTrainingSystemsRepository();
