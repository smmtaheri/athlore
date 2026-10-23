import { useEffect, useState } from "react";
import { Button, Card, Checkbox, FormField, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import type { GeneratedProgram, TrainingExercise } from "../../programs/types/generatedProgram";
import styles from "./studentPortal.module.css";

interface SessionProgress {
  week: number;
  day_id: string;
  completed_sets: Record<string, number[]>;
}

export function InteractiveWorkout({ program }: { program: GeneratedProgram }) {
  const days = program.training?.days ?? [];
  const [week, setWeek] = useState(1);
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [sessions, setSessions] = useState<SessionProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [timerEnd, setTimerEnd] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const [timerSeconds, setTimerSeconds] = useState(90);
  useEffect(() => {
    let active = true;
    apiRequest<{ sessions: SessionProgress[]; version_id: string }>(
      `/me/programs/${program.id}/workout-progress/`
    )
      .then((result) => {
        if (active) {
          if (result.version_id !== program.programVersionId) {
            setMessage("نسخهٔ برنامه تغییر کرده؛ صفحه را دوباره باز کنید.");
            return;
          }
          setSessions(result.sessions);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "دریافت پیشرفت انجام نشد؛ برای جلوگیری از ثبت نادرست، صفحه را دوباره باز کنید."
          );
      });
    return () => {
      active = false;
    };
  }, [program.id, program.programVersionId]);
  useEffect(() => {
    if (!timerEnd) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timerEnd]);
  const day = days.find((item) => item.id === dayId) ?? days[0];
  const current = sessions.find((item) => item.week === week && item.day_id === day?.id);
  const total = day?.exercises.reduce((sum, item) => sum + item.sets, 0) ?? 0;
  const done = Object.values(current?.completed_sets ?? {}).reduce(
    (sum, items) => sum + items.length,
    0
  );
  const weeks = program.durationWeeks ?? 4;
  const courseTotal =
    days.reduce(
      (sum, item) => sum + item.exercises.reduce((sets, exercise) => sets + exercise.sets, 0),
      0
    ) * weeks;
  const courseDone = sessions.reduce(
    (sum, session) =>
      sum + Object.values(session.completed_sets).reduce((sets, items) => sets + items.length, 0),
    0
  );
  const remaining = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : timerSeconds;
  const save = async (exercise: TrainingExercise, index: number, checked: boolean) => {
    if (!loaded || saving || !day) return;
    const before = current?.completed_sets[exercise.id] ?? [];
    const completed = checked ? [...before, index] : before.filter((i) => i !== index);
    const replaceSession = (items: SessionProgress[], replacement: SessionProgress) => [
      ...items.filter(
        (item) => !(item.week === replacement.week && item.day_id === replacement.day_id)
      ),
      replacement
    ];
    const previous = current ?? { week, day_id: day.id, completed_sets: {} };
    setSessions((items) =>
      replaceSession(items, {
        ...previous,
        completed_sets: { ...previous.completed_sets, [exercise.id]: completed }
      })
    );
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
            completed_sets: completed
          }
        }
      );
      setSessions((items) => replaceSession(items, result));
    } catch {
      setSessions((items) => replaceSession(items, previous));
      setMessage("ثبت ست انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={styles.stack} aria-label="تمرین تعاملی">
      <Card>
        <div className={styles.programDetailMeta}>
          <FormField label="هفتهٔ دوره" htmlFor="workout-week">
            <Select
              id="workout-week"
              value={String(week)}
              options={Array.from({ length: weeks }, (_, i) => ({
                value: String(i + 1),
                label: `هفتهٔ ${i + 1}`
              }))}
              onChange={(e) => setWeek(Number(e.target.value))}
            />
          </FormField>
          <FormField label="جلسهٔ تمرین" htmlFor="workout-day">
            <Select
              id="workout-day"
              value={day?.id ?? ""}
              options={days.map((item) => ({ value: item.id, label: item.title }))}
              onChange={(e) => setDayId(e.target.value)}
            />
          </FormField>
          <span role="status">
            {done} از {total} ست انجام شده
          </span>
          <progress aria-label="پیشرفت جلسه" value={done} max={Math.max(1, total)} />
        </div>
        <p>
          پیشرفت کل دوره: {courseDone} از {courseTotal} ست
        </p>
        <progress aria-label="پیشرفت دوره" value={courseDone} max={Math.max(1, courseTotal)} />
        {total > 0 && done === total ? <p role="status">این جلسه کامل شد. آفرین!</p> : null}
      </Card>
      {message ? (
        <p role="alert" className={styles.errorAlert}>
          {message}
        </p>
      ) : null}
      <Card>
        <h3>تایمر استراحت</h3>
        <div className={styles.programDetailMeta}>
          <Select
            aria-label="مدت استراحت"
            value={String(timerSeconds)}
            options={[30, 45, 60, 90, 120, 180].map((seconds) => ({
              value: String(seconds),
              label: `${seconds} ثانیه`
            }))}
            onChange={(e) => {
              setTimerSeconds(Number(e.target.value));
              setTimerEnd(undefined);
            }}
          />
          <output aria-label="زمان باقی‌مانده">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </output>
          <Button
            onClick={() => {
              setNow(Date.now());
              setTimerEnd(Date.now() + timerSeconds * 1000);
            }}
          >
            شروع / شروع دوباره
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setTimerSeconds(remaining);
              setTimerEnd(undefined);
            }}
          >
            توقف
          </Button>
          {timerEnd && remaining === 0 ? <span role="status">زمان استراحت تمام شد.</span> : null}
        </div>
      </Card>
      {day?.notes ? <p>{day.notes}</p> : null}
      {day?.exercises.map((exercise, index) => (
        <Card key={exercise.id}>
          <details open={index === 0}>
            <summary>
              <strong>
                {index + 1}. {exercise.name}
              </strong>{" "}
              · {exercise.sets} ست × {exercise.reps} · استراحت {exercise.rest}
            </summary>
            {exercise.trainingGroupName || exercise.supersetGroupId ? (
              <p>
                گروه تمرینی: {exercise.trainingGroupName ?? "سوپرست"}؛ حرکت‌های این گروه را با ترتیب
                نوشته‌شده اجرا کنید.
              </p>
            ) : null}
            {exercise.dropSet ? (
              <p>
                دراپ‌ست: {exercise.dropSet.drops} مرحله، کاهش {exercise.dropSet.reduction_percent}٪
              </p>
            ) : null}
            <p>{exercise.notes}</p>
            <div className={styles.programDetailMeta}>
              {Array.from({ length: Math.max(0, Math.min(100, exercise.sets)) }, (_, i) => (
                <Checkbox
                  key={i}
                  label={`ست ${i + 1}`}
                  checked={(current?.completed_sets[exercise.id] ?? []).includes(i)}
                  disabled={!loaded || saving}
                  onChange={(e) => void save(exercise, i, e.target.checked)}
                />
              ))}
            </div>
            {exercise.tutorial_url ? (
              <video
                style={{ maxWidth: "100%", maxHeight: 400 }}
                controls
                playsInline
                preload="none"
                src={exercise.tutorial_url}
                aria-label={`آموزش ${exercise.name}`}
              />
            ) : null}
            {Object.entries(exercise.execution_guide ?? {}).map(([key, text]) => (
              <p key={key}>{text}</p>
            ))}
          </details>
        </Card>
      ))}
      <p className={styles.muted}>
        پیشرفت شما برای همین هفته، جلسه و نسخهٔ برنامه در حساب شما ذخیره می‌شود.
      </p>
    </section>
  );
}
