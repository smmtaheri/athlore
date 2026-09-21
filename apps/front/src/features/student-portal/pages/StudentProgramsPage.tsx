import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronLeft, Dumbbell } from "lucide-react";
import { Card, EmptyState, Skeleton, StatusBadge } from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import {
  studentProgramsRepository,
  type StudentProgramsRepository
} from "../services/studentProgramsRepository";
import styles from "../components/studentPortal.module.css";

function statusLabel(status: StudentProgramSummary["status"]): string {
  return status === "active" ? "برنامه فعلی" : "آماده اجرا";
}

function statusVariant(status: StudentProgramSummary["status"]): "success" | "info" {
  return status === "active" ? "success" : "info";
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
}

export function StudentProgramsPage({
  repository = studentProgramsRepository
}: {
  repository?: StudentProgramsRepository;
}) {
  const [programs, setPrograms] = useState<StudentProgramSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    repository
      .list()
      .then((items) => {
        if (!mounted) return;
        setPrograms(items);
        setStatus("loaded");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [repository]);

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <header className={styles.detailHeader}>
          <p className={styles.eyebrow}>برنامه‌های اختصاصی شما</p>
          <h1 className={styles.welcomeTitle}>برنامه‌های من</h1>
          <p className={styles.lead}>
            برنامه‌هایی که مربی برای شما نهایی کرده است، به‌ترتیب آخرین به‌روزرسانی اینجا قرار می‌گیرند.
          </p>
        </header>

        {status === "loading" ? <Skeleton height={180} /> : null}
        {status === "error" ? (
          <EmptyState description="دریافت برنامه‌ها ممکن نشد. دوباره تلاش کنید." title="خطا در دریافت برنامه" />
        ) : null}
        {status === "loaded" && programs.length === 0 ? (
          <EmptyState
            description="وقتی مربی برنامه شما را نهایی کند، از همین بخش قابل مشاهده و دانلود خواهد بود."
            title="هنوز برنامه‌ای ندارید"
          />
        ) : null}
        {status === "loaded" && programs.length > 0 ? (
          <div className={styles.programCardList}>
            {programs.map((program) => (
              <Link
                className={styles.programCardLink}
                key={program.id}
                to={`${studentPaths.programs}/${program.id}`}
              >
                <Card className={styles.programCard} padding="md">
                  <div className={styles.programCardIcon} aria-hidden>
                    <Dumbbell size={22} />
                  </div>
                  <div className={styles.programCardBody}>
                    <div className={styles.programCardTop}>
                      <div>
                        <h2 className={styles.programCardTitle}>{program.title}</h2>
                        <p className={styles.programCardMeta}>نسخه {program.version}</p>
                      </div>
                      <StatusBadge variant={statusVariant(program.status)}>
                        {statusLabel(program.status)}
                      </StatusBadge>
                    </div>
                    <div className={styles.programCardDetails}>
                      {program.dateRange ? <span>{program.dateRange}</span> : null}
                      <span>
                        <CalendarDays aria-hidden size={15} />
                        به‌روزرسانی {formatDate(program.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <ChevronLeft aria-hidden className={styles.programCardArrow} size={20} />
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
