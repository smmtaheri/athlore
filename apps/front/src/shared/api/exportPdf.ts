import { apiDownload } from "./client";

export function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadCoachRulesPdf() {
  const result = await apiDownload("/me/coach-rules/pdf/");
  triggerBrowserDownload(result.blob, result.filename || "coach-rules.pdf");
  return result;
}

export async function downloadStudentProfilePdf(studentId: string) {
  const result = await apiDownload(`/students/${studentId}/profile.pdf`);
  triggerBrowserDownload(result.blob, result.filename || "student-profile.pdf");
  return result;
}
