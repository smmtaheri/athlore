import { appConfig } from "../../../app/config/appConfig";
import { createApiVisitFormTemplatesRepository } from "../../../shared/api/repositories";
import { visitFormTemplateFixture } from "../fixtures/visitFormTemplates";
import type { VisitFormTemplate } from "../types/visitForm";

export const VISIT_FORM_TEMPLATES_STORAGE_KEY = "coach-assistant.visit-form-templates.v1";

export interface VisitFormTemplatesRepository {
  archive(id: string): Promise<VisitFormTemplate>;
  create(
    input: Partial<VisitFormTemplate> & { key: string; name: string }
  ): Promise<VisitFormTemplate>;
  duplicate(id: string, newKey?: string): Promise<VisitFormTemplate>;
  getById(id: string): Promise<VisitFormTemplate | null>;
  getDefault(): Promise<VisitFormTemplate | null>;
  list(): Promise<VisitFormTemplate[]>;
  reset(): Promise<VisitFormTemplate[]>;
  setDefault(id: string): Promise<VisitFormTemplate>;
  update(id: string, input: Partial<VisitFormTemplate>): Promise<VisitFormTemplate>;
}

function cloneTemplate(template: VisitFormTemplate): VisitFormTemplate {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        options: field.options.map((option) => ({ ...option }))
      }))
    }))
  };
}

function cloneTemplates(items: VisitFormTemplate[]): VisitFormTemplate[] {
  return items.map(cloneTemplate);
}

function isTemplateArray(value: unknown): value is VisitFormTemplate[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as VisitFormTemplate).id === "string" &&
        typeof (item as VisitFormTemplate).key === "string"
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

export function createVisitFormTemplatesRepository(
  storage = getStorage()
): VisitFormTemplatesRepository {
  const read = (): VisitFormTemplate[] => {
    if (!storage) {
      return cloneTemplates([visitFormTemplateFixture]);
    }

    const raw = storage.getItem(VISIT_FORM_TEMPLATES_STORAGE_KEY);
    if (!raw) {
      const initial = cloneTemplates([visitFormTemplateFixture]);
      storage.setItem(VISIT_FORM_TEMPLATES_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isTemplateArray(parsed)) {
        return cloneTemplates(parsed);
      }
    } catch {
      // Invalid local data should never leak into UI state.
    }

    const fallback = cloneTemplates([visitFormTemplateFixture]);
    storage.setItem(VISIT_FORM_TEMPLATES_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  };

  const write = (items: VisitFormTemplate[]) => {
    if (storage) {
      storage.setItem(VISIT_FORM_TEMPLATES_STORAGE_KEY, JSON.stringify(items));
    }
  };

  return {
    async archive(id) {
      return this.update(id, { isActive: false, isDefault: false });
    },
    async create(input) {
      const items = read();
      if (items.some((item) => item.key === input.key)) {
        throw new Error("Template key already exists.");
      }
      const now = new Date().toISOString();
      const makeDefault = input.isDefault === true || !items.some((item) => item.isDefault);
      const template: VisitFormTemplate = {
        createdAt: now,
        description: input.description ?? "",
        id: `tpl-${Date.now()}`,
        isActive: input.isActive ?? true,
        isDefault: makeDefault,
        key: input.key,
        name: input.name,
        sections: input.sections ?? [],
        updatedAt: now,
        version: input.version ?? 1
      };
      const next = makeDefault
        ? [template, ...items.map((item) => ({ ...item, isDefault: false }))]
        : [...items, template];
      write(next);
      return cloneTemplate(template);
    },
    async duplicate(id, newKey) {
      const items = read();
      const source = items.find((item) => item.id === id);
      if (!source) {
        throw new Error("Template was not found.");
      }
      let key = (newKey || `${source.key}_copy`).trim();
      let n = 2;
      while (items.some((item) => item.key === key)) {
        key = `${newKey || `${source.key}_copy`}_${n}`;
        n += 1;
      }
      return this.create({
        description: source.description,
        isActive: true,
        isDefault: false,
        key,
        name: `${source.name} (کپی)`,
        sections: cloneTemplate(source).sections
      });
    },
    async getById(id) {
      return read().find((item) => item.id === id) ?? null;
    },
    async getDefault() {
      const items = read().filter((item) => item.isActive);
      return items.find((item) => item.isDefault) ?? items[0] ?? null;
    },
    async list() {
      return read().sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
    },
    async reset() {
      const initial = cloneTemplates([visitFormTemplateFixture]);
      write(initial);
      return initial;
    },
    async setDefault(id) {
      const items = read();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error("Template was not found.");
      }
      if (!items[index].isActive) {
        throw new Error("Cannot default an inactive template.");
      }
      const next = items.map((item) => ({
        ...item,
        isDefault: item.id === id,
        updatedAt: item.id === id ? new Date().toISOString() : item.updatedAt
      }));
      write(next);
      return cloneTemplate(next[index]);
    },
    async update(id, input) {
      const items = read();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error("Template was not found.");
      }
      const current = items[index];
      const sectionsChanged = input.sections !== undefined;
      const isActive = input.isActive ?? current.isActive;
      let isDefault = input.isDefault ?? current.isDefault;
      if (!isActive) {
        isDefault = false;
      }
      const updated: VisitFormTemplate = {
        ...current,
        description: input.description ?? current.description,
        isActive,
        isDefault,
        name: input.name ?? current.name,
        sections: input.sections ?? current.sections,
        updatedAt: new Date().toISOString(),
        version: sectionsChanged ? current.version + 1 : (input.version ?? current.version)
      };
      let next = [...items];
      next[index] = updated;
      if (updated.isDefault) {
        next = next.map((item) => (item.id === id ? updated : { ...item, isDefault: false }));
      }
      write(next);
      return cloneTemplate(updated);
    }
  };
}

export const visitFormTemplatesRepository = appConfig.useMockRepositories
  ? createVisitFormTemplatesRepository()
  : createApiVisitFormTemplatesRepository();
