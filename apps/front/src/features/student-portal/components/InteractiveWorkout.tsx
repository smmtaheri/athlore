import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  Clock3,
  Dumbbell,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  TimerReset,
  X
} from "lucide-react";
import { apiRequest } from "../../../shared/api/client";
import type {
  ExerciseMedia,
  GeneratedProgram,
  TrainingDay,
  TrainingExercise
} from "../../programs/types/generatedProgram";
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
  status?: "in_progress" | "completed" | "completed_partial";
  finished_at?: string | null;
}

interface SetDraft {
  reps: string;
  weight: string;
  completed: boolean;
}

interface ActiveTimer {
  id: number;
  kind: "rest" | "exercise";
  exerciseId?: string;
  restKey?: string;
  durationSeconds: number;
  endAt: number | null;
  remainingSeconds: number;
  startedAt: number | null;
  pausedAt: number | null;
  status: "running" | "paused" | "finished";
}

type LessonTab = "steps" | "tips" | "mistakes";

const FARSI_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MOTION_PREFERENCE_KEY = "athlore.workout.motion-enabled";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

function formatTime(seconds: number): string {
  const wholeSeconds = Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds)) : 0;
  const value = `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
  return persianDigits(value);
}

function youtubeId(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com"].includes(url.hostname) ? url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || "" : "";
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}

function parseRestSeconds(value: string): number | null {
  const normalized = normalizeDigits(value);
  const clock = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Math.max(1, Number(clock[1]) * 60 + Number(clock[2]));
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (/دقیقه|min(?:ute)?s?/i.test(normalized)) return Math.max(1, Math.round(amount * 60));
  if (/ثانیه|sec(?:ond)?s?/i.test(normalized)) return Math.max(1, Math.round(amount));
  return null;
}

function prescribedExerciseSeconds(exercise: TrainingExercise): number | null {
  if (typeof exercise.seconds === "number" && exercise.seconds > 0) return exercise.seconds;
  const match = normalizeDigits(exercise.reps || "").match(/^\s*(\d+)\s*(ثانیه|ثانیه‌ای|sec(?:ond)?s?)\s*$/i);
  return match ? Number(match[1]) : null;
}

function createDraftKey(week: number, dayId: string, exerciseId: string, setIndex: number) {
  return `${week}:${dayId}:${exerciseId}:${setIndex}`;
}

function createExerciseKey(week: number, dayId: string, exerciseId: string) {
  return `${week}:${dayId}:${exerciseId}`;
}

function getExerciseMedia(exercise: TrainingExercise): ExerciseMedia | null {
  return exercise.media && typeof exercise.media === "object" ? exercise.media : null;
}

function guideSteps(exercise: TrainingExercise) {
  const steps = getExerciseMedia(exercise)?.education?.steps;
  if (steps?.length) return steps;
  return Object.entries(exercise.execution_guide ?? {}).map(([title, text], index) => ({
    at_seconds: index * 7,
    title,
    text
  }));
}

function useAccessibleDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return dialogRef;
}

function playCompletionTone() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.onended = () => void context.close();
    oscillator.stop(context.currentTime + 0.18);
  } catch {
    // Audio is optional and may be blocked by browser policy.
  }
}

export function InteractiveWorkout({ program }: { program: GeneratedProgram }) {
  const days = useMemo(() => program.training?.days ?? [], [program.training?.days]);
  const schedule = program.training?.schedule;
  const weeks = useMemo(
    () => (schedule?.configured ? schedule.weeks : []),
    [schedule]
  );
  const daysById = useMemo(() => new Map(days.map((day) => [day.id, day])), [days]);
  const [week, setWeek] = useState(weeks[0]?.week ?? 1);
  const [dayId, setDayId] = useState(weeks[0]?.sessions[0]?.day_id ?? days[0]?.id ?? "");
  const [sessions, setSessions] = useState<SessionProgress[]>([]);
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressLoadFailed, setProgressLoadFailed] = useState(false);
  const [progressReload, setProgressReload] = useState(0);
  const [message, setMessage] = useState("");
  const [lessonExerciseId, setLessonExerciseId] = useState<string | null>(null);
  const [editExerciseId, setEditExerciseId] = useState<string | null>(null);
  const [lessonTab, setLessonTab] = useState<LessonTab>("steps");
  const [now, setNow] = useState(() => Date.now());
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [timerDraftKind, setTimerDraftKind] = useState<"rest" | "exercise">("rest");
  const [timerDraftSeconds, setTimerDraftSeconds] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("1");
  const [customSeconds, setCustomSeconds] = useState("0");
  const [motionEnabled, setMotionEnabled] = useState(() => {
    const reducedMotion = prefersReducedMotion();
    try {
      const saved = window.localStorage.getItem(MOTION_PREFERENCE_KEY);
      if (saved != null) return saved === "true" && !reducedMotion;
    } catch {
      // Storage can be unavailable in privacy-restricted browser modes.
    }
    return !reducedMotion;
  });
  const nextTimerIdRef = useRef(1);
  const restStartedAtByExercise = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!program.programVersionId || !weeks.length) {
      setLoaded(true);
      return undefined;
    }
    let active = true;
    setLoaded(false);
    setProgressLoadFailed(false);
    apiRequest<{ sessions: SessionProgress[]; version_id: string }>(
      `/me/programs/${program.id}/workout-progress/`
    )
      .then((result) => {
        if (!active) return;
        if (result.version_id !== program.programVersionId) {
          setProgressLoadFailed(true);
          setMessage("نسخهٔ برنامه تغییر کرده؛ صفحه را دوباره باز کنید.");
          return;
        }
        setSessions(result.sessions);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setProgressLoadFailed(true);
          setMessage("دریافت پیشرفت انجام نشد؛ پیش از ثبت، دوباره تلاش کن تا دادهٔ قبلی بازنویسی نشود.");
        }
      });
    return () => {
      active = false;
    };
  }, [program.id, program.programVersionId, weeks.length, progressReload]);

  useEffect(() => {
    if (activeTimer?.status !== "running") return undefined;
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [activeTimer?.status]);

  useEffect(() => {
    if (activeTimer?.status !== "running" || !activeTimer.endAt || now < activeTimer.endAt) return;
    setActiveTimer((timer) =>
      timer?.id === activeTimer.id ? { ...timer, status: "finished", endAt: null, remainingSeconds: 0 } : timer
    );
    setMessage(activeTimer.kind === "rest" ? "زمان استراحت تمام شد؛ هر وقت آماده‌ای ادامه بده." : "زمان تمرین تمام شد.");
    playCompletionTone();
  }, [activeTimer, now]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MOTION_PREFERENCE_KEY, String(motionEnabled));
    } catch {
      // The preference remains available for the current page if storage is blocked.
    }
  }, [motionEnabled]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setMotionEnabled(false);
    };
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  const currentWeek = weeks.find((item) => item.week === week) ?? weeks[0];
  const scheduledDayIds = currentWeek?.sessions.map((item) => item.day_id) ?? [];
  const sessionDays = scheduledDayIds
    .map((id) => daysById.get(id))
    .filter((item): item is TrainingDay => Boolean(item));
  const day = sessionDays.find((item) => item.id === dayId) ?? sessionDays[0];
  const current = sessions.find((item) => item.week === week && item.day_id === day?.id);
  const totalSets = day?.exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.sets), 0) ?? 0;
  const completedSetCount = Object.values(current?.completed_sets ?? {}).reduce(
    (sum, indices) => sum + indices.length,
    0
  );
  const sessionPercent = totalSets ? Math.min(100, Math.round((completedSetCount / totalSets) * 100)) : 0;
  const plannedSessions = weeks.flatMap((item) => item.sessions.map((session) => ({ week: item.week, ...session })));
  const endedSessionCount = plannedSessions.filter((item) => {
    const progress = sessions.find((entry) => entry.week === item.week && entry.day_id === item.day_id);
    return progress?.status === "completed" || progress?.status === "completed_partial";
  }).length;
  const coursePercent = plannedSessions.length
    ? Math.min(100, Math.round((endedSessionCount / plannedSessions.length) * 100))
    : 0;
  const dayExercises = day?.exercises ?? [];
  const activeExerciseIndex = dayExercises.findIndex((item) => item.id === lessonExerciseId);
  const activeExercise = activeExerciseIndex >= 0 ? dayExercises[activeExerciseIndex] : null;
  const editExercise = dayExercises.find((item) => item.id === editExerciseId) ?? null;
  const timerRemaining = activeTimer
    ? activeTimer.status === "running" && activeTimer.endAt
      ? Math.max(0, Math.ceil((activeTimer.endAt - now) / 1000))
      : activeTimer.remainingSeconds
    : 0;
  const currentSetRows = editExercise
    ? Array.from({ length: Math.max(0, Math.min(100, editExercise.sets)) }, (_, index) => {
        const savedLog = current?.set_logs?.[editExercise.id]?.find((item) => item.set_index === index);
        const isCompleted = (current?.completed_sets?.[editExercise.id] ?? []).includes(index);
        const key = createDraftKey(week, day?.id ?? "", editExercise.id, index);
        return {
          key,
          index,
          completed: setDrafts[key]?.completed ?? isCompleted,
          reps: setDrafts[key]?.reps ?? (savedLog?.reps == null ? "" : String(savedLog.reps)),
          weight: setDrafts[key]?.weight ?? (savedLog?.weight_kg == null ? "" : String(savedLog.weight_kg)),
          restSeconds: savedLog?.rest_seconds ?? null
        };
      })
    : [];

  const replaceSession = (items: SessionProgress[], replacement: SessionProgress) => [
    ...items.filter((item) => !(item.week === replacement.week && item.day_id === replacement.day_id)),
    replacement
  ];

  const startTimer = (seconds: number, kind: "rest" | "exercise", exerciseId?: string, showPanel = true) => {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 7200) {
      setMessage("زمان تایمر باید بین ۱ ثانیه تا ۲ ساعت باشد.");
      return;
    }
    const startedAt = Date.now();
    const restKey = kind === "rest" && exerciseId && day
      ? createExerciseKey(week, day.id, exerciseId)
      : undefined;
    if (restKey) restStartedAtByExercise.current[restKey] = startedAt;
    setNow(startedAt);
    setActiveTimer({
      id: nextTimerIdRef.current++,
      kind,
      exerciseId,
      restKey,
      durationSeconds: seconds,
      endAt: startedAt + seconds * 1000,
      remainingSeconds: seconds,
      startedAt,
      pausedAt: null,
      status: "running"
    });
    if (showPanel) setTimerOpen(true);
    setMessage("");
  };

  const pauseTimer = () => {
    if (!activeTimer?.endAt) return;
    const pausedAt = Date.now();
    const remainingSeconds = Math.max(0, Math.ceil((activeTimer.endAt - pausedAt) / 1000));
    setActiveTimer({ ...activeTimer, status: "paused", endAt: null, remainingSeconds, pausedAt });
  };

  const resumeTimer = () => {
    if (!activeTimer || activeTimer.status !== "paused") return;
    const startedAt = Date.now();
    if (activeTimer.kind === "rest" && activeTimer.restKey && activeTimer.pausedAt) {
      if (restStartedAtByExercise.current[activeTimer.restKey]) {
        restStartedAtByExercise.current[activeTimer.restKey] += startedAt - activeTimer.pausedAt;
      }
    }
    setNow(startedAt);
    setActiveTimer({
      ...activeTimer,
      status: "running",
      startedAt,
      pausedAt: null,
      endAt: startedAt + activeTimer.remainingSeconds * 1000
    });
  };

  const resetTimer = () => {
    if (!activeTimer) return;
    const resetAt = Date.now();
    if (activeTimer.kind === "rest" && activeTimer.restKey) {
      restStartedAtByExercise.current[activeTimer.restKey] = resetAt;
    }
    setActiveTimer({ ...activeTimer, status: "paused", endAt: null, startedAt: null, pausedAt: resetAt, remainingSeconds: activeTimer.durationSeconds });
  };

  const requestTimer = (exercise: TrainingExercise, kind: "rest" | "exercise") => {
    const seconds = kind === "rest" ? parseRestSeconds(exercise.rest) : prescribedExerciseSeconds(exercise);
    if (!seconds) {
      setMessage(kind === "rest" ? "زمان استراحت برای این حرکت در برنامه مشخص نشده است." : "زمان تمرین برای این حرکت در برنامه مشخص نشده است.");
      return;
    }
    startTimer(seconds, kind, exercise.id);
  };

  const saveExerciseProgress = async (exercise: TrainingExercise, logs: LoggedSet[]) => {
    if (!loaded || saving || !day || !program.programVersionId) return false;
    const completed = logs.filter((item) => item.completed).map((item) => item.set_index).sort((a, b) => a - b);
    const previouslyCompleted = new Set(current?.completed_sets?.[exercise.id] ?? []);
    const newlyCompleted = completed.filter((index) => !previouslyCompleted.has(index));
    const restKey = createExerciseKey(week, day.id, exercise.id);
    const restStartedAt = restStartedAtByExercise.current[restKey];
    const restEndedAt = Date.now();
    const currentPauseMs = activeTimer?.kind === "rest"
      && activeTimer.restKey === restKey
      && activeTimer.status === "paused"
      && activeTimer.pausedAt
      ? Math.max(0, restEndedAt - activeTimer.pausedAt)
      : 0;
    const savedLogs = newlyCompleted.length === 1 && restStartedAt != null
      ? logs.map((item) => item.set_index === newlyCompleted[0]
        ? { ...item, rest_seconds: Math.min(7200, Math.max(0, Math.floor((restEndedAt - restStartedAt - currentPauseMs) / 1000))) }
        : item)
      : logs;
    const previous = current ?? { week, day_id: day.id, completed_sets: {}, set_logs: {} };
    const nextCompleted = { ...previous.completed_sets, [exercise.id]: completed };
    const nextLogs = { ...(previous.set_logs ?? {}), [exercise.id]: savedLogs };
    const optimistic: SessionProgress = {
      ...previous,
      completed_sets: nextCompleted,
      set_logs: nextLogs
    };
    setSessions((items) => replaceSession(items, optimistic));
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<SessionProgress>(`/me/programs/${program.id}/workout-progress/`, {
        method: "PUT",
        body: {
          week,
          version_id: program.programVersionId,
          day_id: day.id,
          exercise_id: exercise.id,
          completed_sets: completed,
          set_logs: savedLogs
        }
      });
      setSessions((items) => replaceSession(items, result));
      if (newlyCompleted.length) {
        delete restStartedAtByExercise.current[restKey];
        const nextIncomplete = savedLogs.some((item) => item.set_index > newlyCompleted[0] && !item.completed);
        const restSeconds = parseRestSeconds(exercise.rest);
        if (newlyCompleted.length === 1 && nextIncomplete && restSeconds) {
          startTimer(restSeconds, "rest", exercise.id, false);
        } else {
          setActiveTimer((timer) =>
            timer?.kind === "rest" && timer.exerciseId === exercise.id ? null : timer
          );
        }
      }
      return true;
    } catch {
      setSessions((items) => replaceSession(items, previous));
      setMessage("ثبت عملکرد انجام نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleExerciseComplete = async (exercise: TrainingExercise) => {
    const oldCompleted = current?.completed_sets?.[exercise.id] ?? [];
    const completeAll = oldCompleted.length < exercise.sets;
    const existing = new Map((current?.set_logs?.[exercise.id] ?? []).map((item) => [item.set_index, item]));
    const logs = Array.from({ length: Math.max(0, Math.min(100, exercise.sets)) }, (_, index) => {
      const previous = existing.get(index);
      const key = createDraftKey(week, day?.id ?? "", exercise.id, index);
      const draft = setDrafts[key];
      return {
        set_index: index,
        completed: completeAll,
        reps: draft?.reps ? Number(normalizeDigits(draft.reps)) : previous?.reps ?? null,
        weight_kg: draft?.weight ? Number(normalizeDigits(draft.weight)) : previous?.weight_kg ?? null,
        rest_seconds: previous?.rest_seconds ?? null
      } satisfies LoggedSet;
    });
    await saveExerciseProgress(exercise, logs);
  };

  const saveSetEditor = async () => {
    if (!editExercise || !day) return false;
    const logs: LoggedSet[] = [];
    for (const row of currentSetRows) {
      const repsText = normalizeDigits(row.reps);
      const weightText = normalizeDigits(row.weight);
      const reps = repsText ? Number(repsText) : null;
      const weight = weightText ? Number(weightText) : null;
      if (reps !== null && (!Number.isInteger(reps) || reps < 0 || reps > 1000)) {
        setMessage("تعداد تکرار باید عدد صحیح بین صفر تا ۱۰۰۰ باشد.");
        return false;
      }
      if (weightText && !/^\d+(?:\.\d{1,2})?$/.test(weightText)) {
        setMessage("وزنه را با حداکثر دو رقم اعشار وارد کنید.");
        return false;
      }
      if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) {
        setMessage("وزنه باید بین صفر تا ۱۰۰۰ کیلوگرم باشد.");
        return false;
      }
      logs.push({
        set_index: row.index,
        completed: row.completed,
        reps,
        weight_kg: weight,
        rest_seconds: row.restSeconds
      });
    }
    const saved = await saveExerciseProgress(editExercise, logs);
    if (saved) setEditExerciseId(null);
    return saved;
  };

  const finishSession = async () => {
    if (!loaded || saving || !day || !program.programVersionId) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<SessionProgress>(`/me/programs/${program.id}/workout-progress/`, {
        method: "PUT",
        body: {
          action: "finish_session",
          week,
          day_id: day.id,
          version_id: program.programVersionId
        }
      });
      setSessions((items) => replaceSession(items, result));
      setActiveTimer(null);
    } catch {
      setMessage("پایان جلسه ثبت نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  };

  const setWeekAndDay = (nextWeek: number, nextDayId?: string) => {
    const nextWeekRecord = weeks.find((item) => item.week === nextWeek);
    const nextIds = nextWeekRecord?.sessions.map((item) => item.day_id) ?? [];
    const preferred = nextDayId && nextIds.includes(nextDayId) ? nextDayId : nextIds[0] ?? "";
    setWeek(nextWeek);
    setDayId(preferred);
  };

  const launchLesson = (exercise: TrainingExercise, target: HTMLElement) => {
    target.focus();
    setLessonTab("steps");
    setLessonExerciseId(exercise.id);
  };

  const allMedia = useMemo(() => {
    const unique = new Map<string, ExerciseMedia>();
    for (const currentDay of days) {
      for (const exercise of currentDay.exercises) {
        const media = getExerciseMedia(exercise);
        if (media) unique.set(media.key, media);
      }
    }
    return [...unique.values()];
  }, [days]);

  const muscleShare = useMemo(() => {
    const totals = new Map<string, number>();
    let overall = 0;
    for (const item of plannedSessions) {
      const scheduledDay = daysById.get(item.day_id);
      for (const exercise of scheduledDay?.exercises ?? []) {
        const sets = Math.max(0, exercise.sets);
        const muscle = exercise.primary_muscle?.trim() || "نامشخص";
        totals.set(muscle, (totals.get(muscle) ?? 0) + sets);
        overall += sets;
      }
    }
    if (!overall) return [];
    const percentages = [...totals.entries()]
      .map(([name, count]) => ({ name, count, raw: (count * 100) / overall }))
      .map((item) => ({ ...item, percent: Math.floor(item.raw), remainder: item.raw % 1 }));
    let remaining = 100 - percentages.reduce((sum, item) => sum + item.percent, 0);
    percentages
      .slice()
      .sort((left, right) => right.remainder - left.remainder)
      .slice(0, remaining)
      .forEach((item) => {
        const target = percentages.find((entry) => entry.name === item.name);
        if (target) target.percent += 1;
      });
    return percentages.sort((left, right) => right.count - left.count);
  }, [plannedSessions, daysById]);

  if (!schedule?.configured || !weeks.length) {
    return (
      <section className={styles.workoutExperience} aria-label="تمرین تعاملی">
        <div className={styles.workoutMessage} role="status">
          زمان‌بندی این برنامه در دسترس نیست؛ تا مشخص‌شدن دورهٔ واقعی، تعداد هفته یا جلسه‌ای حدس زده نمی‌شود. لطفاً از مربی بخواهید برنامه را با تاریخ شروع و پایان ثبت کند.
        </div>
      </section>
    );
  }

  const lessonSource = activeExercise?.media?.reel_url || activeExercise?.tutorial_url || (youtubeId(activeExercise?.tutorial_source_url) ? activeExercise?.tutorial_source_url : "") || "";
  const lessonPoster = activeExercise?.media?.poster_url || "";
  const lessonVideoIndex = activeExerciseIndex;
  const sessionFinished = current?.status === "completed" || current?.status === "completed_partial";

  return (
    <section className={styles.workoutExperience} aria-label="تمرین تعاملی">
      <header className={styles.workoutHero}>
        <div>
          <p className={styles.eyebrow} style={{ color: "rgb(255 255 255 / 82%)" }}>
            برنامهٔ تمرینی شما
          </p>
          <h2 className={styles.workoutHeroTitle}>{program.title}</h2>
          <p className={styles.workoutHeroCopy}>
            {program.training?.summary || "حرکت‌ها را طبق نسخهٔ برنامه اجرا کنید و پیشرفت هر جلسه را ثبت کنید."}
          </p>
        </div>
        <div className={styles.workoutHeroStats} aria-label="خلاصهٔ برنامه">
          <div className={styles.workoutHeroStat}>
            <strong>{persianDigits(plannedSessions.length)}</strong>
            <span>جلسهٔ برنامه‌ریزی‌شده</span>
          </div>
          <div className={styles.workoutHeroStat}>
            <strong>{persianDigits(weeks.length)}</strong>
            <span>هفتهٔ واقعی دوره</span>
          </div>
        </div>
      </header>

      <main className={styles.workoutMain}>
        {message ? <p role="alert" className={styles.workoutMessage}>{message}</p> : null}
        {progressLoadFailed ? (
          <button
            className={`${styles.workoutActionButton} ${styles.workoutActionButtonPrimary}`}
            onClick={() => setProgressReload((value) => value + 1)}
            type="button"
          >
            بارگذاری دوبارهٔ پیشرفت
          </button>
        ) : null}

        <div className={styles.workoutControls}>
          <p className={styles.workoutControlsLabel}>هفتهٔ تمرین</p>
          <div className={styles.workoutWeekTabs} role="tablist" aria-label="هفته‌های برنامه">
            {weeks.map((item) => (
              <button
                aria-selected={week === item.week}
                className={styles.workoutWeekTab}
                key={item.week}
                onClick={() => setWeekAndDay(item.week)}
                role="tab"
                type="button"
              >
                {persianDigits(item.week)}
              </button>
            ))}
          </div>
        </div>

        {day?.notes ? <p className={styles.workoutControlsLabel}>{day.notes}</p> : null}

        <div className={styles.workoutSessionTabs} role="tablist" aria-label={`جلسه‌های هفتهٔ ${persianDigits(week)}`}>
          {sessionDays.map((item, index) => {
            const progress = sessions.find((entry) => entry.week === week && entry.day_id === item.id);
            const doneLabel = progress?.status === "completed"
              ? "کامل‌شده"
              : progress?.status === "completed_partial"
                ? "با ست ناقص"
                : progress
                  ? "در حال انجام"
                  : "شروع‌نشده";
            return (
              <button
                aria-selected={day?.id === item.id}
                className={styles.workoutSessionTab}
                key={item.id}
                onClick={() => setDayId(item.id)}
                role="tab"
                type="button"
              >
                <span>{item.title || `جلسهٔ ${persianDigits(index + 1)}`}</span>
                <small>{doneLabel}</small>
              </button>
            );
          })}
        </div>

        {day ? (
          <>
            <div className={styles.workoutExerciseList}>
              {day.exercises.map((exercise, index) => {
                const completed = current?.completed_sets?.[exercise.id] ?? [];
                const isComplete = exercise.sets > 0 && completed.length >= exercise.sets;
                const hasExplicitState = Object.hasOwn(current?.completed_sets ?? {}, exercise.id)
                  || Object.hasOwn(current?.set_logs ?? {}, exercise.id);
                const prior = sessions.find((item) => item.week === week - 1 && item.day_id === day.id);
                const priorLogs = prior?.set_logs?.[exercise.id] ?? [];
                const priorCompleted = prior?.completed_sets?.[exercise.id] ?? [];
                const lastWeight = priorLogs
                  .filter((item) => item.completed && item.weight_kg != null)
                  .at(-1)?.weight_kg;
                const media = getExerciseMedia(exercise);
                const embedId = youtubeId(exercise.tutorial_source_url);
                const previewSource = media?.preview_url || exercise.tutorial_url || "";
                const poster = media?.poster_url || (embedId ? `https://i.ytimg.com/vi/${embedId}/hqdefault.jpg` : "");
                const timedSeconds = prescribedExerciseSeconds(exercise);
                return (
                  <article className={styles.workoutExerciseRow} key={exercise.id}>
                    <div className={styles.workoutExerciseMedia}>
                      {previewSource || embedId ? (
                        <button
                          aria-label={`آموزش حرکت ${exercise.name}`}
                          className={styles.workoutPreviewButton}
                          onClick={(event) => launchLesson(exercise, event.currentTarget)}
                          type="button"
                        >
                          {previewSource ? <LoopingPreview
                            enabled={motionEnabled}
                            paused={Boolean(lessonExerciseId)}
                            poster={poster}
                            source={previewSource}
                          /> : <img src={poster} alt="" loading="lazy" />}
                          <span className={styles.workoutPreviewPlay} aria-hidden>
                            <Play size={15} fill="currentColor" />
                          </span>
                        </button>
                      ) : (
                        <div className={styles.workoutNoVideo}>
                          {poster ? <img src={poster} alt="" /> : <Dumbbell size={20} aria-hidden />}
                          {exercise.tutorial_source_url ? (
                            <a
                              className={styles.workoutSourceLink}
                              href={exercise.tutorial_source_url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              ویدئو در منبع اصلی <ExternalLink size={13} aria-hidden />
                            </a>
                          ) : (
                            <span>ویدئوی دقیق برای این حرکت ثبت نشده</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className={styles.workoutExerciseInfo}>
                      <div className={styles.workoutExerciseTopline}>
                        <span className={styles.workoutExerciseNumber}>{persianDigits(String(index + 1).padStart(2, "0"))}</span>
                        <div>
                          <p className={styles.eyebrow}>{exercise.targetMuscle || day.targetMuscles?.join("، ") || "حرکت تمرینی"}</p>
                          <h3 className={styles.workoutExerciseTitle}>{exercise.name}</h3>
                        </div>
                      </div>
                      <div className={styles.workoutPrescription}>
                        <span>{persianDigits(exercise.sets)} ست</span>
                        <span>{exercise.reps} تکرار</span>
                        {exercise.rest ? (
                          <button className={styles.workoutPrescriptionButton} onClick={() => requestTimer(exercise, "rest")} type="button">
                            <Clock3 size={13} /> استراحت {exercise.rest}
                          </button>
                        ) : null}
                        {exercise.rpe ? <span>شدت {exercise.rpe}</span> : null}
                      </div>
                      {exercise.trainingGroupName || exercise.supersetGroupId ? (
                        <p className={styles.workoutExerciseSubline}>
                          {exercise.trainingGroupName || "سوپرست"} · حرکت‌ها را به‌ترتیب گروه اجرا کن.
                        </p>
                      ) : null}
                      {exercise.dropSet ? (
                        <p className={styles.workoutExerciseSubline}>
                          دراپ‌ست: {persianDigits(exercise.dropSet.drops)} مرحله · کاهش {persianDigits(exercise.dropSet.reduction_percent)}٪
                        </p>
                      ) : null}
                      {exercise.notes ? <p className={styles.workoutExerciseSubline}>{exercise.notes}</p> : null}
                      <div className={styles.workoutExerciseMeta}>
                        <span className={styles.workoutRowStatus} data-status={isComplete ? "completed" : hasExplicitState ? "partial" : "unregistered"}>
                          {isComplete ? "همهٔ ست‌ها ثبت شده" : hasExplicitState ? `${persianDigits(completed.length)} از ${persianDigits(exercise.sets)} ست · ناقص یا ثبت‌شده` : "هنوز چیزی ثبت نشده"}
                        </span>
                        {lastWeight != null ? <span>هفتهٔ قبل: {persianDigits(lastWeight)} کیلوگرم</span> : null}
                        {week > 1 && priorCompleted.length ? <span>{persianDigits(priorCompleted.length)} ست در هفتهٔ قبل</span> : null}
                      </div>
                      <div className={styles.workoutExerciseActions}>
                        <button
                          aria-label={isComplete ? `لغو ثبت کامل ${exercise.name}` : `ثبت همهٔ ست‌های ${exercise.name}`}
                          aria-pressed={isComplete}
                          className={`${styles.workoutActionButton} ${styles.workoutQuickComplete} ${isComplete ? styles.workoutActionButtonDone : ""}`}
                          disabled={!loaded || saving}
                          onClick={() => void toggleExerciseComplete(exercise)}
                          type="button"
                        >
                          {isComplete ? <CheckCircle2 size={16} /> : <Check size={16} />}
                          <span className={styles.visuallyHidden}>{isComplete ? "ثبت شد" : "ثبت همهٔ ست‌ها"}</span>
                        </button>
                        <button
                          aria-label={`ویرایش ست‌های ${exercise.name}`}
                          className={styles.workoutActionButton}
                          disabled={!loaded || saving}
                          onClick={() => setEditExerciseId(exercise.id)}
                          type="button"
                        >
                          ⋯ <span>جزئیات ست‌ها</span>
                        </button>
                        {timedSeconds ? (
                          <button className={styles.workoutActionButton} onClick={() => requestTimer(exercise, "exercise")} type="button">
                            <TimerReset size={15} /> تایمر {formatTime(timedSeconds)}
                          </button>
                        ) : null}
                      </div>
                      {week > 1 ? (
                        <p className={styles.workoutHistory}>
                          {priorLogs.length
                            ? `هفتهٔ قبل: ${priorLogs.map((item) => `ست ${persianDigits(item.set_index + 1)} ${item.completed ? "✓" : "·"}، ${persianDigits(item.reps ?? "—")} تکرار، ${persianDigits(item.weight_kg ?? "—")} کیلو${item.rest_seconds == null ? "" : `، استراحت ${formatTime(item.rest_seconds)}`}`).join(" | ")}`
                            : "برای این حرکت در هفتهٔ قبل جزئیاتی ثبت نشده است."}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={styles.workoutFinishBar}>
              <p>
                {sessionFinished
                  ? current?.status === "completed" ? "این جلسه کامل ثبت شده است." : "این جلسه پایان یافته؛ ست‌های ناقص همان‌طور حفظ شده‌اند."
                  : `پیشرفت این جلسه: ${persianDigits(completedSetCount)} از ${persianDigits(totalSets)} ست. پایان جلسه، موارد ثبت‌نشده را کامل و موارد صریحاً ناقص را حفظ می‌کند.`}
              </p>
              <button
                className={`${styles.workoutActionButton} ${styles.workoutActionButtonPrimary}`}
                disabled={!loaded || saving || sessionFinished}
                onClick={() => void finishSession()}
                type="button"
              >
                <CheckCircle2 size={16} /> {sessionFinished ? "جلسه پایان یافته" : saving ? "در حال ثبت…" : "پایان جلسه"}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.workoutNoVideo}>در این هفته جلسه‌ای بر اساس بازهٔ برنامه زمان‌بندی نشده است.</div>
        )}
      </main>

      <aside className={styles.workoutAside} aria-label="خلاصهٔ پیشرفت">
        <section className={styles.workoutAsideCard}>
          <h3 className={styles.workoutAsideHeading}>جلسهٔ انتخاب‌شده</h3>
          <div className={styles.workoutSelectedProgress}>
            <div>
              <strong>{day?.title || "جلسهٔ تمرین"}</strong>
              <p className={styles.workoutAsideMuted}>{persianDigits(completedSetCount)} از {persianDigits(totalSets)} ست</p>
            </div>
            <div className={styles.workoutRing} style={{ "--workout-progress": `${sessionPercent}%` } as CSSProperties} aria-label={`${persianDigits(sessionPercent)} درصد از ست‌ها`}>
              <strong>{persianDigits(`${sessionPercent}٪`)}</strong>
            </div>
          </div>
          <div className={styles.workoutCourseProgress}>
            <div className={styles.progressSummaryHeader}>
              <span>پیشرفت دوره</span>
              <strong>{persianDigits(endedSessionCount)} از {persianDigits(plannedSessions.length)} جلسه</strong>
            </div>
            <div className={styles.workoutProgressTrack} role="progressbar" aria-label="پیشرفت دوره بر اساس جلسه‌های پایان‌یافته" aria-valuenow={coursePercent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${coursePercent}%` }} />
            </div>
          </div>
        </section>

        <section className={styles.workoutAsideCard}>
          <h3 className={styles.workoutAsideHeading}>مسیر جلسات</h3>
          <p className={styles.workoutAsideMuted}>فقط نوبت‌های موجود در بازهٔ واقعی برنامه نمایش داده شده‌اند.</p>
          <div className={styles.workoutCalendar}>
            {weeks.map((item) => (
              <div
                className={styles.workoutCalendarWeek}
                key={item.week}
                style={{ "--workout-session-count": Math.max(1, item.sessions.length) } as CSSProperties}
              >
                <span className={styles.workoutCalendarWeekLabel}>هفته {persianDigits(item.week)}</span>
                {item.sessions.map((scheduled, index) => {
                  const progress = sessions.find((entry) => entry.week === item.week && entry.day_id === scheduled.day_id);
                  const status = progress?.status ?? "unregistered";
                  const sessionDay = daysById.get(scheduled.day_id);
                  return (
                    <button
                      aria-label={`${sessionDay?.title || `جلسه ${index + 1}`}، هفتهٔ ${persianDigits(item.week)}، ${statusLabel(status)}`}
                      className={styles.workoutCalendarSession}
                      data-current={week === item.week && dayId === scheduled.day_id}
                      data-status={status}
                      key={`${item.week}:${scheduled.day_id}`}
                      onClick={() => {
                        setWeek(item.week);
                        setDayId(scheduled.day_id);
                      }}
                      title={sessionDay?.title || `جلسهٔ ${index + 1}`}
                      type="button"
                    >
                      {status === "completed" || status === "completed_partial" ? <Check size={14} /> : persianDigits(index + 1)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.workoutAsideCard}>
          <h3 className={styles.workoutAsideHeading}>ترکیب حجم برنامه</h3>
          <p className={styles.workoutAsideMuted}>سهم ست‌های تجویزشده بر اساس عضلهٔ اصلی کاتالوگ؛ این شاخص فشار یا رشد واقعی عضله نیست.</p>
          <div className={styles.workoutMuscleList}>
            {muscleShare.length ? muscleShare.map((item) => (
              <div className={styles.workoutMuscleItem} key={item.name}>
                <span>{item.name}</span><strong>{persianDigits(`${item.percent}٪`)}</strong>
                <div className={styles.workoutProgressTrack} aria-hidden><span style={{ width: `${item.percent}%` }} /></div>
              </div>
            )) : <p className={styles.workoutAsideMuted}>عضلهٔ اصلی برای حرکات این برنامه در دسترس نیست.</p>}
          </div>
        </section>

        <section className={styles.workoutAsideCard}>
          <h3 className={styles.workoutAsideHeading}>پیشرفت همین جلسه</h3>
          <p className={styles.workoutAsideMuted}>{persianDigits(`${sessionPercent}٪`)} از ست‌های این جلسه ثبت شده؛ پایان جلسه جداگانه ذخیره می‌شود.</p>
          <div className={styles.workoutProgressTrack} role="progressbar" aria-label="پیشرفت ست‌های جلسهٔ انتخاب‌شده" aria-valuenow={sessionPercent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${sessionPercent}%` }} />
          </div>
        </section>

        <label className={styles.workoutReducedMotion}>
          <input checked={motionEnabled} disabled={reducedMotion} onChange={(event) => setMotionEnabled(event.target.checked)} type="checkbox" />
          پیش‌نمایش‌های متحرک
        </label>
      </aside>

      <details className={styles.workoutAttribution}>
        <summary>منابع ویدئوها و مجوزها</summary>
        <div className={styles.workoutAttributionList}>
          {allMedia.map((media) => (
            <p key={media.key}>
              <strong>{media.title}</strong> — {media.attribution.author} · {media.attribution.license} · {media.attribution.changes} · <a href={media.attribution.source_url} rel="noreferrer" target="_blank">منبع</a> · <a href={media.attribution.license_url} rel="noreferrer" target="_blank">مجوز</a>
              {media.attribution.disclaimer ? <><br /><span>{media.attribution.disclaimer}</span></> : null}
            </p>
          ))}
          {!allMedia.length ? <p>برای حرکت‌های این برنامه فایل عمومی پیوندخورده‌ای وجود ندارد.</p> : null}
        </div>
      </details>

      <WorkoutTimerControl>
      <button
        aria-label={
          timerOpen
            ? "بستن پنل تایمر"
            : `بازکردن تایمر تمرین${activeTimer ? `، ${formatTime(timerRemaining)}` : ""}`
        }
        className={styles.workoutTimerFab}
        onClick={() => setTimerOpen((open) => !open)}
        type="button"
      >
        <Clock3 size={18} />
        <span className={styles.workoutTimerFabLabel}>
          {activeTimer ? formatTime(timerRemaining) : "تایمر"}
        </span>
        {activeTimer ? (
          <span className={styles.workoutTimerFabCountdown}>{formatTime(timerRemaining)}</span>
        ) : null}
      </button>
      </WorkoutTimerControl>

      {timerOpen ? (
        <TimerPanel
          activeTimer={activeTimer}
          customMinutes={customMinutes}
          customSeconds={customSeconds}
          draftKind={timerDraftKind}
          draftSeconds={timerDraftSeconds}
          onClose={() => setTimerOpen(false)}
          onCustomMinutes={setCustomMinutes}
          onCustomSeconds={setCustomSeconds}
          onDraftKind={setTimerDraftKind}
          onDraftSeconds={setTimerDraftSeconds}
          onPause={pauseTimer}
          onReset={resetTimer}
          onResume={resumeTimer}
          onStart={(seconds, kind) => startTimer(seconds, kind, activeTimer?.exerciseId)}
          remaining={timerRemaining}
        />
      ) : null}

      {editExercise ? (
        <SetEditorDialog
          exercise={editExercise}
          isSaving={saving}
          onCancel={() => setEditExerciseId(null)}
          onChange={(index, patch) => {
            const key = createDraftKey(week, day?.id ?? "", editExercise.id, index);
            const row = currentSetRows.find((item) => item.index === index);
            if (!row) return;
            setSetDrafts((items) => ({
              ...items,
              [key]: {
                reps: patch.reps ?? row.reps,
                weight: patch.weight ?? row.weight,
                completed: patch.completed ?? row.completed
              }
            }));
          }}
          onSave={() => void saveSetEditor()}
          rows={currentSetRows}
        />
      ) : null}

      {activeExercise ? (
        <LessonDialog
          exercise={activeExercise}
          index={lessonVideoIndex}
          isSaving={saving}
          onClose={() => setLessonExerciseId(null)}
          onComplete={async () => {
            const existing = new Map((current?.set_logs?.[activeExercise.id] ?? []).map((item) => [item.set_index, item]));
            const all = Array.from({ length: Math.max(0, activeExercise.sets) }, (_, set_index) => {
              const previous = existing.get(set_index);
              return {
                set_index,
                completed: true,
                reps: previous?.reps ?? null,
                weight_kg: previous?.weight_kg ?? null,
                rest_seconds: previous?.rest_seconds ?? null
              };
            });
            const saved = await saveExerciseProgress(activeExercise, all);
            if (saved) setLessonExerciseId(null);
          }}
          onSelect={(exercise) => setLessonExerciseId(exercise.id)}
          exercises={dayExercises}
          poster={lessonPoster}
          source={lessonSource}
          tab={lessonTab}
          onTab={setLessonTab}
        />
      ) : null}
    </section>
  );
}

function statusLabel(status: string): string {
  if (status === "completed") return "کامل‌شده";
  if (status === "completed_partial") return "پایان‌یافته با ست ناقص";
  if (status === "in_progress") return "در حال انجام";
  return "شروع‌نشده";
}

function LoopingPreview({
  enabled,
  paused,
  poster,
  source
}: {
  enabled: boolean;
  paused: boolean;
  poster: string;
  source: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [intersecting, setIntersecting] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [failed, setFailed] = useState(false);
  const canPlay = enabled && !paused && pageVisible && intersecting && !failed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
      rootMargin: "120px 0px",
      threshold: 0.01
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (canPlay) void video.play().catch(() => setFailed(true));
    else video.pause();
  }, [canPlay]);

  if (failed) {
    return poster ? <img src={poster} alt="" /> : <span className={styles.workoutPreviewFallback}><Dumbbell size={20} />پیش‌نمایش در دسترس نیست</span>;
  }
  return (
    <video
      aria-hidden="true"
      autoPlay={canPlay}
      loop
      muted
      playsInline
      poster={poster || undefined}
      preload={canPlay ? "metadata" : "none"}
      ref={videoRef}
      src={canPlay ? source : undefined}
      onError={() => setFailed(true)}
    />
  );
}

function TimerPanel({
  activeTimer,
  customMinutes,
  customSeconds,
  draftKind,
  draftSeconds,
  onClose,
  onCustomMinutes,
  onCustomSeconds,
  onDraftKind,
  onDraftSeconds,
  onPause,
  onReset,
  onResume,
  onStart,
  remaining
}: {
  activeTimer: ActiveTimer | null;
  customMinutes: string;
  customSeconds: string;
  draftKind: "rest" | "exercise";
  draftSeconds: number;
  onClose: () => void;
  onCustomMinutes: (value: string) => void;
  onCustomSeconds: (value: string) => void;
  onDraftKind: (value: "rest" | "exercise") => void;
  onDraftSeconds: (value: number) => void;
  onPause: () => void;
  onReset: () => void;
  onResume: () => void;
  onStart: (seconds: number, kind: "rest" | "exercise") => void;
  remaining: number;
}) {
  const [customError, setCustomError] = useState("");
  const applyCustom = () => {
    const minutes = Number(normalizeDigits(customMinutes));
    const seconds = Number(normalizeDigits(customSeconds));
    const total = minutes * 60 + seconds;
    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || seconds < 0 || seconds > 59 || total < 1 || total > 7200) {
      setCustomError("زمان باید بین ۱ ثانیه تا ۲ ساعت باشد.");
      return;
    }
    setCustomError("");
    onStart(total, draftKind);
  };
  return (
    <section className={styles.workoutTimerPanel} aria-label="کنترل تایمر">
      <div className={styles.workoutTimerPanelHeader}>
        <strong>{activeTimer ? activeTimer.kind === "rest" ? "تایمر استراحت" : "تایمر تمرین" : "تنظیم تایمر"}</strong>
        <button className={styles.workoutDialogClose} aria-label="بستن پنل تایمر" onClick={onClose} type="button"><X size={17} /></button>
      </div>
      {activeTimer ? <output className={styles.workoutTimerValue} aria-live="polite">{formatTime(remaining)}</output> : null}
      <div className={styles.workoutTimerActions}>
        {activeTimer?.status === "running" ? <button className={styles.workoutActionButton} onClick={onPause} type="button"><Pause size={15} /> مکث</button> : null}
        {activeTimer?.status === "paused" ? <button className={styles.workoutActionButtonPrimary + " " + styles.workoutActionButton} onClick={onResume} type="button"><Play size={15} /> ادامه</button> : null}
        {activeTimer ? <button className={styles.workoutActionButton} onClick={onReset} type="button"><RotateCcw size={15} /> بازنشانی</button> : null}
      </div>
      <div className={styles.workoutTimerPresets} aria-label="زمان‌های آماده">
        {[30, 45, 60, 90].map((seconds) => (
          <button
            aria-pressed={draftSeconds === seconds}
            className={styles.workoutActionButton}
            key={seconds}
            onClick={() => onDraftSeconds(seconds)}
            type="button"
          >
            {persianDigits(seconds)} ثانیه
          </button>
        ))}
      </div>
      <div className={styles.workoutTimerActions}>
        <button aria-pressed={draftKind === "rest"} className={styles.workoutActionButton} onClick={() => onDraftKind("rest")} type="button">استراحت</button>
        <button aria-pressed={draftKind === "exercise"} className={styles.workoutActionButton} onClick={() => onDraftKind("exercise")} type="button">تمرین زمان‌دار</button>
        <button className={styles.workoutActionButtonPrimary + " " + styles.workoutActionButton} onClick={() => onStart(draftSeconds, draftKind)} type="button"><Play size={14} /> شروع</button>
      </div>
      <div className={styles.workoutTimerCustom}>
        <label>دقیقه <input inputMode="numeric" max="120" min="0" onChange={(event) => onCustomMinutes(event.target.value)} type="number" value={customMinutes} /></label>
        <label>ثانیه <input inputMode="numeric" max="59" min="0" onChange={(event) => onCustomSeconds(event.target.value)} type="number" value={customSeconds} /></label>
        <button className={styles.workoutActionButton} onClick={applyCustom} type="button">شروع زمان دلخواه</button>
      </div>
      {customError ? <p className={styles.workoutMessage} role="alert">{customError}</p> : null}
      <p className={styles.workoutAsideMuted}>بستن این پنل شمارش را متوقف نمی‌کند؛ پایان تایمر به‌تنهایی ست یا جلسه را ثبت نمی‌کند.</p>
    </section>
  );
}

function SetEditorDialog({
  exercise,
  isSaving,
  onCancel,
  onChange,
  onSave,
  rows
}: {
  exercise: TrainingExercise;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (index: number, patch: Partial<SetDraft>) => void;
  onSave: () => void;
  rows: Array<{ key: string; index: number; completed: boolean; reps: string; weight: string; restSeconds: number | null }>;
}) {
  const dialogRef = useAccessibleDialog(onCancel);
  return createPortal(
    <div className={styles.workoutDialogBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section aria-label={`ثبت جزئیات ${exercise.name}`} aria-modal="true" className={styles.workoutSetDialog} ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className={styles.workoutDialogHeader}>
          <div><h2>ثبت عملکرد: {exercise.name}</h2><p>ست‌هایی که انجام نشده یا ناقص بوده را صریحاً علامت بزن.</p></div>
          <button aria-label="بستن" className={styles.workoutDialogClose} onClick={onCancel} type="button"><X size={19} /></button>
        </header>
        <div className={styles.workoutSetEditorList}>
          {rows.map((row) => (
            <div className={styles.workoutSetEditorRow} key={row.index}>
              <label>
                <input checked={row.completed} onChange={(event) => onChange(row.index, { completed: event.target.checked })} type="checkbox" />
                ست {persianDigits(row.index + 1)}
              </label>
              <span className={styles.workoutRowStatus}>{row.completed ? "انجام‌شده" : "ناقص / انجام‌نشده"}</span>
              <div className={styles.workoutSetEditorFields}>
                <label>تکرار واقعی<input inputMode="numeric" min="0" onChange={(event) => onChange(row.index, { reps: event.target.value })} type="number" value={row.reps} /></label>
                <label>وزنهٔ واقعی (کیلوگرم)<input inputMode="decimal" min="0" step="0.25" onChange={(event) => onChange(row.index, { weight: event.target.value })} type="number" value={row.weight} /></label>
              </div>
            </div>
          ))}
        </div>
        <footer className={styles.workoutDialogFooter}>
          <button className={styles.workoutActionButton} disabled={isSaving} onClick={onCancel} type="button">انصراف</button>
          <button className={styles.workoutActionButtonPrimary + " " + styles.workoutActionButton} disabled={isSaving} onClick={onSave} type="button">{isSaving ? "در حال ثبت…" : "ذخیرهٔ ست‌ها"}</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function LessonDialog({
  exercise,
  index,
  isSaving,
  onClose,
  onComplete,
  onSelect,
  exercises,
  poster,
  source,
  tab,
  onTab
}: {
  exercise: TrainingExercise;
  index: number;
  isSaving: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
  onSelect: (exercise: TrainingExercise) => void;
  exercises: TrainingExercise[];
  poster: string;
  source: string;
  tab: LessonTab;
  onTab: (tab: LessonTab) => void;
}) {
  const dialogRef = useAccessibleDialog(onClose);
  const media = getExerciseMedia(exercise);
  const steps = guideSteps(exercise);
  const tips = media?.education?.tips ?? [];
  const mistakes = media?.education?.mistakes ?? [];
  const durationSeconds = prescribedExerciseSeconds(exercise);
  const prior = index > 0 ? exercises[index - 1] : null;
  const next = index < exercises.length - 1 ? exercises[index + 1] : null;

  return createPortal(
    <div className={styles.workoutDialogBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-label={`آموزش حرکت ${exercise.name}`} aria-modal="true" className={styles.workoutLessonDialog} ref={dialogRef} role="dialog" tabIndex={-1}>
        <aside className={styles.workoutLessonInfo}>
          <header className={styles.workoutLessonInfoHeader}>
            <div><small>حرکت را بهتر بشناس</small><h2>{exercise.name}</h2></div>
            <button aria-label="بستن آموزش" className={styles.workoutDialogClose} onClick={onClose} type="button"><X size={19} /></button>
          </header>
          <div className={styles.workoutLessonTags}>
            {exercise.targetMuscle ? <span>{exercise.targetMuscle}</span> : null}
            {exercise.trainingGroupName ? <span>{exercise.trainingGroupName}</span> : null}
            {exercise.reps ? <span>{exercise.reps} تکرار</span> : null}
          </div>
          <div className={styles.workoutLessonContentArea}>
            <div className={styles.workoutLessonTabs} role="tablist" aria-label="بخش‌های آموزش">
              <button aria-selected={tab === "steps"} onClick={() => onTab("steps")} role="tab" type="button">اجرای درست</button>
              <button aria-selected={tab === "tips"} onClick={() => onTab("tips")} role="tab" type="button">نکات مهم</button>
              <button aria-selected={tab === "mistakes"} onClick={() => onTab("mistakes")} role="tab" type="button">اشتباهات</button>
            </div>
            <div className={styles.workoutLessonContent}>
              {tab === "steps" ? (
                <>
                  <h3>اجرای درست</h3>
                  {media?.education?.description ? <p>{media.education.description}</p> : null}
                  {steps.length ? <ol>{steps.map((step) => <li key={`${step.at_seconds}-${step.title}`}><strong>{step.title}</strong>{step.text}</li>)}</ol> : <p>راهنمای اجرای عمومی برای این حرکت ثبت نشده است؛ دستور مربی را ملاک قرار بده.</p>}
                </>
              ) : null}
              {tab === "tips" ? (
                <>
                  <h3>نکات مهم</h3>
                  {tips.length ? <ul>{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : <p>نکتهٔ عمومی اضافه‌ای ثبت نشده است؛ محدودیت‌های فردی و دستور مربی را رعایت کن.</p>}
                </>
              ) : null}
              {tab === "mistakes" ? (
                <>
                  <h3>اشتباهات رایج</h3>
                  {mistakes.length ? <ul>{mistakes.map((item) => <li key={item.title}><strong>{item.title}</strong>{item.text}</li>)}</ul> : <p>اشتباه رایج مشخصی برای این حرکت ثبت نشده است؛ اگر فرم حرکت درد ایجاد کرد، متوقف شو و با مربی هماهنگ کن.</p>}
                </>
              ) : null}
            </div>
          </div>
          <div className={styles.workoutLessonPrescription}>
            <div><strong>{persianDigits(exercise.sets)}</strong><span>ست</span></div>
            <div><strong>{exercise.reps || "—"}</strong><span>{durationSeconds ? "زمان هدف" : "تکرار"}</span></div>
            <div><strong>{exercise.rest || "—"}</strong><span>استراحت</span></div>
          </div>
          <div className={styles.workoutLessonCompleteAction}>
            <button className={styles.workoutActionButtonPrimary + " " + styles.workoutActionButton} disabled={isSaving} onClick={() => void onComplete()} type="button">
              <Check size={15} /> {isSaving ? "در حال ثبت…" : "ثبت همهٔ ست‌ها"}
            </button>
          </div>
        </aside>

        <div className={styles.workoutLessonPlayer}>
          <header className={styles.workoutLessonPlayerHeader}>
            <strong>Athlore</strong>
            <span>{persianDigits(index + 1)} از {persianDigits(exercises.length)}</span>
          </header>
          <LessonVideo
            key={exercise.id}
            attribution={media?.attribution}
            exerciseName={exercise.name}
            poster={poster}
            source={source}
            steps={steps}
          />
          <footer className={styles.workoutLessonPlayerFooter}>
            <button disabled={!prior} onClick={() => prior && onSelect(prior)} type="button">‹ قبلی</button>
            <button disabled={!next} onClick={() => next && onSelect(next)} type="button">بعدی ›</button>
          </footer>
        </div>
      </section>
    </div>,
    document.body
  );
}

function WorkoutTimerControl({ children }: { children: React.ReactNode }) {
  const header = document.getElementById("student-workout-tools");
  return header ? createPortal(children, header) : children;
}

function LessonVideo({
  attribution,
  exerciseName,
  poster,
  source,
  steps
}: {
  attribution?: ExerciseMedia["attribution"];
  exerciseName: string;
  poster: string;
  source: string;
  steps: Array<{ at_seconds: number; title: string; text: string }>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const embedId = youtubeId(source);
  const currentCue = [...steps].reverse().find((step) => step.at_seconds <= currentTime) ?? steps[0];

  useEffect(() => {
    const video = videoRef.current;
    if (!source || !video) return undefined;
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    return () => video.pause();
  }, [source]);

  return (
    <>
      <div className={styles.workoutLessonStage}>
        {embedId ? (
          <iframe
            title={`ویدئوی ${exerciseName}`}
            src={`https://www.youtube-nocookie.com/embed/${embedId}?playsinline=1&rel=0`}
            allow="encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : source && !failed ? (
          <video
            aria-label={`ویدئوی ${exerciseName}`}
            autoPlay
            muted
            playsInline
            poster={poster || undefined}
            preload="metadata"
            ref={videoRef}
            src={source}
            onError={() => setFailed(true)}
            onLoadedMetadata={(event) => {
              const value = event.currentTarget.duration;
              setDuration(Number.isFinite(value) ? value : 0);
            }}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onTimeUpdate={(event) => {
              const time = event.currentTarget.currentTime;
              setCurrentTime(time);
            }}
          />
        ) : poster ? (
          <img src={poster} alt={`پوستر ${exerciseName}`} />
        ) : (
          <div className={styles.workoutNoVideo}><Dumbbell size={22} />ویدئوی دقیق این حرکت موجود نیست.</div>
        )}
        {source && !embedId && !failed && currentCue ? <div className={styles.workoutLessonCue}><strong>{currentCue.title}</strong><span>{currentCue.text}</span></div> : null}
        <span className={styles.visuallyHidden}>{exerciseName}</span>
      </div>
      <div className={styles.workoutVideoControls}>
        {source && !embedId && !failed ? (
          <>
            <div className={styles.workoutVideoTimeline}>
              <span>{formatTime(currentTime)}</span>
              <input
                aria-label="موقعیت پخش ویدئو"
                max={duration || 1}
                min="0"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (videoRef.current && Number.isFinite(next)) videoRef.current.currentTime = next;
                  setCurrentTime(next);
                }}
                step="0.1"
                type="range"
                value={Math.min(currentTime, duration || currentTime)}
              />
              <span>{formatTime(duration)}</span>
            </div>
            <div className={styles.workoutVideoControlActions}>
              <button onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play().catch(() => setPlaying(false));
                else video.pause();
              }} type="button">{playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "مکث" : "پخش"}</button>
              <span aria-live="off">{steps.length ? `${steps.filter((step) => step.at_seconds <= currentTime).length || 1} نکتهٔ راهنما` : "آموزش عمومی موجود نیست"}</span>
            </div>
          </>
        ) : null}
        <div className={styles.workoutVideoControlActions}>
          <span>{failed ? "پخش ویدئو در دسترس نیست؛ تصویر ثابت نمایش داده شده است." : ""}</span>
          <span>{embedId ? <a href={source} rel="noopener noreferrer" target="_blank">ویدئو از منبع اصلی پخش می‌شود؛ اگر باز نشد اینجا بزن</a> : attribution ? <a href={attribution.source_url} rel="noreferrer" target="_blank">منبع و مجوز ویدئو</a> : "ویدئوی ثبت‌شده برای این حرکت"}</span>
        </div>
      </div>
    </>
  );
}
