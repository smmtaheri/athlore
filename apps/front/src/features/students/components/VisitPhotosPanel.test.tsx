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
    vi.mocked(apiUploadFormData).mockResolvedValue({});
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
        "/me/visits/visit-1/photos/",
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
        "/students/student-1/visits/visit-1/photos/",
        expect.any(FormData)
      )
    );
  });

  it("uploads a selected photo immediately for a new coach visit and shows its preview", async () => {
    const onUploadForNewVisit = vi.fn().mockResolvedValue({
      content_type: "image/jpeg",
      download_path: "/visits/photos/photo-1/download/",
      id: "photo-1",
      original_filename: "front.jpg",
      pose: "front",
      size_bytes: 4,
      uploaded_at: "2026-10-09T10:00:00Z",
      uploader_role: "coach"
    });
    const file = new File(["jpeg"], "front.jpg", { type: "image/jpeg" });

    render(
      <VisitPhotosPanel
        audience="coach"
        canUpload
        onUploadForNewVisit={onUploadForNewVisit}
        studentId="student-1"
        visitId={null}
      />
    );
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(["جلو", "پهلو چپ", "پشت", "پهلو راست"]);
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز جلو"), {
      target: { files: [file] }
    });

    await waitFor(() => expect(onUploadForNewVisit).toHaveBeenCalledWith("front", file));
    expect(await screen.findByRole("img", { name: "عکس پوز جلو" })).toBeTruthy();
  });

  it("shows an upload failure beside the preview and retries without blocking the visit", async () => {
    const onUploadForNewVisit = vi
      .fn()
      .mockRejectedValueOnce(new Error("آپلود موقتاً ناموفق بود."))
      .mockResolvedValueOnce({
        content_type: "image/jpeg",
        download_path: "/visits/photos/photo-1/download/",
        id: "photo-1",
        original_filename: "front.jpg",
        pose: "front",
        size_bytes: 4,
        uploaded_at: "2026-10-09T10:00:00Z",
        uploader_role: "coach"
      });

    render(
      <VisitPhotosPanel
        audience="coach"
        canUpload
        onUploadForNewVisit={onUploadForNewVisit}
        studentId="student-1"
        visitId={null}
      />
    );
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای پوز جلو"), {
      target: { files: [new File(["jpeg"], "front.jpg", { type: "image/jpeg" })] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("آپلود موقتاً ناموفق بود.");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره برای آپلود" }));
    await waitFor(() => expect(onUploadForNewVisit).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("img", { name: "عکس پوز جلو" })).toBeTruthy();
  });
});
