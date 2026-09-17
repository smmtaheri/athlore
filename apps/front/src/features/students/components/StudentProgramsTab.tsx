import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Copy,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCcw,
  Star,
  Trash2
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
import type { StatusBadgeVariant, TableColumn } from "../../../components/ui";
import {
  studentProgramsRepository,
  type StudentProgramsRepository
} from "../services/studentProgramsRepository";
import {
  createGeneratedProgramFromSummary,
  programsRepository,
  type ProgramsRepository
} from "../../programs/services/programsRepository";
import type { StudentProgramStatus, StudentProgramSummary } from "../types/studentProgram";
import type { Student } from "../types/student";
import { programStatusLabels, programTypeLabels } from "../types/programLabels";
import { ProfileTabHeader, SummaryMetricCard } from "./ProfileTabHeader";
import styles from "./students.module.css";

export interface StudentProgramsTabProps {
  generatedProgramsRepository?: ProgramsRepository;
  repository?: StudentProgramsRepository;
  student: Student;
}

const statusVariant: Record<StudentProgramStatus, StatusBadgeVariant> = {
  active: "success",
  archived: "neutral",
  draft: "warning",
  expired: "danger",
  ready: "info"
};

export function StudentProgramsTab({
  generatedProgramsRepository = programsRepository,
  repository = studentProgramsRepository,
  student
}: StudentProgramsTabProps) {
  const [feedback, setFeedback] = useState("");
  const [programToDelete, setProgramToDelete] = useState<StudentProgramSummary | null>(null);
  const [programs, setPrograms] = useState<StudentProgramSummary[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    repository
      .listByStudent(student.id)
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setPrograms(items);
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

  const activeProgram = programs.find((program) => program.isCurrent);
  const latestProgram = programs[0];

  const handleRetry = () => {
    setStatus("loading");
    setReloadKey((current) => current + 1);
  };

  const handleActivate = async (program: StudentProgramSummary) => {
    try {
      const activatedProgram = await repository.activate(program.id);
      setPrograms((current) =>
        current.map((item) => {
          if (item.studentId !== activatedProgram.studentId) {
            return item;
          }

          if (item.id === activatedProgram.id) {
            return activatedProgram;
          }

          return {
            ...item,
            isCurrent: false,
            status: item.status === "active" ? ("ready" as const) : item.status
          };
        })
      );
      setFeedback("برنامه انتخاب شده به عنوان برنامه فعال ثبت شد.");
    } catch {
      setFeedback("فعال سازی برنامه انجام نشد. لطفا دوباره تلاش کنید.");
    }
  };

  const handleDuplicate = async (program: StudentProgramSummary) => {
    try {
      const duplicatedProgram = await repository.duplicate(program.id);
      try {
        const generatedProgram = await generatedProgramsRepository.duplicate(program.id);
        if (generatedProgram.id !== duplicatedProgram.id) {
          await generatedProgramsRepository.remove?.(generatedProgram.id);
          await generatedProgramsRepository.update(duplicatedProgram.id, {
            ...generatedProgram,
            id: duplicatedProgram.id
          });
        }
      } catch {
        await generatedProgramsRepository.update(
          duplicatedProgram.id,
          createGeneratedProgramFromSummary(duplicatedProgram)
        );
      }
      setPrograms((current) => [duplicatedProgram, ...current]);
      setFeedback("یک نسخه پیش نویس از برنامه ساخته شد.");
    } catch {
      setFeedback("تکثیر برنامه انجام نشد. لطفا دوباره تلاش کنید.");
    }
  };

  const handleDelete = async () => {
    if (!programToDelete) {
      return;
    }

    try {
      await repository.remove(programToDelete.id);
      setPrograms((current) => current.filter((program) => program.id !== programToDelete.id));
      setFeedback("برنامه انتخاب شده حذف شد.");
      setProgramToDelete(null);
    } catch {
      setFeedback("حذف برنامه انجام نشد. لطفا دوباره تلاش کنید.");
    }
  };

  if (status === "loading") {
    return <ProgramsLoadingState />;
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
          description="دریافت برنامه های شاگرد با خطا روبه رو شد."
          title="خطای دریافت برنامه ها"
        />
      </Card>
    );
  }

  return (
    <div className={styles.tabContentStack}>
      {feedback ? (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          {feedback}
        </div>
      ) : null}

      <ProfileTabHeader
        action={
          <Button
            iconStart={<Plus size={18} />}
            onClick={() => navigate(`/programs/new?studentId=${student.id}`)}
          >
            تولید برنامه جدید
          </Button>
        }
        description="برنامه های ساخته شده برای شاگرد و نسخه های قبلی"
        title="برنامه های شاگرد"
      />

      <div className={styles.summaryMetricGrid}>
        <SummaryMetricCard
          hint="در همه وضعیت ها"
          icon={FileText}
          label="تعداد کل برنامه ها"
          value={programs.length}
        />
        <SummaryMetricCard
          hint={activeProgram ? `نسخه ${activeProgram.version}` : "بدون برنامه فعال"}
          icon={Star}
          label="برنامه فعال"
          value={activeProgram?.title ?? "ثبت نشده"}
        />
        <SummaryMetricCard
          hint="آخرین برنامه ساخته شده"
          icon={FileText}
          label="آخرین برنامه"
          value={latestProgram?.generatedAt ?? "ثبت نشده"}
        />
      </div>

      {programs.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            action={
              <Button
                iconStart={<Plus size={18} />}
                onClick={() => navigate(`/programs/new?studentId=${student.id}`)}
              >
                تولید برنامه جدید
              </Button>
            }
            description="برای این شاگرد هنوز برنامه ای ثبت نشده است."
            title="هنوز برنامه ای وجود ندارد"
          />
        </Card>
      ) : (
        <Card className={styles.tabTableCard}>
          <div className={styles.desktopList}>
            <ProgramsTable
              onActivate={handleActivate}
              onDelete={setProgramToDelete}
              onDuplicate={handleDuplicate}
              programs={programs}
            />
          </div>
          <div className={styles.mobileList}>
            <div className={styles.cardList}>
              {programs.map((program) => (
                <ProgramCard
                  key={program.id}
                  onActivate={handleActivate}
                  onDelete={setProgramToDelete}
                  onDuplicate={handleDuplicate}
                  program={program}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal
        footer={
          <>
            <Button onClick={() => setProgramToDelete(null)} variant="secondary">
              انصراف
            </Button>
            <Button iconStart={<Trash2 size={18} />} onClick={handleDelete} variant="danger">
              حذف
            </Button>
          </>
        }
        onClose={() => setProgramToDelete(null)}
        open={Boolean(programToDelete)}
        title="حذف برنامه"
      >
        <p className={styles.modalText}>آیا از حذف برنامه {programToDelete?.title} مطمئن هستید؟</p>
        <p className={styles.dangerText}>این عملیات قابل بازگشت نیست.</p>
      </Modal>
    </div>
  );
}

interface ProgramsTableProps {
  onActivate: (program: StudentProgramSummary) => void;
  onDelete: (program: StudentProgramSummary) => void;
  onDuplicate: (program: StudentProgramSummary) => void;
  programs: StudentProgramSummary[];
}

function ProgramsTable({ onActivate, onDelete, onDuplicate, programs }: ProgramsTableProps) {
  const columns: Array<TableColumn<StudentProgramSummary>> = [
    {
      cell: (program) => (
        <span className={styles.recordTitle}>
          {program.title}
          {program.isCurrent ? <Star aria-hidden size={16} /> : null}
        </span>
      ),
      header: "عنوان برنامه",
      id: "title"
    },
    {
      cell: (program) => (
        <StatusBadge variant={program.programType === "complete" ? "purple" : "info"}>
          {programTypeLabels[program.programType]}
        </StatusBadge>
      ),
      header: "نوع برنامه",
      id: "type"
    },
    {
      cell: (program) => program.version,
      header: "نسخه",
      id: "version"
    },
    {
      cell: (program) => program.generatedAt,
      header: "تاریخ تولید",
      id: "generatedAt"
    },
    {
      cell: (program) => program.dateRange,
      header: "بازه برنامه",
      id: "dateRange"
    },
    {
      cell: (program) => (
        <StatusBadge variant={statusVariant[program.status]}>
          {programStatusLabels[program.status]}
        </StatusBadge>
      ),
      header: "وضعیت",
      id: "status"
    },
    {
      cell: (program) => (
        <StatusBadge variant={program.isCurrent ? "success" : "neutral"}>
          {program.isCurrent ? "فعال" : "قبلی"}
        </StatusBadge>
      ),
      header: "برنامه؟",
      id: "current"
    },
    {
      align: "end",
      cell: (program) => (
        <ProgramActions
          onActivate={() => onActivate(program)}
          onDelete={() => onDelete(program)}
          onDuplicate={() => onDuplicate(program)}
          program={program}
        />
      ),
      header: "عملیات",
      id: "actions",
      width: "150px"
    }
  ];

  return (
    <Table
      ariaLabel="برنامه های شاگرد"
      columns={columns}
      data={programs}
      getRowKey={(program) => program.id}
    />
  );
}

interface ProgramCardProps extends Omit<ProgramsTableProps, "programs"> {
  program: StudentProgramSummary;
}

function ProgramCard({ onActivate, onDelete, onDuplicate, program }: ProgramCardProps) {
  return (
    <Card className={styles.studentCard} padding="md">
      <div className={styles.studentCardHeader}>
        <div className={styles.studentCardTitleText}>
          <span className={styles.studentName}>{program.title}</span>
          <span>{program.generatedAt}</span>
        </div>
        <ProgramActions
          onActivate={() => onActivate(program)}
          onDelete={() => onDelete(program)}
          onDuplicate={() => onDuplicate(program)}
          program={program}
        />
      </div>
      <div className={styles.badgeGroup}>
        <StatusBadge variant="purple">{programTypeLabels[program.programType]}</StatusBadge>
        <StatusBadge variant={statusVariant[program.status]}>
          {programStatusLabels[program.status]}
        </StatusBadge>
        <StatusBadge variant={program.isCurrent ? "success" : "neutral"}>
          {program.isCurrent ? "فعال" : "قبلی"}
        </StatusBadge>
      </div>
      <div className={styles.metricGrid}>
        <StudentRecordMetric label="نسخه" value={program.version} />
        <StudentRecordMetric label="بازه برنامه" value={program.dateRange} />
      </div>
    </Card>
  );
}

interface ProgramActionsProps {
  onActivate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  program: StudentProgramSummary;
}

function ProgramActions({ onActivate, onDelete, onDuplicate, program }: ProgramActionsProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu
      items={[
        {
          icon: <Eye size={16} />,
          label: "مشاهده",
          onSelect: () => navigate(`/programs/${program.id}/preview`)
        },
        {
          icon: <Pencil size={16} />,
          label: "ویرایش",
          onSelect: () => navigate(`/programs/${program.id}/preview?mode=edit`)
        },
        {
          icon: <Download size={16} />,
          label: "فایل‌های PDF",
          onSelect: () => navigate(`/students/${program.studentId}/pdf-files`)
        },
        {
          disabled: program.isCurrent,
          icon: <Star size={16} />,
          label: "فعال سازی",
          onSelect: onActivate
        },
        {
          icon: <Copy size={16} />,
          label: "تکثیر برنامه",
          onSelect: onDuplicate
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

function StudentRecordMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}

function ProgramsLoadingState() {
  return (
    <Card aria-label="در حال بارگذاری برنامه ها">
      <Skeleton height={72} />
      <Skeleton height={160} />
      <Skeleton height={260} />
    </Card>
  );
}
