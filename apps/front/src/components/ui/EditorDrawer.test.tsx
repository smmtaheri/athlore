import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorDrawer } from "./EditorDrawer";

describe("EditorDrawer", () => {
  it("asks before discarding edits and then closes on confirmation", async () => {
    const onClose = vi.fn();
    render(
      <EditorDrawer
        footer={(requestClose) => <button onClick={requestClose}>انصراف</button>}
        hasUnsavedChanges
        onClose={onClose}
        open
        title="ویرایش"
      >
        محتوای فرم
      </EditorDrawer>
    );

    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(screen.getByText("تغییرات ذخیره نشده‌اند.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "خروج بدون ذخیره" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes directly when there are no unsaved changes", async () => {
    const onClose = vi.fn();
    render(
      <EditorDrawer
        footer={(requestClose) => <button onClick={requestClose}>انصراف</button>}
        onClose={onClose}
        open
        title="ویرایش"
      >
        محتوای فرم
      </EditorDrawer>
    );

    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("تغییرات ذخیره نشده‌اند.")).not.toBeInTheDocument();
  });
});
