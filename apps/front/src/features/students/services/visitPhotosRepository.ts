import { apiRequest, apiUploadFormData } from "../../../shared/api/client";

export const visitPhotoPoseOptions = [
  { label: "جلو", value: "front" },
  { label: "پهلو چپ", value: "left_side" },
  { label: "پشت", value: "back" },
  { label: "پهلو راست", value: "right_side" }
] as const;

export type VisitPhotoPose = (typeof visitPhotoPoseOptions)[number]["value"];

export interface StagedVisitPhotoResult {
  id: string;
  pose: VisitPhotoPose;
}

export function coachVisitPhotosPath(studentId: string, visitId: string): string {
  return `/students/${studentId}/visits/${visitId}/photos/`;
}

export function studentVisitPhotosPath(visitId: string): string {
  return `/me/visits/${visitId}/photos/`;
}

export async function uploadVisitPhoto(
  path: string,
  pose: VisitPhotoPose,
  file: File
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  form.append("pose", pose);
  return apiUploadFormData<Record<string, unknown>>(path, form);
}

export async function stageVisitPhoto(
  audience: "coach" | "student",
  sessionId: string,
  pose: VisitPhotoPose,
  file: File,
  visitId: string | null,
  studentId?: string
): Promise<StagedVisitPhotoResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("pose", pose);
  form.append("session_id", sessionId);
  if (audience === "coach" && visitId) form.append("visit_id", visitId);
  const path =
    audience === "coach"
      ? `/students/${studentId}/visits/photo-staging/`
      : `/me/visits/${visitId}/photo-staging/`;
  return apiUploadFormData<StagedVisitPhotoResult>(path, form);
}

export async function deleteStagedVisitPhoto(id: string): Promise<void> {
  await apiRequest(`/visits/photos/staged/${id}/`, { method: "DELETE" });
}

export async function commitStagedVisitPhotos(
  audience: "coach" | "student",
  sessionId: string,
  visitId: string,
  studentId?: string
): Promise<{ photo_issues: string[]; results: Record<string, unknown>[] }> {
  const path =
    audience === "coach"
      ? `/students/${studentId}/visits/${visitId}/photos/commit/`
      : `/me/visits/${visitId}/photos/commit/`;
  return apiRequest<{ photo_issues: string[]; results: Record<string, unknown>[] }>(path, {
    method: "POST",
    body: { session_id: sessionId }
  });
}
