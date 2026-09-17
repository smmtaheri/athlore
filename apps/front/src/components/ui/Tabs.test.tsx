import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  it("changes the active tab", async () => {
    const user = userEvent.setup();

    render(
      <Tabs
        items={[
          {
            content: <p>محتوای اول</p>,
            id: "first",
            label: "اول"
          },
          {
            content: <p>محتوای دوم</p>,
            id: "second",
            label: "دوم"
          }
        ]}
      />
    );

    expect(screen.getByText("محتوای اول")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "دوم" }));

    expect(screen.getByText("محتوای دوم")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "دوم" })).toHaveAttribute("aria-selected", "true");
  });
});
