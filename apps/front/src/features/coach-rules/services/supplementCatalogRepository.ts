import { apiRequest } from "../../../shared/api/client";

export interface SupplementDose {
  amount: string;
  unit: string;
  timing: string;
  custom_time: string;
  days: string;
}
export interface SupplementEntry {
  id: string;
  name: string;
  name_en: string;
  aliases: string[];
  category: string;
  goal_ids: string[];
  reason: string;
  instructions: string;
  warnings: string;
  replacement_group: string;
  priority: number;
  is_active: boolean;
  is_archived: boolean;
  auto_eligible: boolean;
  reviewed: boolean;
  doses: SupplementDose[];
}
export interface SupplementOptions {
  goals: { id: string; name: string }[];
  units: { key: string; name: string }[];
  timings: { key: string; name: string }[];
  days: { key: string; name: string }[];
}
export interface SupplementSelection {
  items: { entry_id: string; doses: SupplementDose[]; reason: string }[];
  confirmed: boolean;
  safety_reviewed: boolean;
  mode: "manual" | "suggested";
  goal_ids: string[];
}
export const emptySupplementSelection = (): SupplementSelection => ({
  items: [],
  confirmed: false,
  safety_reviewed: false,
  mode: "manual",
  goal_ids: []
});
export const newSupplementDose = (): SupplementDose => ({
  amount: "",
  unit: "scoop",
  timing: "after_workout",
  custom_time: "",
  days: "all"
});
export const supplementCatalogRepository = {
  prescribe: (student_id: string, selection: SupplementSelection) =>
    apiRequest<{ items: import("../../programs/types/generatedProgram").SupplementItem[] }>(
      "/supplement-catalog/prescribe/",
      { method: "POST", body: { student_id, selection } }
    ),
  options: () => apiRequest<SupplementOptions>("/supplement-catalog/options/"),
  async list() {
    const all: SupplementEntry[] = [];
    let count: number;
    do {
      const page = await apiRequest<{ count: number; results: SupplementEntry[] }>(
        "/supplement-catalog/",
        { query: { limit: 100, offset: all.length } }
      );
      all.push(...page.results);
      count = page.count;
      if (!page.results.length) break;
    } while (all.length < count);
    return all;
  },
  save: (entry: SupplementEntry) =>
    apiRequest<SupplementEntry>(
      entry.id ? `/supplement-catalog/${entry.id}/` : "/supplement-catalog/",
      { method: entry.id ? "PUT" : "POST", body: entry }
    ),
  archive: (id: string) => apiRequest(`/supplement-catalog/${id}/`, { method: "DELETE" }),
  saveGoal: (name: string, id?: string) =>
    apiRequest<{ id: string; name: string }>(
      id ? `/supplement-catalog/goals/${id}/` : "/supplement-catalog/goals/",
      { method: id ? "PATCH" : "POST", body: { name } }
    ),
  removeGoal: (id: string) => apiRequest(`/supplement-catalog/goals/${id}/`, { method: "DELETE" }),
  propose: (student_id: string, goal_ids: string[], count: number) =>
    apiRequest<{
      items: SupplementEntry[];
      reason: string;
      excluded: { id: string; reason: string }[];
    }>("/supplement-catalog/propose/", { method: "POST", body: { student_id, goal_ids, count } })
};
