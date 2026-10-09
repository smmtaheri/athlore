import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDownload, apiRequest, apiUploadFormData } from "../../../shared/api/client";
import { VisitPhotosPanel } from "./VisitPhotosPanel";

vi.mock("../../../shared/api/client", () => ({
  apiDownload: vi.fn(),
  apiRequest: vi.fn(),
  apiUploadFormData: vi.fn()
}));

describe("VisitPhotosPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockResolvedValue({ results: [] });
    vi.mocked(apiDownload).mockResolvedValue({
      blob: new Blob(["photo"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      filename: "visit.jpg"
    });
    vi.mocked(apiUploadFormData).mockResolvedValue({ id: "stage-1", pose: "front" });
  });

  it("lets the student upload visit photos through the student-scoped endpoint", async () => {
    render(<VisitPhotosPanel audience="student" canUpload visitId="visit-1" />);
    expect(await screen.findByText("هنوز عکسی برای این ویزیت ثبت نشده است.")).toBeTruthy();

    const file = new File(["jpeg"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز جلو"), {
      target: { files: [file] }
    });

    await waitFor(() =>
      expect(apiUploadFormData).toHaveBeenCalledWith(
        "/me/visits/visit-1/photo-staging/",
        expect.any(FormData)
      )
    );
  });

  it("uses the coach-owned visit endpoint for coach uploads", async () => {
    render(<VisitPhotosPanel audience="coach" canUpload studentId="student-1" visitId="visit-1" />);
    expect(await screen.findByText("هنوز عکسی برای این ویزیت ثبت نشده است.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز پشت"), {
      target: { files: [new File(["jpeg"], "front.jpg", { type: "image/jpeg" })] }
    });

    await waitFor(() =>
      expect(apiUploadFormData).toHaveBeenCalledWith(
        "/students/student-1/visits/photo-staging/",
        expect.any(FormData)
      )
    );
  });

  it("uploads a selected photo immediately for a new coach visit and shows its preview", async () => {
    const file = new File(["jpeg"], "front.jpg", { type: "image/jpeg" });

    render(<VisitPhotosPanel audience="coach" canUpload studentId="student-1" visitId={null} />);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(["جلو", "پهلو چپ", "پشت", "پهلو راست"]);
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز جلو"), {
      target: { files: [file] }
    });

    await waitFor(() => expect(apiUploadFormData).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("img", { name: "پیش‌نمایش پوز جلو" })).toBeTruthy();
    expect(await screen.findByText("آماده ثبت")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حذف عکس انتخاب‌شده برای پوز جلو" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/visits/photos/staged/stage-1/", {
        method: "DELETE"
      })
    );
    expect(screen.queryByRole("img", { name: "پیش‌نمایش پوز جلو" })).toBeNull();
  });

  it("shows an upload failure beside the preview and retries without blocking the visit", async () => {
    vi.mocked(apiUploadFormData)
      .mockRejectedValueOnce(new Error("آپلود موقتاً ناموفق بود."))
      .mockResolvedValueOnce({ id: "stage-1", pose: "front" });

    render(<VisitPhotosPanel audience="coach" canUpload studentId="student-1" visitId={null} />);
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز جلو"), {
      target: { files: [new File(["jpeg"], "front.jpg", { type: "image/jpeg" })] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("آپلود موقتاً ناموفق بود.");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره برای آپلود" }));
    await waitFor(() => expect(apiUploadFormData).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("آماده ثبت")).toBeTruthy();
  });
});
