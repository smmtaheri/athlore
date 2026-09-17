import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredCatalogSection } from "./StructuredCatalogSection";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("../../../shared/api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args)
}));

describe("StructuredCatalogSection", () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/exercise-taxonomy/") {
        return {
          equipment: [{ key: "dumbbell", name: "دمبل" }],
          levels: [{ key: "intermediate", name: "متوسط" }],
          muscles: [
            {
              key: "chest",
              name: "سینه",
              regions: [{ key: "upper_chest", name: "بالاسینه" }]
            }
          ]
        };
      }
      if (path === "/exercises/") {
        return {
          results: [
            {
              id: "exercise-1",
              name: "پرس بالاسینه دمبل",
              name_en: "Incline dumbbell press",
              aliases: [],
              targets: [{ muscle_key: "chest", region_key: "upper_chest", role: "primary" }],
              levels: ["intermediate"],
              equipment_keys: ["dumbbell"],
              movement_pattern: "press",
              source_document: "manual",
              coach_notes: "",
              is_active: true,
              is_archived: false,
              is_preferred: true,
              is_prohibited: false,
              priority: 1
            }
          ]
        };
      }
      return [
        {
          id: null,
          key: "superset",
          name: "سوپرست",
          description: "دو حرکت سازگار پشت سر هم.",
          execution_method: "جفت کن و بعد استراحت بده.",
          allowed_levels: [],
          max_per_session: 0,
          parameters: {},
          enabled: false,
          source: "platform",
          base_technique_key: "superset",
          handler_key: "superset",
          handler_status: "implemented",
          parameter_schema: {
            pairing_mode: { default: "same_muscle_isolation" },
            max_pairs: { default: 1 },
            rest_after_pair_seconds: { default: 90 }
          }
        },
        {
          id: null,
          key: "custom_manual",
          name: "تکنیک اختصاصی",
          description: "",
          execution_method: "",
          allowed_levels: [],
          max_per_session: 0,
          parameters: {},
          enabled: true,
          source: "coach_private",
          base_technique_key: null,
          handler_status: "manual_only"
        }
      ];
    });
  });

  it("renders structured rows, handler status, and archive action", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    expect(await screen.findByText("پرس بالاسینه دمبل")).toBeInTheDocument();
    expect(screen.getByText("فقط ذخیره اطلاعات")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "آرشیو" }));
    expect(apiRequestMock).toHaveBeenCalledWith("/exercises/exercise-1/", { method: "DELETE" });
  });

  it("shows executable technique logic and structured superset settings", async () => {
    const user = userEvent.setup();
    render(<StructuredCatalogSection />);

    expect(await screen.findByText(/جفت‌سازی:/)).toBeInTheDocument();
    expect(screen.getByText("قابل اجرا")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تنظیم برای من" }));

    expect(screen.getByText("روش جفت‌سازی")).toBeInTheDocument();
    expect(screen.getByText("استراحت بعد از جفت (ثانیه)")).toBeInTheDocument();
    expect(screen.getByText(/این handler در generator پیاده‌سازی شده است/)).toBeInTheDocument();
  });
});
