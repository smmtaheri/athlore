import { formatCalendarDateTime } from "../../../shared/dates/calendar";
import { useEffect, useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import { Button, Card, EmptyState, Skeleton } from "../../../components/ui";
import { ApiError, persianMessageForVisitApiError } from "../../../shared/api/errors";
import { StudentStatusBadge } from "../components/StudentStatusBadge";
import { StudentVisitForm, type VisitSubmitIntent } from "../components/StudentVisitForm";
import { VisitPhotosPanel } from "../components/VisitPhotosPanel";
import {
  visitFormTemplatesRepository,
  type VisitFormTemplatesRepository
} from "../services/visitFormTemplatesRepository";
import {
  studentVisitsRepository,
  type StudentVisitsRepository
} from "../services/studentVisitsRepository";
import { studentsRepository, type StudentsRepository } from "../services/studentsRepository";
import type { StudentVisit, StudentVisitInput, VisitAnswerRevision } from "../types/monthlyVisit";
import type { Student } from "../types/student";
import type { VisitFormTemplate } from "../types/visitForm";
import { goalLabels, trainingLevelLabels } from "../types/options";
import { programRequestRepository } from "../../program-requests/services/programRequestRepository";
import type { ProgramAssessmentMode } from "../../program-requests/types/programRequest";
import styles from "../components/students.module.css";

function answersLockedForStatus(status: StudentVisit["status"] | undefined): boolean {
  return status === "waiting_for_student" || status === "student_submitted";
}

function withoutLockedAnswers(
  input: StudentVisitInput,
  status: StudentVisit["status"] | undefined
): StudentVisitInput {
  if (!answersLockedForStatus(status)) {
    return input;
  }
  const rest = { ...input };
  delete rest.answers;
  return rest;
}

export interface StudentVisitFormPageProps {
  mode: "create" | "edit";
  studentsRepo?: StudentsRepository;
  templatesRepo?: VisitFormTemplatesRepository;
  visitsRepo?: StudentVisitsRepository;
}

export function StudentVisitFormPage({
  mode,
  studentsRepo = studentsRepository,
  templatesRepo = visitFormTemplatesRepository,
  visitsRepo = studentVisitsRepository
}: StudentVisitFormPageProps) {
  const [answerRevisions, setAnswerRevisions] = useState<VisitAnswerRevision[]>([]);
  const [formTemplates, setFormTemplates] = useState<VisitFormTemplate[]>([]);
  const [latestVisit, setLatestVisit] = useState<StudentVisit | undefined>();
  const [photosUploading, setPhotosUploading] = useState(false);
  const [hasStagedPhotos, setHasStagedPhotos] = useState(false);
  const [routeFeedback, setRouteFeedback] = useState("");
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "notFound">("loading");
  const [student, setStudent] = useState<Student | undefined>();
  const [visit, setVisit] = useState<StudentVisit | undefined>();
  const [photoSessionId] = useState(() => globalThis.crypto.randomUUID());
  const location = useLocation();
  const navigate = useNavigate();
  const { studentId, visitId } = useParams();
  const [searchParams] = useSearchParams();
  const programRequestId = searchParams.get("programRequestId");
  const assessmentMode = (searchParams.get("assessmentMode") ?? "online") as ProgramAssessmentMode;
  const requestQuery = programRequestId
    ? `?programRequestId=${encodeURIComponent(programRequestId)}&assessmentMode=${encodeURIComponent(assessmentMode)}`
    : "";

  const incomingVisitSaved = (location.state as { visitSaved?: string } | null)?.visitSaved ?? "";
  if (incomingVisitSaved && routeFeedback !== incomingVisitSaved) {
    setRouteFeedback(incomingVisitSaved);
  }

  useEffect(() => {
    if (!incomingVisitSaved) {
      return;
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [incomingVisitSaved, location.pathname, navigate]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      studentsRepo.getById(studentId ?? ""),
      visitsRepo.listByStudent(studentId ?? ""),
      templatesRepo.list(),
      mode === "edit" && visitId
        ? visitsRepo.getById(studentId ?? "", visitId)
        : Promise.resolve(null)
    ])
      .then(async ([studentResult, visits, templates, visitResult]) => {
        if (!isMounted) {
          return;
        }

        if (!studentResult || (mode === "edit" && !visitResult)) {
          setStatus("notFound");
          return;
        }

        setStudent(studentResult);
        setFormTemplates(templates.filter((item) => item.isActive));
        setLatestVisit(
          mode === "edit" ? visits.find((item) => item.id !== visitResult?.id) : visits[0]
        );
        setVisit(visitResult ?? undefined);
        setStatus("loaded");

        if (mode === "edit" && visitResult && studentId) {
          try {
            const revisions = await visitsRepo.listAnswerRevisions(studentId, visitResult.id);
            if (isMounted) {
              setAnswerRevisions(revisions);
            }
          } catch {
            if (isMounted) {
              setAnswerRevisions([]);
            }
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode, studentId, studentsRepo, templatesRepo, visitId, visitsRepo]);

  const goToVisits = () => navigate(`/students/${studentId}/visits`);

  const handleSubmit = async (input: StudentVisitInput, intent: VisitSubmitIntent) => {
    if (!studentId) {
      throw new Error("Student id is required.");
    }

    try {
      const currentStatus = visit?.status ?? input.status ?? "draft";
      const payload = withoutLockedAnswers(input, currentStatus);
      if (hasStagedPhotos) payload.stagedPhotoSessionId = photoSessionId;

      // Resend while answers are locked: skip PATCH (answers would be rejected)
      // and only extend the student send window.
      if (
        intent === "send-to-student" &&
        mode === "edit" &&
        visitId &&
        !hasStagedPhotos &&
        answersLockedForStatus(currentStatus)
      ) {
        const resent = await visitsRepo.sendToStudent(studentId, visitId);
        if (programRequestId) {
          await programRequestRepository.startCoach(programRequestId, assessmentMode, resent.id);
        }
        navigate(`/students/${studentId}/visits/${resent.id}/edit${requestQuery}`, {
          replace: true,
          state: {
            visitSaved: resent.expiresAt
              ? `فرم دوباره برای شاگرد ارسال شد. انقضا: ${formatCalendarDateTime(resent.expiresAt)}`
              : "فرم دوباره برای شاگرد ارسال شد."
          }
        });
        setVisit(resent);
        return;
      }

      const existingVisitId = visit?.id ?? (mode === "edit" ? visitId : undefined);
      let savedVisit = existingVisitId
        ? await visitsRepo.update(studentId, existingVisitId, payload)
        : await visitsRepo.create(studentId, payload);
      const photoWarning = savedVisit.photoIssues?.length
        ? ` ${savedVisit.photoIssues.join(" ")}`
        : "";

      if (programRequestId) {
        await programRequestRepository.startCoach(programRequestId, assessmentMode, savedVisit.id);
      }

      if (intent === "send-to-student") {
        savedVisit = await visitsRepo.sendToStudent(studentId, savedVisit.id);
        navigate(`/students/${studentId}/visits/${savedVisit.id}/edit${requestQuery}`, {
          replace: true,
          state: {
            visitSaved: savedVisit.expiresAt
              ? `فرم برای شاگرد ارسال شد. انقضا: ${formatCalendarDateTime(savedVisit.expiresAt)}${photoWarning}`
              : `فرم برای شاگرد ارسال شد.${photoWarning}`
          }
        });
        setVisit(savedVisit);
        return;
      }

      if (intent === "start-coach-review") {
        savedVisit = await visitsRepo.startCoachReview(studentId, savedVisit.id);
        navigate(`/students/${studentId}/visits/${savedVisit.id}/edit${requestQuery}`, {
          replace: true,
          state: { visitSaved: `بررسی مربی شروع شد؛ فرم شاگرد قفل است.${photoWarning}` }
        });
        setVisit(savedVisit);
        return;
      }

      if (intent === "finalize") {
        savedVisit = await visitsRepo.finalize(studentId, savedVisit.id);
        navigate(`/students/${studentId}/visits`, {
          state: { visitSaved: `ویزیت نهایی شد.${photoWarning}` }
        });
        return;
      }

      if (intent === "generate-program") {
        const requestParams = programRequestId
          ? `&programRequestId=${encodeURIComponent(programRequestId)}`
          : "";
        navigate(`/programs/new?studentId=${studentId}&visitId=${savedVisit.id}${requestParams}`, {
          state: {
            visitSaved: `ویزیت ذخیره شد و تولید برنامه در مرحله بعد تکمیل می شود.${photoWarning}`
          }
        });
        return;
      }

      navigate(`/students/${studentId}/visits`, {
        state: {
          visitSaved: `${mode === "edit" ? "تغییرات ویزیت ذخیره شد." : "ویزیت جدید ثبت شد."}${photoWarning}`
        }
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(persianMessageForVisitApiError(error), { cause: error });
      }
      throw error;
    }
  };

  const defaultTemplateId =
    visit?.formTemplateId ??
    formTemplates.find((item) => item.isDefault)?.id ??
    formTemplates[0]?.id ??
    null;

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button iconStart={<ArrowRight size={18} />} onClick={goToVisits} variant="secondary">
            بازگشت به ویزیت ها
          </Button>
        }
        breadcrumb={[
          "داشبورد",
          "شاگردها",
          "پروفایل شاگرد",
          mode === "edit" ? "ویرایش ویزیت" : "ویزیت جدید"
        ]}
        description="برای ثبت ویزیت، تاریخ و وزن جدید را وارد کنید؛ بقیه بخش‌ها اختیاری‌اند و با فلش باز می‌شوند. «ثبت و ادامه برای تولید برنامه» ویزیت را ذخیره و صفحه ساخت برنامه را باز می‌کند."
        title={mode === "edit" ? "ویرایش ویزیت" : "ویزیت جدید"}
      />

      <ContentSection>
        {status === "loading" ? (
          <Card aria-label="در حال بارگذاری فرم ویزیت">
            <Skeleton height={120} />
            <Skeleton height={220} />
            <Skeleton height={220} />
          </Card>
        ) : null}

        {status === "error" ? (
          <Card padding="lg">
            <EmptyState
              description="دریافت اطلاعات فرم ویزیت با خطا روبه رو شد."
              title="خطای موقت"
            />
          </Card>
        ) : null}

        {status === "notFound" ? (
          <Card padding="lg">
            <EmptyState
              action={
                <Button onClick={() => navigate("/students")} variant="secondary">
                  بازگشت به لیست شاگردها
                </Button>
              }
              description="شاگرد یا ویزیت انتخاب شده در داده های موقت پیدا نشد."
              title="اطلاعات ویزیت پیدا نشد"
            />
          </Card>
        ) : null}

        {status === "loaded" && student ? (
          <Stack gap="20px">
            {routeFeedback ? (
              <div
                className={`${styles.alert} ${routeFeedback.includes("آپلود نشد") ? styles.alertError : styles.alertSuccess}`}
                role="status"
              >
                {routeFeedback}
              </div>
            ) : null}
            <VisitStudentSummary student={student} />
            <VisitPhotosPanel
              audience="coach"
              canUpload
              onStagedChange={setHasStagedPhotos}
              onUploadStateChange={setPhotosUploading}
              sessionId={photoSessionId}
              studentId={student.id}
              visitId={visit?.id ?? null}
            />
            <StudentVisitForm
              answerRevisions={answerRevisions}
              formTemplates={formTemplates}
              initialFormTemplateId={defaultTemplateId}
              initialVisit={visit}
              key={`${student.id}-${visit?.id ?? "new"}-${defaultTemplateId ?? "none"}-${visit?.status ?? "draft"}`}
              latestVisit={latestVisit}
              mode={mode}
              onCancel={goToVisits}
              photosUploading={photosUploading}
              onSubmit={handleSubmit}
              student={student}
            />
          </Stack>
        ) : null}
      </ContentSection>
    </PageContainer>
  );
}

function VisitStudentSummary({ student }: { student: Student }) {
  return (
    <Card className={styles.visitStudentSummary}>
      <div className={styles.profileHeaderMain}>
        <span aria-hidden className={styles.profileAvatar}>
          <UserRound size={44} />
        </span>
        <div className={styles.profileIdentity}>
          <div className={styles.profileNameRow}>
            <h2>{student.fullName}</h2>
            <StudentStatusBadge status={student.status} />
          </div>
          <p>
            هدف: {goalLabels[student.goals.primaryGoal]} - سطح تمرین:{" "}
            {trainingLevelLabels[student.trainingBackground.level]}
          </p>
        </div>
      </div>
    </Card>
  );
}
