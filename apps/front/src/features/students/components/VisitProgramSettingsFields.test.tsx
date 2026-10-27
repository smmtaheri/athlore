import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { VisitProgramSettings } from "../types/monthlyVisit";
import { VisitProgramSettingsFields } from "./VisitProgramSettingsFields";

vi.mock("../../coach-rules/services/coachRulesRepository", () => ({
  coachRulesRepository: { get: vi.fn().mockResolvedValue({ templates: [] }) }
}));
vi.mock("../../coach-rules/services/trainingSystemsRepository", () => ({
  trainingSystemsRepository: {
    list: vi.fn().mockResolvedValue([
      { key: "drop_set", name: "دراپ‌ست", allowed_levels: [] },
      { key: "superset", name: "سوپرست", allowed_levels: [] }
    ])
  }
}));

function Harness() {
  const [value, setValue] = useState<VisitProgramSettings>({ training_systems: [] });
  return (
    <>
      <VisitProgramSettingsFields
        value={value}
        onChange={setValue}
        disabled={false}
        sessions={4}
        level="advanced"
      />
      <output data-testid="settings">{JSON.stringify(value)}</output>
    </>
  );
}

it("keeps muscle selections independent per system and removes them with the system", async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "دراپ‌ست" }));
  const drop = screen.getByRole("group", { name: "عضلات هدف دراپ‌ست" });
  fireEvent.click(within(drop).getByRole("checkbox", { name: "سینه" }));
  fireEvent.click(within(drop).getByRole("checkbox", { name: "سرشانه" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "سوپرست" }));
  const superset = screen.getByRole("group", { name: "عضلات هدف سوپرست" });
  fireEvent.click(within(superset).getByRole("checkbox", { name: "پا" }));
  expect(JSON.parse(screen.getByTestId("settings").textContent ?? "{}").training_systems).toEqual([
    { key: "drop_set", muscles: ["سینه", "سرشانه"] },
    { key: "superset", muscles: ["پا"] }
  ]);
  fireEvent.click(screen.getByRole("checkbox", { name: "دراپ‌ست" }));
  expect(screen.queryByRole("group", { name: "عضلات هدف دراپ‌ست" })).not.toBeInTheDocument();
  expect(JSON.parse(screen.getByTestId("settings").textContent ?? "{}").training_systems).toEqual([
    { key: "superset", muscles: ["پا"] }
  ]);
});

it("stores the coach's per-muscle decision independently", () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox", { name: "تصمیم باسن" }), {
    target: { value: "focus" }
  });
  fireEvent.change(screen.getByRole("combobox", { name: "تصمیم سینه" }), {
    target: { value: "maintenance" }
  });
  expect(JSON.parse(screen.getByTestId("settings").textContent ?? "{}").muscle_decisions).toEqual({
    glutes: "focus",
    chest: "maintenance"
  });
});
