import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Skeleton } from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { StudentVisitCard } from "../components/StudentVisitCard";
import { myVisitsRepository, type MyVisitsRepository } from "../services/myVisitsRepository";
import { matchesStudentVisitFilter, type StudentVisitFilter } from "../utils/studentVisitUi";
import { sortVisitsNewestFirst } from "../../students/utils/visitDates";
import styles from "../components/studentPortal.module.css";
import { cx } from "../../../utils/classNames";

const filters: { id: StudentVisitFilter; label: string }[] = [
  { id: "all", label: "همه" },
  { id: "action", label: "نیازمند اقدام" },
  { id: "submitted", label: "ارسال‌شده" },
  { id: "finalized", label: "نهایی‌شده" },
  { id: "expired", label: "منقضی‌شده" }
];

export function StudentVisitsPage({
  repository = myVisitsRepository
}: {
  repository?: MyVisitsRepository;
}) {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [filter, setFilter] = useState<StudentVisitFilter>("all");

  useEffect(() => {
    let mounted = true;
    repository
      .list()
      .then((items) => {
        if (!mounted) return;
        setVisits(sortVisitsNewestFirst(items));
        setStatus("loaded");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [repository]);

  const filtered = useMemo(
    () => visits.filter((visit) => matchesStudentVisitFilter(visit, filter)),
    [filter, visits]
  );

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <header className={styles.stackTight}>
          <h1 className={styles.welcomeTitle}>ویزیت‌های من</h1>
          <p className={styles.lead}>
            ویزیت‌های باز را تکمیل کنید و تاریخچهٔ ارسال‌شده، نهایی و منقضی را ببینید.
          </p>
        </header>

        <div aria-label="فیلتر ویزیت‌ها" className={styles.filterBar} role="group">
          {filters.map((item) => (
            <button
              aria-pressed={filter === item.id}
              className={cx(styles.filterChip, filter === item.id && styles.filterChipActive)}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {status === "loading" ? <Skeleton height={160} /> : null}
        {status === "error" ? (
          <EmptyState description="دریافت ویزیت‌ها ممکن نشد." title="خطا" />
        ) : null}

        {status === "loaded" && filtered.length === 0 ? (
          <EmptyState
            description={
              visits.length === 0
                ? "هنوز ویزیتی برای شما ارسال نشده است."
                : "در این فیلتر موردی پیدا نشد."
            }
            title="موردی نیست"
          />
        ) : null}

        {status === "loaded" && filtered.length > 0 ? (
          <div className={styles.cardList}>
            {filtered.map((visit) => (
              <StudentVisitCard
                key={visit.id}
                onOpen={(id) => navigate(`${studentPaths.visits}/${id}`)}
                visit={visit}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
