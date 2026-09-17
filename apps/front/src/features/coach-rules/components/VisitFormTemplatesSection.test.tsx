import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisitFormTemplatesSection } from "./VisitFormTemplatesSection";
import type { VisitFormTemplatesRepository } from "../../students/services/visitFormTemplatesRepository";
import type { VisitFormTemplate } from "../../students/types/visitForm";

const baseTemplate: VisitFormTemplate = {
  createdAt: "2026-01-01T00:00:00.000Z",
  description: "",
  id: "tpl-1",
  isActive: true,
  isDefault: true,
  key: "default_v1",
  name: "فرم پایه",
  sections: [
    {
      fields: [
        {
          coachEditable: true,
          enabled: true,
          helpText: "",
          key: "goal",
          label: "هدف",
          options: [],
          order: 1,
          prefillFrom: "",
          required: false,
          semanticKey: "goal",
          studentEditable: false,
          studentVisible: true,
          studentVisibleWhenFinalized: true,
          type: "text"
        }
      ],
      key: "general",
      label: "عمومی",
      order: 1
    }
  ],
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1
};

function createRepo(
  overrides: Partial<VisitFormTemplatesRepository> = {}
): VisitFormTemplatesRepository {
  return {
    archive: vi.fn(async () => baseTemplate),
    create: vi.fn(async () => baseTemplate),
    duplicate: vi.fn(async () => baseTemplate),
    getById: vi.fn(async () => baseTemplate),
    getDefault: vi.fn(async () => baseTemplate),
    list: vi.fn(async () => [baseTemplate]),
    reset: vi.fn(async () => [baseTemplate]),
    setDefault: vi.fn(async () => baseTemplate),
    update: vi.fn(async (id, input) => ({ ...baseTemplate, ...input, id })),
    ...overrides
  };
}

describe("VisitFormTemplatesSection permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the four field permission switches", async () => {
    render(<VisitFormTemplatesSection repository={createRepo()} />);

    expect(await screen.findByText("قابل مشاهده برای شاگرد (باز)")).toBeInTheDocument();
    expect(screen.getByText("قابل ویرایش توسط شاگرد")).toBeInTheDocument();
    expect(screen.getByText("قابل ویرایش توسط مربی")).toBeInTheDocument();
    expect(screen.getByText("قابل مشاهده پس از نهایی‌سازی")).toBeInTheDocument();
  });
});
