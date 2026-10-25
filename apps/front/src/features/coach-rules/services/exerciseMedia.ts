import { apiUploadFormData } from "../../../shared/api/client";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import type { ExerciseMedia } from "../../programs/types/generatedProgram";

export interface ExerciseVideoUpload {
  id: string;
  status: "queued" | "processing" | "ready" | "failed" | "cancelled";
  original_filename: string;
  error_message: string;
  can_retry: boolean;
}

export interface ExerciseVideoState {
  media?: ExerciseMedia | null;
  media_upload?: ExerciseVideoUpload | null;
}

export function videoIsPending(state: ExerciseVideoState) {
  return state.media_upload?.status === "queued" || state.media_upload?.status === "processing";
}

export function videoStatusLabel(state: ExerciseVideoState) {
  if (state.media_upload?.status === "queued") return "در صف آماده‌سازی";
  if (state.media_upload?.status === "processing") return "در حال آماده‌سازی";
  if (state.media_upload?.status === "failed") return "آماده‌سازی ناموفق";
  return state.media ? "ویدئو دارد" : "بدون ویدئو";
}

export function videoErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 413)
      return "حجم ویدئو بیش از حد مجاز سرور است؛ فایل کوچک‌تری انتخاب کنید.";
    const fieldMessage = Object.values(error.fieldErrors).flat()[0];
    if (fieldMessage) return fieldMessage;
    return /[\u0600-\u06ff]/.test(error.message) ? error.message : persianMessageForApiError(error);
  }
  return "بارگذاری ویدئو انجام نشد؛ دوباره تلاش کنید.";
}

export function validateExerciseVideo(file: File) {
  if (!/\.(mp4|mov)$/i.test(file.name)) return "فقط فایل MP4 یا MOV انتخاب کنید.";
  if (!file.size || file.size > 100 * 1024 * 1024)
    return "حجم ویدئو باید بیشتر از صفر و حداکثر ۱۰۰ مگابایت باشد.";
  return "";
}

export async function uploadExerciseVideo(
  exerciseId: string,
  file: File,
  onUploadProgress?: (percent: number) => void,
  metadata?: Record<string, string>
) {
  const error = validateExerciseVideo(file);
  if (error) throw new ApiError({ code: "validation_error", message: error, status: 400 });
  const body = new FormData();
  body.append("file", file);
  Object.entries(metadata || {}).forEach(([name, value]) => body.append(name, value));
  return apiUploadFormData<ExerciseVideoState>(`/exercises/${exerciseId}/media/`, body, {
    onUploadProgress
  });
}
