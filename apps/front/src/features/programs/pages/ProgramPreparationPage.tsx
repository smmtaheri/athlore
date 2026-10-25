import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PageContainer, PageHeader } from "../../../components/layout";
import { Button, Card, FormField, Select } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import { ApiError, persianMessageForProgramApiError } from "../../../shared/api/errors";
import { studentsRepository } from "../../students/services/studentsRepository";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import type { Student } from "../../students/types/student";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { ProgramGenerationPage } from "./ProgramGenerationPage";
import { formatCalendarDate } from "../../../shared/dates/calendar";

export function ProgramPreparationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState(params.get("studentId") ?? "");
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [visitId, setVisitId] = useState(params.get("visitId") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const requestQuery = params.get("programRequestId")
    ? `&programRequestId=${encodeURIComponent(params.get("programRequestId")!)}`
    : "";
  useEffect(() => {
    let active = true;
    studentsRepository
      .list()
      .then((items) => {
        if (active) setStudents(items.filter((item) => item.status === "active"));
      })
      .catch(() => {
        if (active) setError("دریافت شاگردها انجام نشد.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (studentId)
      studentVisitsRepository
        .listByStudent(studentId)
        .then((items) => {
          if (active) setVisits(items);
        })
        .catch(() => {
          if (active) setError("دریافت ویزیت‌ها انجام نشد.");
        });
    return () => {
      active = false;
    };
  }, [studentId]);
  if (params.get("mode") === "upload") return <ProgramGenerationPage key={params.toString()} />;
  const prepare = async () => {
    if (!visitId) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ program: { id: string } }>(
        `/visits/${visitId}/prepare-program/`,
        { method: "POST", body: { operation_key: key } }
      );
      navigate(`/programs/${result.program.id}`);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? persianMessageForProgramApiError(error)
          : "ساخت برنامه انجام نشد؛ ویزیت و اطلاعات شما حفظ شده است."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageContainer>
      <PageHeader
        title="آماده‌سازی برنامه"
        description="ویزیت مرجع را انتخاب کنید؛ تنظیمات دوره از همان ویزیت خوانده می‌شوند."
      />
      <Card>
        <FormField label="شاگرد" htmlFor="prepare-student">
          <Select
            id="prepare-student"
            value={studentId}
            placeholder="انتخاب شاگرد"
            options={students.map((student) => ({ value: student.id, label: student.fullName }))}
            onChange={(e) => {
              setStudentId(e.target.value);
              setVisitId("");
              setVisits([]);
            }}
          />
        </FormField>
        <FormField label="ویزیت مرجع" htmlFor="prepare-visit">
          <Select
            id="prepare-visit"
            value={visitId}
            placeholder="انتخاب ویزیت"
            options={visits.map((visit) => ({
              value: visit.id,
              label: formatCalendarDate(visit.visitDate)
            }))}
            onChange={(e) => setVisitId(e.target.value)}
          />
        </FormField>
        {studentId && !visits.length ? <p>ابتدا ارزیابی این دوره را در ویزیت ثبت کنید.</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <Button disabled={!visitId || busy} isLoading={busy} onClick={() => void prepare()}>
          ساخت پیش‌نویس از ویزیت
        </Button>
        <Button
          disabled={!studentId || busy}
          onClick={() =>
            navigate(
              `/programs/new?mode=upload&studentId=${studentId}${visitId ? `&visitId=${visitId}` : ""}${requestQuery}`
            )
          }
        >
          آپلود PDF آماده
        </Button>
        <Button
          disabled={!studentId || busy}
          onClick={() =>
            navigate(
              visitId
                ? `/students/${studentId}/visits/${visitId}/edit`
                : `/students/${studentId}/visits/new`
            )
          }
        >
          ثبت یا اصلاح ویزیت
        </Button>
      </Card>
    </PageContainer>
  );
}
