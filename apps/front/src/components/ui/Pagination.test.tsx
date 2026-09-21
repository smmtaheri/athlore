import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("keeps large page counts compact", () => {
    render(<Pagination onPageChange={vi.fn()} page={100} pageCount={200} />);

    expect(screen.getAllByRole("button")).toHaveLength(7);
    expect(screen.getAllByText("…")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "صفحه 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "صفحه 100" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("button", { name: "صفحه 50" })).not.toBeInTheDocument();
  });
});
