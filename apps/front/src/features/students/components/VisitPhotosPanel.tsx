import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, Upload, X, XCircle } from "lucide-react";
import { Card } from "../../../components/ui";
import { ApiError } from "../../../shared/api/errors";
import { apiDownload, apiRequest } from "../../../shared/api/client";
import { formatCalendarDateTime } from "../../../shared/dates/calendar";
import {
  coachVisitPhotosPath,
  commitStagedVisitPhotos,
  deleteStagedVisitPhoto,
  stageVisitPhoto,
  studentVisitPhotosPath,
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
      commitInPanel?: boolean;
      onStagedChange?: (hasStaged: boolean) => void;
      onUploadStateChange?: (uploading: boolean) => void;
      sessionId?: string;
      studentId: string;
      visitId: string | null;
    }
  | {
      audience: "student";
      canUpload: boolean;
      commitInPanel?: boolean;
      onStagedChange?: (hasStaged: boolean) => void;
      onUploadStateChange?: (uploading: boolean) => void;
      sessionId?: string;
      studentId?: never;
      visitId: string;
    };

interface LocalPhotoSelection {
  file: File;
  previewUrl: string;
  stagedId?: string;
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
  const { audience, canUpload, onStagedChange, visitId } = props;
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [localSelections, setLocalSelections] = useState<
    Partial<Record<VisitPhotoPose, LocalPhotoSelection>>
  >({});
  const [loading, setLoading] = useState(Boolean(visitId));
  const [uploadingPose, setUploadingPose] = useState<VisitPhotoPose | null>(null);
  const [removingPose, setRemovingPose] = useState<VisitPhotoPose | null>(null);
  const [committing, setCommitting] = useState(false);
  const [poseErrors, setPoseErrors] = useState<Partial<Record<VisitPhotoPose, string>>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const localPreviewUrls = useRef<Partial<Record<VisitPhotoPose, string>>>({});
  const [localSessionId] = useState(() => globalThis.crypto.randomUUID());
  const sessionId = props.sessionId ?? localSessionId;

  useEffect(() => {
    onStagedChange?.(Object.values(localSelections).some((item) => Boolean(item?.stagedId)));
  }, [localSelections, onStagedChange]);

  const photosPath = visitId
    ? audience === "coach"
      ? coachVisitPhotosPath(props.studentId, visitId)
      : studentVisitPhotosPath(visitId)
    : null;
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
          if (!current) {
            URL.revokeObjectURL(url);
            return null;
          }
          createdUrls.push(url);
          return [photo.id, url] as const;
        } catch {
          if (current) setImageErrors((previous) => ({ ...previous, [photo.id]: true }));
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

  const upload = async (
    pose: VisitPhotoPose,
    selection: LocalPhotoSelection,
    previous?: LocalPhotoSelection
  ) => {
    setUploadingPose(pose);
    props.onUploadStateChange?.(true);
    setError("");
    setMessage("");
    setPoseErrors((current) => {
      const next = { ...current };
      delete next[pose];
      return next;
    });
    try {
      const result = await stageVisitPhoto(
        audience,
        sessionId,
        pose,
        selection.file,
        visitId,
        audience === "coach" ? props.studentId : undefined
      );
      if (previous?.previewUrl && previous.previewUrl !== selection.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      setLocalSelections((current) => ({
        ...current,
        [pose]: { ...selection, stagedId: result.id }
      }));
      setMessage("عکس آپلود شد؛ پس از ثبت عکس‌ها یا ذخیرهٔ ویزیت به این پوز متصل می‌شود.");
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
      if (previous?.stagedId) {
        URL.revokeObjectURL(selection.previewUrl);
        localPreviewUrls.current[pose] = previous.previewUrl;
        setLocalSelections((current) => ({ ...current, [pose]: previous }));
      }
    } finally {
      setUploadingPose(null);
      props.onUploadStateChange?.(false);
    }
  };

  const chooseFile = (pose: VisitPhotoPose, file?: File) => {
    if (!file) return;
    const previous = localSelections[pose];
    const previewUrl = URL.createObjectURL(file);
    if (previous && !previous.stagedId) URL.revokeObjectURL(previous.previewUrl);
    localPreviewUrls.current[pose] = previewUrl;
    const selection = { file, previewUrl };
    setLocalSelections((current) => ({ ...current, [pose]: selection }));
    setPoseErrors((current) => ({ ...current, [pose]: undefined }));
    void upload(pose, selection, previous);
  };

  const removeSelection = async (pose: VisitPhotoPose) => {
    const selection = localSelections[pose];
    if (!selection || uploadingPose || committing) return;
    setRemovingPose(pose);
    props.onUploadStateChange?.(true);
    try {
      if (selection.stagedId) await deleteStagedVisitPhoto(selection.stagedId);
      URL.revokeObjectURL(selection.previewUrl);
      delete localPreviewUrls.current[pose];
      setLocalSelections((current) => {
        const next = { ...current };
        delete next[pose];
        return next;
      });
      setPoseErrors((current) => ({ ...current, [pose]: undefined }));
    } catch {
      setPoseErrors((current) => ({ ...current, [pose]: "حذف عکس انجام نشد؛ دوباره تلاش کنید." }));
    } finally {
      setRemovingPose(null);
      props.onUploadStateChange?.(false);
    }
  };

  const commitPhotos = async () => {
    if (!visitId || uploadingPose || removingPose) return;
    setCommitting(true);
    setError("");
    try {
      const result = await commitStagedVisitPhotos(
        audience,
        sessionId,
        visitId,
        audience === "coach" ? props.studentId : undefined
      );
      setPhotos((result.results ?? []).map(photoFromApi));
      setImageErrors({});
      Object.values(localPreviewUrls.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      localPreviewUrls.current = {};
      setLocalSelections({});
      setMessage(
        result.photo_issues?.length
          ? `عکس‌های قابل ثبت ذخیره شدند. ${result.photo_issues.join(" ")}`
          : "عکس‌ها در ویزیت ثبت شدند."
      );
    } catch (commitError) {
      setError(
        commitError instanceof ApiError
          ? commitError.message
          : "ثبت عکس‌ها انجام نشد؛ دوباره تلاش کنید."
      );
    } finally {
      setCommitting(false);
    }
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
            <span className={styles.count}>
              {(
                photosByPose.size +
                Object.values(localSelections).filter((item) => item?.stagedId).length
              ).toLocaleString("fa-IR")}
            </span>
          </div>
          <p className={styles.intro}>
            برای هر پوز یک عکس ثبت می‌شود؛ عکس را در کادر همان پوز انتخاب کنید. سمت راست و چپ از دید
            شاگرد است. عکس همان‌جا نمایش داده و موقتاً آپلود می‌شود. تا قبل از ثبت، می‌توانید آن را
            حذف یا عوض کنید؛ عکس‌های ناموفق مانع ثبت ویزیت نیستند.
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
            const canChoose = canUpload && !photo;
            const inputId = `visit-photo-${visitId ?? "new"}-${pose}`;

            return (
              <article className={styles.poseSlot} key={pose}>
                <div className={styles.poseHeader}>
                  <h3>{label}</h3>
                  <div className={styles.poseStatus}>
                    {photo ? (
                      "ثبت شده"
                    ) : uploadingPose === pose ? (
                      "در حال آپلود"
                    ) : localSelection?.stagedId ? (
                      <span className={styles.readyStatus}>
                        <CheckCircle2 aria-hidden size={14} /> آماده ثبت
                      </span>
                    ) : poseError ? (
                      <span className={styles.failedStatus}>
                        <XCircle aria-hidden size={14} /> آپلود ناموفق
                      </span>
                    ) : localSelection ? (
                      "پیش‌نمایش عکس"
                    ) : (
                      "خالی"
                    )}
                  </div>
                </div>
                {photo ? (
                  <figure className={styles.photo}>
                    {imageErrors[photo.id] ? (
                      <div className={styles.imagePlaceholder}>
                        نمایش عکس ممکن نشد؛ صفحه را تازه کنید.
                      </div>
                    ) : imageUrls[photo.id] || localSelection?.previewUrl ? (
                      <img
                        alt={`عکس پوز ${label}`}
                        loading="lazy"
                        onError={() =>
                          setImageErrors((current) => ({ ...current, [photo.id]: true }))
                        }
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
                        : localSelection.stagedId
                          ? "آپلود شد؛ هنوز در ویزیت ثبت نشده است."
                          : poseError
                            ? "عکس آپلود نشد؛ می‌توانید دوباره تلاش کنید یا بدون آن ادامه دهید."
                            : "در انتظار نتیجهٔ آپلود…"}
                    </small>
                    {poseError && !localSelection.stagedId && uploadingPose !== pose ? (
                      <button
                        className={styles.retryButton}
                        onClick={() => void upload(pose, localSelection)}
                        type="button"
                      >
                        تلاش دوباره برای آپلود
                      </button>
                    ) : null}
                    <button
                      aria-label={`حذف عکس انتخاب‌شده برای پوز ${label}`}
                      className={styles.removePending}
                      disabled={uploadingPose !== null || removingPose === pose || committing}
                      onClick={() => void removeSelection(pose)}
                      type="button"
                    >
                      <X aria-hidden size={16} />
                    </button>
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
                      disabled={uploadingPose !== null || removingPose !== null || committing}
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
                        : localSelection
                          ? "تغییر عکس"
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

        {props.commitInPanel &&
        visitId &&
        Object.values(localSelections).some((item) => item?.stagedId) ? (
          <button
            className={styles.commitButton}
            disabled={committing || uploadingPose !== null || removingPose !== null}
            onClick={() => void commitPhotos()}
            type="button"
          >
            {committing ? "در حال ثبت عکس‌ها…" : "ثبت عکس‌ها در ویزیت"}
          </button>
        ) : null}

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
