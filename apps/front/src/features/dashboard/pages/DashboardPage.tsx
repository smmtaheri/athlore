import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, Plus, RefreshCcw, Settings, UserPlus, Users } from "lucide-react";
import { ContentSection, PageContainer, PageHeader } from "../../../components/layout";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { fetchDashboardMetrics } from "../../../shared/api/repositories";
import { studentPdfFilesRepository } from "../../students/services/studentPdfFilesRepository";
import { studentProgramsRepository } from "../../students/services/studentProgramsRepository";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import { studentsRepository } from "../../students/services/studentsRepository";
import { programStatusLabels, programTypeLabels } from "../../students/types/programLabels";
import type { Student } from "../../students/types/student";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import {
  calculateDashboardMetrics,
  type BodyCheckTodayItem,
  type DashboardMetrics
} from "../services/dashboardMetrics";
import {
  formatBodyCheckDate,
  formatClockTime,
  formatDeltaKg,
  formatKg
} from "../../body-check/utils/bodyCheckFormat";
import styles from "../../programs/components/programFlow.module.css";
import mvpStyles from "../../programs/components/mvp.module.css";

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [primaryStudentId, setPrimaryStudentId] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const load = appConfig.useMockRepositories
      ? Promise.all([
          studentsRepository.list(),
          studentProgramsRepository.list?.() ?? Promise.resolve([]),
          studentVisitsRepository.list?.() ?? Promise.resolve([]),
          studentPdfFilesRepository.list?.() ?? Promise.resolve([])
        ]).then(([students, programs, visits, pdfFiles]) => {
          setPrimaryStudentId(students[0]?.id ?? "");
          return calculateDashboardMetrics({
            pdfFiles: pdfFiles as StudentPdfFile[],
            programs: programs as StudentProgramSummary[],
            students: students as Student[],
            visits: visits as StudentVisit[]
          });
        })
      : fetchDashboardMetrics().then(async (data) => {
          const students = await studentsRepository.list();
          setPrimaryStudentId(students[0]?.id ?? "");
          return data;
        });

    load
      .then((data) => {
        if (!mounted) return;
        setMetrics(data);
        setStatus("loaded");
      })
      .catch(() => mounted && setStatus("error"));

    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={["داشبورد"]}
        description="نمای کلی شاگردها، ویزیت‌ها، برنامه‌ها و وضعیت PDF"
        title="داشبورد مربی"
      />
      <ContentSection>
        {status === "loading" ? <DashboardLoading /> : null}
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
              description="دریافت داده‌های داشبورد با خطا روبه‌رو شد."
              title="خطای داشبورد"
            />
          </Card>
        ) : null}
        {status === "loaded" && metrics ? (
          <DashboardContent metrics={metrics} primaryStudentId={primaryStudentId} />
        ) : null}
      </ContentSection>
    </PageContainer>
  );
}

function DashboardContent({
  metrics,
  primaryStudentId
}: {
  metrics: DashboardMetrics;
  primaryStudentId: string;
}) {
  const visitPath = primaryStudentId ? `/students/${primaryStudentId}/visits/new` : "/students";
  const programPath = primaryStudentId
    ? `/programs/new?studentId=${primaryStudentId}`
    : "/programs/new";

  return (
    <div className={mvpStyles.pageStack}>
      <BodyCheckTodaySection asOf={metrics.asOf} items={metrics.bodyCheckToday} />
      <div className={mvpStyles.metricGrid}>
        <Metric title="کل شاگردها" value={metrics.totalStudents} />
        <Metric title="شاگردهای فعال" value={metrics.activeStudents} />
        <Metric title="ویزیت‌های این ماه" value={metrics.thisMonthVisits} />
        <Metric title="برنامه‌های Draft" value={metrics.draftPrograms} />
        <Metric title="برنامه‌های Final" value={metrics.finalPrograms} />
        <Metric
          title="PDF آماده"
          value={metrics.readyPdfFiles}
          hint={
            metrics.pdfGenerationAvailable === false
              ? "تولید فایل PDF در این نسخه فعال نیست"
              : "فایل‌های آماده شاگردان"
          }
        />
      </div>
      <Card className={mvpStyles.quickActions}>
        <Link to="/students/new">
          <Button iconStart={<UserPlus size={18} />}>افزودن شاگرد</Button>
        </Link>
        <Link to={visitPath}>
          <Button iconStart={<Plus size={18} />} variant="secondary">
            ثبت ویزیت
          </Button>
        </Link>
        <Link to={programPath}>
          <Button iconStart={<FileText size={18} />} variant="secondary">
            ساخت برنامه
          </Button>
        </Link>
        <Link to="/programs">
          <Button iconStart={<Users size={18} />} variant="secondary">
            مشاهده برنامه‌ها
          </Button>
        </Link>
        <Link to="/coach-rules">
          <Button iconStart={<Settings size={18} />} variant="secondary">
            مدیریت قوانین مربی
          </Button>
        </Link>
      </Card>
      <div className={mvpStyles.twoColumn}>
        <DashboardList
          title="کارهای امروز"
          items={metrics.todayTasks.map((task) => ({ id: task, title: task, meta: "امروز" }))}
        />
        <DashboardList
          title="ویزیت‌های عقب‌افتاده"
          items={metrics.overdueVisits.map((student) => ({
            id: student.id,
            title: student.fullName,
            meta: student.summary.lastVisitDate || "بدون ویزیت"
          }))}
        />
        <DashboardList
          title="آخرین برنامه‌ها"
          items={metrics.latestPrograms.map((program) => ({
            id: program.id,
            title: program.title,
            meta: `${programTypeLabels[program.programType]} - ${programStatusLabels[program.status]}`
          }))}
        />
        <DashboardList
          title="آخرین ویزیت‌ها"
          items={metrics.latestVisits.map((visit) => ({
            id: visit.id,
            title: visit.nextCycleGoal || "ویزیت",
            meta: visit.visitDate
          }))}
        />
        <DashboardList
          title="نیاز به پیگیری"
          items={metrics.followUpStudents.map((student) => ({
            id: student.id,
            title: student.fullName,
            meta: student.summary.medicalNote || "پیگیری وضعیت"
          }))}
        />
      </div>
    </div>
  );
}

type BodyCheckState = "complete" | "missing" | "partial";

function bodyCheckState(item: BodyCheckTodayItem): BodyCheckState {
  if (!item.isLogged) return "missing";
  return item.completion.hasWeight && item.completion.hasSleep && item.completion.hasNutrition
    ? "complete"
    : "partial";
}

function sleepSummary(item: BodyCheckTodayItem): string {
  if (item.sleepStartTime && item.wakeTime) {
    return `خواب: ${formatClockTime(item.sleepStartTime)} تا ${formatClockTime(item.wakeTime)}`;
  }
  if (item.sleepStartTime) return `خواب: از ${formatClockTime(item.sleepStartTime)} · بیداری ثبت نشده`;
  if (item.wakeTime) return `خواب: ساعت خواب ثبت نشده · بیداری ${formatClockTime(item.wakeTime)}`;
  return "خواب: ثبت نشده";
}

export function BodyCheckTodaySection({ asOf, items }: { asOf: string; items: BodyCheckTodayItem[] }) {
  const missing = items.filter((item) => bodyCheckState(item) === "missing");
  const partial = items.filter((item) => bodyCheckState(item) === "partial");
  const complete = items.filter((item) => bodyCheckState(item) === "complete");
  const logged = items.filter((item) => item.isLogged);
  return (
    <Card className={mvpStyles.bodyCheckCard}>
      <div className={mvpStyles.bodyCheckHeader}>
        <div>
          <h2 className={styles.sectionTitle}>پیگیری بادی‌چک امروز</h2>
          <p className={styles.sectionDescription}>
            {formatBodyCheckDate(asOf)} · وضعیت شاگردهای دارای دوره فعال امروز
          </p>
          {items.length > 0 ? (
            <p className={styles.sectionDescription}>
              از {items.length} شاگرد دارای دوره فعال، {logged.length} نفر امروز بادی‌چک را ثبت کرده‌اند و {missing.length} نفر هنوز ثبت نکرده‌اند.
            </p>
          ) : null}
        </div>
        {items.length > 0 ? <StatusBadge>{items.length} دوره فعال</StatusBadge> : null}
      </div>

      {items.length === 0 ? (
        <EmptyState
          description="فعلاً هیچ شاگردی دوره‌ی فعال بادی‌چک ندارد."
          title="دوره فعال بادی‌چک وجود ندارد"
        />
      ) : (
        <>
          <div className={mvpStyles.bodyCheckCounts}>
            <StatusBadge>{items.length} کل</StatusBadge>
            <StatusBadge variant="success">{logged.length} ثبت‌شده</StatusBadge>
            <StatusBadge variant="warning">{missing.length} ثبت نشده</StatusBadge>
            <StatusBadge variant="info">{partial.length} ناقص</StatusBadge>
            <StatusBadge variant="success">{complete.length} کامل</StatusBadge>
          </div>
          <BodyCheckGroup items={[...missing, ...partial]} title="نیاز به پیگیری" />
          <BodyCheckGroup items={complete} title="ثبت کامل امروز" />
        </>
      )}
    </Card>
  );
}

function BodyCheckGroup({ items, title }: { items: BodyCheckTodayItem[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div className={mvpStyles.bodyCheckGroup}>
      <strong>{title}</strong>
      <div className={mvpStyles.bodyCheckList}>
        {items.map((item) => {
          const state = bodyCheckState(item);
          const label = state === "missing" ? "ثبت نشده" : state === "partial" ? "ثبت ناقص" : "کامل";
          const variant = state === "missing" ? "warning" : state === "partial" ? "info" : "success";
          return (
            <Link
              className={mvpStyles.bodyCheckItem}
              key={item.cycleId}
              to={`/students/${item.studentId}/body-check`}
            >
              <div className={mvpStyles.bodyCheckIdentity}>
                <strong>{item.studentName}</strong>
                <StatusBadge variant={variant}>{label}</StatusBadge>
              </div>
              <div className={mvpStyles.bodyCheckDetails}>
                <span>وزن: {item.actualWeightKg == null ? "ثبت نشده" : formatKg(item.actualWeightKg)}</span>
                <span>هدف: {item.targetWeightKg == null ? "ثبت نشده" : formatKg(item.targetWeightKg)}</span>
                <span>اختلاف: {item.weightDeltaKg == null ? "ثبت نشده" : formatDeltaKg(item.weightDeltaKg)}</span>
                <span>{sleepSummary(item)}</span>
                <span>نمره خواب: {item.sleepQualityScore == null ? "ثبت نشده" : `${item.sleepQualityScore} از ۱۰`}</span>
                <span>رژیم: {item.nutritionAdherenceScore == null ? "ثبت نشده" : `${item.nutritionAdherenceScore} از ۱۰`}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ hint, title, value }: { hint?: string; title: string; value: number }) {
  return (
    <Card className={mvpStyles.metricCard}>
      <span>{title}</span>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </Card>
  );
}

function DashboardList({
  items,
  title
}: {
  items: Array<{ id: string; meta: string; title: string }>;
  title: string;
}) {
  return (
    <Card className={mvpStyles.listCard}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {items.length === 0 ? <StatusBadge>موردی ثبت نشده</StatusBadge> : null}
      {items.map((item) => (
        <div className={mvpStyles.listItem} key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
        </div>
      ))}
    </Card>
  );
}

function DashboardLoading() {
  return (
    <Card>
      <Skeleton height={120} />
      <Skeleton height={240} />
    </Card>
  );
}
