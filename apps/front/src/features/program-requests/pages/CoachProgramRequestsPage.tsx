import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarClock, ClipboardList, Dumbbell, RefreshCcw, UserRound } from "lucide-react";
import { Button, Card, EmptyState, Modal, Skeleton, StatusBadge } from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { programRequestRepository } from "../services/programRequestRepository";
import type {
  ProgramAssessmentMode,
  ProgramRequest,
  ProgramRequestSection
} from "../types/programRequest";
import styles from "../components/programRequest.module.css";

const statusLabels: Record<ProgramRequest["status"], string> = {
  submitted: "درخواست جدید",
  awaiting_info: "در انتظار اطلاعات یا ویزیت",
  in_progress: "در حال آماده‌سازی",
  fulfilled: "تکمیل‌شده",
  cancelled: "لغوشده"
};

const sectionLabels: Record<ProgramRequestSection, string> = {
  workout: "تمرینی",
  nutrition: "غذایی",
  supplement: "مکمل"
};

const equipmentLabels: Record<string, string> = {
  full_gym: "باشگاه کامل",
  bodyweight_only: "فقط وزن بدن",
  dumbbell: "دمبل",
  barbell: "هالتر",
  cable: "کابل",
  machines: "دستگاه",
  resistance_band: "کش"
};

const environmentLabels: Record<string, string> = {
  gym: "باشگاه",
  home: "خانه",
  outdoors: "فضای باز",
  other: "محیط دیگر"
};

export function CoachProgramRequestsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProgramRequest[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ProgramRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    programRequestRepository
      .listCoach()
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setUnreadCount(result.unreadCount);
        setError("");
        if (result.unreadCount > 0) {
          void programRequestRepository
            .markCoachQueueRead(result.items.filter((item) => !item.readAt).map((item) => item.id))
            .then(() => {
              if (!active) return;
              const readAt = new Date().toISOString();
              setItems((current) =>
                current.map((item) => ({ ...item, readAt: item.readAt ?? readAt }))
              );
              setUnreadCount(0);
            })
            .catch(() => undefined);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof ApiError
            ? persianMessageForApiError(cause)
            : "دریافت درخواست‌ها انجام نشد. دوباره تلاش کنید."
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  };

  const openAssessment = async (item: ProgramRequest, mode: ProgramAssessmentMode) => {
    setBusyId(item.id);
    setError("");
    try {
      const current = await programRequestRepository.getCoach(item.id);
      if (mode === "none") {
        await programRequestRepository.startCoach(item.id, mode);
        const visitQuery = current.visitId ? `&visitId=${encodeURIComponent(current.visitId)}` : "";
        navigate(
          `/programs/new?studentId=${encodeURIComponent(item.studentId)}&programRequestId=${encodeURIComponent(item.id)}${visitQuery}`
        );
        return;
      }
      await programRequestRepository.startCoach(item.id, mode, current.visitId ?? undefined);
      const query = `?programRequestId=${encodeURIComponent(item.id)}&assessmentMode=${mode}`;
      const path = current.visitId
        ? `/students/${encodeURIComponent(item.studentId)}/visits/${encodeURIComponent(current.visitId)}/edit${query}`
        : `/students/${encodeURIComponent(item.studentId)}/visits/new${query}`;
      navigate(path);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? persianMessageForApiError(cause)
          : "شروع رسیدگی به درخواست انجام نشد. دوباره تلاش کنید."
      );
    } finally {
      setBusyId("");
    }
  };

  const cancelRequest = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setError("");
    try {
      await programRequestRepository.cancelCoach(cancelTarget.id);
      const remaining = items.filter((item) => item.id !== cancelTarget.id);
      setItems(remaining);
      setUnreadCount(remaining.filter((item) => !item.readAt).length);
      setNotice(`درخواست ${cancelTarget.studentName} لغو شد.`);
      setCancelTarget(null);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? persianMessageForApiError(cause)
          : "لغو درخواست انجام نشد. دوباره تلاش کنید."
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>صف رسیدگی مربی</p>
        <h1>درخواست‌های برنامه</h1>
        <p>
          درخواست‌های شاگردها و برنامه‌هایی که به‌زودی یا اخیراً به پایان رسیده‌اند را از داشبورد
          پیگیری کنید.
        </p>
      </header>

      {error ? (
        <Card className={styles.errorCard} padding="md" role="alert">
          <span>{error}</span>
          <Button onClick={reload} variant="secondary">
            تلاش دوباره
          </Button>
        </Card>
      ) : null}
      {notice ? (
        <Card className={styles.feedback} padding="md" role="status">
          {notice}
        </Card>
      ) : null}

      {loading ? (
        <Card padding="lg">
          <Skeleton height={180} />
        </Card>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            action={
              <Button iconStart={<RefreshCcw size={18} />} onClick={reload} variant="secondary">
                بازخوانی
              </Button>
            }
            description="با ثبت درخواست از طرف شاگرد، مورد اینجا قرار می‌گیرد. پایان برنامه به‌تنهایی درخواست جدید نمی‌سازد."
            title="درخواست بازی وجود ندارد"
          />
        </Card>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className={styles.queueSummary}>
            <StatusBadge variant={unreadCount ? "warning" : "info"}>
              {unreadCount} درخواست خوانده‌نشده
            </StatusBadge>
            <StatusBadge variant="neutral">{items.length} درخواست باز</StatusBadge>
          </div>
          <div className={styles.coachQueue}>
            {items.map((item) => (
              <Card className={styles.requestCard} key={item.id} padding="lg">
                <div className={styles.statusLine}>
                  <div className={styles.studentHeading}>
                    <UserRound aria-hidden="true" size={20} />
                    <h2>{item.studentName}</h2>
                  </div>
                  <StatusBadge variant={item.readAt ? "info" : "warning"}>
                    {item.readAt
                      ? statusLabels[item.status]
                      : "جدید · " + statusLabels[item.status]}
                  </StatusBadge>
                </div>
                <div className={styles.requestMeta}>
                  <span>
                    <Dumbbell aria-hidden="true" size={16} />
                    {item.sections.map((section) => sectionLabels[section]).join("، ")}
                  </span>
                  <span>
                    <CalendarClock aria-hidden="true" size={16} />
                    {assessmentLabel(item.assessmentMode)}
                  </span>
                  <span>{purposeLabel(item.purpose)}</span>
                  {item.trainingEnvironment ? (
                    <span>
                      محیط:{" "}
                      {environmentLabels[item.trainingEnvironment] ?? item.trainingEnvironment}
                    </span>
                  ) : null}
                  {item.sessionsPerWeek ? <span>{item.sessionsPerWeek} جلسه در هفته</span> : null}
                  {item.sessionDurationMinutes ? (
                    <span>{item.sessionDurationMinutes} دقیقه برای هر جلسه</span>
                  ) : null}
                  {item.equipmentAvailable.length ? (
                    <span>
                      تجهیزات:{" "}
                      {item.equipmentAvailable
                        .map((value) => equipmentLabels[value] ?? value)
                        .join("، ")}
                    </span>
                  ) : null}
                </div>
                {item.goal ? (
                  <p>
                    <strong>هدف:</strong> {item.goal}
                  </p>
                ) : null}
                {item.injuryNotes ? (
                  <p>
                    <strong>آسیب یا محدودیت:</strong> {item.injuryNotes}
                  </p>
                ) : null}
                {item.trainingTimeNotes ? (
                  <p>
                    <strong>زمان تمرین:</strong> {item.trainingTimeNotes}
                  </p>
                ) : null}
                {item.sleepNotes ? (
                  <p>
                    <strong>خواب:</strong> {item.sleepNotes}
                  </p>
                ) : null}
                {item.nutritionNotes ? (
                  <p>
                    <strong>تغذیه و محدودیت‌ها:</strong> {item.nutritionNotes}
                  </p>
                ) : null}
                <div className={styles.requestActions}>
                  <Link
                    className={styles.secondaryAction}
                    to={`/students/${encodeURIComponent(item.studentId)}`}
                  >
                    <UserRound aria-hidden="true" size={17} /> پروندهٔ شاگرد
                  </Link>
                  <Button
                    disabled={busyId === item.id}
                    onClick={() => void openAssessment(item, "online")}
                    variant="secondary"
                  >
                    ویزیت آنلاین
                  </Button>
                  <Button
                    disabled={busyId === item.id}
                    onClick={() => void openAssessment(item, "in_person")}
                    variant="secondary"
                  >
                    ویزیت حضوری
                  </Button>
                  <Button
                    disabled={busyId === item.id}
                    iconStart={<ClipboardList size={17} />}
                    onClick={() => void openAssessment(item, "none")}
                  >
                    ساخت برنامه بدون ویزیت
                  </Button>
                  <Button
                    disabled={busyId === item.id || cancelling}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setCancelTarget(item);
                    }}
                    variant="danger"
                  >
                    لغو درخواست
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
      <Modal
        footer={
          <>
            <Button disabled={cancelling} onClick={() => setCancelTarget(null)} variant="secondary">
              بازگشت
            </Button>
            <Button isLoading={cancelling} onClick={() => void cancelRequest()} variant="danger">
              لغو درخواست
            </Button>
          </>
        }
        onClose={() => {
          if (!cancelling) setCancelTarget(null);
        }}
        open={cancelTarget !== null}
        title="لغو درخواست برنامه؟"
      >
        <p>
          درخواست {cancelTarget?.studentName ?? "شاگرد"} از صف درخواست‌های باز خارج می‌شود و شاگرد
          می‌تواند درخواست تازه‌ای ثبت کند. سابقهٔ درخواست حفظ خواهد شد.
        </p>
        {cancelTarget?.status === "in_progress" ? (
          <p>
            ویزیت و پیش‌نویس‌های مرتبط حذف نمی‌شوند؛ فقط این درخواست دیگر در صف باز قرار نمی‌گیرد.
          </p>
        ) : null}
      </Modal>
    </main>
  );
}

function assessmentLabel(mode: ProgramAssessmentMode): string {
  if (mode === "in_person") return "ترجیح شاگرد: حضوری";
  if (mode === "none") return "بدون نیاز به ویزیت جدید";
  return "ترجیح شاگرد: آنلاین";
}

function purposeLabel(purpose: ProgramRequest["purpose"]): string {
  if (purpose === "first") return "اولین برنامه";
  if (purpose === "revision") return "بازبینی برنامه";
  return "برنامهٔ دورهٔ بعد";
}
