import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, FileText, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { ContentSection, PageContainer, PageHeader } from "../../../components/layout";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  Table
} from "../../../components/ui";
import type { TableColumn } from "../../../components/ui";
import { studentPdfFilesRepository } from "../../students/services/studentPdfFilesRepository";
import { studentProgramsRepository } from "../../students/services/studentProgramsRepository";
import { studentsRepository } from "../../students/services/studentsRepository";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import { programStatusLabels, programTypeLabels } from "../../students/types/programLabels";
import type { Student } from "../../students/types/student";
import type {
  StudentProgramStatus,
  StudentProgramSummary,
  StudentProgramType
} from "../../students/types/studentProgram";
import { programsRepository } from "../services/programsRepository";
import styles from "../components/mvp.module.css";

type ProgramFilterStatus = StudentProgramStatus | "all";
type ProgramFilterType = StudentProgramType | "all";

interface ProgramRow extends StudentProgramSummary {
  pdfStatus: StudentPdfFile["status"] | "none";
  studentName: string;
}

export function ProgramsListPage() {
  const [programs, setPrograms] = useState<StudentProgramSummary[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [pdfFiles, setPdfFiles] = useState<StudentPdfFile[]>([]);
  const [programToDelete, setProgramToDelete] = useState<ProgramRow | null>(null);
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState({
    dateRange: "all",
    programType: "all" as ProgramFilterType,
    search: "",
    status: "all" as ProgramFilterStatus,
    studentId: "all"
  });
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    Promise.all([
      studentProgramsRepository.list?.() ?? Promise.resolve([]),
      studentsRepository.list(),
      studentPdfFilesRepository.list?.() ?? Promise.resolve([])
    ])
      .then(([programItems, studentItems, pdfItems]) => {
        if (!mounted) return;
        setPrograms(programItems as StudentProgramSummary[]);
        setStudents(studentItems);
        setPdfFiles(pdfItems as StudentPdfFile[]);
        setStatus("loaded");
      })
      .catch(() => mounted && setStatus("error"));

    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const rows = useMemo(() => {
    const studentMap = new Map(students.map((student) => [student.id, student.fullName]));
    return programs.map((program): ProgramRow => {
      const latestPdf = pdfFiles.find((file) => file.programId === program.id);
      return {
        ...program,
        pdfStatus: latestPdf?.status ?? "none",
        studentName: studentMap.get(program.studentId) ?? "شاگرد نامشخص"
      };
    });
  }, [pdfFiles, programs, students]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const search = filters.search.trim().toLowerCase();
        const matchesSearch =
          !search ||
          row.title.toLowerCase().includes(search) ||
          row.studentName.toLowerCase().includes(search);
        const matchesStudent = filters.studentId === "all" || row.studentId === filters.studentId;
        const matchesType =
          filters.programType === "all" || row.programType === filters.programType;
        const matchesStatus = filters.status === "all" || row.status === filters.status;
        const matchesDate = matchesDateRange(row.createdAt, filters.dateRange);
        return matchesSearch && matchesStudent && matchesType && matchesStatus && matchesDate;
      }),
    [filters, rows]
  );

  const removeProgram = async () => {
    if (!programToDelete) return;
    try {
      await studentProgramsRepository.remove(programToDelete.id);
      await programsRepository.remove?.(programToDelete.id);
      setPrograms((current) => current.filter((program) => program.id !== programToDelete.id));
      setProgramToDelete(null);
      setFeedback("برنامه حذف شد.");
    } catch {
      setFeedback("حذف برنامه انجام نشد.");
    }
  };

  const duplicateProgram = async (row: ProgramRow) => {
    try {
      const duplicatedSummary = await studentProgramsRepository.duplicate(row.id);
      await programsRepository.duplicate(row.id);
      setPrograms((current) => [duplicatedSummary, ...current]);
      setFeedback("یک نسخه پیش نویس کپی شد.");
    } catch {
      setFeedback("Duplicate انجام نشد.");
    }
  };

  const createVersion = async (row: ProgramRow) => {
    try {
      const version = await programsRepository.createVersion?.(row.id);
      if (!version) {
        throw new Error("Create version is not available.");
      }
      const summary = await studentProgramsRepository.upsert?.({
        createdAt: version.createdAt,
        dateRange: version.dateRange,
        generatedAt: version.createdAt,
        id: version.id,
        isCurrent: false,
        programType: version.programType,
        status: "draft",
        studentId: version.studentId,
        title: version.title,
        updatedAt: version.updatedAt,
        version: `v${version.version}`
      });
      if (summary) setPrograms((current) => [summary, ...current]);
      setFeedback("نسخه جدید برنامه ساخته شد.");
    } catch {
      setFeedback("ایجاد نسخه جدید انجام نشد.");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button iconStart={<Plus size={18} />} onClick={() => navigate("/programs/new")}>
            تولید برنامه جدید
          </Button>
        }
        breadcrumb={["داشبورد", "برنامه‌ها"]}
        description="لیست و تاریخچه همه برنامه‌های ساخته شده مربی"
        title="برنامه‌ها"
      />
      <ContentSection>
        {status === "loading" ? <ProgramsLoading /> : null}
        {status === "error" ? (
          <Card padding="lg">
            <EmptyState
              action={
                <Button
                  iconStart={<RefreshCcw size={18} />}
                  onClick={() => setReloadKey((v) => v + 1)}
                  variant="secondary"
                >
                  تلاش دوباره
                </Button>
              }
              description="دریافت برنامه‌ها با خطا روبه‌رو شد."
              title="خطای برنامه‌ها"
            />
          </Card>
        ) : null}
        {status === "loaded" ? (
          <div className={styles.pageStack}>
            {feedback ? (
              <StatusBadge variant={feedback.includes("نشد") ? "danger" : "success"}>
                {feedback}
              </StatusBadge>
            ) : null}
            <ProgramsFilters filters={filters} setFilters={setFilters} students={students} />
            {filteredRows.length === 0 ? (
              <Card padding="lg">
                <EmptyState
                  action={<Button onClick={() => navigate("/programs/new")}>تولید برنامه</Button>}
                  description="با فیلترهای فعلی برنامه‌ای پیدا نشد."
                  title="برنامه‌ای وجود ندارد"
                />
              </Card>
            ) : (
              <>
                <div className={styles.desktopOnly}>
                  <ProgramsTable
                    onCreateVersion={createVersion}
                    onDelete={setProgramToDelete}
                    onDuplicate={duplicateProgram}
                    rows={filteredRows}
                  />
                </div>
                <div className={styles.mobileOnly}>
                  <div className={styles.cardList}>
                    {filteredRows.map((row) => (
                      <ProgramCard
                        key={row.id}
                        onCreateVersion={createVersion}
                        onDelete={setProgramToDelete}
                        onDuplicate={duplicateProgram}
                        row={row}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </ContentSection>
      <Modal
        footer={
          <>
            <Button onClick={() => setProgramToDelete(null)} variant="secondary">
              انصراف
            </Button>
            <Button iconStart={<Trash2 size={18} />} onClick={removeProgram} variant="danger">
              حذف برنامه
            </Button>
          </>
        }
        onClose={() => setProgramToDelete(null)}
        open={Boolean(programToDelete)}
        title="حذف برنامه"
      >
        برنامه «{programToDelete?.title}» حذف شود؟
      </Modal>
    </PageContainer>
  );
}

function ProgramsFilters({
  filters,
  setFilters,
  students
}: {
  filters: {
    dateRange: string;
    programType: ProgramFilterType;
    search: string;
    status: ProgramFilterStatus;
    studentId: string;
  };
  setFilters: React.Dispatch<
    React.SetStateAction<{
      dateRange: string;
      programType: ProgramFilterType;
      search: string;
      status: ProgramFilterStatus;
      studentId: string;
    }>
  >;
  students: Student[];
}) {
  return (
    <Card>
      <div className={styles.filters}>
        <FormField htmlFor="program-search" label="جست‌وجو">
          <Input
            id="program-search"
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="نام شاگرد یا برنامه"
            value={filters.search}
          />
        </FormField>
        <FormField htmlFor="program-student" label="شاگرد">
          <Select
            id="program-student"
            onChange={(event) =>
              setFilters((current) => ({ ...current, studentId: event.target.value }))
            }
            options={[
              { label: "همه", value: "all" },
              ...students.map((student) => ({ label: student.fullName, value: student.id }))
            ]}
            value={filters.studentId}
          />
        </FormField>
        <FormField htmlFor="program-type" label="نوع">
          <Select
            id="program-type"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                programType: event.target.value as ProgramFilterType
              }))
            }
            options={[
              { label: "همه", value: "all" },
              ...Object.entries(programTypeLabels).map(([value, label]) => ({ label, value }))
            ]}
            value={filters.programType}
          />
        </FormField>
        <FormField htmlFor="program-status" label="وضعیت">
          <Select
            id="program-status"
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as ProgramFilterStatus
              }))
            }
            options={[
              { label: "همه", value: "all" },
              ...Object.entries(programStatusLabels).map(([value, label]) => ({ label, value }))
            ]}
            value={filters.status}
          />
        </FormField>
        <FormField htmlFor="program-date" label="بازه زمانی">
          <Select
            id="program-date"
            onChange={(event) =>
              setFilters((current) => ({ ...current, dateRange: event.target.value }))
            }
            options={[
              { label: "همه", value: "all" },
              { label: "ماه جاری", value: "month" },
              { label: "سه ماه اخیر", value: "quarter" }
            ]}
            value={filters.dateRange}
          />
        </FormField>
      </div>
    </Card>
  );
}

function ProgramsTable({
  onCreateVersion,
  onDelete,
  onDuplicate,
  rows
}: {
  onCreateVersion: (row: ProgramRow) => void;
  onDelete: (row: ProgramRow) => void;
  onDuplicate: (row: ProgramRow) => void;
  rows: ProgramRow[];
}) {
  const navigate = useNavigate();
  const columns: Array<TableColumn<ProgramRow>> = [
    {
      cell: (row) => (
        <div>
          <div className={styles.programTitle}>{row.title}</div>
          <span className={styles.programMeta}>{row.studentName}</span>
        </div>
      ),
      header: "برنامه",
      id: "title"
    },
    { cell: (row) => programTypeLabels[row.programType], header: "نوع", id: "type" },
    { cell: (row) => row.version, header: "نسخه", id: "version" },
    { cell: (row) => formatDate(row.createdAt), header: "ایجاد", id: "created" },
    { cell: (row) => formatDate(row.updatedAt), header: "ویرایش", id: "updated" },
    {
      cell: (row) => (
        <StatusBadge variant={row.status === "draft" ? "warning" : "success"}>
          {programStatusLabels[row.status]}
        </StatusBadge>
      ),
      header: "وضعیت",
      id: "status"
    },
    { cell: (row) => <PdfBadge status={row.pdfStatus} />, header: "PDF", id: "pdf" },
    {
      cell: (row) => (
        <ProgramActions
          onCreateVersion={onCreateVersion}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          row={row}
        />
      ),
      header: "عملیات",
      id: "actions",
      width: "340px"
    }
  ];
  void navigate;
  return (
    <Table ariaLabel="لیست برنامه‌ها" columns={columns} data={rows} getRowKey={(row) => row.id} />
  );
}

function ProgramCard(props: {
  onCreateVersion: (row: ProgramRow) => void;
  onDelete: (row: ProgramRow) => void;
  onDuplicate: (row: ProgramRow) => void;
  row: ProgramRow;
}) {
  const { row } = props;
  return (
    <Card className={styles.programCard}>
      <div className={styles.programCardHeader}>
        <div>
          <div className={styles.programTitle}>{row.title}</div>
          <span className={styles.programMeta}>{row.studentName}</span>
        </div>
        <div className={styles.programBadges}>
          <StatusBadge variant={row.status === "draft" ? "warning" : "success"}>
            {programStatusLabels[row.status]}
          </StatusBadge>
          <PdfBadge status={row.pdfStatus} />
        </div>
      </div>
      <div className={styles.metaGrid}>
        <MetaBox label="نوع" value={programTypeLabels[row.programType]} />
        <MetaBox label="نسخه" value={row.version} />
        <MetaBox label="ایجاد" value={formatDate(row.createdAt)} />
        <MetaBox label="ویرایش" value={formatDate(row.updatedAt)} />
      </div>
      <ProgramActions {...props} />
    </Card>
  );
}

function ProgramActions({
  onCreateVersion,
  onDelete,
  onDuplicate,
  row
}: {
  onCreateVersion: (row: ProgramRow) => void;
  onDelete: (row: ProgramRow) => void;
  onDuplicate: (row: ProgramRow) => void;
  row: ProgramRow;
}) {
  const navigate = useNavigate();
  return (
    <div className={styles.programActions}>
      <Button
        iconStart={<Eye size={16} />}
        onClick={() => navigate(`/programs/${row.id}`)}
        size="sm"
        variant="secondary"
      >
        مشاهده
      </Button>
      <Button
        onClick={() => navigate(`/programs/${row.id}?mode=edit`)}
        size="sm"
        variant="secondary"
      >
        ویرایش
      </Button>
      <Button
        iconStart={<Copy size={16} />}
        onClick={() => onDuplicate(row)}
        size="sm"
        variant="secondary"
      >
        Duplicate
      </Button>
      <Button
        iconStart={<Plus size={16} />}
        onClick={() => onCreateVersion(row)}
        size="sm"
        variant="secondary"
      >
        نسخه جدید
      </Button>
      <Button
        iconStart={<FileText size={16} />}
        onClick={() => navigate(`/students/${row.studentId}/pdf-files`)}
        size="sm"
        variant="secondary"
      >
        PDFها
      </Button>
      <Button
        iconStart={<Trash2 size={16} />}
        onClick={() => onDelete(row)}
        size="sm"
        variant="danger"
      >
        حذف
      </Button>
    </div>
  );
}

function PdfBadge({ status }: { status: ProgramRow["pdfStatus"] }) {
  if (status === "ready") return <StatusBadge variant="success">آماده</StatusBadge>;
  if (status === "generating" || status === "pending" || status === "rendering") {
    return <StatusBadge variant="warning">در حال ساخت</StatusBadge>;
  }
  if (status === "failed") return <StatusBadge variant="danger">خطا</StatusBadge>;
  return <StatusBadge>ندارد</StatusBadge>;
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleDateString("fa-IR");
}

function matchesDateRange(value: string, range: string) {
  if (range === "all") {
    return true;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  const now = Date.now();
  const days = range === "month" ? 31 : 93;
  return now - timestamp <= days * 24 * 60 * 60 * 1000;
}

function ProgramsLoading() {
  return (
    <Card>
      <Skeleton height={90} />
      <Skeleton height={280} />
    </Card>
  );
}
