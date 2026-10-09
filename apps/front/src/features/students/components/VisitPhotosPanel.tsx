import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { Card } from "../../../components/ui";
import { ApiError } from "../../../shared/api/errors";
import { apiDownload, apiRequest } from "../../../shared/api/client";
import { formatCalendarDateTime } from "../../../shared/dates/calendar";
import {
  coachVisitPhotosPath,
  studentVisitPhotosPath,
  uploadVisitPhoto,
  visitPhotoPoseOptions,
  type VisitPhotoPose
} from "../services/visitPhotosRepository";
import styles from "./visitPhotos.module.css";

interface VisitPhoto {
  contentType: string;
  downloadPath: string;
  id: string;
  originalFilename: string;
  pose: VisitPhotoPose | null;
  sizeBytes: number;
  uploadedAt: string;
  uploaderRole: "coach" | "student";
}

type VisitPhotosPanelProps =
  | {
      audience: "coach";
      canUpload: boolean;
      onUploadForNewVisit?: (pose: VisitPhotoPose, file: File) => Promise<Record<string, unknown>>;
      onUploadStateChange?: (uploading: boolean) => void;
      studentId: string;
      visitId: string | null;
    }
  | { audience: "student"; canUpload: boolean; studentId?: never; visitId: string };

interface LocalPhotoSelection {
  file: File;
  previewUrl: string;
}

function photoFromApi(value: Record<string, unknown>): VisitPhoto {
  const pose = visitPhotoPoseOptions.some((option) => option.value === value.pose)
    ? (value.pose as VisitPhotoPose)
    : null;
  return {
    contentType: String(value.content_type ?? "image/jpeg"),
    downloadPath: String(value.download_path ?? ""),
    id: String(value.id ?? ""),
    originalFilename: String(value.original_filename ?? ""),
    pose,
    sizeBytes: Number(value.size_bytes ?? 0),
    uploadedAt: String(value.uploaded_at ?? ""),
    uploaderRole: value.uploader_role === "student" ? "student" : "coach"
  };
}

function photoUploaderLabel(role: VisitPhoto["uploaderRole"]): string {
  return role === "student" ? "ارسال شاگرد" : "ارسال مربی";
}

export function VisitPhotosPanel(props: VisitPhotosPanelProps) {
  const { audience, canUpload, visitId } = props;
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [localSelections, setLocalSelections] = useState<
    Partial<Record<VisitPhotoPose, LocalPhotoSelection>>
  >({});
  const [loading, setLoading] = useState(Boolean(visitId));
  const [uploadingPose, setUploadingPose] = useState<VisitPhotoPose | null>(null);
  const [poseErrors, setPoseErrors] = useState<Partial<Record<VisitPhotoPose, string>>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const localPreviewUrls = useRef<Partial<Record<VisitPhotoPose, string>>>({});

  const photosPath = visitId
    ? audience === "coach"
      ? coachVisitPhotosPath(props.studentId, visitId)
      : studentVisitPhotosPath(visitId)
    : null;
  const refresh = useCallback(async () => {
    if (!photosPath) return [];
    const payload = await apiRequest<{ results?: Record<string, unknown>[] }>(photosPath);
    const latestPhotos = (payload.results ?? []).map(photoFromApi);
    setPhotos(latestPhotos);
    return latestPhotos;
  }, [photosPath]);

  useEffect(() => {
    let current = true;
    if (!photosPath) return undefined;

    setLoading(true);
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

  useEffect(
    () => () => {
      Object.values(localPreviewUrls.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    },
    []
  );

  const upload = async (pose: VisitPhotoPose, file: File) => {
    setUploadingPose(pose);
    if (audience === "coach") props.onUploadStateChange?.(true);
    setError("");
    setMessage("");
    setPoseErrors((current) => {
      const next = { ...current };
      delete next[pose];
      return next;
    });
    try {
      const result = photosPath
        ? await uploadVisitPhoto(photosPath, pose, file)
        : audience === "coach" && props.onUploadForNewVisit
          ? await props.onUploadForNewVisit(pose, file)
          : null;
      if (!result) throw new Error("آپلود عکس برای این ویزیت در دسترس نیست.");
      const uploadedPhoto = photoFromApi(result);
      setPhotos((current) => [
        ...current.filter((photo) => photo.id !== uploadedPhoto.id && photo.pose !== pose),
        uploadedPhoto
      ]);
      setMessage("عکس این پوز ثبت شد و برای طرف دیگر ویزیت قابل مشاهده است.");
    } catch (uploadError) {
      setPoseErrors((current) => ({
        ...current,
        [pose]:
          uploadError instanceof ApiError
            ? uploadError.message
            : uploadError instanceof Error && uploadError.message
              ? uploadError.message
              : "آپلود این عکس انجام نشد؛ دوباره تلاش کنید."
      }));
      try {
        const latestPhotos = await refresh();
        if (latestPhotos.some((photo) => photo.pose === pose)) {
          const previewUrl = localPreviewUrls.current[pose];
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          delete localPreviewUrls.current[pose];
          setLocalSelections((current) => {
            const next = { ...current };
            delete next[pose];
            return next;
          });
          setPoseErrors((current) => {
            const next = { ...current };
            delete next[pose];
            return next;
          });
          setMessage("این پوز هم‌زمان توسط طرف دیگر ویزیت ثبت شد و عکس ثبت‌شده نمایش داده می‌شود.");
        }
      } catch {
        // Keep the upload error visible; the next page load will refresh the slot.
      }
    } finally {
      setUploadingPose(null);
      if (audience === "coach") props.onUploadStateChange?.(false);
    }
  };

  const chooseFile = (pose: VisitPhotoPose, file?: File) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const previousPreviewUrl = localPreviewUrls.current[pose];
    if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
    localPreviewUrls.current[pose] = previewUrl;
    setLocalSelections((current) => ({ ...current, [pose]: { file, previewUrl } }));
    setPoseErrors((current) => ({ ...current, [pose]: undefined }));
    void upload(pose, file);
  };

  const removeFailedSelection = (pose: VisitPhotoPose) => {
    const previewUrl = localPreviewUrls.current[pose];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    delete localPreviewUrls.current[pose];
    setLocalSelections((current) => {
      const next = { ...current };
      delete next[pose];
      return next;
    });
    setPoseErrors((current) => {
      const next = { ...current };
      delete next[pose];
      return next;
    });
  };

  const photosByPose = new Map<VisitPhotoPose, VisitPhoto>(
    photos.flatMap((photo) => (photo.pose ? [[photo.pose, photo] as const] : []))
  );
  const legacyPhotos = photos.filter((photo) => photo.pose === null);

  return (
    <Card>
      <section aria-label="عکس‌های ویزیت" className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.title}>
            <ImagePlus aria-hidden size={20} />
            <h2>عکس‌های ارزیابی</h2>
            <span className={styles.count}>{photosByPose.size.toLocaleString("fa-IR")}</span>
          </div>
          <p className={styles.intro}>
            برای هر پوز یک عکس ثبت می‌شود؛ عکس را در کادر همان پوز انتخاب کنید. سمت راست و چپ از دید
            شاگرد است. عکس بلافاصله آپلود می‌شود؛ اگر آپلود نشود، همین‌جا می‌توانید دوباره تلاش کنید
            یا ویزیت را بدون آن ادامه دهید.
            {!visitId && audience === "coach"
              ? " با انتخاب اولین عکس، پیش‌نویس ویزیت برای اتصال عکس خودکار ذخیره می‌شود."
              : ""}
          </p>
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
        {!loading && photos.length === 0 && Object.keys(localSelections).length === 0 ? (
          <p className={styles.muted}>هنوز عکسی برای این ویزیت ثبت نشده است.</p>
        ) : null}

        <div className={styles.poseGrid}>
          {visitPhotoPoseOptions.map(({ label, value: pose }) => {
            const photo = photosByPose.get(pose);
            const localSelection = localSelections[pose];
            const poseError = poseErrors[pose];
            const canChoose =
              canUpload &&
              !photo &&
              (Boolean(photosPath) || (audience === "coach" && Boolean(props.onUploadForNewVisit)));
            const inputId = `visit-photo-${visitId ?? "new"}-${pose}`;

            return (
              <article className={styles.poseSlot} key={pose}>
                <div className={styles.poseHeader}>
                  <h3>{label}</h3>
                  <span>
                    {photo
                      ? "ثبت شده"
                      : uploadingPose === pose
                        ? "در حال آپلود"
                        : poseError
                          ? "آپلود ناموفق"
                          : localSelection
                            ? "پیش‌نمایش عکس"
                            : "خالی"}
                  </span>
                </div>
                {photo ? (
                  <figure className={styles.photo}>
                    {imageUrls[photo.id] || localSelection?.previewUrl ? (
                      <img
                        alt={`عکس پوز ${label}`}
                        loading="lazy"
                        src={imageUrls[photo.id] ?? localSelection?.previewUrl}
                      />
                    ) : (
                      <div aria-label="در حال بارگذاری تصویر" className={styles.imagePlaceholder} />
                    )}
                    <figcaption>
                      <span>{photo.originalFilename || `پوز ${label}`}</span>
                      <small>{photoUploaderLabel(photo.uploaderRole)}</small>
                      <small>{formatCalendarDateTime(photo.uploadedAt)}</small>
                    </figcaption>
                  </figure>
                ) : localSelection ? (
                  <div className={styles.pendingPhoto}>
                    <img alt={`پیش‌نمایش پوز ${label}`} src={localSelection.previewUrl} />
                    <span>{localSelection.file.name}</span>
                    <small>
                      {uploadingPose === pose
                        ? "عکس در حال آپلود است…"
                        : poseError
                          ? "عکس آپلود نشد؛ می‌توانید دوباره تلاش کنید یا بدون آن ادامه دهید."
                          : "آپلود عکس آغاز می‌شود. منطق ثبت ویزیت مستقل است."}
                    </small>
                    {poseError && uploadingPose !== pose ? (
                      <>
                        <button
                          className={styles.retryButton}
                          onClick={() => void upload(pose, localSelection.file)}
                          type="button"
                        >
                          تلاش دوباره برای آپلود
                        </button>
                        <button
                          aria-label={`حذف عکس انتخاب‌شده برای پوز ${label}`}
                          className={styles.removePending}
                          onClick={() => removeFailedSelection(pose)}
                          type="button"
                        >
                          <X aria-hidden size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div aria-hidden className={styles.emptyPose}>
                    <ImagePlus size={24} />
                    <span>جای عکس {label}</span>
                  </div>
                )}

                {canChoose ? (
                  <label className={styles.uploadLabel} htmlFor={inputId}>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={`انتخاب عکس برای پوز ${label}`}
                      disabled={uploadingPose !== null}
                      id={inputId}
                      onChange={(event) => {
                        chooseFile(pose, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                    <span className={styles.uploadButton}>
                      {uploadingPose === pose ? (
                        <LoaderCircle aria-hidden className={styles.spinner} size={16} />
                      ) : (
                        <Upload aria-hidden size={16} />
                      )}
                      {uploadingPose === pose
                        ? "در حال آپلود…"
                        : poseError
                          ? "انتخاب عکس دیگر"
                          : "انتخاب عکس"}
                    </span>
                  </label>
                ) : null}
                {!canUpload && !photo ? (
                  <p className={styles.muted}>برای این ویزیت امکان افزودن عکس ندارید.</p>
                ) : null}
                {poseError ? (
                  <p className={styles.error} role="alert">
                    {poseError}
                  </p>
                ) : null}
                {photo ? (
                  <p className={styles.slotLock}>این پوز ثبت شده و جایگزین نمی‌شود.</p>
                ) : null}
              </article>
            );
          })}
        </div>

        {legacyPhotos.length > 0 ? (
          <div className={styles.legacySection}>
            <h3>عکس‌های قبلی بدون پوز مشخص</h3>
            <div className={styles.legacyGrid}>
              {legacyPhotos.map((photo) => (
                <figure className={styles.photo} key={photo.id}>
                  {imageUrls[photo.id] ? (
                    <img alt={photo.originalFilename || "عکس ویزیت"} src={imageUrls[photo.id]} />
                  ) : (
                    <div aria-label="در حال بارگذاری تصویر" className={styles.imagePlaceholder} />
                  )}
                  <figcaption>
                    <span>{photo.originalFilename || "عکس"}</span>
                    <small>{photoUploaderLabel(photo.uploaderRole)}</small>
                    <small>{formatCalendarDateTime(photo.uploadedAt)}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : null}
        <p className={styles.muted}>
          JPG، PNG یا WebP؛ حداکثر ۱۰ مگابایت برای هر عکس. هر پوز فقط یک بار و توسط مربی یا شاگرد
          ثبت می‌شود.
        </p>
      </section>
    </Card>
  );
}
