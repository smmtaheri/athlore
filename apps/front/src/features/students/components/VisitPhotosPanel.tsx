import { useCallback, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Upload } from "lucide-react";
import { Card } from "../../../components/ui";
import { apiDownload, apiRequest, apiUploadFormData } from "../../../shared/api/client";
import { formatCalendarDateTime } from "../../../shared/dates/calendar";
import styles from "./visitPhotos.module.css";

interface VisitPhoto {
  contentType: string;
  downloadPath: string;
  id: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  uploaderRole: "coach" | "student";
}

type VisitPhotosPanelProps =
  | { audience: "coach"; canUpload: boolean; studentId: string; visitId: string }
  | { audience: "student"; canUpload: boolean; studentId?: never; visitId: string };

function photoFromApi(value: Record<string, unknown>): VisitPhoto {
  return {
    contentType: String(value.content_type ?? "image/jpeg"),
    downloadPath: String(value.download_path ?? ""),
    id: String(value.id ?? ""),
    originalFilename: String(value.original_filename ?? ""),
    sizeBytes: Number(value.size_bytes ?? 0),
    uploadedAt: String(value.uploaded_at ?? ""),
    uploaderRole: value.uploader_role === "student" ? "student" : "coach"
  };
}

export function VisitPhotosPanel(props: VisitPhotosPanelProps) {
  const { audience, canUpload, visitId } = props;
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const photosPath =
    audience === "coach"
      ? `/students/${props.studentId}/visits/${visitId}/photos/`
      : `/me/visits/${visitId}/photos/`;

  const refresh = useCallback(async () => {
    const payload = await apiRequest<{ results?: Record<string, unknown>[] }>(photosPath);
    setPhotos((payload.results ?? []).map(photoFromApi));
  }, [photosPath]);

  useEffect(() => {
    let current = true;
    void apiRequest<{ results?: Record<string, unknown>[] }>(photosPath)
      .then((payload) => {
        if (current) setPhotos((payload.results ?? []).map(photoFromApi));
      })
      .catch(() => {
        if (current) setError("دریافت عکس‌های ویزیت انجام نشد.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [photosPath]);

  useEffect(() => {
    let current = true;
    const createdUrls: string[] = [];
    void Promise.all(
      photos.map(async (photo) => {
        try {
          const result = await apiDownload(photo.downloadPath);
          const url = URL.createObjectURL(result.blob);
          createdUrls.push(url);
          return [photo.id, url] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (current) {
        setImageUrls(Object.fromEntries(entries.filter((entry) => entry !== null)));
      }
    });
    return () => {
      current = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    setMessage("");
    let uploadedCount = 0;
    let failedCount = 0;
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        await apiUploadFormData(photosPath, form);
        uploadedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
    try {
      await refresh();
    } catch {
      failedCount = Math.max(failedCount, files.length - uploadedCount);
    }
    if (uploadedCount > 0) {
      setMessage(`${uploadedCount.toLocaleString("fa-IR")} عکس به ویزیت اضافه شد.`);
    }
    if (failedCount > 0) {
      setError(
        `${failedCount.toLocaleString("fa-IR")} عکس آپلود نشد. فرمت عکس باید JPG، PNG یا WebP و حجم هر عکس حداکثر ۱۰ مگابایت باشد.`
      );
    }
    if (uploadedCount === 0 && failedCount === 0) setError("آپلود انجام نشد.");
    setUploading(false);
  };

  return (
    <Card>
      <section aria-label="عکس‌های ویزیت" className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.title}>
            <ImagePlus aria-hidden size={20} />
            <h2>عکس‌های ویزیت</h2>
            <span className={styles.count}>{photos.length.toLocaleString("fa-IR")}</span>
          </div>
          {canUpload ? (
            <label className={styles.uploadLabel}>
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-label="انتخاب عکس برای ویزیت"
                disabled={uploading}
                multiple
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
              <span className={styles.uploadButton}>
                {uploading ? (
                  <LoaderCircle aria-hidden size={16} />
                ) : (
                  <Upload aria-hidden size={16} />
                )}
                {uploading ? "در حال آپلود…" : "افزودن عکس"}
              </span>
            </label>
          ) : null}
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className={styles.success} role="status">
            {message}
          </p>
        ) : null}
        {loading ? <p className={styles.muted}>در حال دریافت عکس‌ها…</p> : null}
        {!loading && photos.length === 0 ? (
          <p className={styles.muted}>هنوز عکسی برای این ویزیت ثبت نشده است.</p>
        ) : null}
        {photos.length > 0 ? (
          <div className={styles.grid}>
            {photos.map((photo) => (
              <figure className={styles.photo} key={photo.id}>
                {imageUrls[photo.id] ? (
                  <img
                    alt={photo.originalFilename || "عکس ویزیت"}
                    loading="lazy"
                    src={imageUrls[photo.id]}
                  />
                ) : (
                  <div aria-label="در حال بارگذاری تصویر" className={styles.imagePlaceholder} />
                )}
                <figcaption>
                  <span>{photo.originalFilename || "عکس"}</span>
                  <small>{photo.uploaderRole === "student" ? "ارسال شاگرد" : "ارسال مربی"}</small>
                  <small>{formatCalendarDateTime(photo.uploadedAt)}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {!canUpload ? (
          <p className={styles.muted}>در حال حاضر امکان افزودن عکس به این ویزیت وجود ندارد.</p>
        ) : null}
      </section>
    </Card>
  );
}
