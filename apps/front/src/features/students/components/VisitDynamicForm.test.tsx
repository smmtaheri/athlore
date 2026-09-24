import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VisitDynamicForm } from "./VisitDynamicForm";

const sections = [
  {
    fields: [
      {
        coachHelpText: "این توضیح فقط برای مربی است.",
        enabled: true,
        helpText: "این راهنمای شاگرد است.",
        key: "field",
        label: "فیلد",
        options: [],
        order: 0,
        prefillFrom: "",
        required: false,
        semanticKey: "",
        type: "text" as const
      }
    ],
    key: "section",
    label: "بخش",
    order: 0
  }
];

describe("VisitDynamicForm guidance visibility", () => {
  it("keeps coach-only help hidden unless the coach form explicitly enables it", () => {
    const props = {
      answers: {},
      onAnswersChange: () => undefined,
      sections
    };
    const { rerender } = render(<VisitDynamicForm {...props} />);

    expect(screen.getByText("این راهنمای شاگرد است.")).toBeInTheDocument();
    expect(screen.queryByText(/این توضیح فقط برای مربی است/)).not.toBeInTheDocument();

    rerender(<VisitDynamicForm {...props} showCoachHelpText />);
    expect(screen.getByText(/یادداشت مربی: این توضیح فقط برای مربی است/)).toBeInTheDocument();
  });
});
