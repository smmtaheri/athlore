import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Circle, Clock3, Dumbbell, Play, X } from "lucide-react";
import { Button, Card, FormField, Input, Modal, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import type { GeneratedProgram, TrainingExercise } from "../../programs/types/generatedProgram";
import styles from "./studentPortal.module.css";

interface LoggedSet {
  set_index: number;
  completed: boolean;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
}

interface SessionProgress {
  week: number;
  day_id: string;
  completed_sets: Record<string, number[]>;
  set_logs?: Record<string, LoggedSet[]>;
}

interface ActiveTimer {
  endAt: number;
  exerciseId: string;
  startedAt: number;
}

interface SetDraft {
  reps: string;
  weight: string;
}

const FARSI_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function persianDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => FARSI_DIGITS[Number(digit)]);
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(FARSI_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/٫/g, ".")
    .trim();
}

function parseRestSeconds(value: string): number {
  const normalized = normalizeDigits(value);
  const clock = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Math.max(1, Number(clock[1]) * 60 + Number(clock[2]));

  const amount = normalized.match(/\d+(?:\.\d+)?/);
  if (!amount) return 90;
  const number = Number(amount[0]);
  if (/دقیقه|min(?:ute)?s?/i.test(normalized)) return Math.max(1, Math.round(number * 60));
  return Math.max(1, Math.round(number));
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`.replace(
    /\d/g,
    (digit) => FARSI_DIGITS[Number(digit)]
  );
}

function createRestTimer(exercise: TrainingExercise): ActiveTimer {
  const startedAt = Date.now();
  return {
    endAt: startedAt + parseRestSeconds(exercise.rest) * 1000,
    exerciseId: exercise.id,
    startedAt
  };
}

function elapsedRestSeconds(startedAt: number): number {
  return Math.min(7200, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
}

function draftKey(week: number, dayId: string, exerciseId: string, setIndex: number): string {
  return `${week}:${dayId}:${exerciseId}:${setIndex}`;
}

export function InteractiveWorkout({ program }: { program: GeneratedProgram }) {
  const days = useMemo(() => program.training?.days ?? [], [program.training?.days]);
  const [week, setWeek] = useState(1);
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [sessions, setSessions] = useState<SessionProgress[]>([]);
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ name: string; url: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failedVideos, setFailedVideos] = useState<string[]>([]);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    apiRequest<{ sessions: SessionProgress[]; version_id: string }>(
      `/me/programs/${program.id}/workout-progress/`
    )
      .then((result) => {
        if (!active) return;
        if (result.version_id !== program.programVersionId) {
          setMessage("نسخهٔ برنامه تغییر کرده؛ صفحه را دوباره باز کنید.");
          return;
        }
        setSessions(result.sessions);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setMessage(
            "دریافت پیشرفت انجام نشد؛ برای جلوگیری از ثبت نادرست، صفحه را دوباره باز کنید."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [program.id, program.programVersionId]);

  useEffect(() => {
    if (!activeTimer) return;
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (activeTimer.endAt <= currentTime) window.clearInterval(interval);
    }, 250);
    return () => window.clearInterval(interval);
  }, [activeTimer]);

  const day = days.find((item) => item.id === dayId) ?? days[0];
  const current = sessions.find((item) => item.week === week && item.day_id === day?.id);
  const total = day?.exercises.reduce((sum, item) => sum + Math.max(0, item.sets), 0) ?? 0;
  const done = Object.values(current?.completed_sets ?? {}).reduce(
    (sum, items) => sum + items.length,
    0
  );
  const weeks = Math.max(1, program.durationWeeks ?? 4);
  const courseTotal =
    days.reduce(
      (sum, item) =>
        sum + item.exercises.reduce((sets, exercise) => sets + Math.max(0, exercise.sets), 0),
      0
    ) * weeks;
  const courseDone = sessions.reduce(
    (sum, session) =>
      sum + Object.values(session.completed_sets).reduce((sets, items) => sets + items.length, 0),
    0
  );
  const sessionPercent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const coursePercent = courseTotal
    ? Math.min(100, Math.round((courseDone / courseTotal) * 100))
    : 0;

  const replaceSession = (items: SessionProgress[], replacement: SessionProgress) => [
    ...items.filter(
      (item) => !(item.week === replacement.week && item.day_id === replacement.day_id)
    ),
    replacement
  ];

  const getDraft = (
    exercise: TrainingExercise,
    setIndex: number,
    savedLog?: LoggedSet
  ): SetDraft => {
    const key = draftKey(week, day?.id ?? "", exercise.id, setIndex);
    return (
      setDrafts[key] ?? {
        reps: savedLog?.reps == null ? "" : String(savedLog.reps),
        weight: savedLog?.weight_kg == null ? "" : String(savedLog.weight_kg)
      }
    );
  };

  const saveSet = async (
    exercise: TrainingExercise,
    setIndex: number,
    completed: boolean,
    draft: SetDraft
  ) => {
    if (!loaded || saving || !day || !program.programVersionId) return false;
    const repsText = normalizeDigits(draft.reps);
    const weightText = normalizeDigits(draft.weight);
    const reps = repsText === "" ? null : Number(repsText);
    const weight = weightText === "" ? null : Number(weightText);
    if (completed && (reps === null || !Number.isInteger(reps) || reps < 1 || reps > 1000)) {
      setMessage("تعداد تکرار انجام‌شده را به‌صورت عدد صحیح وارد کنید.");
      return false;
    }
    if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) {
      setMessage("وزنه باید بین صفر تا ۱۰۰۰ کیلوگرم باشد.");
      return false;
    }
    if (weightText && !/^\d+(?:\.\d{1,2})?$/.test(weightText)) {
      setMessage("وزنه را با حداکثر دو رقم اعشار وارد کنید.");
      return false;
    }

    const previous = current ?? { week, day_id: day.id, completed_sets: {}, set_logs: {} };
    const previousCompleted = previous.completed_sets[exercise.id] ?? [];
    const wasCompleted = previousCompleted.includes(setIndex);
    const nextCompleted = completed
      ? [...new Set([...previousCompleted, setIndex])].sort((left, right) => left - right)
      : previousCompleted.filter((item) => item !== setIndex);
    const previousLogs = previous.set_logs?.[exercise.id] ?? [];
    const existingLog = previousLogs.find((item) => item.set_index === setIndex);
    const measuredRest =
      completed && !wasCompleted && activeTimer?.exerciseId === exercise.id
        ? elapsedRestSeconds(activeTimer.startedAt)
        : (existingLog?.rest_seconds ?? null);
    const updatedLog: LoggedSet = {
      set_index: setIndex,
      completed,
      reps,
      weight_kg: weight,
      rest_seconds: measuredRest
    };
    const logByIndex = new Map(previousLogs.map((item) => [item.set_index, item]));
    logByIndex.set(setIndex, updatedLog);
    for (const completedIndex of nextCompleted) {
      if (!logByIndex.has(completedIndex)) {
        logByIndex.set(completedIndex, {
          set_index: completedIndex,
          completed: true,
          reps: null,
          weight_kg: null,
          rest_seconds: null
        });
      }
    }
    const nextLogs = [...logByIndex.values()].sort(
      (left, right) => left.set_index - right.set_index
    );
    const optimistic: SessionProgress = {
      ...previous,
      completed_sets: { ...previous.completed_sets, [exercise.id]: nextCompleted },
      set_logs: { ...(previous.set_logs ?? {}), [exercise.id]: nextLogs }
    };
    setSessions((items) => replaceSession(items, optimistic));
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<SessionProgress>(
        `/me/programs/${program.id}/workout-progress/`,
        {
          method: "PUT",
          body: {
            week,
            version_id: program.programVersionId,
            day_id: day.id,
            exercise_id: exercise.id,
            completed_sets: nextCompleted,
            set_logs: nextLogs
          }
        }
      );
      setSessions((items) => replaceSession(items, result));
      if (completed && !wasCompleted) {
        const hasRemainingSet = Array.from({ length: exercise.sets }, (_, index) => index).some(
          (index) => !nextCompleted.includes(index)
        );
        if (hasRemainingSet) startRestTimer(exercise);
        else setActiveTimer(null);
      } else if (!completed && activeTimer?.exerciseId === exercise.id) {
        setActiveTimer(null);
      }
      return true;
    } catch {
      setSessions((items) => replaceSession(items, previous));
      setMessage("ثبت جزئیات ست انجام نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startRestTimer = (exercise: TrainingExercise) => {
    const timer = createRestTimer(exercise);
    setNow(timer.startedAt);
    setActiveTimer(timer);
  };

  const timerForExercise = (exercise: TrainingExercise) =>
    activeTimer?.exerciseId === exercise.id ? activeTimer : null;

  const changeDay = (nextDayId: string) => {
    setDayId(nextDayId);
    setActiveTimer(null);
  };

  const changeWeek = (nextWeek: number) => {
    setWeek(nextWeek);
    setActiveTimer(null);
  };

  const dayOptions = useMemo(
    () => days.map((item) => ({ value: item.id, label: item.title || `روز ${item.order}` })),
    [days]
  );

  return (
    <section className={styles.workoutExperience} aria-label="تمرین تعاملی">
      <Card className={styles.workoutOverview}>
        <div className={styles.workoutOverviewHeader}>
          <div>
            <p className={styles.eyebrow}>برنامهٔ تمرینی</p>
            <h2 className={styles.workoutHeading}>{day?.title || "جلسهٔ تمرین"}</h2>
            <p className={styles.muted}>
              برای هر ست، تکرار و وزنهٔ واقعی را ثبت کنید؛ سابقه برای هفته‌های بعد می‌ماند.
            </p>
          </div>
          <div className={styles.workoutSelectors}>
            <FormField label="هفتهٔ برنامه" htmlFor="workout-week">
              <Select
                id="workout-week"
                value={String(week)}
                options={Array.from({ length: weeks }, (_, index) => ({
                  value: String(index + 1),
                  label: `هفتهٔ ${index + 1}`
                }))}
                onChange={(event) => changeWeek(Number(event.target.value))}
              />
            </FormField>
            <FormField label="جلسه" htmlFor="workout-day">
              <Select
                id="workout-day"
                value={day?.id ?? ""}
                options={dayOptions}
                onChange={(event) => changeDay(event.target.value)}
              />
            </FormField>
          </div>
        </div>
        <div className={styles.workoutProgressGrid}>
          <ProgressSummary
            label="پیشرفت این جلسه"
            value={`${done} از ${total} ست`}
            percent={sessionPercent}
          />
          <ProgressSummary
            label="پیشرفت کل دوره"
            value={`${courseDone} از ${courseTotal} ست`}
            percent={coursePercent}
          />
        </div>
        {total > 0 && done >= total ? (
          <p className={styles.workoutCompleteBanner} role="status">
            <CheckCircle2 size={20} /> این جلسه کامل شد. آفرین!
          </p>
        ) : null}
      </Card>

      {message ? (
        <p role="alert" className={styles.errorAlert}>
          {message}
        </p>
      ) : null}

      {day?.notes ? <p className={styles.muted}>{day.notes}</p> : null}

      <div className={styles.interactiveExerciseList}>
        {day?.exercises.map((exercise, index) => {
          const completedSets = current?.completed_sets[exercise.id] ?? [];
          const isComplete = exercise.sets > 0 && completedSets.length >= exercise.sets;
          const exerciseTimer = timerForExercise(exercise);
          const timerRemaining = exerciseTimer
            ? Math.max(0, Math.ceil((exerciseTimer.endAt - now) / 1000))
            : 0;
          const videoUnavailable = !exercise.tutorial_url || failedVideos.includes(exercise.id);
          const previousWeek = sessions.find(
            (item) => item.week === week - 1 && item.day_id === day.id
          );
          const previousDone = previousWeek?.completed_sets[exercise.id] ?? [];
          const previousLogs = previousWeek?.set_logs?.[exercise.id] ?? [];

          return (
            <Card
              className={`${styles.interactiveExerciseCard} ${isComplete ? styles.interactiveExerciseComplete : ""}`}
              key={exercise.id}
            >
              <header className={styles.interactiveExerciseHeader}>
                <div className={styles.exerciseIdentity}>
                  <span className={styles.exerciseIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className={styles.eyebrow}>
                      {exercise.targetMuscle || day.targetMuscles?.join("، ") || "حرکت تمرینی"}
                    </p>
                    <h3 className={styles.interactiveExerciseTitle}>{exercise.name}</h3>
                  </div>
                </div>
                <span
                  className={`${styles.exerciseStatus} ${isComplete ? styles.exerciseStatusComplete : ""}`}
                >
                  {isComplete ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                  {isComplete
                    ? "همهٔ ست‌ها کامل"
                    : `${persianDigits(completedSets.length)} از ${persianDigits(exercise.sets)} ست`}
                </span>
              </header>

              <div className={styles.interactiveExerciseBody}>
                <div className={styles.interactiveExerciseDetails}>
                  <div className={styles.prescriptionChips}>
                    <span>{exercise.sets} ست</span>
                    <span>هدف {exercise.reps} تکرار</span>
                    <span>استراحت هدف {exercise.rest || "۹۰ ثانیه"}</span>
                    {exercise.rpe ? <span>شدت {exercise.rpe}</span> : null}
                  </div>

                  {exercise.trainingGroupName || exercise.supersetGroupId ? (
                    <p className={styles.trainingGroupNote}>
                      گروه تمرینی: {exercise.trainingGroupName ?? "سوپرست"}. حرکت‌ها را به‌ترتیب
                      گروه اجرا کنید.
                    </p>
                  ) : null}
                  {exercise.dropSet ? (
                    <p className={styles.trainingGroupNote}>
                      دراپ‌ست: {exercise.dropSet.drops} مرحله، کاهش{" "}
                      {exercise.dropSet.reduction_percent}٪
                    </p>
                  ) : null}
                  {exercise.notes ? (
                    <p className={styles.exerciseCoachNote}>{exercise.notes}</p>
                  ) : null}
                  {Object.entries(exercise.execution_guide ?? {}).map(([key, text]) => (
                    <p className={styles.exerciseCoachNote} key={key}>
                      {text}
                    </p>
                  ))}

                  <div className={styles.setCompletionBlock}>
                    <div className={styles.setCompletionHeader}>
                      <strong>ثبت عملکرد هر ست</strong>
                      <span>
                        {persianDigits(completedSets.length)} از {persianDigits(exercise.sets)} ست
                        انجام شده
                      </span>
                    </div>
                    <div className={styles.setLogList}>
                      {Array.from(
                        { length: Math.max(0, Math.min(100, exercise.sets)) },
                        (_, setIndex) => {
                          const isSetComplete = completedSets.includes(setIndex);
                          const savedLog = current?.set_logs?.[exercise.id]?.find(
                            (item) => item.set_index === setIndex
                          );
                          const draft = getDraft(exercise, setIndex, savedLog);
                          const key = draftKey(week, day.id, exercise.id, setIndex);
                          return (
                            <div className={styles.setLogCard} key={setIndex}>
                              <div className={styles.setLogHeader}>
                                <strong>ست {persianDigits(setIndex + 1)}</strong>
                                <span
                                  className={
                                    isSetComplete ? styles.setLogDone : styles.setLogPending
                                  }
                                >
                                  {isSetComplete ? "انجام‌شده" : "ثبت‌نشده"}
                                </span>
                              </div>
                              <div className={styles.setLogFields}>
                                <FormField
                                  label={`تکرار واقعی ست ${persianDigits(setIndex + 1)}`}
                                  htmlFor={`${key}-reps`}
                                  hint={`هدف: ${exercise.reps}`}
                                >
                                  <Input
                                    id={`${key}-reps`}
                                    inputMode="numeric"
                                    min={0}
                                    max={1000}
                                    type="number"
                                    value={draft.reps}
                                    disabled={!loaded || saving}
                                    onChange={(event) =>
                                      setSetDrafts((items) => ({
                                        ...items,
                                        [key]: { ...draft, reps: event.target.value }
                                      }))
                                    }
                                  />
                                </FormField>
                                <FormField
                                  label={`وزنهٔ واقعی (کیلوگرم) ست ${persianDigits(setIndex + 1)}`}
                                  htmlFor={`${key}-weight`}
                                >
                                  <Input
                                    id={`${key}-weight`}
                                    inputMode="decimal"
                                    min={0}
                                    max={1000}
                                    step="0.25"
                                    type="number"
                                    value={draft.weight}
                                    disabled={!loaded || saving}
                                    onChange={(event) =>
                                      setSetDrafts((items) => ({
                                        ...items,
                                        [key]: { ...draft, weight: event.target.value }
                                      }))
                                    }
                                  />
                                </FormField>
                              </div>
                              <div className={styles.setLogActions}>
                                <Button
                                  disabled={!loaded || saving || !normalizeDigits(draft.reps)}
                                  iconStart={<Check size={16} />}
                                  onClick={() => void saveSet(exercise, setIndex, true, draft)}
                                  size="sm"
                                  variant="primary"
                                >
                                  {isSetComplete ? "ذخیرهٔ تغییرات" : "ثبت ست"}
                                </Button>
                                {isSetComplete ? (
                                  <Button
                                    disabled={!loaded || saving}
                                    onClick={() => void saveSet(exercise, setIndex, false, draft)}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    علامت‌گذاری به‌عنوان ناقص
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {week > 1 ? (
                    <section className={styles.setHistory} aria-label={`سابقهٔ ${exercise.name}`}>
                      <h4>عملکرد هفتهٔ قبل</h4>
                      {!previousWeek ? (
                        <p>برای هفتهٔ قبل سابقه‌ای ثبت نشده است.</p>
                      ) : (
                        <>
                          <p>
                            {persianDigits(previousDone.length)} ست از{" "}
                            {persianDigits(exercise.sets)} ست انجام شده بود.
                          </p>
                          <ul>
                            {Array.from({ length: exercise.sets }, (_, setIndex) => setIndex).map(
                              (setIndex) => {
                                const log = previousLogs.find(
                                  (item) => item.set_index === setIndex
                                );
                                if (!previousDone.includes(setIndex)) return null;
                                return (
                                  <li key={setIndex}>
                                    <strong>ست {persianDigits(setIndex + 1)}:</strong>{" "}
                                    {log?.reps != null ? `${log.reps} تکرار` : "تکرار ثبت نشده"} ·{" "}
                                    {log?.weight_kg != null
                                      ? `${log.weight_kg} کیلوگرم`
                                      : "وزنه ثبت نشده"}
                                    {log?.rest_seconds != null
                                      ? ` · استراحت پیش از ست ${formatTime(log.rest_seconds)}`
                                      : ""}
                                  </li>
                                );
                              }
                            )}
                          </ul>
                          {previousDone.some(
                            (setIndex) => !previousLogs.some((item) => item.set_index === setIndex)
                          ) ? (
                            <small>برای بعضی ست‌های قدیمی، جزئیات تکرار و وزنه ثبت نشده است.</small>
                          ) : null}
                        </>
                      )}
                    </section>
                  ) : null}

                  {exerciseTimer ? (
                    <div
                      className={styles.inlineRestTimer}
                      role="group"
                      aria-label={`تایمر استراحت ${exercise.name}`}
                    >
                      <div className={styles.inlineTimerInfo}>
                        <Clock3 size={19} />
                        <div>
                          <span className={styles.inlineTimerLabel}>
                            {timerRemaining === 0 ? "استراحت هدف تمام شد" : "زمان استراحت تا هدف"}
                          </span>
                          <output aria-label="زمان استراحت" className={styles.inlineTimerValue}>
                            {formatTime(timerRemaining)}
                          </output>
                        </div>
                      </div>
                      <div className={styles.inlineTimerActions}>
                        <Button
                          iconStart={<Play size={15} />}
                          onClick={() => startRestTimer(exercise)}
                          size="sm"
                          variant="secondary"
                        >
                          شروع دوباره
                        </Button>
                        <Button
                          aria-label={`بستن تایمر ${exercise.name}`}
                          iconStart={<X size={15} />}
                          onClick={() => setActiveTimer(null)}
                          size="sm"
                          variant="ghost"
                        >
                          بستن
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={styles.exerciseMedia}>
                  {videoUnavailable ? (
                    <div
                      className={styles.videoPlaceholder}
                      role="img"
                      aria-label={`ویدئوی ${exercise.name} موجود نیست`}
                    >
                      <span className={styles.videoPlaceholderIcon} aria-hidden>
                        <Dumbbell size={25} />
                      </span>
                      <strong>ویدئوی آموزشی ثبت نشده</strong>
                      <span>مربی می‌تواند لینک مستقیم ویدئو را در کاتالوگ همین حرکت ثبت کند.</span>
                    </div>
                  ) : (
                    <button
                      aria-label={`پخش ویدئوی ${exercise.name}`}
                      className={styles.exerciseVideoPreview}
                      onClick={() =>
                        setActiveVideo({ name: exercise.name, url: exercise.tutorial_url! })
                      }
                      type="button"
                    >
                      <LoopingVideoPreview
                        onDuration={(duration) =>
                          setVideoDurations((items) => ({ ...items, [exercise.id]: duration }))
                        }
                        onError={() =>
                          setFailedVideos((items) =>
                            items.includes(exercise.id) ? items : [...items, exercise.id]
                          )
                        }
                        source={exercise.tutorial_url!}
                      />
                      <span className={styles.videoPreviewPlay} aria-hidden>
                        <Play size={16} fill="currentColor" />
                      </span>
                      {videoDurations[exercise.id] ? (
                        <span className={styles.videoPreviewDuration}>
                          {formatTime(Math.round(videoDurations[exercise.id]))}
                        </span>
                      ) : null}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className={styles.workoutSaveNote}>
        <CheckCircle2 size={16} /> تکرار، وزنه، استراحت و وضعیت هر ست برای همین هفته، جلسه و نسخهٔ
        برنامه ذخیره می‌شود.
      </p>
      <Modal
        onClose={() => setActiveVideo(null)}
        open={Boolean(activeVideo)}
        title={activeVideo ? `آموزش حرکت ${activeVideo.name}` : "آموزش حرکت"}
      >
        {activeVideo ? (
          <video
            aria-label={`ویدئوی ${activeVideo.name}`}
            autoPlay
            className={styles.exerciseVideoModal}
            controls
            playsInline
            src={activeVideo.url}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function ProgressSummary({
  label,
  percent,
  value
}: {
  label: string;
  percent: number;
  value: string;
}) {
  return (
    <div className={styles.progressSummary}>
      <div className={styles.progressSummaryHeader}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <progress aria-label={label} value={percent} max={100} />
    </div>
  );
}

function LoopingVideoPreview({
  onDuration,
  onError,
  source
}: {
  onDuration: (duration: number) => void;
  onError: () => void;
  source: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.01 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [source]);

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      autoPlay={visible}
      className={styles.exerciseVideoThumbnail}
      loop
      muted
      playsInline
      preload={visible ? "metadata" : "none"}
      src={source}
      onLoadedMetadata={(event) => {
        const { duration } = event.currentTarget;
        if (Number.isFinite(duration) && duration > 0) onDuration(duration);
      }}
      onError={onError}
    />
  );
}
