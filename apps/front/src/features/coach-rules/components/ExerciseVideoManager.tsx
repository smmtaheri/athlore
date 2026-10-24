import { useId, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Button, FormField, Input } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import {
  uploadExerciseVideo,
  videoErrorMessage,
  videoIsPending,
  videoStatusLabel
} from "../services/exerciseMedia";
import type { ExerciseVideoState } from "../services/exerciseMedia";
import styles from "./exerciseVideo.module.css";

export function ExerciseVideoManager({
  exerciseId,
  name,
  state,
  onChange,
  onBusyChange
}: {
  exerciseId: string;
  name: string;
  state: ExerciseVideoState;
  onChange: (id: string, value: ExerciseVideoState) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [metadata, setMetadata] = useState({
    author: "",
    source_url: "",
    license_name: "",
    license_url: ""
  });
  const run = async (action: () => Promise<ExerciseVideoState>) => {
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      onChange(exerciseId, await action());
      setConfirmRemove(false);
    } catch (failure) {
      setError(videoErrorMessage(failure));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <section aria-label={`ویدئوی ${name}`} className={styles.manager}>
      <strong>{name}</strong>
      <p role="status">{videoStatusLabel(state)}</p>
      {state.media ? (
        <video
          aria-label={`پیش‌نمایش ویدئوی ${name}`}
          controls
          playsInline
          preload="none"
          poster={state.media.poster_url || undefined}
          src={state.media.reel_url}
        />
      ) : null}
      <p>
        فقط ویدئوی اصلی را انتخاب کنید؛ تصویر و پیش‌نمایش متحرک خودکار ساخته می‌شوند. MP4 یا MOV،
        حداکثر ۱۰۰ مگابایت و دو دقیقه.
      </p>
      <label className={styles.upload} htmlFor={inputId}>
        <Upload size={18} aria-hidden />
        {busy ? "در حال ارسال…" : state.media ? "انتخاب ویدئوی جایگزین" : "انتخاب ویدئو"}
        <input
          accept="video/mp4,video/quicktime,.mp4,.mov"
          disabled={busy || videoIsPending(state)}
          id={inputId}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              setPercent(0);
              void run(() => uploadExerciseVideo(exerciseId, file, setPercent, metadata));
            }
          }}
        />
      </label>
      {busy ? <progress aria-label="پیشرفت ارسال ویدئو" max={100} value={percent} /> : null}
      {busy ? <span>{percent.toLocaleString("fa-IR")}٪ ارسال شده</span> : null}
      {videoIsPending(state) ? (
        <p>
          پس از آماده‌شدن، ویدئو خودکار برای شاگرد نمایش داده می‌شود. در صورت جایگزینی، ویدئوی قبلی
          تا آن زمان فعال می‌ماند.
        </p>
      ) : null}
      {state.media_upload?.status === "failed" ? (
        <p className={styles.error} role="alert">
          {state.media_upload.error_message}
          <br />
          <small>کد پیگیری: {state.media_upload.id}</small>
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {state.media_upload?.can_retry ? (
        <Button
          disabled={busy}
          onClick={() =>
            void run(() =>
              apiRequest<ExerciseVideoState>(`/exercises/${exerciseId}/media/retry/`, {
                method: "POST"
              })
            )
          }
          variant="secondary"
        >
          تلاش دوباره
        </Button>
      ) : null}
      {state.media || videoIsPending(state) || state.media_upload?.status === "failed" ? (
        <div className={styles.actions}>
          {confirmRemove ? (
            <>
              <p>
                ویدئو از این حرکت و نمایش برنامه‌های شاگردان حذف شود؟ خود حرکت و برنامه‌ها باقی
                می‌مانند.
              </p>
              <Button
                disabled={busy}
                variant="danger"
                onClick={() =>
                  void run(() =>
                    apiRequest<ExerciseVideoState>(`/exercises/${exerciseId}/media/`, {
                      method: "DELETE"
                    })
                  )
                }
              >
                حذف ویدئو
              </Button>
              <Button disabled={busy} variant="secondary" onClick={() => setConfirmRemove(false)}>
                انصراف
              </Button>
            </>
          ) : (
            <Button
              disabled={busy}
              iconStart={<Trash2 size={16} />}
              variant="danger"
              onClick={() => setConfirmRemove(true)}
            >
              حذف ویدئو / لغو آماده‌سازی
            </Button>
          )}
        </div>
      ) : null}
      <details>
        <summary>منبع و مجوز ویدئو — اختیاری</summary>
        <div className={styles.metadata}>
          <FormField label="نام سازنده">
            <Input
              value={metadata.author}
              onChange={(event) => setMetadata({ ...metadata, author: event.target.value })}
            />
          </FormField>
          <FormField label="لینک منبع">
            <Input
              type="url"
              value={metadata.source_url}
              onChange={(event) => setMetadata({ ...metadata, source_url: event.target.value })}
            />
          </FormField>
          <FormField label="نام مجوز">
            <Input
              value={metadata.license_name}
              onChange={(event) => setMetadata({ ...metadata, license_name: event.target.value })}
            />
          </FormField>
          <FormField label="لینک مجوز">
            <Input
              type="url"
              value={metadata.license_url}
              onChange={(event) => setMetadata({ ...metadata, license_url: event.target.value })}
            />
          </FormField>
        </div>
      </details>
    </section>
  );
}
