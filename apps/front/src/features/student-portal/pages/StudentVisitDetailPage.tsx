import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { VisitDynamicForm } from "../../students/components/VisitDynamicForm";
import { enabledSectionsFromTemplate } from "../../students/components/visitFormUtils";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { formatVisitDate } from "../utils/studentVisitUi";
import type { VisitFormAnswers } from "../../students/types/visitForm";
import { myVisitsRepository, type MyVisitsRepository } from "../services/myVisitsRepository";
import {
  formatVisitDeadline,
  isVisitOpenForStudent,
  studentVisitStatusLabel,
  studentVisitStatusVariant,
  visitDisplayTitle
} from "../utils/studentVisitUi";
import styles from "../components/studentPortal.module.css";

export function StudentVisitDetailPage({
  repository = myVisitsRepository
}: {
  repository?: MyVisitsRepository;
}) {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<StudentVisit | null>(null);
  const [answers, setAnswers] = useState<VisitFormAnswers>({});
  const [status, setStatus] = useState<"loading" | "loaded" | "error" | "notFound">("loading");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visitId) {
      return;
    }
    let mounted = true;
    repository
      .getById(visitId)
      .then((item) => {
        if (!mounted) return;
        if (!item) {
          setStatus("notFound");
          return;
        }
        setVisit(item);
        setAnswers(item.answers || {});
        setStatus("loaded");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [repository, visitId]);

  const sections = useMemo(() => enabledSectionsFromTemplate(visit?.formTemplateSnapshot), [visit]);
  const open = visit ? isVisitOpenForStudent(visit) : false;
  const expired = Boolean(visit?.isExpired) && visit?.status === "waiting_for_student";
  const deadline = visit ? formatVisitDeadline(visit) : null;

  const statusMessage = (() => {
    if (!visit) return "";
    if (expired) {
      return "مهلت پاسخ به این ویزیت تمام شده است و امکان ویرایش یا ارسال وجود ندارد.";
    }
    if (visit.status === "student_submitted") {
      return "فرم شما ارسال شده و تا شروع بررسی مربی قابل تغییر نیست.";
    }
    if (visit.status === "coach_review") {
      return "فرم در حال بررسی مربی است و امکان تغییر پاسخ‌ها وجود ندارد.";
    }
    if (visit.status === "finalized") {
      return "این ویزیت نهایی شده است. فقط اطلاعات مجاز برای شما نمایش داده می‌شود.";
    }
    return "";
  })();

  const editableAnswersPayload = (): VisitFormAnswers => {
    const editableKeys = new Set(
      sections.flatMap((section) =>
        section.fields.filter((field) => field.studentEditable).map((field) => field.key)
      )
    );
    return Object.fromEntries(Object.entries(answers).filter(([key]) => editableKeys.has(key)));
  };

  const save = async () => {
    if (!visit || !open) return;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const next = await repository.updateAnswers(visit.id, editableAnswersPayload());
      setVisit(next);
      setAnswers(next.answers || {});
      setFeedback("پاسخ‌ها ذخیره شد.");
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "ذخیره انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!visit || !open) return;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      await repository.updateAnswers(visit.id, editableAnswersPayload());
      const next = await repository.submit(visit.id);
      setVisit(next);
      setFeedback("ویزیت برای مربی ارسال شد.");
      navigate(studentPaths.visits);
    } catch (err) {
      setError(err instanceof ApiError ? persianMessageForApiError(err) : "ارسال انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  if (!visitId) {
    return (
      <div className={styles.page}>
        <EmptyState
          action={
            <Button onClick={() => navigate(studentPaths.visits)} variant="secondary">
              بازگشت به ویزیت‌های من
            </Button>
          }
          description="این ویزیت پیدا نشد."
          title="یافت نشد"
        />
      </div>
    );
  }

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
        <EmptyState description="دریافت ویزیت ممکن نشد." title="خطا" />
      </div>
    );
  }
  if (status === "notFound" || !visit) {
    return (
      <div className={styles.page}>
        <EmptyState
          action={
            <Button onClick={() => navigate(studentPaths.visits)} variant="secondary">
              بازگشت به ویزیت‌های من
            </Button>
          }
          description="این ویزیت پیدا نشد."
          title="یافت نشد"
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <nav aria-label="مسیر صفحه" className={styles.breadcrumb}>
          <Link className={styles.breadcrumbLink} to={studentPaths.visits}>
            ویزیت‌های من
          </Link>
          <span aria-hidden>/</span>
          <span>{visitDisplayTitle(visit)}</span>
        </nav>

        <header className={styles.detailHeader}>
          <div className={styles.detailTitleRow}>
            <h1 className={styles.welcomeTitle}>{visitDisplayTitle(visit)}</h1>
            <StatusBadge variant={studentVisitStatusVariant(visit)}>
              {studentVisitStatusLabel(visit)}
            </StatusBadge>
          </div>
          {deadline ? <p className={styles.muted}>مهلت تکمیل: {deadline}</p> : null}
          <p className={styles.muted}>تاریخ ویزیت: {formatVisitDate(visit)}</p>
          <p className={styles.lead}>فقط فیلدهایی که مربی برای شما مجاز کرده نمایش داده می‌شود.</p>
        </header>

        {error ? <div className={styles.errorAlert}>{error}</div> : null}
        {feedback ? <div className={styles.successAlert}>{feedback}</div> : null}
        {statusMessage ? (
          <div className={expired ? styles.warningAlert : styles.infoAlert}>{statusMessage}</div>
        ) : null}
        {open ? (
          <div className={styles.warningAlert}>
            بعد از ارسال، تا شروع بررسی مربی امکان ویرایش ندارید.
          </div>
        ) : null}

        {sections.length > 0 ? (
          <Card>
            <VisitDynamicForm
              answers={answers}
              disabled={!open}
              onAnswersChange={setAnswers}
              respectStudentEditable={open}
              sections={sections}
              showNotes={false}
            />
          </Card>
        ) : (
          <p className={styles.muted}>فیلد قابل‌نمایش برای شما وجود ندارد.</p>
        )}

        <div className={styles.actionBar}>
          <Button onClick={() => navigate(studentPaths.visits)} variant="secondary">
            بازگشت
          </Button>
          {open ? (
            <div className={styles.actionButtons}>
              <Button isLoading={saving} onClick={() => void save()} variant="secondary">
                ذخیره
              </Button>
              <Button isLoading={saving} onClick={() => void submit()}>
                ارسال برای مربی
              </Button>
            </div>
          ) : null}
        </div>
        {open ? (
          <p className={styles.actionBarNote}>
            ذخیره پاسخ‌های شما را نگه می‌دارد؛ ارسال نهایی آن‌ها را برای مربی می‌فرستد.
          </p>
        ) : null}
      </div>
    </div>
  );
}
