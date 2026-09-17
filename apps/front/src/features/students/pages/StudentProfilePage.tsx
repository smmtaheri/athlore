import { useEffect, useState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import { Button, Card, EmptyState, Skeleton } from "../../../components/ui";
import { StudentBasicInfoTab } from "../components/StudentBasicInfoTab";
import { StudentPdfFilesTab } from "../components/StudentPdfFilesTab";
import { StudentProgramsTab } from "../components/StudentProgramsTab";
import { StudentProfileHeader } from "../components/StudentProfileHeader";
import { StudentProfileTabs, type StudentProfileTab } from "../components/StudentProfileTabs";
import type { StudentPdfFilesRepository } from "../services/studentPdfFilesRepository";
import type { StudentProgramsRepository } from "../services/studentProgramsRepository";
import type { StudentVisitsRepository } from "../services/studentVisitsRepository";
import { StudentVisitsTab } from "../components/StudentVisitsTab";
import { StudentBodyCheckTab } from "../../body-check/pages/StudentBodyCheckTab";
import { studentsRepository, type StudentsRepository } from "../services/studentsRepository";
import type { Student } from "../types/student";

export interface StudentProfilePageProps {
  pdfFilesRepository?: StudentPdfFilesRepository;
  programsRepository?: StudentProgramsRepository;
  repository?: StudentsRepository;
  tab: StudentProfileTab;
  visitsRepository?: StudentVisitsRepository;
}

export function StudentProfilePage({
  pdfFilesRepository,
  programsRepository,
  repository = studentsRepository,
  tab,
  visitsRepository
}: StudentProfilePageProps) {
  const [student, setStudent] = useState<Student | undefined>();
  const [requestKey, setRequestKey] = useState(0);
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "notFound">("loading");
  const navigate = useNavigate();
  const { studentId } = useParams();
  const isStaleStudent = status === "loaded" && student?.id !== studentId;
  const visibleStatus = isStaleStudent ? "loading" : status;

  useEffect(() => {
    let isMounted = true;

    repository
      .getById(studentId ?? "")
      .then((item) => {
        if (!isMounted) {
          return;
        }

        if (!item) {
          setStatus("notFound");
          return;
        }

        setStudent(item);
        setStatus("loaded");
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [repository, requestKey, studentId]);

  const goToList = () => navigate("/students");
  const retryLoad = () => {
    setStudent(undefined);
    setStatus("loading");
    setRequestKey((current) => current + 1);
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button iconStart={<ArrowRight size={18} />} onClick={goToList} variant="secondary">
            بازگشت به لیست
          </Button>
        }
        breadcrumb={["داشبورد", "شاگردها", "پروفایل شاگرد"]}
        description="مشاهده اطلاعات و وضعیت فعلی شاگرد"
        title="پروفایل شاگرد"
      />

      <ContentSection>
        {visibleStatus === "loading" ? <StudentProfileLoading /> : null}

        {visibleStatus === "error" ? (
          <Card padding="lg">
            <EmptyState
              action={
                <Button
                  iconStart={<RefreshCcw size={18} />}
                  onClick={retryLoad}
                  variant="secondary"
                >
                  تلاش دوباره
                </Button>
              }
              description="دریافت اطلاعات شاگرد با خطا روبه رو شد."
              title="خطای موقت"
            />
          </Card>
        ) : null}

        {visibleStatus === "notFound" ? (
          <Card padding="lg">
            <EmptyState
              action={
                <Button onClick={goToList} variant="secondary">
                  بازگشت به لیست شاگردها
                </Button>
              }
              description="شناسه شاگرد در داده های موقت پیدا نشد."
              title="شاگرد پیدا نشد"
            />
          </Card>
        ) : null}

        {visibleStatus === "loaded" && student ? (
          <Stack gap="20px">
            <StudentProfileHeader
              onStudentUpdated={setStudent}
              student={student}
            />
            <StudentProfileTabs activeTab={tab} studentId={student.id} />
            <StudentProfileTabContent
              pdfFilesRepository={pdfFilesRepository}
              programsRepository={programsRepository}
              student={student}
              tab={tab}
              visitsRepository={visitsRepository}
            />
          </Stack>
        ) : null}
      </ContentSection>
    </PageContainer>
  );
}

function StudentProfileLoading() {
  return (
    <Card aria-label="در حال بارگذاری پروفایل شاگرد">
      <Stack>
        <Skeleton height={120} />
        <Skeleton height={48} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </Stack>
    </Card>
  );
}

interface StudentProfileTabContentProps {
  pdfFilesRepository?: StudentPdfFilesRepository;
  programsRepository?: StudentProgramsRepository;
  student: Student;
  tab: StudentProfileTab;
  visitsRepository?: StudentVisitsRepository;
}

function StudentProfileTabContent({
  pdfFilesRepository,
  programsRepository,
  student,
  tab,
  visitsRepository
}: StudentProfileTabContentProps) {
  if (tab === "overview") {
    return <StudentBasicInfoTab student={student} />;
  }

  if (tab === "visits") {
    return <StudentVisitsTab repository={visitsRepository} student={student} />;
  }

  if (tab === "programs") {
    return <StudentProgramsTab repository={programsRepository} student={student} />;
  }

  if (tab === "body-check") {
    return <StudentBodyCheckTab student={student} />;
  }

  return <StudentPdfFilesTab repository={pdfFilesRepository} student={student} />;
}
