import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  CalendarDays,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Weight
} from "lucide-react";
import {
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
  Table
} from "../../../components/ui";
import type { TableColumn } from "../../../components/ui";
import type { StudentVisit, VisitLevel } from "../types/monthlyVisit";
import { visitStatusLabels, type VisitStatus } from "../types/visitForm";
import type { Student } from "../types/student";
import {
  studentVisitsRepository,
  type StudentVisitsRepository
} from "../services/studentVisitsRepository";
import { VisitAnswersReadonly } from "./VisitDynamicForm";
import { enabledSectionsFromTemplate } from "./visitFormUtils";
import { ProfileTabHeader, SummaryMetricCard } from "./ProfileTabHeader";
import styles from "./students.module.css";

export interface StudentVisitsTabProps {
  repository?: StudentVisitsRepository;
  student: Student;
}

const levelLabels: Record<VisitLevel, string> = {
  good: "خوب",
  high: "زیاد",
  low: "کم",
  medium: "متوسط"
};

export function StudentVisitsTab({
  repository = studentVisitsRepository,
  student
}: StudentVisitsTabProps) {
  const [feedback, setFeedback] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedVisit, setSelectedVisit] = useState<StudentVisit | null>(null);
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [visitToDelete, setVisitToDelete] = useState<StudentVisit | null>(null);
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const routeFeedback = (location.state as { visitSaved?: string } | null)?.visitSaved ?? "";

  useEffect(() => {
    let isMounted = true;

    repository
      .listByStudent(student.id)
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setVisits(items);
        setSelectedVisit((current) => {
          if (current && items.some((item) => item.id === current.id)) {
            return current;
          }

          return items[0] ?? null;
        });
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
  }, [reloadKey, repository, student.id]);

  const latestVisit = visits[0];
  const weightChange = latestVisit ? latestVisit.currentWeightKg - latestVisit.previousWeightKg : 0;
  const canShowSuccess = Boolean(feedback || routeFeedback);

  const handleRetry = () => {
    setStatus("loading");
    setReloadKey((current) => current + 1);
  };

  const handleDelete = async () => {
    if (!visitToDelete) {
      return;
    }

    try {
      await repository.remove(student.id, visitToDelete.id);
      setVisits((current) => current.filter((visit) => visit.id !== visitToDelete.id));
      setSelectedVisit((current) => (current?.id === visitToDelete.id ? null : current));
      setFeedback("ویزیت انتخاب شده حذف شد.");
      setVisitToDelete(null);
    } catch {
      setFeedback("حذف ویزیت انجام نشد. لطفا دوباره تلاش کنید.");
    }
  };

  if (status === "loading") {
    return <VisitsLoadingState />;
  }

  if (status === "error") {
    return (
      <Card padding="lg">
        <EmptyState
          action={
            <Button iconStart={<RefreshCcw size={18} />} onClick={handleRetry} variant="secondary">
              تلاش دوباره
            </Button>
          }
          description="دریافت تاریخچه ویزیت های شاگرد با خطا روبه رو شد."
          title="خطای دریافت ویزیت ها"
        />
      </Card>
    );
  }

  return (
    <div className={styles.tabContentStack}>
      {canShowSuccess ? (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          {feedback || routeFeedback}
        </div>
      ) : null}

      <ProfileTabHeader
        action={
          <Button
            iconStart={<Plus size={18} />}
            onClick={() => navigate(`/students/${student.id}/visits/new`)}
          >
            ویزیت جدید
          </Button>
        }
        description="تغییرات ماهانه وزن، اندازه ها، پایبندی و بازخورد شاگرد"
        title="ویزیت های ماهانه"
      />

      <div className={styles.summaryMetricGrid}>
        <SummaryMetricCard
          hint={latestVisit ? "آخرین رکورد ثبت شده" : "بدون رکورد"}
          icon={CalendarDays}
          label="تاریخ آخرین ویزیت"
          value={latestVisit?.visitDate ?? "ثبت نشده"}
        />
        <SummaryMetricCard
          hint="بر اساس آخرین ویزیت"
          icon={Weight}
          label="وزن فعلی"
          value={latestVisit ? `${latestVisit.currentWeightKg} کیلوگرم` : "ثبت نشده"}
        />
        <SummaryMetricCard
          hint="نسبت به ویزیت قبلی"
          icon={Weight}
          label="تغییر وزن"
          value={
            latestVisit ? (
              <span className={weightChange >= 0 ? styles.positiveText : styles.successText}>
                {formatSignedNumber(weightChange)} کیلوگرم
              </span>
            ) : (
              "ثبت نشده"
            )
          }
        />
        <SummaryMetricCard
          hint="وضعیت ثبت ماه جاری"
          icon={CalendarDays}
          label="وضعیت ویزیت این ماه"
          value={
            <StatusBadge variant={latestVisit ? "success" : "neutral"}>
              {latestVisit ? "ثبت شده" : "ثبت نشده"}
            </StatusBadge>
          }
        />
      </div>

      {visits.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            action={
              <Button
                iconStart={<Plus size={18} />}
                onClick={() => navigate(`/students/${student.id}/visits/new`)}
              >
                ویزیت جدید
              </Button>
            }
            description="هنوز هیچ ویزیتی برای این شاگرد ثبت نشده است."
            title="هنوز ویزیتی ثبت نشده"
          />
        </Card>
      ) : (
        <div className={styles.visitsLayout}>
          <Card className={styles.tabTableCard}>
            <h2 className={styles.cardTitle}>تاریخچه ویزیت ها</h2>
            <div className={styles.desktopList}>
              <VisitsTable
                onDelete={setVisitToDelete}
                onSelect={setSelectedVisit}
                studentId={student.id}
                visits={visits}
              />
            </div>
            <div className={styles.mobileList}>
              <div className={styles.cardList}>
                {visits.map((visit) => (
                  <VisitCard
                    key={visit.id}
                    onDelete={setVisitToDelete}
                    onSelect={setSelectedVisit}
                    studentId={student.id}
                    visit={visit}
                  />
                ))}
              </div>
            </div>
          </Card>

          {selectedVisit ? <VisitDetailsPanel visit={selectedVisit} /> : null}
        </div>
      )}

      <Modal
        footer={
          <>
            <Button onClick={() => setVisitToDelete(null)} variant="secondary">
              انصراف
            </Button>
            <Button iconStart={<Trash2 size={18} />} onClick={handleDelete} variant="danger">
              حذف ویزیت
            </Button>
          </>
        }
        onClose={() => setVisitToDelete(null)}
        open={Boolean(visitToDelete)}
        title="حذف ویزیت"
      >
        <p className={styles.modalText}>آیا از حذف ویزیت {visitToDelete?.visitDate} مطمئن هستید؟</p>
        <p className={styles.dangerText}>این عملیات قابل بازگشت نیست.</p>
      </Modal>
    </div>
  );
}

interface VisitsTableProps {
  onDelete: (visit: StudentVisit) => void;
  onSelect: (visit: StudentVisit) => void;
  studentId: string;
  visits: StudentVisit[];
}

function VisitsTable({ onDelete, onSelect, studentId, visits }: VisitsTableProps) {
  const columns: Array<TableColumn<StudentVisit>> = [
    {
      cell: (visit) => visit.visitDate,
      header: "تاریخ ویزیت",
      id: "visitDate"
    },
    {
      cell: (visit) => visit.formTemplateName || visit.formTemplateKey || "—",
      header: "قالب فرم",
      id: "template"
    },
    {
      cell: (visit) => <VisitStatusBadge status={visit.status} />,
      header: "وضعیت",
      id: "status"
    },
    {
      cell: (visit) => `${visit.currentWeightKg} کیلوگرم`,
      header: "وزن",
      id: "weight"
    },
    {
      cell: (visit) => (
        <span className={getChangeClass(visit)}>
          {formatSignedNumber(visit.currentWeightKg - visit.previousWeightKg)}
        </span>
      ),
      header: "تغییر وزن",
      id: "change"
    },
    {
      cell: (visit) => <LevelBadge level={visit.stressLevel} />,
      header: "میزان استرس",
      id: "stress"
    },
    {
      cell: (visit) => <PercentBar value={visit.adherence.overallPercent} />,
      header: "اجرای برنامه",
      id: "adherence"
    },
    {
      align: "end",
      cell: (visit) => (
        <VisitActions
          onDelete={() => onDelete(visit)}
          onSelect={() => onSelect(visit)}
          studentId={studentId}
          visit={visit}
        />
      ),
      header: "عملیات",
      id: "actions",
      width: "150px"
    }
  ];

  return (
    <Table
      ariaLabel="تاریخچه ویزیت های شاگرد"
      columns={columns}
      data={visits}
      getRowKey={(visit) => visit.id}
    />
  );
}

interface VisitCardProps {
  onDelete: (visit: StudentVisit) => void;
  onSelect: (visit: StudentVisit) => void;
  studentId: string;
  visit: StudentVisit;
}

function VisitCard({ onDelete, onSelect, studentId, visit }: VisitCardProps) {
  return (
    <Card className={styles.studentCard} padding="md">
      <div className={styles.studentCardHeader}>
        <div className={styles.studentCardTitleText}>
          <span className={styles.studentName}>{visit.visitDate}</span>
          <span className={getChangeClass(visit)}>
            تغییر وزن {formatSignedNumber(visit.currentWeightKg - visit.previousWeightKg)} کیلوگرم
          </span>
        </div>
        <VisitActions
          onDelete={() => onDelete(visit)}
          onSelect={() => onSelect(visit)}
          studentId={studentId}
          visit={visit}
        />
      </div>
      <div className={styles.metricGrid}>
        <StudentVisitMetric
          label="قالب فرم"
          value={visit.formTemplateName || visit.formTemplateKey || "—"}
        />
        <StudentVisitMetric label="وضعیت" value={visitStatusLabels[visit.status]} />
        <StudentVisitMetric label="وزن" value={`${visit.currentWeightKg} کیلوگرم`} />
        <StudentVisitMetric label="اجرای برنامه" value={`${visit.adherence.overallPercent}%`} />
      </div>
    </Card>
  );
}

interface VisitActionsProps {
  onDelete: () => void;
  onSelect: () => void;
  studentId: string;
  visit: StudentVisit;
}

function VisitActions({ onDelete, onSelect, studentId, visit }: VisitActionsProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu
      items={[
        {
          icon: <Eye size={16} />,
          label: "مشاهده جزئیات",
          onSelect
        },
        {
          icon: <Pencil size={16} />,
          label: "ویرایش",
          onSelect: () => navigate(`/students/${studentId}/visits/${visit.id}/edit`)
        },
        {
          icon: <FilePlus2 size={16} />,
          label: "تولید برنامه",
          onSelect: () => navigate(`/programs/new?studentId=${studentId}&visitId=${visit.id}`)
        },
        {
          icon: <Trash2 size={16} />,
          label: "حذف",
          onSelect: onDelete
        }
      ]}
      label="عملیات"
    />
  );
}

function VisitDetailsPanel({ visit }: { visit: StudentVisit }) {
  const weightChange = visit.currentWeightKg - visit.previousWeightKg;
  const dynamicSections = enabledSectionsFromTemplate(visit.formTemplateSnapshot);

  return (
    <Card className={styles.visitDetailsPanel}>
      <div className={styles.infoSectionHeader}>
        <span aria-hidden className={styles.sectionIcon}>
          <Eye size={20} />
        </span>
        <div>
          <h2>جزئیات ویزیت</h2>
          <p className={styles.subtleText}>{visit.visitDate}</p>
        </div>
      </div>

      <div className={styles.detailMetricGrid}>
        <StudentVisitMetric
          label="قالب فرم"
          value={visit.formTemplateName || visit.formTemplateKey || "—"}
        />
        <StudentVisitMetric label="وضعیت" value={visitStatusLabels[visit.status]} />
        <StudentVisitMetric label="وزن قبلی" value={`${visit.previousWeightKg} کیلوگرم`} />
        <StudentVisitMetric label="وزن جدید" value={`${visit.currentWeightKg} کیلوگرم`} />
        <StudentVisitMetric
          label="تغییر وزن"
          value={`${formatSignedNumber(weightChange)} کیلوگرم`}
        />
      </div>

      <div className={styles.detailBlock}>
        <h3>اندازه های بدن</h3>
        <div className={styles.detailMetricGrid}>
          <StudentVisitMetric label="دور سینه" value={formatCm(visit.measurements.chestCm)} />
          <StudentVisitMetric label="دور کمر" value={formatCm(visit.measurements.waistCm)} />
          <StudentVisitMetric label="دور بازو" value={formatCm(visit.measurements.armCm)} />
          <StudentVisitMetric label="دور ران" value={formatCm(visit.measurements.thighCm)} />
          <StudentVisitMetric label="دور باسن" value={formatCm(visit.measurements.hipCm)} />
        </div>
      </div>

      <div className={styles.detailMetricGrid}>
        <StudentVisitMetric label="کیفیت خواب" value={levelLabels[visit.sleepQuality]} />
        <StudentVisitMetric label="میزان استرس" value={levelLabels[visit.stressLevel]} />
        <StudentVisitMetric label="سطح انرژی" value={levelLabels[visit.dailyEnergyLevel]} />
      </div>

      <div className={styles.detailBlock}>
        <h3>میزان اجرای برنامه</h3>
        <PercentBar value={visit.adherence.overallPercent} />
      </div>

      <ReadonlyDetail label="بازخورد شاگرد" value={visit.studentFeedback} />
      <ReadonlyDetail label="آسیب یا درد جدید" value={visit.newInjuryNotes} />
      <ReadonlyDetail label="ارزیابی مربی" value={visit.coachAssessment} />
      <ReadonlyDetail label="هدف ماه بعد" value={visit.nextCycleGoal} />
      <ReadonlyDetail label="یادداشت مربی" value={visit.coachNotes} />
      <ReadonlyDetail label="یادداشت خصوصی مربی" value={visit.coachPrivateNotes} />

      {dynamicSections.length > 0 ? (
        <VisitAnswersReadonly
          answers={visit.answers}
          coachNotes={undefined}
          sections={dynamicSections}
        />
      ) : null}
    </Card>
  );
}

function StudentVisitMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.compactMetric}>
      <span>{label}</span>
      <strong>{value || "ثبت نشده"}</strong>
    </div>
  );
}

function ReadonlyDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.readonlyDetail}>
      <span>{label}</span>
      <p>{value || "ثبت نشده"}</p>
    </div>
  );
}

function VisitsLoadingState() {
  return (
    <Card aria-label="در حال بارگذاری ویزیت ها">
      <Skeleton height={72} />
      <Skeleton height={160} />
      <Skeleton height={260} />
    </Card>
  );
}

function PercentBar({ value }: { value: number }) {
  return (
    <span className={styles.percentBarWrap}>
      <span>{value}%</span>
      <span className={styles.percentBarTrack}>
        <span className={styles.percentBarFill} style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

function LevelBadge({ level }: { level: VisitLevel }) {
  const variant = useMemo(() => {
    if (level === "good" || level === "low") {
      return "success";
    }

    if (level === "high") {
      return "danger";
    }

    return "warning";
  }, [level]);

  return <StatusBadge variant={variant}>{levelLabels[level]}</StatusBadge>;
}

function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const variant =
    status === "finalized"
      ? "success"
      : status === "coach_review"
        ? "info"
        : status === "student_submitted"
          ? "warning"
          : status === "waiting_for_student"
            ? "neutral"
            : "neutral";

  return <StatusBadge variant={variant}>{visitStatusLabels[status]}</StatusBadge>;
}

function formatSignedNumber(value: number): string {
  if (value > 0) {
    return `+${value.toFixed(1)}`;
  }

  return value.toFixed(1);
}

function getChangeClass(visit: StudentVisit): string {
  return visit.currentWeightKg - visit.previousWeightKg >= 0
    ? styles.positiveText
    : styles.successText;
}

function formatCm(value?: number): string {
  return value === undefined ? "ثبت نشده" : `${value} سانتی متر`;
}
