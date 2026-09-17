import { useEffect, useState } from "react";
import {
  Download,
  Eye,
  FilePlus2,
  FileText,
  Link2,
  Link2Off,
  Plus,
  RefreshCcw,
  Trash2
} from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Modal,
  Skeleton,
  StatusBadge,
  Table
} from "../../../components/ui";
import type { StatusBadgeVariant, TableColumn } from "../../../components/ui";
import { apiDownload } from "../../../shared/api/client";
import {
  studentPdfFilesRepository,
  type StudentPdfFilesRepository
} from "../services/studentPdfFilesRepository";
import type { StudentPdfFile, StudentPdfFileStatus } from "../types/pdfFile";
import type { Student } from "../types/student";
import { programTypeLabels } from "../types/programLabels";
import { ProfileTabHeader, SummaryMetricCard } from "./ProfileTabHeader";
import styles from "./students.module.css";

export interface StudentPdfFilesTabProps {
  repository?: StudentPdfFilesRepository;
  student: Student;
}

const pdfStatusLabels: Record<StudentPdfFileStatus, string> = {
  failed: "خطا",
  generating: "در حال ساخت",
  pending: "در صف",
  ready: "آماده",
  rendering: "در حال ساخت"
};

const pdfStatusVariant: Record<StudentPdfFileStatus, StatusBadgeVariant> = {
  failed: "danger",
  generating: "info",
  pending: "info",
  ready: "success",
  rendering: "info"
};

export function StudentPdfFilesTab({
  repository = studentPdfFilesRepository,
  student
}: StudentPdfFilesTabProps) {
  const [feedback, setFeedback] = useState("");
  const [fileToDelete, setFileToDelete] = useState<StudentPdfFile | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<StudentPdfFile[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    repository
      .listByStudent(student.id)
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setFiles(items);
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

  const lastFileDate = files[0]?.generatedAt.split(" - ")[0] ?? "ثبت نشده";
  const usedStorage = formatStorageUsage(files);

  const handleRetry = () => {
    setStatus("loading");
    setReloadKey((current) => current + 1);
  };

  const handleDelete = async () => {
    if (!fileToDelete) {
      return;
    }

    try {
      await repository.remove(fileToDelete.id);
      setFiles((current) => current.filter((file) => file.id !== fileToDelete.id));
      setFeedback("فایل PDF حذف شد.");
      setFileToDelete(null);
    } catch {
      setFeedback("حذف فایل PDF انجام نشد. لطفا دوباره تلاش کنید.");
    }
  };

  const handleDownload = async (file: StudentPdfFile) => {
    if (file.status !== "ready") {
      setFeedback("فقط فایل‌های آماده قابل دانلود هستند.");
      return;
    }
    if (!repository.download) {
      setFeedback("دانلود در این حالت در دسترس نیست.");
      return;
    }
    try {
      await repository.download(file.id, file.fileName);
      setFeedback("دانلود فایل PDF آغاز شد.");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "token_expired") {
        setFeedback("نشست شما منقضی شده است. دوباره وارد شوید.");
      } else {
        setFeedback("دانلود فایل PDF انجام نشد.");
      }
    }
  };

  const handleView = async (file: StudentPdfFile) => {
    if (file.status !== "ready") {
      setFeedback("فقط فایل‌های آماده قابل مشاهده هستند.");
      return;
    }
    try {
      const result = await apiDownload(`/pdf-files/${file.id}/download/`);
      const url = URL.createObjectURL(result.blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setFeedback("مرورگر پنجره جدید را مسدود کرد. اجازه پاپ‌آپ را فعال کنید.");
      } else {
        setFeedback("پیش‌نمایش PDF در تب جدید باز شد.");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "token_expired") {
        setFeedback("نشست شما منقضی شده است. دوباره وارد شوید.");
      } else {
        setFeedback("مشاهده فایل PDF انجام نشد.");
      }
    }
  };

  const handleShare = async (file: StudentPdfFile) => {
    if (file.status !== "ready") {
      setFeedback("فقط فایل‌های آماده قابل اشتراک‌گذاری هستند.");
      return;
    }
    if (!repository.createShare) {
      setFeedback("اشتراک‌گذاری در این حالت در دسترس نیست.");
      return;
    }
    setBusyId(file.id);
    try {
      const result = await repository.createShare(file.id, { expiresInDays: 7 });
      setFiles((current) =>
        current.map((item) =>
          item.id === file.id ? { ...item, hasActiveShare: true, shareUrl: result.shareUrl } : item
        )
      );
      setShareUrl(result.shareUrl);
      try {
        await navigator.clipboard.writeText(result.shareUrl);
        setFeedback("لینک اشتراک ساخته و در کلیپ‌بورد کپی شد.");
      } catch {
        setFeedback("لینک اشتراک ساخته شد.");
      }
    } catch {
      setFeedback("ساخت لینک اشتراک انجام نشد.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeShare = async (file: StudentPdfFile) => {
    if (!repository.revokeShare) {
      setFeedback("لغو اشتراک در این حالت در دسترس نیست.");
      return;
    }
    setBusyId(file.id);
    try {
      await repository.revokeShare(file.id);
      setFiles((current) =>
        current.map((item) =>
          item.id === file.id ? { ...item, hasActiveShare: false, shareUrl: undefined } : item
        )
      );
      setFeedback("لینک اشتراک لغو شد.");
    } catch {
      setFeedback("لغو لینک اشتراک انجام نشد.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (file: StudentPdfFile) => {
    setBusyId(file.id);
    try {
      const next = await repository.regenerate(file.id);
      setFiles((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setFeedback("فایل PDF دوباره ساخته شد.");
      setReloadKey((current) => current + 1);
    } catch {
      setFeedback("بازسازی فایل PDF انجام نشد.");
    } finally {
      setBusyId(null);
    }
  };

  if (status === "loading") {
    return <PdfFilesLoadingState />;
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
          description="دریافت فایل های PDF شاگرد با خطا روبه رو شد."
          title="خطای دریافت فایل ها"
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
            data-testid="pdf-create-hint"
            iconStart={<Plus size={18} />}
            onClick={() =>
              setFeedback(
                "برای ساخت PDF از صفحه برنامه، ابتدا نسخه را نهایی کنید و سپس «ساخت PDF» را بزنید. خروجی شامل فایل تمرین و فایل تغذیه/مکمل است."
              )
            }
          >
            ساخت PDF جدید
          </Button>
        }
        description="خروجی‌های شاگرد: فایل تمرین و فایل تغذیه/مکمل (نه یک PDF ترکیبی)"
        title="فایل های PDF"
      />

      <div className={styles.summaryMetricGrid}>
        <SummaryMetricCard
          hint="همه خروجی های شاگرد"
          icon={FileText}
          label="تعداد فایل های PDF"
          value={files.length}
        />
        <SummaryMetricCard
          hint="بر اساس آخرین فایل"
          icon={FileText}
          label="تاریخ آخرین فایل"
          value={lastFileDate}
        />
        <SummaryMetricCard
          hint="از فضای ذخیره"
          icon={FileText}
          label="فضای مصرف شده"
          value={usedStorage}
        />
      </div>

      {files.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            action={
              <Button
                iconStart={<FilePlus2 size={18} />}
                onClick={() =>
                  setFeedback(
                    "برای ساخت PDF از صفحه برنامه، ابتدا نسخه را نهایی کنید و سپس «ساخت PDF» را بزنید."
                  )
                }
              >
                ساخت PDF جدید
              </Button>
            }
            description="برای این شاگرد هنوز فایل PDF ثبت نشده است."
            title="هنوز فایل PDF وجود ندارد"
          />
        </Card>
      ) : (
        <Card className={styles.tabTableCard}>
          <div className={styles.desktopList}>
            <PdfFilesTable
              busyId={busyId}
              files={files}
              onDelete={setFileToDelete}
              onDownload={handleDownload}
              onRegenerate={handleRegenerate}
              onRevokeShare={handleRevokeShare}
              onShare={handleShare}
              onView={handleView}
            />
          </div>
          <div className={styles.mobileList}>
            <div className={styles.cardList}>
              {files.map((file) => (
                <PdfFileCard
                  busyId={busyId}
                  file={file}
                  key={file.id}
                  onDelete={setFileToDelete}
                  onDownload={handleDownload}
                  onRegenerate={handleRegenerate}
                  onRevokeShare={handleRevokeShare}
                  onShare={handleShare}
                  onView={handleView}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal
        footer={
          <>
            <Button onClick={() => setFileToDelete(null)} variant="secondary">
              انصراف
            </Button>
            <Button iconStart={<Trash2 size={18} />} onClick={handleDelete} variant="danger">
              حذف
            </Button>
          </>
        }
        onClose={() => setFileToDelete(null)}
        open={Boolean(fileToDelete)}
        title="حذف فایل PDF"
      >
        <p className={styles.modalText}>آیا از حذف فایل {fileToDelete?.fileName} مطمئن هستید؟</p>
        <p className={styles.dangerText}>این عملیات قابل بازگشت نیست.</p>
      </Modal>

      <Modal
        footer={
          <Button onClick={() => setShareUrl(null)} variant="secondary">
            بستن
          </Button>
        }
        onClose={() => setShareUrl(null)}
        open={Boolean(shareUrl)}
        title="لینک اشتراک PDF"
      >
        <p className={styles.modalText}>این لینک تا ۷ روز معتبر است و بدون ورود قابل دانلود است.</p>
        <p className={styles.modalText} data-testid="pdf-share-url">
          {shareUrl}
        </p>
      </Modal>
    </div>
  );
}

interface PdfTableActions {
  busyId: string | null;
  onDelete: (file: StudentPdfFile) => void;
  onDownload: (file: StudentPdfFile) => void;
  onRegenerate: (file: StudentPdfFile) => void;
  onRevokeShare: (file: StudentPdfFile) => void;
  onShare: (file: StudentPdfFile) => void;
  onView: (file: StudentPdfFile) => void;
}

interface PdfFilesTableProps extends PdfTableActions {
  files: StudentPdfFile[];
}

function PdfFilesTable({
  busyId,
  files,
  onDelete,
  onDownload,
  onRegenerate,
  onRevokeShare,
  onShare,
  onView
}: PdfFilesTableProps) {
  const columns: Array<TableColumn<StudentPdfFile>> = [
    {
      cell: (file) => <span className={styles.recordTitle}>{file.fileName}</span>,
      header: "نام فایل",
      id: "fileName"
    },
    {
      cell: (file) => file.programTitle,
      header: "عنوان برنامه",
      id: "programTitle"
    },
    {
      cell: (file) => (
        <StatusBadge variant={file.contentType === "complete" ? "purple" : "info"}>
          {programTypeLabels[file.contentType]}
        </StatusBadge>
      ),
      header: "نوع محتوا",
      id: "contentType"
    },
    {
      cell: (file) => file.version,
      header: "نسخه",
      id: "version"
    },
    {
      cell: (file) => file.generatedAt,
      header: "تاریخ تولید",
      id: "generatedAt"
    },
    {
      cell: (file) => file.size,
      header: "حجم فایل",
      id: "size"
    },
    {
      cell: (file) => (
        <StatusBadge variant={pdfStatusVariant[file.status]}>
          {pdfStatusLabels[file.status]}
        </StatusBadge>
      ),
      header: "وضعیت",
      id: "status"
    },
    {
      align: "end",
      cell: (file) => (
        <PdfActions
          busy={busyId === file.id}
          file={file}
          onDelete={() => onDelete(file)}
          onDownload={() => onDownload(file)}
          onRegenerate={() => onRegenerate(file)}
          onRevokeShare={() => onRevokeShare(file)}
          onShare={() => onShare(file)}
          onView={() => onView(file)}
        />
      ),
      header: "",
      id: "actions",
      width: "200px"
    }
  ];

  return (
    <Table
      ariaLabel="فایل های PDF شاگرد"
      columns={columns}
      data={files}
      getRowKey={(file) => file.id}
    />
  );
}

interface PdfFileCardProps extends PdfTableActions {
  file: StudentPdfFile;
}

function PdfFileCard({
  busyId,
  file,
  onDelete,
  onDownload,
  onRegenerate,
  onRevokeShare,
  onShare,
  onView
}: PdfFileCardProps) {
  return (
    <Card className={styles.studentCard} padding="md" data-testid="student-pdf-card">
      <div className={styles.studentCardHeader}>
        <div className={styles.studentCardTitleText}>
          <span className={styles.studentName}>{file.fileName}</span>
          <span>{file.programTitle}</span>
        </div>
        <PdfActions
          busy={busyId === file.id}
          file={file}
          onDelete={() => onDelete(file)}
          onDownload={() => onDownload(file)}
          onRegenerate={() => onRegenerate(file)}
          onRevokeShare={() => onRevokeShare(file)}
          onShare={() => onShare(file)}
          onView={() => onView(file)}
        />
      </div>
      <div className={styles.badgeGroup}>
        <StatusBadge variant={file.contentType === "complete" ? "purple" : "info"}>
          {programTypeLabels[file.contentType]}
        </StatusBadge>
        <StatusBadge variant={pdfStatusVariant[file.status]}>
          {pdfStatusLabels[file.status]}
        </StatusBadge>
      </div>
      <div className={styles.metricGrid}>
        <PdfMetric label="نسخه" value={file.version} />
        <PdfMetric label="حجم فایل" value={file.size} />
        <PdfMetric label="تاریخ تولید" value={file.generatedAt} />
      </div>
    </Card>
  );
}

interface PdfActionsProps {
  busy: boolean;
  file: StudentPdfFile;
  onDelete: () => void;
  onDownload: () => void;
  onRegenerate: () => void;
  onRevokeShare: () => void;
  onShare: () => void;
  onView: () => void;
}

function PdfActions({
  busy,
  file,
  onDelete,
  onDownload,
  onRegenerate,
  onRevokeShare,
  onShare,
  onView
}: PdfActionsProps) {
  const isReady = file.status === "ready";

  return (
    <div className={styles.pdfIconActions}>
      <IconButton
        aria-label="مشاهده PDF"
        className={styles.pdfIconAction}
        data-testid="pdf-view"
        disabled={!isReady || busy}
        icon={<Eye size={16} strokeWidth={1.75} />}
        onClick={onView}
        title="مشاهده"
        variant="ghost"
      />
      <IconButton
        aria-label="دانلود PDF"
        className={styles.pdfIconAction}
        data-testid="pdf-download-direct"
        disabled={!isReady || busy}
        icon={<Download size={16} strokeWidth={1.75} />}
        onClick={onDownload}
        title="دانلود"
        variant="ghost"
      />
      {file.hasActiveShare ? (
        <IconButton
          aria-label="لغو لینک اشتراک"
          className={styles.pdfIconAction}
          data-testid="pdf-revoke-share"
          disabled={busy}
          icon={<Link2Off size={16} strokeWidth={1.75} />}
          onClick={onRevokeShare}
          title="لغو اشتراک"
          variant="ghost"
        />
      ) : (
        <IconButton
          aria-label="اشتراک PDF"
          className={styles.pdfIconAction}
          data-testid="pdf-share"
          disabled={!isReady || busy}
          icon={<Link2 size={16} strokeWidth={1.75} />}
          onClick={onShare}
          title="اشتراک"
          variant="ghost"
        />
      )}
      <IconButton
        aria-label="بازسازی PDF"
        className={styles.pdfIconAction}
        data-testid="pdf-regenerate"
        disabled={busy}
        icon={<RefreshCcw size={16} strokeWidth={1.75} />}
        onClick={onRegenerate}
        title="بازسازی"
        variant="ghost"
      />
      <IconButton
        aria-label="حذف PDF"
        className={`${styles.pdfIconAction} ${styles.pdfIconActionDanger}`}
        data-testid="pdf-delete"
        disabled={busy}
        icon={<Trash2 size={16} strokeWidth={1.75} />}
        onClick={onDelete}
        title="حذف"
        variant="ghost"
      />
    </div>
  );
}

function PdfMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}

function PdfFilesLoadingState() {
  return (
    <Card aria-label="در حال بارگذاری فایل های PDF">
      <Skeleton height={72} />
      <Skeleton height={160} />
      <Skeleton height={260} />
    </Card>
  );
}

function formatStorageUsage(files: StudentPdfFile[]): string {
  const totalBytes = files.reduce((total, file) => total + (file.sizeBytes ?? 0), 0);
  if (totalBytes > 0) {
    return `${(totalBytes / (1024 * 1024)).toFixed(2)} مگابایت`;
  }
  const totalMb = files.reduce((total, file) => total + parseSizeToMb(file.size), 0);
  if (totalMb === 0) {
    return "۰ مگابایت";
  }
  return `${totalMb.toFixed(1)} مگابایت`;
}

function parseSizeToMb(size: string): number {
  const normalized = size.trim().toLowerCase();

  if (!normalized || normalized === "-") {
    return 0;
  }

  const parsed = Number(normalized.replace(/[^\d.]/g, ""));

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (normalized.includes("kb")) {
    return parsed / 1024;
  }

  return parsed;
}
