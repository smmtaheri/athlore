import { apiUploadFormData } from "../../../shared/api/client";

export const visitPhotoPoseOptions = [
  { label: "جلو", value: "front" },
  { label: "پهلو چپ", value: "left_side" },
  { label: "پشت", value: "back" },
  { label: "پهلو راست", value: "right_side" }
] as const;

export type VisitPhotoPose = (typeof visitPhotoPoseOptions)[number]["value"];

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
