import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Card, EmptyState, Skeleton } from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import { useAuth } from "../../auth";
import type { BodyCheckDashboardSnapshot } from "../../body-check/types/bodyCheck";
import {
  studentBodyCheckRepository,
  type StudentBodyCheckRepository
} from "../../body-check/services/bodyCheckRepository";
import { formatDeltaKg, formatKg } from "../../body-check/utils/bodyCheckFormat";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { StudentVisitCard } from "../components/StudentVisitCard";
import { myVisitsRepository, type MyVisitsRepository } from "../services/myVisitsRepository";
import { summarizeStudentVisits } from "../utils/studentVisitUi";
import { sortVisitsNewestFirst } from "../../students/utils/visitDates";
import styles from "../components/studentPortal.module.css";

export function StudentDashboardPage({
  bodyCheckRepository = studentBodyCheckRepository,
  repository = myVisitsRepository
}: {
  bodyCheckRepository?: StudentBodyCheckRepository;
  repository?: MyVisitsRepository;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [bodyCheck, setBodyCheck] = useState<BodyCheckDashboardSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const name = auth.session?.student?.fullName || auth.session?.user.fullName || "";

  useEffect(() => {
    let mounted = true;
    Promise.all([repository.list(), bodyCheckRepository.getDashboard()])
      .then(([items, bc]) => {
        if (!mounted) return;
        setVisits(sortVisitsNewestFirst(items));
        setBodyCheck(bc);
        setStatus("loaded");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [bodyCheckRepository, repository]);

  const groups = useMemo(() => summarizeStudentVisits(visits), [visits]);
  const openVisit = groups.openActive[0] ?? null;
  const latestSubmittedVisit = groups.submitted[0] ?? null;
  const today = bodyCheck?.today;
  const todayParts = today
    ? [
        today.completion.hasWeight ? "وزن" : null,
        today.completion.hasSleep ? "خواب" : null,
        today.completion.hasNutrition ? "رژیم" : null
      ].filter(Boolean)
    : [];
  const pendingParts = today
    ? [
        !today.completion.hasWeight ? "وزن" : null,
        !today.completion.hasSleep ? "خواب" : null,
        !today.completion.hasNutrition ? "رژیم" : null
      ].filter(Boolean)
    : ["وزن", "خواب", "رژیم"];

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <header className={styles.stackTight}>
          <p className={styles.eyebrow}>فضای شخصی شما</p>
          <h1 className={styles.welcomeTitle}>سلام{name ? ` ${name}` : ""}</h1>
          <p className={styles.lead}>بادی چک روزانه و ویزیت‌های باز را از اینجا پیگیری کنید.</p>
        </header>

        {status === "loading" ? <Skeleton height={180} /> : null}
        {status === "error" ? (
          <EmptyState description="دریافت اطلاعات داشبورد ممکن نشد." title="خطا" />
        ) : null}

        {status === "loaded" ? (
          <>
            <section className={styles.stackTight} aria-labelledby="bc-today-heading">
              <h2 className={styles.sectionTitle} id="bc-today-heading">
                بادی چک امروز
              </h2>
              {!bodyCheck ? (
                <Card padding="md">
                  <p className={styles.muted}>
                    هنوز دوره بادی چک فعالی ندارید. وقتی مربی دوره بسازد اینجا نمایش داده می‌شود.
                  </p>
                </Card>
              ) : !bodyCheck.todayInCycle || !today ? (
                <Card padding="md">
                  <p className={styles.muted}>امروز خارج از بازه دوره فعال بادی چک است.</p>
                  <Button
                    onClick={() => navigate(studentPaths.bodyCheck)}
                    size="sm"
                    variant="secondary"
                  >
                    مشاهده بادی چک
                  </Button>
                </Card>
              ) : (
                <Card className={styles.visitCardOpen} padding="md">
                  <div className={styles.stackTight}>
                    <p className={styles.muted}>
                      وضعیت امروز:{" "}
                      {today.isLogged ? `ثبت‌شده (${todayParts.join("، ") || "جزئی"})` : "ثبت‌نشده"}
                    </p>
                    {pendingParts.length > 0 ? (
                      <p className={styles.muted}>مانده: {pendingParts.join("، ")}</p>
                    ) : (
                      <p className={styles.muted}>بخش‌های اصلی امروز تکمیل شده است.</p>
                    )}
                    {bodyCheck.lastActualWeightKg != null ? (
                      <p className={styles.muted}>
                        آخرین وزن: {formatKg(bodyCheck.lastActualWeightKg)}
                        {bodyCheck.lastWeightDeltaKg != null
                          ? ` · اختلاف با هدف روز: ${formatDeltaKg(bodyCheck.lastWeightDeltaKg)}`
                          : ""}
                      </p>
                    ) : null}
                    <Button onClick={() => navigate(studentPaths.bodyCheck)}>
                      ثبت بادی چک امروز
                    </Button>
                  </div>
                </Card>
              )}
            </section>

            {openVisit ? (
              <section className={styles.stackTight} aria-labelledby="visit-action-heading">
                <h2 className={styles.sectionTitle} id="visit-action-heading">
                  ویزیت باز
                </h2>
                <StudentVisitCard
                  onOpen={(id) => navigate(`${studentPaths.visits}/${id}`)}
                  visit={openVisit}
                />
              </section>
            ) : null}

            {latestSubmittedVisit ? (
              <section
                className={styles.stackTight}
                aria-labelledby="latest-submitted-visit-heading"
              >
                <h2 className={styles.sectionTitle} id="latest-submitted-visit-heading">
                  آخرین ویزیت ارسال‌شده
                </h2>
                <StudentVisitCard
                  onOpen={(id) => navigate(`${studentPaths.visits}/${id}`)}
                  visit={latestSubmittedVisit}
                />
              </section>
            ) : null}

            <div>
              <Link className={styles.textLink} to={studentPaths.visits}>
                مشاهدهٔ همهٔ ویزیت‌ها
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
