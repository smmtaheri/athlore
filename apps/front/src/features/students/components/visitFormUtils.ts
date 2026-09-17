import type {
  VisitFormAnswerValue,
  VisitFormFieldDefinition,
  VisitFormSectionDefinition,
  VisitFormTemplate,
  VisitFormTemplateSnapshot
} from "../types/visitForm";

export function enabledSectionsFromTemplate(
  template: VisitFormTemplate | VisitFormTemplateSnapshot | null | undefined
): VisitFormSectionDefinition[] {
  const sections = template?.sections ?? [];
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      ...section,
      fields: [...section.fields]
        .filter((field) => field.enabled !== false)
        .sort((a, b) => a.order - b.order)
    }))
    .filter((section) => section.fields.length > 0);
}

export function formatAnswerDisplay(
  field: VisitFormFieldDefinition,
  value: VisitFormAnswerValue | undefined
): string {
  if (value === undefined || value === null || value === "") {
    return "ثبت نشده";
  }

  if (field.type === "boolean") {
    return value === true ? "بله" : value === false ? "خیر" : "ثبت نشده";
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    if (selected.length === 0) {
      return "ثبت نشده";
    }
    const labels = field.options
      .filter((option) => selected.includes(option.value))
      .map((option) => option.label);
    return labels.length > 0 ? labels.join("، ") : selected.join("، ");
  }

  if (field.type === "single_select") {
    const match = field.options.find((option) => option.value === String(value));
    return match?.label ?? String(value);
  }

  return String(value);
}
