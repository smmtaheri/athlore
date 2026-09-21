import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  StatusBadge,
  Switch
} from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import type { Student } from "../../students/types/student";
import type { BodyCheckCycle } from "../types/bodyCheck";
import {
  coachBodyCheckRepository,
  type CoachBodyCheckRepository
} from "../services/bodyCheckRepository";
import { BodyCheckPhotoImage } from "../components/BodyCheckPhotoImage";
import {
  formatBodyCheckDate,
  formatClockTime,
  formatDeltaKg,
  formatKg,
  formatSleepDuration,
  weekLabel
} from "../utils/bodyCheckFormat";
import styles from "../components/bodyCheck.module.css";

export function StudentBodyCheckTab({
  repository = coachBodyCheckRepository,
  student
}: {
  repository?: CoachBodyCheckRepository;
  student: Student;
}) {
  const [cycles, setCycles] = useState<BodyCheckCycle[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startingWeight, setStartingWeight] = useState(String(student.weightKg || ""));
  const [goalWeight, setGoalWeight] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [mealEnabled, setMealEnabled] = useState(false);

  const load = async () => {
    const items = await repository.listCycles(student.id);
    setCycles(items);
    const preferred =
      items.find((c) => c.id === activeId) || items.find((c) => c.status === "active") || items[0];
    if (preferred) {
      const detail = await repository.getCycle(student.id, preferred.id);
      setCycles((prev) => prev.map((c) => (c.id === detail.id ? detail : c)));
      setActiveId(detail.id);
      setMealEnabled(detail.mealDetailEnabled);
      setTargetsText(detail.dailyTargetsKg.join(", "));
    } else {
      setActiveId("");
    }
  };

  useEffect(() => {
    let mounted = true;
    repository
      .listCycles(student.id)
      .then(async (items) => {
        if (!mounted) return;
        setCycles(items);
        const first = items.find((c) => c.status === "active") || items[0];
        if (first) {
          const detail = await repository.getCycle(student.id, first.id);
          if (!mounted) return;
          setCycles([detail, ...items.filter((c) => c.id !== detail.id)]);
          setActiveId(detail.id);
          setMealEnabled(detail.mealDetailEnabled);
          setTargetsText(detail.dailyTargetsKg.join(", "));
        }
        setStatus("loaded");
      })
      .catch(() => mounted && setStatus("error"));
    return () => {
      mounted = false;
    };
  }, [repository, student.id]);

  const active = useMemo(() => cycles.find((c) => c.id === activeId) || null, [activeId, cycles]);

  const suggest = async () => {
    setError("");
    try {
      const targets = await repository.suggestTargets(
        student.id,
        Number(startingWeight),
        Number(goalWeight)
      );
      setTargetsText(targets.join(", "));
      setFeedback("پیشنهاد سیستم برای وزن‌های هدف روزانه ساخته شد. در صورت نیاز ویرایش کنید.");
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "پیشنهاد ساخته نشد.");
    }
  };

  const create = async () => {
    setCreating(true);
    setError("");
    setFeedback("");
    try {
      const targets = targetsText
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v));
      const cycle = await repository.createCycle(student.id, {
        startDate,
        startingWeightKg: Number(startingWeight),
        goalWeightKg: Number(goalWeight),
        mealDetailEnabled: mealEnabled,
        dailyTargetsKg: targets.length === 30 ? targets : undefined
      });
      setFeedback("دوره ۳۰ روزه بادی چک ساخته شد.");
      setActiveId(cycle.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "ایجاد دوره انجام نشد.");
    } finally {
      setCreating(false);
    }
  };

  const saveTargets = async () => {
    if (!active) return;
    setError("");
    try {
      const targets = targetsText.split(",").map((v) => Number(v.trim()));
      if (targets.length !== 30 || targets.some((t) => !Number.isFinite(t))) {
        setError("باید دقیقاً ۳۰ وزن هدف عددی وارد کنید.");
        return;
      }
      await repository.updateCycle(student.id, active.id, {
        dailyTargetsKg: targets,
        mealDetailEnabled: mealEnabled,
        goalWeightKg: Number(goalWeight) || active.goalWeightKg,
        startingWeightKg: Number(startingWeight) || active.startingWeightKg
      });
      setFeedback("تنظیمات دوره ذخیره شد.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "ذخیره انجام نشد.");
    }
  };

  const close = async () => {
    if (!active) return;
    await repository.closeCycle(student.id, active.id);
    setFeedback("دوره بسته شد.");
    await load();
  };

  if (status === "loading") return <Skeleton height={200} />;
  if (status === "error") return <EmptyState description="خطا در دریافت بادی چک." title="خطا" />;

  return (
    <div className={styles.stack}>
      {error ? <div className={styles.alertErr}>{error}</div> : null}
      {feedback ? <div className={styles.alertOk}>{feedback}</div> : null}

      <Card>
        <div className={styles.stackTight}>
          <strong>دوره جدید ۳۰ روزه</strong>
          <div className={styles.formGrid}>
            <FormField htmlFor="bc-start" label="تاریخ شروع">
              <Input
                id="bc-start"
                onChange={(e) => setStartDate(e.target.value)}
                type="date"
                value={startDate}
              />
            </FormField>
            <FormField htmlFor="bc-start-w" label="وزن شروع">
              <Input
                id="bc-start-w"
                onChange={(e) => setStartingWeight(e.target.value)}
                type="number"
                value={startingWeight}
              />
            </FormField>
            <FormField htmlFor="bc-goal-w" label="وزن هدف">
              <Input
                id="bc-goal-w"
                onChange={(e) => setGoalWeight(e.target.value)}
                type="number"
                value={goalWeight}
              />
            </FormField>
            <div>
              <Switch
                checked={mealEnabled}
                label={mealEnabled ? "ریز وعده‌ها باز است" : "ریز وعده‌ها قفل است"}
                onCheckedChange={setMealEnabled}
              />
            </div>
          </div>
          <FormField htmlFor="bc-targets" label="وزن‌های هدف روزانه (۳۰ عدد، با ویرگول)">
            <Input
              id="bc-targets"
              onChange={(e) => setTargetsText(e.target.value)}
              value={targetsText}
            />
          </FormField>
          <div className={styles.actions}>
            <Button onClick={() => void suggest()} type="button" variant="secondary">
              پیشنهاد سیستم
            </Button>
            <Button isLoading={creating} onClick={() => void create()} type="button">
              ایجاد دوره
            </Button>
          </div>
        </div>
      </Card>

      {cycles.length > 0 ? (
        <Card>
          <div className={styles.stackTight}>
            <strong>دوره‌ها</strong>
            <div className={styles.actions}>
              {cycles.map((cycle) => (
                <Button
                  key={cycle.id}
                  onClick={() => {
                    setActiveId(cycle.id);
                    setMealEnabled(cycle.mealDetailEnabled);
                    setTargetsText(cycle.dailyTargetsKg.join(", "));
                    setStartingWeight(String(cycle.startingWeightKg));
                    setGoalWeight(String(cycle.goalWeightKg));
                    void repository.getCycle(student.id, cycle.id).then((detail) => {
                      setCycles((prev) => prev.map((c) => (c.id === detail.id ? detail : c)));
                    });
                  }}
                  size="sm"
                  variant={cycle.id === activeId ? "primary" : "secondary"}
                >
                  {formatBodyCheckDate(cycle.startDate)} ·{" "}
                  {cycle.status === "active"
                    ? "فعال"
                    : cycle.status === "expired"
                      ? "منقضی شده"
                      : "بسته"}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      {active ? (
        <>
          <Card className={styles.printHide}>
            <div className={styles.actions}>
              <Button onClick={() => void saveTargets()} variant="secondary">
                ذخیره تنظیمات دوره
              </Button>
              {active.status === "active" ? (
                <Button onClick={() => void close()} variant="secondary">
                  بستن دوره
                </Button>
              ) : null}
              <Button onClick={() => window.print()} variant="secondary">
                چاپ گزارش
              </Button>
            </div>
          </Card>
          <BodyCheckReportView
            cycle={active}
            downloadPhoto={repository.downloadPhoto}
            studentName={student.fullName}
          />
        </>
      ) : (
        <EmptyState description="هنوز دوره‌ای برای این شاگرد نیست." title="بدون دوره" />
      )}
    </div>
  );
}

export function BodyCheckReportView({
  cycle,
  downloadPhoto = coachBodyCheckRepository.downloadPhoto,
  studentName
}: {
  cycle: BodyCheckCycle;
  downloadPhoto?: (photoId: string) => Promise<Blob>;
  studentName: string;
}) {
  const report = cycle.report;
  return (
    <div className={styles.stack} id="body-check-print-root">
      <header className={styles.stackTight}>
        <p className={styles.eyebrow}>گزارش بادی چک</p>
        <h2 className={styles.title}>{studentName}</h2>
        <p className={styles.muted}>
          {formatBodyCheckDate(cycle.startDate)} تا {formatBodyCheckDate(cycle.endDate)} ·{" "}
          <StatusBadge
            variant={
              cycle.status === "active"
                ? "info"
                : cycle.status === "expired"
                  ? "warning"
                  : "neutral"
            }
          >
            {cycle.status === "active"
              ? "فعال"
              : cycle.status === "expired"
                ? "منقضی شده"
                : "بسته"}
          </StatusBadge>
        </p>
      </header>

      {report ? (
        <div className={styles.summaryRow}>
          <Card>
            <p className={styles.muted}>روزهای ثبت‌شده</p>
            <p className={styles.readonlyValue}>
              {report.loggedDays} از {report.cycleLengthDays}
            </p>
            <p className={styles.muted}>ثبت‌نشده: {report.missingDays}</p>
          </Card>
          <Card>
            <p className={styles.muted}>وزن</p>
            <p className={styles.readonlyValue}>{formatKg(report.lastActualWeightKg)}</p>
            <p className={styles.muted}>
              شروع {formatKg(report.startingWeightKg)} · هدف {formatKg(report.goalWeightKg)} ·
              اختلاف {formatDeltaKg(report.deltaToGoalKg)}
            </p>
          </Card>
          <Card>
            <p className={styles.muted}>میانگین‌ها</p>
            <p className={styles.muted}>
              رژیم: {report.avgNutritionAdherenceScore ?? "—"} ({report.nutritionScoreDays} روز)
            </p>
            <p className={styles.muted}>
              مدت خواب: {formatSleepDuration(report.avgSleepDurationMinutes)} (
              {report.sleepDurationDays} روز)
            </p>
            <p className={styles.muted}>
              ساعت خواب: {formatClockTime(report.avgSleepStartTime)} ({report.sleepStartTimeDays}{" "}
              روز)
            </p>
            <p className={styles.muted}>
              ساعت بیداری: {formatClockTime(report.avgWakeTime)} ({report.wakeTimeDays} روز)
            </p>
            <p className={styles.muted}>
              نمره خواب: {report.avgSleepQualityScore ?? "—"} ({report.sleepQualityDays} روز)
            </p>
          </Card>
        </div>
      ) : null}

      <Card>
        <div className={styles.mobileReportList}>
          {(cycle.days || []).map((day) => (
            <article className={styles.mobileReportCard} key={day.localDate}>
              <div className={styles.mobileReportHeader}>
                <strong>{formatBodyCheckDate(day.localDate, true)}</strong>
                <StatusBadge variant={day.isLogged ? "success" : "neutral"}>
                  {day.isLogged ? "ثبت‌شده" : "ثبت‌نشده"}
                </StatusBadge>
              </div>
              <div className={styles.mobileReportGrid}>
                <span>روز: {day.dayNumber}</span>
                <span>هدف: {day.targetWeightKg ?? "—"}</span>
                <span>واقعی: {day.actualWeightKg ?? "—"}</span>
                <span>اختلاف: {day.weightDeltaKg ?? "—"}</span>
                <span>ساعت خواب: {formatClockTime(day.sleepStartTime)}</span>
                <span>ساعت بیداری: {formatClockTime(day.wakeTime)}</span>
                <span>مدت خواب: {formatSleepDuration(day.sleepDurationMinutes)}</span>
                <span>نمره خواب: {day.sleepQualityScore ?? "—"}</span>
                <span>نمره رژیم: {day.nutritionAdherenceScore ?? "—"}</span>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>روز</th>
                <th>هدف</th>
                <th>واقعی</th>
                <th>اختلاف</th>
                <th>ساعت خواب</th>
                <th>ساعت بیداری</th>
                <th>خواب</th>
                <th>نمره خواب</th>
                <th>نمره رژیم</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {(cycle.days || []).map((day) => (
                <tr key={day.localDate}>
                  <td>{formatBodyCheckDate(day.localDate, true)}</td>
                  <td>{day.dayNumber}</td>
                  <td>{day.targetWeightKg ?? "—"}</td>
                  <td className={day.isLogged ? undefined : styles.missingCell}>
                    {day.actualWeightKg ?? "—"}
                  </td>
                  <td>{day.weightDeltaKg ?? "—"}</td>
                  <td>{formatClockTime(day.sleepStartTime)}</td>
                  <td>{formatClockTime(day.wakeTime)}</td>
                  <td>{formatSleepDuration(day.sleepDurationMinutes)}</td>
                  <td>{day.sleepQualityScore ?? "—"}</td>
                  <td>{day.nutritionAdherenceScore ?? "—"}</td>
                  <td>{day.isLogged ? "ثبت‌شده" : "ثبت‌نشده"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className={styles.stackTight}>
          <strong>عکس‌های پیشرفت</strong>
          {[1, 2, 3, 4].map((week) => {
            const photos = (cycle.photos || []).filter((p) => p.weekNumber === week);
            return (
              <details key={week} open>
                <summary>{weekLabel(week)}</summary>
                {photos.length === 0 ? (
                  <p className={styles.muted}>عکسی ثبت نشده.</p>
                ) : (
                  <ul className={styles.photoGrid}>
                    {photos.map((photo) => (
                      <li className={styles.photoItem} key={photo.id}>
                        <BodyCheckPhotoImage
                          alt={photo.originalFilename || `عکس هفته ${week}`}
                          downloadPhoto={downloadPhoto}
                          photoId={photo.id}
                        />
                        <p className={styles.photoMeta}>{photo.originalFilename || "عکس"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
