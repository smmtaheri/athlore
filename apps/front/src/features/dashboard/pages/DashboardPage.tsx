import { formatCalendarDate } from "../../../shared/dates/calendar";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Plus,
  RefreshCcw,
  Settings,
  UserPlus,
  Users
} from "lucide-react";
import { ContentSection, PageContainer, PageHeader } from "../../../components/layout";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { fetchDashboardMetrics } from "../../../shared/api/repositories";
import { studentPdfFilesRepository } from "../../students/services/studentPdfFilesRepository";
import { studentProgramsRepository } from "../../students/services/studentProgramsRepository";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import { studentsRepository } from "../../students/services/studentsRepository";
import { programStatusLabels, programTypeLabels } from "../../students/types/programLabels";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import type { Student } from "../../students/types/student";
import type { StudentProgramSummary } from "../../students/types/studentProgram";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import {
  calculateDashboardMetrics,
  type BodyCheckCycleSummary,
  type BodyCheckCycleSummaryItem,
  type BodyCheckTodayItem,
  type DashboardMetrics,
  type DashboardVisit,
  type MonthlyVisitStatus,
  type MonthlyVisitSummary,
  type MonthlyVisitSummaryItem
} from "../services/dashboardMetrics";
import {
  formatBodyCheckDate,
  formatClockTime,
  formatDeltaKg,
  formatKg
} from "../../body-check/utils/bodyCheckFormat";
import styles from "../../programs/components/programFlow.module.css";
import mvpStyles from "../../programs/components/mvp.module.css";

const DASHBOARD_PREVIEW_LIMIT = 6;

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = appConfig.useMockRepositories
      ? Promise.all([
          studentsRepository.list(),
          studentProgramsRepository.list?.() ?? Promise.resolve([]),
          studentVisitsRepository.list?.() ?? Promise.resolve([]),
          studentPdfFilesRepository.list?.() ?? Promise.resolve([])
        ]).then(([students, programs, visits, pdfFiles]) => {
          return calculateDashboardMetrics({
            pdfFiles: pdfFiles as StudentPdfFile[],
            programs: programs as StudentProgramSummary[],
            students: students as Student[],
            visits: visits as StudentVisit[]
          });
        })
      : fetchDashboardMetrics();

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
        {status === "loaded" && metrics ? <DashboardContent metrics={metrics} /> : null}
      </ContentSection>
    </PageContainer>
  );
}

function DashboardOverview({ metrics }: { metrics: DashboardMetrics }) {
  const loggedToday = metrics.bodyCheckToday.filter(
    (item) => bodyCheckState(item) === "complete"
  ).length;
  const partialToday = metrics.bodyCheckToday.filter(
    (item) => bodyCheckState(item) === "partial"
  ).length;
  const missingToday = metrics.bodyCheckToday.filter(
    (item) => bodyCheckState(item) === "missing"
  ).length;
  const monthlyFollowups =
    metrics.monthlyVisits.overdue +
    metrics.monthlyVisits.dueSoon +
    metrics.monthlyVisits.coachReview;

  return (
    <div className={mvpStyles.dashboardSummaryGrid}>
      <DashboardSummaryCard href="/students">
        <div className={mvpStyles.dashboardSummaryHeading}>
          <Users aria-hidden="true" size={18} />
          <strong>شاگردها</strong>
        </div>
        <div className={mvpStyles.dashboardSummaryNumber}>{metrics.totalStudents}</div>
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant="success">{metrics.activeStudents} فعال</StatusBadge>
          <StatusBadge variant="neutral">
            {metrics.inactiveStudents ??
              Math.max(0, metrics.totalStudents - metrics.activeStudents)}{" "}
            متوقف
          </StatusBadge>
        </div>
      </DashboardSummaryCard>

      <DashboardSummaryCard detailId="monthly-visit-details">
        <div className={mvpStyles.dashboardSummaryHeading}>
          <CalendarDays aria-hidden="true" size={18} />
          <strong>ویزیت ماهانه</strong>
        </div>
        <div className={mvpStyles.dashboardSummaryNumber}>{metrics.thisMonthVisits}</div>
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant="info">{metrics.monthlyVisits.sent} ارسال‌شده</StatusBadge>
          <StatusBadge variant="warning">{metrics.monthlyVisits.notSent} ارسال‌نشده</StatusBadge>
          {monthlyFollowups > 0 ? (
            <StatusBadge variant="danger">{monthlyFollowups} نیازمند پیگیری</StatusBadge>
          ) : null}
        </div>
      </DashboardSummaryCard>

      <DashboardSummaryCard detailId="daily-body-check-details">
        <div className={mvpStyles.dashboardSummaryHeading}>
          <CalendarDays aria-hidden="true" size={18} />
          <strong>بادی‌چک امروز</strong>
        </div>
        <div className={mvpStyles.dashboardSummaryNumber}>{metrics.bodyCheckToday.length}</div>
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant="success">{loggedToday} کامل</StatusBadge>
          {partialToday > 0 ? <StatusBadge variant="info">{partialToday} ناقص</StatusBadge> : null}
          <StatusBadge variant="warning">{missingToday} ثبت‌نشده</StatusBadge>
        </div>
      </DashboardSummaryCard>

      <DashboardSummaryCard detailId="body-check-cycle-details">
        <div className={mvpStyles.dashboardSummaryHeading}>
          <CalendarDays aria-hidden="true" size={18} />
          <strong>دوره‌های بادی‌چک</strong>
        </div>
        <div className={mvpStyles.dashboardSummaryNumber}>{metrics.bodyCheckCycles.active}</div>
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant="success">فعال</StatusBadge>
          <StatusBadge variant="warning">
            {metrics.bodyCheckCycles.expiringSoon} نزدیک انقضا
          </StatusBadge>
          {metrics.bodyCheckCycles.expired > 0 ? (
            <StatusBadge variant="danger">{metrics.bodyCheckCycles.expired} منقضی</StatusBadge>
          ) : null}
        </div>
      </DashboardSummaryCard>
    </div>
  );
}

function DashboardSummaryCard({
  children,
  detailId,
  href
}: {
  children: ReactNode;
  detailId?: string;
  href?: string;
}) {
  const card = <Card className={mvpStyles.dashboardSummaryCard}>{children}</Card>;
  if (href) {
    return (
      <Link className={mvpStyles.dashboardSummaryCardLink} to={href}>
        {card}
      </Link>
    );
  }
  return (
    <button
      className={mvpStyles.dashboardSummaryCardButton}
      onClick={() => detailId && openDashboardDetail(detailId)}
      type="button"
    >
      {card}
    </button>
  );
}

function openDashboardDetail(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDetailsElement)) return;
  element.open = true;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function DashboardVisitsSection({
  entries,
  visits
}: {
  entries: DashboardVisit[];
  visits: DashboardVisit[];
}) {
  const [sort, setSort] = useState<"created" | "visit">("visit");
  const items = sort === "visit" ? visits : entries;

  return (
    <Card className={mvpStyles.dashboardPriorityCard}>
      <div className={mvpStyles.dashboardSectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>آخرین شاگردهای ویزیت‌شده</h2>
          <p className={styles.sectionDescription}>هر شاگرد فقط یک‌بار در فهرست دیده می‌شود.</p>
        </div>
        <div aria-label="مرتب‌سازی ویزیت‌ها" className={mvpStyles.dashboardSort} role="group">
          <Button
            aria-pressed={sort === "visit"}
            onClick={() => setSort("visit")}
            size="sm"
            variant={sort === "visit" ? "primary" : "secondary"}
          >
            تاریخ ویزیت
          </Button>
          <Button
            aria-pressed={sort === "created"}
            onClick={() => setSort("created")}
            size="sm"
            variant={sort === "created" ? "primary" : "secondary"}
          >
            زمان ثبت
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState
          action={<Link to="/students">انتخاب شاگرد</Link>}
          description="با ثبت ویزیت، نام شاگرد و وضعیت آخرین ویزیتش اینجا دیده می‌شود."
          title="هنوز ویزیتی برای نمایش نیست"
        />
      ) : (
        <div className={mvpStyles.bodyCheckList}>
          {items.map((visit) => {
            const statusInfo = visitStatusInfo(visit.status);
            return (
              <Link
                className={mvpStyles.bodyCheckItem}
                key={`${sort}-${visit.studentId}-${visit.id}`}
                to={`/students/${visit.studentId}/visits`}
              >
                <div className={mvpStyles.bodyCheckIdentity}>
                  <strong>{visit.studentName}</strong>
                  <StatusBadge variant={statusInfo.variant}>{statusInfo.label}</StatusBadge>
                </div>
                <div className={mvpStyles.bodyCheckDetails}>
                  <span>تاریخ ویزیت: {formatCalendarDate(visit.visitDate)}</span>
                  {visit.nextCycleGoal ? <span>هدف: {visit.nextCycleGoal}</span> : null}
                  <span className={mvpStyles.dashboardVisitLink}>مشاهده ویزیت</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DashboardActionsSection({ metrics }: { metrics: DashboardMetrics }) {
  const visitItems = metrics.monthlyVisits.items
    .filter((item) => item.dueState !== "not_due" || item.status === "coach_review")
    .slice(0, DASHBOARD_PREVIEW_LIMIT);
  const partialBodyChecks = metrics.bodyCheckToday.filter(
    (item) => bodyCheckState(item) === "partial"
  ).length;
  const missingBodyChecks = metrics.bodyCheckToday.filter((item) => !item.isLogged).length;
  const bodyCheckFollowups = partialBodyChecks + missingBodyChecks;
  const actionCount =
    metrics.monthlyVisits.overdue +
    metrics.monthlyVisits.dueSoon +
    metrics.monthlyVisits.coachReview +
    bodyCheckFollowups +
    metrics.bodyCheckCycles.expired +
    metrics.bodyCheckCycles.expiringSoon;

  return (
    <Card className={mvpStyles.dashboardPriorityCard}>
      <div className={mvpStyles.dashboardSectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>نیازمند اقدام</h2>
          <p className={styles.sectionDescription}>موارد نزدیک موعد و بررسی مربی</p>
        </div>
        <StatusBadge variant={actionCount > 0 ? "warning" : "success"}>
          {actionCount} مورد
        </StatusBadge>
      </div>
      <div className={mvpStyles.dashboardActionCounts}>
        <StatusBadge variant={metrics.monthlyVisits.overdue > 0 ? "danger" : "neutral"}>
          {metrics.monthlyVisits.overdue} ویزیت عقب‌افتاده
        </StatusBadge>
        <StatusBadge variant={metrics.monthlyVisits.dueSoon > 0 ? "warning" : "neutral"}>
          {metrics.monthlyVisits.dueSoon} نزدیک موعد
        </StatusBadge>
        <StatusBadge variant={bodyCheckFollowups > 0 ? "warning" : "neutral"}>
          {bodyCheckFollowups} بادی‌چک ناقص یا ثبت‌نشده
        </StatusBadge>
        <StatusBadge variant={metrics.bodyCheckCycles.expired > 0 ? "danger" : "neutral"}>
          {metrics.bodyCheckCycles.expired} دوره منقضی
        </StatusBadge>
      </div>
      {visitItems.length === 0 ? (
        <p className={styles.sectionDescription}>ویزیت موعدگذشته‌ای برای پیگیری نیست.</p>
      ) : (
        <div className={mvpStyles.bodyCheckList}>
          {visitItems.map((item) => {
            const state = monthlyVisitState(item.status);
            return (
              <Link
                className={mvpStyles.bodyCheckItem}
                key={item.studentId}
                to={`/students/${item.studentId}/visits`}
              >
                <div className={mvpStyles.bodyCheckIdentity}>
                  <strong>{item.studentName}</strong>
                  <StatusBadge variant={item.dueState === "overdue" ? "danger" : state.variant}>
                    {item.dueState === "overdue" ? "عقب‌افتاده" : state.label}
                  </StatusBadge>
                </div>
                <div className={mvpStyles.bodyCheckDetails}>
                  <span>{monthlyVisitMeta(item)}</span>
                  {item.status === "coach_review" ? <span>نیاز به بررسی مربی</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function visitStatusInfo(status: DashboardVisit["status"]): {
  label: string;
  variant: "danger" | "info" | "neutral" | "success" | "warning";
} {
  switch (status) {
    case "waiting_for_student":
      return { label: "منتظر پاسخ شاگرد", variant: "info" };
    case "student_submitted":
      return { label: "پاسخ شاگرد ثبت شده", variant: "success" };
    case "coach_review":
      return { label: "در انتظار بررسی مربی", variant: "warning" };
    case "finalized":
      return { label: "نهایی‌شده", variant: "success" };
    default:
      return { label: "پیش‌نویس", variant: "neutral" };
  }
}

export function DashboardContent({
  metrics
}: {
  metrics: DashboardMetrics;
  primaryStudentId?: string;
}) {
  return (
    <div className={mvpStyles.pageStack}>
      <DashboardOverview metrics={metrics} />
      <Card className={mvpStyles.quickActions}>
        <Link to="/students/new">
          <Button iconStart={<UserPlus size={18} />}>افزودن شاگرد</Button>
        </Link>
        <Link to="/students">
          <Button iconStart={<Plus size={18} />} variant="secondary">
            انتخاب شاگرد و ثبت ویزیت
          </Button>
        </Link>
        <Link to="/programs/new">
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
        <DashboardVisitsSection
          visits={metrics.latestVisits}
          entries={metrics.latestVisitEntries ?? []}
        />
        <DashboardActionsSection metrics={metrics} />
      </div>
      <div className={mvpStyles.twoColumn}>
        <DashboardList
          title="آخرین برنامه‌ها"
          items={metrics.latestPrograms.map((program) => ({
            id: program.id,
            title: program.title,
            meta: `${programTypeLabels[program.programType]} · ${programStatusLabels[program.status]}`,
            href: `/programs/${program.id}`
          }))}
        />
        <DashboardList
          title="نیاز به پیگیری"
          items={metrics.followUpStudents.map((student) => ({
            id: student.id,
            title: student.fullName,
            meta: student.summary.medicalNote || "پیگیری وضعیت",
            href: `/students/${student.id}`
          }))}
        />
      </div>
      <div className={mvpStyles.dashboardProgramStats}>
        <Metric title="برنامه‌های پیش‌نویس" value={metrics.draftPrograms} />
        <Metric title="برنامه‌های نهایی" value={metrics.finalPrograms} />
        <Metric
          title="PDF آماده"
          value={metrics.readyPdfFiles}
          hint={metrics.pdfGenerationAvailable === false ? "تولید PDF فعال نیست" : "فایل شاگردان"}
        />
      </div>
      <div className={mvpStyles.dashboardDetailsStack}>
        <MonthlyVisitSummarySection summary={metrics.monthlyVisits} />
        <BodyCheckTodaySection asOf={metrics.asOf} items={metrics.bodyCheckToday} />
        <BodyCheckCycleSummarySection summary={metrics.bodyCheckCycles} />
      </div>
    </div>
  );
}

function cycleSummaryStatus(item: BodyCheckCycleSummaryItem): {
  label: string;
  variant: "danger" | "info" | "neutral" | "success" | "warning";
} {
  switch (item.status) {
    case "expired":
      return { label: "منقضی شده", variant: "danger" };
    case "closed":
      return { label: "بسته شده", variant: "neutral" };
    case "expiring_soon":
      return { label: "نزدیک به انقضا", variant: "warning" };
    case "active":
      return { label: "فعال", variant: "success" };
    default:
      return { label: "بدون دوره فعال", variant: "info" };
  }
}

export function BodyCheckCycleSummarySection({ summary }: { summary: BodyCheckCycleSummary }) {
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PREVIEW_LIMIT);
  const attentionItems = summary.items.filter(
    (item) => item.status === "expired" || item.status === "expiring_soon"
  );
  const candidateItems = attentionItems.length > 0 ? attentionItems : summary.items;
  const visibleItems = candidateItems.slice(0, visibleCount);

  return (
    <DashboardDisclosure
      id="body-check-cycle-details"
      title="وضعیت دوره‌های بادی‌چک"
      subtitle="تصمیم‌گیری درباره تمدید یا فعال‌سازی دوره شاگردها"
      summary={
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant="success">{summary.active} فعال</StatusBadge>
          <StatusBadge variant="warning">{summary.expiringSoon} نزدیک انقضا</StatusBadge>
          <StatusBadge variant="danger">{summary.expired} منقضی</StatusBadge>
          <StatusBadge variant="info">{summary.withoutActiveCycle} بدون دوره</StatusBadge>
        </div>
      }
    >
      <div className={mvpStyles.bodyCheckCounts}>
        <StatusBadge variant="success">{summary.active} فعال</StatusBadge>
        <StatusBadge variant="warning">{summary.expiringSoon} نزدیک انقضا</StatusBadge>
        <StatusBadge variant="danger">{summary.expired} منقضی</StatusBadge>
        <StatusBadge variant="info">{summary.withoutActiveCycle} بدون دوره فعال</StatusBadge>
      </div>
      {visibleItems.length === 0 ? (
        <p className={styles.sectionDescription}>هنوز شاگردی برای نمایش وجود ندارد.</p>
      ) : (
        <div className={mvpStyles.bodyCheckList}>
          {visibleItems.map((item) => {
            const state = cycleSummaryStatus(item);
            const dateText = item.endDate
              ? `تا ${formatBodyCheckDate(item.endDate)}`
              : "نیازمند فعال‌سازی دوره";
            const daysText =
              item.daysRemaining == null
                ? ""
                : item.daysRemaining < 0
                  ? ` · ${Math.abs(item.daysRemaining)} روز گذشته`
                  : ` · ${item.daysRemaining} روز باقی‌مانده`;
            return (
              <Link
                className={mvpStyles.bodyCheckItem}
                key={`${item.studentId}-${item.cycleId || "none"}`}
                to={`/students/${item.studentId}/body-check`}
              >
                <div className={mvpStyles.bodyCheckIdentity}>
                  <strong>{item.studentName}</strong>
                  <StatusBadge variant={state.variant}>{state.label}</StatusBadge>
                </div>
                <div className={mvpStyles.bodyCheckDetails}>
                  <span>
                    {dateText}
                    {daysText}
                  </span>
                  {item.status === "expired" || item.status === "no_active_cycle" ? (
                    <span>برای فعال‌سازی دوره جدید وارد پروفایل شوید</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <DashboardPreviewNotice
        listName="وضعیت دوره‌های بادی‌چک"
        onShowMore={() =>
          setVisibleCount((current) => nextVisibleCount(current, candidateItems.length))
        }
        shown={visibleItems.length}
        total={candidateItems.length}
      />
    </DashboardDisclosure>
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
  if (item.sleepStartTime)
    return `خواب: از ${formatClockTime(item.sleepStartTime)} · بیداری ثبت نشده`;
  if (item.wakeTime) return `خواب: ساعت خواب ثبت نشده · بیداری ${formatClockTime(item.wakeTime)}`;
  return "خواب: ثبت نشده";
}

export function BodyCheckTodaySection({
  asOf,
  items
}: {
  asOf: string;
  items: BodyCheckTodayItem[];
}) {
  const missing = items.filter((item) => bodyCheckState(item) === "missing");
  const partial = items.filter((item) => bodyCheckState(item) === "partial");
  const complete = items.filter((item) => bodyCheckState(item) === "complete");
  const logged = items.filter((item) => item.isLogged);
  return (
    <DashboardDisclosure
      id="daily-body-check-details"
      title="پیگیری بادی‌چک امروز"
      subtitle={`${formatBodyCheckDate(asOf)} · وضعیت شاگردهای دارای دوره فعال`}
      summary={
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge>{items.length} شاگرد</StatusBadge>
          <StatusBadge variant="success">{logged.length} ثبت‌شده</StatusBadge>
          <StatusBadge variant="warning">{missing.length} ثبت‌نشده</StatusBadge>
        </div>
      }
    >
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
    </DashboardDisclosure>
  );
}

export function MonthlyVisitSummarySection({ summary }: { summary: MonthlyVisitSummary }) {
  const notSentItems = summary.items.filter((item) => item.status === "not_sent");
  const sentItems = summary.items.filter((item) => item.status !== "not_sent");

  return (
    <DashboardDisclosure
      id="monthly-visit-details"
      title="پیگیری ویزیت ماهانه"
      subtitle={`ماه جاری · ${summary.activeStudents} شاگرد فعال`}
      summary={
        <div className={mvpStyles.dashboardSummaryBadges}>
          <StatusBadge variant={summary.notSent > 0 ? "warning" : "success"}>
            {summary.notSent} ارسال‌نشده
          </StatusBadge>
          <StatusBadge variant="info">{summary.sent} ارسال‌شده</StatusBadge>
          <StatusBadge variant="success">{summary.studentSubmitted} پاسخ‌داده</StatusBadge>
        </div>
      }
    >
      {summary.activeStudents === 0 ? (
        <EmptyState
          description="برای نمایش وضعیت ویزیت ماهانه، ابتدا شاگرد فعال داشته باشید."
          title="شاگرد فعال وجود ندارد"
        />
      ) : (
        <>
          <div className={mvpStyles.bodyCheckCounts}>
            <StatusBadge>{summary.activeStudents} فعال</StatusBadge>
            <StatusBadge variant="warning">{summary.dueSoon} نزدیک موعد</StatusBadge>
            {summary.overdue > 0 ? (
              <StatusBadge variant="danger">{summary.overdue} عقب‌افتاده</StatusBadge>
            ) : null}
            <StatusBadge variant="info">{summary.sent} ارسال‌شده</StatusBadge>
            <StatusBadge variant="success">{summary.studentSubmitted} پاسخ‌داده</StatusBadge>
            <StatusBadge variant="warning">{summary.notSent} ارسال‌نشده</StatusBadge>
          </div>
          <div className={mvpStyles.monthlyVisitGrid}>
            <MonthlyVisitGroup items={notSentItems} title="ارسال نشده‌ها" />
            <MonthlyVisitGroup items={sentItems} title="ارسال شده‌ها و وضعیت پاسخ" />
          </div>
        </>
      )}
    </DashboardDisclosure>
  );
}

function DashboardDisclosure({
  children,
  id,
  subtitle,
  summary,
  title
}: {
  children: ReactNode;
  id?: string;
  subtitle: string;
  summary: ReactNode;
  title: string;
}) {
  return (
    <Card className={mvpStyles.bodyCheckCard}>
      <details className={mvpStyles.dashboardDisclosure} id={id}>
        <summary className={mvpStyles.dashboardDisclosureSummary}>
          <div className={mvpStyles.dashboardDisclosureTitle}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            <p className={styles.sectionDescription}>{subtitle}</p>
          </div>
          <div className={mvpStyles.dashboardDisclosureCounts}>{summary}</div>
          <ChevronDown aria-hidden="true" className={mvpStyles.dashboardDisclosureIcon} size={18} />
        </summary>
        <div className={mvpStyles.dashboardDisclosureContent}>{children}</div>
      </details>
    </Card>
  );
}

function MonthlyVisitGroup({ items, title }: { items: MonthlyVisitSummaryItem[]; title: string }) {
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PREVIEW_LIMIT);
  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className={mvpStyles.monthlyVisitGroup}>
      <strong>{title}</strong>
      {items.length === 0 ? (
        <span className={mvpStyles.monthlyVisitEmpty}>موردی ثبت نشده</span>
      ) : (
        <div className={mvpStyles.bodyCheckList}>
          {visibleItems.map((item) => {
            const state = monthlyVisitState(item.status);
            return (
              <Link
                className={mvpStyles.bodyCheckItem}
                key={item.studentId}
                to={`/students/${item.studentId}/visits`}
              >
                <div className={mvpStyles.bodyCheckIdentity}>
                  <strong>{item.studentName}</strong>
                  <StatusBadge variant={state.variant}>{state.label}</StatusBadge>
                </div>
                <div className={mvpStyles.bodyCheckDetails}>
                  <span>{monthlyVisitMeta(item)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <DashboardPreviewNotice
        listName={title}
        onShowMore={() => setVisibleCount((current) => nextVisibleCount(current, items.length))}
        shown={visibleItems.length}
        total={items.length}
      />
    </div>
  );
}

function monthlyVisitState(status: MonthlyVisitStatus): {
  label: string;
  variant: "danger" | "info" | "neutral" | "success" | "warning";
} {
  switch (status) {
    case "waiting_for_student":
      return { label: "ارسال‌شده", variant: "info" };
    case "student_submitted":
      return { label: "پاسخ داده", variant: "success" };
    case "coach_review":
      return { label: "در حال بررسی", variant: "warning" };
    case "finalized":
      return { label: "نهایی‌شده", variant: "success" };
    default:
      return { label: "ارسال نشده", variant: "warning" };
  }
}

function monthlyVisitMeta(item: MonthlyVisitSummaryItem): string {
  if (item.status !== "not_sent") {
    return item.visitDate ? `تاریخ ویزیت: ${formatBodyCheckDate(item.visitDate)}` : "ویزیت این ماه";
  }
  if (item.dueState === "overdue" && item.daysUntilDue != null) {
    return `${Math.abs(item.daysUntilDue)} روز از موعد گذشته است`;
  }
  if (item.dueDate) {
    if (item.daysUntilDue === 0) return "موعد ویزیت: امروز";
    if (item.daysUntilDue != null) {
      return `موعد ویزیت: ${formatBodyCheckDate(item.dueDate)} · ${item.daysUntilDue} روز دیگر`;
    }
    return `موعد ویزیت: ${formatBodyCheckDate(item.dueDate)}`;
  }
  return "موعد ویزیت مشخص نشده است";
}

function BodyCheckGroup({ items, title }: { items: BodyCheckTodayItem[]; title: string }) {
  const [visibleCount, setVisibleCount] = useState(DASHBOARD_PREVIEW_LIMIT);
  if (items.length === 0) return null;
  const visibleItems = items.slice(0, visibleCount);

  return (
    <div className={mvpStyles.bodyCheckGroup}>
      <strong>{title}</strong>
      <div className={mvpStyles.bodyCheckList}>
        {visibleItems.map((item) => {
          const state = bodyCheckState(item);
          const label =
            state === "missing" ? "ثبت نشده" : state === "partial" ? "ثبت ناقص" : "کامل";
          const variant =
            state === "missing" ? "warning" : state === "partial" ? "info" : "success";
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
                <span>
                  وزن: {item.actualWeightKg == null ? "ثبت نشده" : formatKg(item.actualWeightKg)}
                </span>
                <span>
                  هدف: {item.targetWeightKg == null ? "ثبت نشده" : formatKg(item.targetWeightKg)}
                </span>
                <span>
                  اختلاف:{" "}
                  {item.weightDeltaKg == null ? "ثبت نشده" : formatDeltaKg(item.weightDeltaKg)}
                </span>
                <span>{sleepSummary(item)}</span>
                <span>
                  نمره خواب:{" "}
                  {item.sleepQualityScore == null ? "ثبت نشده" : `${item.sleepQualityScore} از ۱۰`}
                </span>
                <span>
                  رژیم:{" "}
                  {item.nutritionAdherenceScore == null
                    ? "ثبت نشده"
                    : `${item.nutritionAdherenceScore} از ۱۰`}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <DashboardPreviewNotice
        listName={title}
        onShowMore={() => setVisibleCount((current) => nextVisibleCount(current, items.length))}
        shown={visibleItems.length}
        total={items.length}
      />
    </div>
  );
}

function DashboardPreviewNotice({
  listName,
  onShowMore,
  shown,
  total
}: {
  listName: string;
  onShowMore: () => void;
  shown: number;
  total: number;
}) {
  if (total <= shown) return null;

  return (
    <div className={mvpStyles.previewNotice}>
      <span>
        نمایش {shown} مورد از {total} مورد
      </span>
      <Button aria-label={`نمایش ادامه ${listName}`} onClick={onShowMore} size="sm" variant="ghost">
        نمایش {Math.min(DASHBOARD_PREVIEW_LIMIT, total - shown)} مورد دیگر
      </Button>
    </div>
  );
}

function nextVisibleCount(current: number, total: number): number {
  return Math.min(current + DASHBOARD_PREVIEW_LIMIT, total);
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
  items: Array<{ href?: string; id: string; meta: string; title: string }>;
  title: string;
}) {
  return (
    <Card className={mvpStyles.listCard}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {items.length === 0 ? <StatusBadge>موردی ثبت نشده</StatusBadge> : null}
      {items.map((item) => {
        const content = (
          <>
            <strong>{item.title}</strong>
            <span>{item.meta}</span>
          </>
        );
        return item.href ? (
          <Link className={mvpStyles.listItemLink} key={item.id} to={item.href}>
            {content}
          </Link>
        ) : (
          <div className={mvpStyles.listItem} key={item.id}>
            {content}
          </div>
        );
      })}
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
