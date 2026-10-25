import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { RefreshCcw } from "lucide-react";
import { PageContainer, PageHeader } from "../../../components/layout";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Table
} from "../../../components/ui";
import type { TableColumn } from "../../../components/ui";
import { formatCalendarDate } from "../../../shared/dates/calendar";
import { VisitDetailsPanel, VisitStatusBadge } from "../../students/components/StudentVisitsTab";
import { studentVisitsRepository } from "../../students/services/studentVisitsRepository";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import { isVisitStatus, visitStatusLabels } from "../../students/types/visitForm";
import { COACH_VISITS_PAGE_SIZE, coachVisitsRepository } from "../services/coachVisitsRepository";
import type { CoachVisit, CoachVisitFilters } from "../services/coachVisitsRepository";
import styles from "./coachVisits.module.css";

export function CoachVisitsPage() {
  const [params, setParams] = useSearchParams();
  const [{ search, status, ordering }, setFilters] = useState<CoachVisitFilters>(() => {
    const rawStatus = params.get("status");
    return {
      search: params.get("search") ?? "",
      status: isVisitStatus(rawStatus) ? rawStatus : "all",
      ordering: params.get("ordering") === "-created_at" ? "-created_at" : "-visit_date"
    };
  });
  const [page, setPage] = useState(() => {
    const rawPage = Number(params.get("page") ?? 1);
    return Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  });
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = JSON.stringify([search, status, ordering, page, reloadKey]);
  const [result, setResult] = useState<{
    key: string;
    count: number;
    items: CoachVisit[];
    error?: boolean;
  }>();

  useEffect(() => {
    let cancelled = false;
    coachVisitsRepository
      .listPage({ search, status, ordering }, page)
      .then((response) => {
        if (!cancelled) setResult({ ...response, key: requestKey });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, count: 0, items: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [search, status, ordering, page, requestKey]);

  const loading = result?.key !== requestKey;
  const changeFilter = <K extends keyof CoachVisitFilters>(key: K, value: CoachVisitFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const openVisit = (visit: CoachVisit) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("student", visit.studentId);
      next.set("visit", visit.id);
      next.set("search", search);
      next.set("status", status);
      next.set("ordering", ordering);
      next.set("page", String(page));
      return next;
    });
  };
  const columns: TableColumn<CoachVisit>[] = [
    { id: "student", header: "شاگرد", cell: (visit) => visit.studentName },
    { id: "date", header: "تاریخ ویزیت", cell: (visit) => formatCalendarDate(visit.visitDate) },
    { id: "status", header: "وضعیت", cell: (visit) => <VisitStatusBadge status={visit.status} /> },
    { id: "template", header: "قالب فرم", cell: (visit) => visit.formTemplateName || "—" },
    {
      id: "action",
      header: "جزئیات",
      cell: (visit) => (
        <Button size="sm" variant="secondary" onClick={() => openVisit(visit)}>
          مشاهده ویزیت
        </Button>
      )
    }
  ];
  const selectedStudent = params.get("student");
  const selectedVisit = params.get("visit");

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={["داشبورد", "ویزیت‌ها"]}
        title="همه ویزیت‌ها"
        description="تاریخچه و وضعیت ویزیت‌های تمام شاگردهای شما"
      />
      <div className={styles.stack}>
        <Card className={styles.filters}>
          <FormField htmlFor="coach-visits-search" label="جستجوی شاگرد">
            <Input
              id="coach-visits-search"
              placeholder="نام شاگرد را وارد کنید"
              value={search}
              onChange={(event) => changeFilter("search", event.target.value)}
            />
          </FormField>
          <FormField htmlFor="coach-visits-status" label="وضعیت ویزیت">
            <Select
              id="coach-visits-status"
              value={status}
              onChange={(event) =>
                changeFilter(
                  "status",
                  isVisitStatus(event.target.value) ? event.target.value : "all"
                )
              }
              options={[
                { value: "all", label: "همه وضعیت‌ها" },
                ...Object.entries(visitStatusLabels).map(([value, label]) => ({ value, label }))
              ]}
            />
          </FormField>
          <FormField htmlFor="coach-visits-ordering" label="مرتب‌سازی">
            <Select
              id="coach-visits-ordering"
              value={ordering}
              onChange={(event) =>
                changeFilter(
                  "ordering",
                  event.target.value === "-created_at" ? "-created_at" : "-visit_date"
                )
              }
              options={[
                { value: "-visit_date", label: "جدیدترین تاریخ ویزیت" },
                { value: "-created_at", label: "جدیدترین زمان ثبت" }
              ]}
            />
          </FormField>
        </Card>
        <Card className={styles.stack}>
          {loading ? (
            <div aria-label="در حال دریافت ویزیت‌ها" role="status">
              <Skeleton height="180px" />
            </div>
          ) : result?.error ? (
            <EmptyState
              title="دریافت ویزیت‌ها انجام نشد"
              description="دوباره تلاش کنید."
              action={
                <Button
                  variant="secondary"
                  iconStart={<RefreshCcw size={18} />}
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  تلاش دوباره
                </Button>
              }
            />
          ) : result && result.items.length > 0 ? (
            <>
              <p className={styles.count}>{result.count} ویزیت</p>
              <div className={styles.desktop}>
                <Table
                  ariaLabel="همه ویزیت‌ها"
                  columns={columns}
                  data={result.items}
                  getRowKey={(visit) => visit.id}
                />
              </div>
              <div className={styles.mobile}>
                {result.items.map((visit) => (
                  <article className={styles.visitCard} key={visit.id}>
                    <div className={styles.identity}>
                      <strong>{visit.studentName}</strong>
                      <VisitStatusBadge status={visit.status} />
                    </div>
                    <p>تاریخ ویزیت: {formatCalendarDate(visit.visitDate)}</p>
                    {visit.formTemplateName ? <p>{visit.formTemplateName}</p> : null}
                    <Button variant="secondary" onClick={() => openVisit(visit)}>
                      مشاهده ویزیت
                    </Button>
                  </article>
                ))}
              </div>
              <div className={styles.pagination}>
                <Pagination
                  page={page}
                  pageCount={Math.max(1, Math.ceil(result.count / COACH_VISITS_PAGE_SIZE))}
                  onPageChange={setPage}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="ویزیتی پیدا نشد"
              description={
                search || status !== "all"
                  ? "نام یا وضعیت انتخاب‌شده را تغییر دهید."
                  : "ویزیت‌های ثبت‌شده اینجا نمایش داده می‌شوند."
              }
            />
          )}
        </Card>
      </div>
      {selectedStudent && selectedVisit ? (
        <CoachVisitDialog
          key={`${selectedStudent}/${selectedVisit}`}
          studentId={selectedStudent}
          visitId={selectedVisit}
          onClose={() =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete("student");
                next.delete("visit");
                return next;
              },
              { replace: true }
            )
          }
        />
      ) : null}
    </PageContainer>
  );
}

function CoachVisitDialog({
  studentId,
  visitId,
  onClose
}: {
  studentId: string;
  visitId: string;
  onClose: () => void;
}) {
  const [visit, setVisit] = useState<StudentVisit | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    studentVisitsRepository
      .getById(studentId, visitId)
      .then((item) => {
        if (!cancelled) {
          setVisit(item);
          setStatus(item ? "loaded" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, visitId, reloadKey]);
  return (
    <Modal
      open
      onClose={onClose}
      title={visit ? `جزئیات ویزیت · ${formatCalendarDate(visit.visitDate)}` : "جزئیات ویزیت"}
      footer={
        visit ? (
          <Link className={styles.actionLink} to={`/students/${studentId}/visits/${visitId}/edit`}>
            ویرایش و بررسی ویزیت
          </Link>
        ) : undefined
      }
    >
      {status === "loading" ? (
        <div role="status" aria-label="در حال دریافت جزئیات">
          <Skeleton height="160px" />
        </div>
      ) : status === "error" ? (
        <EmptyState
          title="جزئیات ویزیت دریافت نشد"
          description="دوباره تلاش کنید یا از فهرست ویزیت دیگری را انتخاب کنید."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setStatus("loading");
                setReloadKey((value) => value + 1);
              }}
            >
              تلاش دوباره
            </Button>
          }
        />
      ) : visit ? (
        <VisitDetailsPanel studentId={studentId} visit={visit} />
      ) : null}
    </Modal>
  );
}
