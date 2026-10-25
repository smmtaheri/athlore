import { appConfig } from "../../../app/config/appConfig";
import { apiRequest } from "../../../shared/api/client";
import { CATALOG_PAGE_SIZE, type ListPage } from "../../../shared/api/usePagedList";
import type { TrainingRecipe, TrainingSystem } from "../types/coachRules";

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
  recipe?: TrainingRecipe;
}

export interface TrainingSystemsRepository {
  list(): Promise<TrainingSystem[]>;
  savePlatform(
    key: string,
    input: Pick<TrainingSystemInput, "name" | "description" | "execution_method" | "recipe">
  ): Promise<TrainingSystem>;
  listPage(search: string, offset: number, signal: AbortSignal): Promise<ListPage<TrainingSystem>>;
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
        },
        recipe: {
          version: 1,
          target: "last_isolation",
          steps: [{ op: "partial_range", mode: "after_failure", count: 3 }]
        }
      }
    ];
    return {
      async list() {
        return structuredClone(items);
      },
      async savePlatform(key, input) {
        const current = items.find((item) => item.key === key);
        if (!current) throw new Error("Unknown platform system.");
        const saved = { ...current, ...input };
        items = items.map((item) => (item.key === key ? saved : item));
        return structuredClone(saved);
      },
      async listPage(search, offset) {
        const matches = items.filter((item) =>
          `${item.name} ${item.key} ${item.description}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
        return {
          results: structuredClone(matches.slice(offset, offset + CATALOG_PAGE_SIZE)),
          count: matches.length,
          next: offset + CATALOG_PAGE_SIZE < matches.length ? "next" : null
        };
      },
      async save(input, id) {
        const current = id ? items.find((item) => item.id === id) : undefined;
        const next: TrainingSystem = {
          ...input,
          id: current?.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: input.base_technique_key ? "coach_override" : "coach_private",
          base_technique_key: input.base_technique_key ?? null,
          handler_key: input.base_technique_key ?? undefined,
          handler_status: input.recipe
            ? "implemented"
            : input.base_technique_key
              ? "implemented"
              : "manual_only"
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
    savePlatform: (key, input) =>
      apiRequest<TrainingSystem>(`/training-techniques/platform/${encodeURIComponent(key)}/`, {
        method: "PATCH",
        body: input
      }),
    listPage: (search, offset, signal) =>
      apiRequest<ListPage<TrainingSystem>>("/training-techniques/", {
        signal,
        query: { search, offset, limit: CATALOG_PAGE_SIZE }
      }),
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
