import { useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, FormField, Input, Select, Skeleton, Textarea } from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import type { BodyCheckCycle, BodyCheckDay, BodyCheckEntryInput } from "../types/bodyCheck";
import {
  studentBodyCheckRepository,
  type StudentBodyCheckRepository
} from "../services/bodyCheckRepository";
import { BodyCheckPhotoImage } from "../components/BodyCheckPhotoImage";
import {
  formatBodyCheckDate,
  formatKg,
  formatSleepDuration,
  scoreOptions,
  weekLabel
} from "../utils/bodyCheckFormat";
import styles from "../components/bodyCheck.module.css";

type DayFormState = {
  actualWeightKg: string;
  localDate: string;
  meal1: string;
  meal2: string;
  meal3: string;
  meal4: string;
  meal5: string;
  meal6: string;
  nutritionAdherenceScore: string;
  sleepQualityScore: string;
  sleepStartTime: string;
  wakeTime: string;
};

function emptyForm(day: BodyCheckDay | null): DayFormState {
  return {
    actualWeightKg: day?.actualWeightKg != null ? String(day.actualWeightKg) : "",
    localDate: day?.localDate || "",
    meal1: day?.meals?.meal1 || "",
    meal2: day?.meals?.meal2 || "",
    meal3: day?.meals?.meal3 || "",
    meal4: day?.meals?.meal4 || "",
    meal5: day?.meals?.meal5 || "",
    meal6: day?.meals?.meal6 || "",
    nutritionAdherenceScore:
      day?.nutritionAdherenceScore != null ? String(day.nutritionAdherenceScore) : "",
    sleepQualityScore: day?.sleepQualityScore != null ? String(day.sleepQualityScore) : "",
    sleepStartTime: day?.sleepStartTime ? day.sleepStartTime.slice(0, 5) : "",
    wakeTime: day?.wakeTime ? day.wakeTime.slice(0, 5) : ""
  };
}

export function StudentBodyCheckPage({
  repository = studentBodyCheckRepository
}: {
  repository?: StudentBodyCheckRepository;
}) {
  const [cycle, setCycle] = useState<BodyCheckCycle | null>(null);
  const [history, setHistory] = useState<BodyCheckCycle[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [form, setForm] = useState<DayFormState>(emptyForm(null));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const reload = async () => {
    const data = await repository.getActive();
    setCycle(data.cycle);
    setHistory(data.history || []);
    const today = data.cycle?.localToday || "";
    const initialDate =
      selectedDate && data.cycle?.days?.some((d) => d.localDate === selectedDate)
        ? selectedDate
        : today;
    setSelectedDate(initialDate);
    const day = data.cycle?.days?.find((d) => d.localDate === initialDate) || null;
    setForm(emptyForm(day));
  };

  useEffect(() => {
    let mounted = true;
    repository
      .getActive()
      .then((data) => {
        if (!mounted) return;
        setCycle(data.cycle);
        setHistory(data.history || []);
        const today = data.cycle?.localToday || "";
        setSelectedDate(today);
        const day = data.cycle?.days?.find((d) => d.localDate === today) || null;
        setForm(emptyForm(day));
        setStatus("loaded");
      })
      .catch(() => mounted && setStatus("error"));
    return () => {
      mounted = false;
    };
  }, [repository]);

  const selectedDay = useMemo(
    () => cycle?.days?.find((d) => d.localDate === selectedDate) || null,
    [cycle, selectedDate]
  );
  const isFuture = Boolean(
    cycle && selectedDate && selectedDate > cycle.localToday
  );
  const editable = Boolean(cycle && cycle.status === "active" && !isFuture);

  const selectDay = (localDate: string) => {
    setSelectedDate(localDate);
    const day = cycle?.days?.find((d) => d.localDate === localDate) || null;
    setForm(emptyForm(day));
    setFeedback("");
    setError("");
  };

  const save = async () => {
    if (!editable || !selectedDate) return;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const payload: BodyCheckEntryInput = {
        localDate: selectedDate,
        actualWeightKg: form.actualWeightKg === "" ? null : Number(form.actualWeightKg),
        sleepStartTime: form.sleepStartTime ? `${form.sleepStartTime}:00` : null,
        wakeTime: form.wakeTime ? `${form.wakeTime}:00` : null,
        sleepQualityScore:
          form.sleepQualityScore === "" ? null : Number(form.sleepQualityScore),
        nutritionAdherenceScore:
          form.nutritionAdherenceScore === "" ? null : Number(form.nutritionAdherenceScore)
      };
      if (cycle?.mealDetailEnabled) {
        payload.meal1 = form.meal1;
        payload.meal2 = form.meal2;
        payload.meal3 = form.meal3;
        payload.meal4 = form.meal4;
        payload.meal5 = form.meal5;
        payload.meal6 = form.meal6;
      }
      const saved = await repository.saveEntry(payload);
      setFeedback("ثبت امروز ذخیره شد.");
      await reload();
      setSelectedDate(saved.localDate);
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "ذخیره انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File | null) => {
    if (!file || !selectedDay || !editable) return;
    setUploading(true);
    setError("");
    try {
      await repository.uploadPhoto(selectedDay.weekNumber, file);
      setFeedback(`عکس هفته ${selectedDay.weekNumber} آپلود شد.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "آپلود عکس انجام نشد.");
    } finally {
      setUploading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <Skeleton height={220} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.page}>
        <EmptyState description="دریافت بادی چک ممکن نشد." title="خطا" />
      </div>
    );
  }
  if (!cycle) {
    return (
      <div className={styles.page}>
        <EmptyState
          description="دوره فعالی ندارید؛ سوابق قبلی شما در پایین صفحه فقط برای مشاهده باقی می‌ماند."
          title="دوره فعالی نیست؛ پنل در حالت مشاهده است"
        />
        {history.length > 0 ? (
          <Card>
            <div className={styles.stackTight}>
              <strong>سوابق بادی‌چک</strong>
              {history.map((item) => (
                <div className={styles.lockedBox} key={item.id}>
                  {formatBodyCheckDate(item.startDate)} تا {formatBodyCheckDate(item.endDate)} · {item.report?.loggedDays ?? 0} روز ثبت‌شده · {item.status === "expired" ? "منقضی‌شده" : "بسته‌شده"}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    );
  }

  const sleepMinutes =
    form.sleepStartTime && form.wakeTime
      ? (() => {
          const [sh, sm] = form.sleepStartTime.split(":").map(Number);
          const [wh, wm] = form.wakeTime.split(":").map(Number);
          let mins = wh * 60 + wm - (sh * 60 + sm);
          if (mins <= 0) mins += 24 * 60;
          return mins;
        })()
      : selectedDay?.sleepDurationMinutes ?? null;

  const weekPhotos = (cycle.photos || []).filter((p) => p.weekNumber === selectedDay?.weekNumber);

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <header className={styles.stackTight}>
          <p className={styles.eyebrow}>ثبت روزانه</p>
          <h1 className={styles.title}>بادی چک</h1>
          <p className={styles.lead}>
            وزن، خواب و رعایت رژیم را برای هر روز ثبت کنید. ذخیره جزئی مجاز است.
          </p>
        </header>

        {error ? <div className={styles.alertErr}>{error}</div> : null}
        {feedback ? <div className={styles.alertOk}>{feedback}</div> : null}

        <Card>
          <div className={styles.stackTight}>
            <strong>انتخاب روز</strong>
            <div aria-label="روزهای دوره" className={styles.dayPicker} role="group">
              {(cycle.days || []).map((day) => {
                const future = day.localDate > cycle.localToday;
                return (
                  <button
                    aria-pressed={day.localDate === selectedDate}
                    className={[
                      styles.dayChip,
                      day.isLogged ? styles.dayChipLogged : styles.dayChipMissing,
                      day.localDate === selectedDate ? styles.dayChipActive : "",
                      future ? styles.dayChipFuture : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={future}
                    key={day.localDate}
                    onClick={() => selectDay(day.localDate)}
                    title={day.isLogged ? "ثبت‌شده" : "ثبت‌نشده"}
                    type="button"
                  >
                    {day.dayNumber}
                  </button>
                );
              })}
            </div>
            <p className={styles.muted}>
              {selectedDay
                ? `روز ${selectedDay.dayNumber} · ${formatBodyCheckDate(selectedDay.localDate)} · ${weekLabel(selectedDay.weekNumber)} · ${
                    selectedDay.isLogged ? "ثبت‌شده" : "ثبت‌نشده"
                  }`
                : null}
            </p>
          </div>
        </Card>

        {isFuture ? (
          <div className={styles.alertInfo}>برای تاریخ آینده نمی‌توانید بادی چک ثبت کنید.</div>
        ) : null}

        <Card>
          <div className={styles.stackTight}>
            <strong>وزن</strong>
            <div className={styles.formGrid}>
              <div>
                <p className={styles.muted}>وزن هدف (فقط مشاهده)</p>
                <p className={styles.readonlyValue}>{formatKg(selectedDay?.targetWeightKg)}</p>
              </div>
              <FormField htmlFor="bc-weight" label="وزن واقعی (کیلوگرم)">
                <Input
                  disabled={!editable}
                  id="bc-weight"
                  onChange={(e) => setForm((f) => ({ ...f, actualWeightKg: e.target.value }))}
                  type="number"
                  value={form.actualWeightKg}
                />
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <div className={styles.stackTight}>
            <strong>خواب</strong>
            <div className={styles.formGrid}>
              <FormField htmlFor="bc-sleep-start" label="ساعت خواب">
                <Input
                  disabled={!editable}
                  id="bc-sleep-start"
                  onChange={(e) => setForm((f) => ({ ...f, sleepStartTime: e.target.value }))}
                  type="time"
                  value={form.sleepStartTime}
                />
              </FormField>
              <FormField htmlFor="bc-wake" label="ساعت بیداری">
                <Input
                  disabled={!editable}
                  id="bc-wake"
                  onChange={(e) => setForm((f) => ({ ...f, wakeTime: e.target.value }))}
                  type="time"
                  value={form.wakeTime}
                />
              </FormField>
              <div>
                <p className={styles.muted}>مدت خواب (محاسبه‌شده)</p>
                <p className={styles.readonlyValue}>{formatSleepDuration(sleepMinutes)}</p>
              </div>
              <FormField htmlFor="bc-sleep-score" label="نمره خواب (۱ تا ۱۰)">
                <Select
                  disabled={!editable}
                  id="bc-sleep-score"
                  onChange={(e) => setForm((f) => ({ ...f, sleepQualityScore: e.target.value }))}
                  options={[{ label: "انتخاب کنید", value: "" }, ...scoreOptions()]}
                  value={form.sleepQualityScore}
                />
              </FormField>
            </div>
          </div>
        </Card>

        <Card>
          <div className={styles.stackTight}>
            <strong>رعایت رژیم</strong>
            <FormField htmlFor="bc-nutrition" label="نمره رعایت رژیم (۱ تا ۱۰)">
              <Select
                disabled={!editable}
                id="bc-nutrition"
                onChange={(e) =>
                  setForm((f) => ({ ...f, nutritionAdherenceScore: e.target.value }))
                }
                options={[{ label: "انتخاب کنید", value: "" }, ...scoreOptions()]}
                value={form.nutritionAdherenceScore}
              />
            </FormField>
          </div>
        </Card>

        <Card>
          <div className={styles.stackTight}>
            <strong>ریز وعده‌ها</strong>
            {cycle.mealDetailEnabled ? (
              <div className={styles.formGrid}>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-1" label="وعده ۱">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-1"
                    onChange={(e) => setForm((f) => ({ ...f, meal1: e.target.value }))}
                    rows={2}
                    value={form.meal1}
                  />
                </FormField>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-2" label="وعده ۲">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-2"
                    onChange={(e) => setForm((f) => ({ ...f, meal2: e.target.value }))}
                    rows={2}
                    value={form.meal2}
                  />
                </FormField>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-3" label="وعده ۳">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-3"
                    onChange={(e) => setForm((f) => ({ ...f, meal3: e.target.value }))}
                    rows={2}
                    value={form.meal3}
                  />
                </FormField>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-4" label="وعده ۴">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-4"
                    onChange={(e) => setForm((f) => ({ ...f, meal4: e.target.value }))}
                    rows={2}
                    value={form.meal4}
                  />
                </FormField>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-5" label="وعده ۵">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-5"
                    onChange={(e) => setForm((f) => ({ ...f, meal5: e.target.value }))}
                    rows={2}
                    value={form.meal5}
                  />
                </FormField>
                <FormField className={styles.fullWidth} htmlFor="bc-meal-6" label="وعده ۶">
                  <Textarea
                    disabled={!editable}
                    id="bc-meal-6"
                    onChange={(e) => setForm((f) => ({ ...f, meal6: e.target.value }))}
                    rows={2}
                    value={form.meal6}
                  />
                </FormField>
              </div>
            ) : (
              <div className={styles.lockedBox}>
                مربی هنوز ثبت ریز وعده‌ها را برای این دوره فعال نکرده است. بخش دیده می‌شود ولی قابل
                ویرایش نیست.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className={styles.stackTight}>
            <strong>عکس پیشرفت · {selectedDay ? weekLabel(selectedDay.weekNumber) : ""}</strong>
            <FormField htmlFor="bc-photo" label="آپلود عکس (JPEG/PNG/WebP، حداکثر ۵ مگابایت)">
              <Input
                disabled={!editable || uploading}
                id="bc-photo"
                onChange={(e) => void uploadPhoto(e.target.files?.[0] || null)}
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </FormField>
            {weekPhotos.length === 0 ? (
              <p className={styles.muted}>هنوز عکسی برای این هفته نیست.</p>
            ) : (
              <ul className={styles.photoGrid}>
                {weekPhotos.map((photo) => (
                  <li className={styles.photoItem} key={photo.id}>
                    <BodyCheckPhotoImage
                      alt={photo.originalFilename || `عکس هفته ${photo.weekNumber}`}
                      downloadPhoto={repository.downloadPhoto}
                      photoId={photo.id}
                    />
                    <p className={styles.photoMeta}>{photo.originalFilename || "عکس"}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {editable ? (
          <div className={styles.actions}>
            <Button isLoading={saving} onClick={() => void save()}>
              ذخیره این روز
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
