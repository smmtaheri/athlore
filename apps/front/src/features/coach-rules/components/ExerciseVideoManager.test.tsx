import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseVideoManager } from "./ExerciseVideoManager";
import type { ExerciseVideoState } from "../services/exerciseMedia";

const { request, upload } = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock("../../../shared/api/client", () => ({
  apiRequest: (...args: unknown[]) => request(...args),
  apiUploadFormData: (...args: unknown[]) => upload(...args)
}));

const ready: ExerciseVideoState = {
  media: {
    key: "owned-video",
    title: "Press",
    preview_url: "/preview.mp4",
    poster_url: "/poster.jpg",
    reel_url: "/video.mp4",
    education: {},
    attribution: { author: "Coach", source_url: "", license: "", license_url: "", changes: "" }
  }
};

function Harness({ initial = ready }: { initial?: ExerciseVideoState }) {
  const [state, setState] = useState(initial);
  return (
    <ExerciseVideoManager
      exerciseId="exercise-1"
      name="پرس سینه"
      state={state}
      onChange={(_id, value) => setState(value)}
      onBusyChange={() => undefined}
    />
  );
}

describe("ExerciseVideoManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads only the original video and retains the current video during processing", async () => {
    upload.mockImplementation(async (_path, _form, options) => {
      options.onUploadProgress(72);
      return {
        ...ready,
        media_upload: {
          id: "revision-2",
          status: "queued",
          original_filename: "phone.MOV",
          error_message: "",
          can_retry: false
        }
      };
    });
    render(<Harness />);
    const file = new File(["movie"], "phone.MOV", { type: "video/quicktime" });
    fireEvent.change(screen.getByLabelText("انتخاب ویدئوی جایگزین"), { target: { files: [file] } });
    await screen.findByText("در صف آماده‌سازی");
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toBe("/exercises/exercise-1/media/");
    const body = upload.mock.calls[0][1] as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.has("poster")).toBe(false);
    expect(body.has("preview")).toBe(false);
    expect(screen.getByLabelText("پیش‌نمایش ویدئوی پرس سینه")).toHaveAttribute("src", "/video.mp4");
    expect(screen.getByLabelText("انتخاب ویدئوی جایگزین")).toBeDisabled();
  });

  it("rejects unsupported files without starting a request", async () => {
    render(<Harness initial={{}} />);
    fireEvent.change(screen.getByLabelText("انتخاب ویدئو"), {
      target: { files: [new File(["image"], "poster.gif", { type: "image/gif" })] }
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("فقط فایل MP4 یا MOV");
    expect(upload).not.toHaveBeenCalled();
  });

  it("removes only the selected exercise video after confirmation", async () => {
    request.mockResolvedValue({ media: null, media_upload: null });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "حذف ویدئو / لغو آماده‌سازی" }));
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "حذف ویدئو" }));
    await screen.findByText("بدون ویدئو");
    expect(request).toHaveBeenCalledWith("/exercises/exercise-1/media/", { method: "DELETE" });
    expect(screen.queryByLabelText("پیش‌نمایش ویدئوی پرس سینه")).not.toBeInTheDocument();
  });

  it("retries the persisted failed job and keeps the old playable revision", async () => {
    const failed = {
      id: "revision-2",
      status: "failed" as const,
      original_filename: "phone.mp4",
      error_message: "پردازش قطع شد",
      can_retry: true
    };
    request.mockResolvedValue({
      ...ready,
      media_upload: { ...failed, status: "queued", can_retry: false }
    });
    render(<Harness initial={{ ...ready, media_upload: failed }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("پردازش قطع شد");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/exercises/exercise-1/media/retry/", { method: "POST" })
    );
    await screen.findByText("در صف آماده‌سازی");
    expect(screen.getByLabelText("پیش‌نمایش ویدئوی پرس سینه")).toBeInTheDocument();
  });
});
