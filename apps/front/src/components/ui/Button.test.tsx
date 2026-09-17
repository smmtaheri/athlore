import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>ذخیره</Button>);

    expect(screen.getByRole("button", { name: "ذخیره" })).toBeInTheDocument();
  });

  it("supports disabled state", () => {
    render(<Button disabled>ذخیره</Button>);

    expect(screen.getByRole("button", { name: "ذخیره" })).toBeDisabled();
  });
});
