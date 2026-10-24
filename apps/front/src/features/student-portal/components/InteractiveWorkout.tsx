import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, Clock3, Dumbbell, Play, RotateCcw, X } from "lucide-react";
import { Button, Card, FormField, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import type { GeneratedProgram, TrainingExercise } from "../../programs/types/generatedProgram";
import styles from "./studentPortal.module.css";

interface SessionProgress {
  week: number;
  day_id: string;
  completed_sets: Record<string, number[]>;
}

interface ActiveTimer {
  endAt: number;
  exerciseId: string;
}

const FARSI_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function parseRestSeconds(value: string): number {
  const normalized = value.replace(/[۰-۹]/g, (digit) => String(FARSI_DIGITS.indexOf(digit))).trim();
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
    (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]
  );
}

function createRestTimer(exercise: TrainingExercise): ActiveTimer {
  return {
    endAt: Date.now() + parseRestSeconds(exercise.rest) * 1000,
    exerciseId: exercise.id
  };
}

export function InteractiveWorkout({ program }: { program: GeneratedProgram }) {
  const days = useMemo(() => program.training?.days ?? [], [program.training?.days]);
  const [week, setWeek] = useState(1);
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [sessions, setSessions] = useState<SessionProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failedVideos, setFailedVideos] = useState<string[]>([]);

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

  const saveCompletedSets = async (exercise: TrainingExercise, completedSets: number[]) => {
    if (!loaded || saving || !day || !program.programVersionId) return false;
    const previous = current ?? { week, day_id: day.id, completed_sets: {} };
    const normalized = [...new Set(completedSets)].sort((left, right) => left - right);
    const optimistic = {
      ...previous,
      completed_sets: { ...previous.completed_sets, [exercise.id]: normalized }
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
            completed_sets: normalized
          }
        }
      );
      setSessions((items) => replaceSession(items, result));
      return true;
    } catch {
      setSessions((items) => replaceSession(items, previous));
      setMessage("ثبت پیشرفت انجام نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startRestTimer = (exercise: TrainingExercise) => {
    const timer = createRestTimer(exercise);
    setNow(timer.endAt - parseRestSeconds(exercise.rest) * 1000);
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
              ست‌ها را بعد از انجام علامت بزنید؛ پیشرفت شما خودکار ذخیره می‌شود.
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
                  role="status"
                >
                  {isComplete ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                  {isComplete ? "کامل شد" : "در حال انجام"}
                </span>
              </header>

              <div className={styles.interactiveExerciseBody}>
                <div className={styles.interactiveExerciseDetails}>
                  <div className={styles.prescriptionChips}>
                    <span>{exercise.sets} ست</span>
                    <span>{exercise.reps} تکرار</span>
                    <span>استراحت {exercise.rest || "۹۰ ثانیه"}</span>
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
                      <strong>ست‌های این حرکت</strong>
                      <span>
                        {completedSets.length} از {exercise.sets} انجام شده
                      </span>
                    </div>
                    <div className={styles.setButtons} aria-label={`ثبت ست‌های ${exercise.name}`}>
                      {Array.from(
                        { length: Math.max(0, Math.min(100, exercise.sets)) },
                        (_, setIndex) => {
                          const checked = completedSets.includes(setIndex);
                          return (
                            <button
                              aria-label={`ست ${setIndex + 1} ${checked ? "انجام شده" : "انجام نشده"}`}
                              aria-pressed={checked}
                              className={`${styles.setButton} ${checked ? styles.setButtonDone : ""}`}
                              disabled={!loaded || saving}
                              key={setIndex}
                              onClick={() => {
                                const next = checked
                                  ? completedSets.filter((item) => item !== setIndex)
                                  : [...completedSets, setIndex];
                                void saveCompletedSets(exercise, next).then((saved) => {
                                  if (saved && !checked) startRestTimer(exercise);
                                  if (saved && checked && activeTimer?.exerciseId === exercise.id) {
                                    setActiveTimer(null);
                                  }
                                });
                              }}
                              type="button"
                            >
                              {checked ? <Check size={16} /> : null}
                              <span>ست {setIndex + 1}</span>
                            </button>
                          );
                        }
                      )}
                    </div>
                    <Button
                      className={styles.exerciseCompletionButton}
                      disabled={!loaded || saving}
                      iconStart={isComplete ? <RotateCcw size={17} /> : <CheckCircle2 size={17} />}
                      onClick={() => {
                        const next = isComplete
                          ? []
                          : Array.from({ length: exercise.sets }, (_, item) => item);
                        void saveCompletedSets(exercise, next).then((saved) => {
                          if (saved && !isComplete) startRestTimer(exercise);
                          if (saved && isComplete && activeTimer?.exerciseId === exercise.id) {
                            setActiveTimer(null);
                          }
                        });
                      }}
                      variant={isComplete ? "secondary" : "primary"}
                    >
                      {isComplete
                        ? "برگرداندن حرکت به حالت ناقص"
                        : "علامت‌گذاری حرکت به‌عنوان کامل"}
                    </Button>
                  </div>

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
                            {timerRemaining === 0 ? "استراحت تمام شد" : "زمان استراحت"}
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
                      <span>مربی می‌تواند ویدئو را به حرکت در کاتالوگ وصل کند.</span>
                    </div>
                  ) : (
                    <video
                      aria-label={`ویدئوی آموزشی ${exercise.name}`}
                      className={styles.exerciseVideo}
                      controls
                      playsInline
                      preload="metadata"
                      src={exercise.tutorial_url}
                      onError={() =>
                        setFailedVideos((items) =>
                          items.includes(exercise.id) ? items : [...items, exercise.id]
                        )
                      }
                    />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className={styles.workoutSaveNote}>
        <CheckCircle2 size={16} /> پیشرفت ست‌ها برای همین هفته، جلسه و نسخهٔ برنامه در حساب شما
        ذخیره می‌شود.
      </p>
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
