import { useNavigate } from "react-router";
import { CalendarDays, Dumbbell, Eye, Pencil, Target, UserRound } from "lucide-react";
import { Button, Card, EmptyState, Pagination, StatusBadge, Table } from "../../../components/ui";
import type { TableColumn } from "../../../components/ui";
import type { Student } from "../types/student";
import { genderLabels, goalLabels, trainingLevelLabels } from "../types/options";
import { StudentActionsMenu } from "./StudentActionsMenu";
import { StudentStatusBadge } from "./StudentStatusBadge";
import styles from "./students.module.css";

export interface StudentListProps {
  emptyDescription: string;
  isFiltered: boolean;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  pageStudents: Student[];
  total: number;
}

export function StudentList({
  emptyDescription,
  isFiltered,
  onPageChange,
  page,
  pageCount,
  pageStudents,
  total
}: StudentListProps) {
  if (total === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          description={emptyDescription}
          title={isFiltered ? "نتیجه ای پیدا نشد" : "هنوز شاگردی ثبت نشده است"}
        />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className={styles.listMeta}>
        <span>تعداد کل: {total} شاگرد</span>
        <span>
          نمایش صفحه {page} از {pageCount}
        </span>
      </div>

      <div className={styles.desktopList}>
        <StudentsTable students={pageStudents} />
      </div>

      <div className={styles.mobileList}>
        <div className={styles.cardList}>
          {pageStudents.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      </div>

      {pageCount > 1 ? (
        <div className={styles.paginationRow}>
          <span>نمایش {pageStudents.length} مورد در این صفحه</span>
          <Pagination onPageChange={onPageChange} page={page} pageCount={pageCount} />
        </div>
      ) : null}
    </Card>
  );
}

interface StudentsTableProps {
  students: Student[];
}

function StudentsTable({ students }: StudentsTableProps) {
  const navigate = useNavigate();
  const columns: Array<TableColumn<Student>> = [
    {
      cell: (student) => (
        <div className={styles.studentNameCell}>
          <span className={styles.studentName}>{student.fullName}</span>
          <div className={styles.badgeGroup}>
            <StatusBadge variant="info">{student.summary.currentProgramTitle}</StatusBadge>
            {student.summary.medicalNote !== "بدون محدودیت" ? (
              <StatusBadge variant="warning">{student.summary.medicalNote}</StatusBadge>
            ) : null}
          </div>
        </div>
      ),
      header: "نام شاگرد",
      id: "name"
    },
    {
      cell: (student) => student.age,
      header: "سن",
      id: "age",
      width: "72px"
    },
    {
      cell: (student) => trainingLevelLabels[student.trainingBackground.level],
      header: "سطح",
      id: "level"
    },
    {
      cell: (student) => goalLabels[student.goals.primaryGoal],
      header: "هدف اصلی",
      id: "goal"
    },
    {
      cell: (student) => `${student.trainingConditions.trainingDaysPerWeek} روز`,
      header: "روزهای تمرین",
      id: "days"
    },
    {
      cell: (student) => student.summary.lastVisitDate,
      header: "آخرین مراجعه",
      id: "visit"
    },
    {
      cell: (student) => <StudentStatusBadge status={student.status} />,
      header: "وضعیت",
      id: "status"
    },
    {
      align: "end",
      cell: (student) => (
        <div className={styles.tableActions}>
          <Button
            iconStart={<Eye size={16} />}
            onClick={() => navigate(`/students/${student.id}`)}
            size="sm"
            variant="secondary"
          >
            مشاهده
          </Button>
          <Button
            iconStart={<Pencil size={16} />}
            onClick={() => navigate(`/students/${student.id}/edit`)}
            size="sm"
            variant="secondary"
          >
            ویرایش
          </Button>
          <StudentActionsMenu studentId={student.id} />
        </div>
      ),
      header: "عملیات",
      id: "actions"
    }
  ];

  return (
    <Table
      ariaLabel="لیست شاگردها"
      columns={columns}
      data={students}
      getRowKey={(student) => student.id}
    />
  );
}

interface StudentCardProps {
  student: Student;
}

function StudentCard({ student }: StudentCardProps) {
  const navigate = useNavigate();

  return (
    <Card className={styles.studentCard} padding="md">
      <div className={styles.studentCardHeader}>
        <div className={styles.studentCardTitle}>
          <span aria-hidden className={styles.avatar}>
            <UserRound size={24} />
          </span>
          <span className={styles.studentCardTitleText}>
            <span className={styles.studentName}>{student.fullName}</span>
            <StudentStatusBadge status={student.status} />
          </span>
        </div>
        <StudentActionsMenu studentId={student.id} />
      </div>

      <div className={styles.metricGrid}>
        <StudentMetric
          icon={<CalendarDays size={18} />}
          label="سن"
          value={`${student.age} سال - ${genderLabels[student.gender]}`}
        />
        <StudentMetric
          icon={<Target size={18} />}
          label="هدف اصلی"
          value={goalLabels[student.goals.primaryGoal]}
        />
        <StudentMetric
          icon={<Dumbbell size={18} />}
          label="سطح"
          value={trainingLevelLabels[student.trainingBackground.level]}
        />
        <StudentMetric
          icon={<Dumbbell size={18} />}
          label="روزهای تمرین"
          value={`${student.trainingConditions.trainingDaysPerWeek} روز`}
        />
      </div>

      <div className={styles.badgeGroup}>
        <StatusBadge variant="info">{student.summary.currentProgramTitle}</StatusBadge>
        {student.summary.medicalNote !== "بدون محدودیت" ? (
          <StatusBadge variant="warning">{student.summary.medicalNote}</StatusBadge>
        ) : null}
      </div>

      <div className={styles.mobileActions}>
        <Button
          iconStart={<Eye size={18} />}
          onClick={() => navigate(`/students/${student.id}`)}
          variant="secondary"
        >
          مشاهده پروفایل
        </Button>
        <Button
          iconStart={<Pencil size={18} />}
          onClick={() => navigate(`/students/${student.id}/edit`)}
          variant="secondary"
        >
          ویرایش
        </Button>
      </div>
    </Card>
  );
}

interface StudentMetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StudentMetric({ icon, label, value }: StudentMetricProps) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>
        {icon} {label}
      </span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}
