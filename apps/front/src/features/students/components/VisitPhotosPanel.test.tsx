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
    fireEvent.change(screen.getByLabelText("انتخاب عکس برای ویزیت"), {
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

    fireEvent.change(screen.getByLabelText("انتخاب عکس برای ویزیت"), {
      target: { files: [new File(["jpeg"], "front.jpg", { type: "image/jpeg" })] }
    });

    await waitFor(() =>
      expect(apiUploadFormData).toHaveBeenCalledWith(
        "/students/student-1/visits/visit-1/photos/",
        expect.any(FormData)
      )
    );
  });
});
