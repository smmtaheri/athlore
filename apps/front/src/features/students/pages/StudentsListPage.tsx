import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Plus, RefreshCcw } from "lucide-react";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import { Button, Card, EmptyState, Skeleton } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { StudentFilters } from "../components/StudentFilters";
import { StudentList } from "../components/StudentList";
import styles from "../components/students.module.css";
import {
  defaultStudentFilters,
  filterStudents,
  hasActiveFilters,
  paginateStudents
} from "../services/studentFilters";
import { studentsRepository } from "../services/studentsRepository";
import type { Student, StudentsListFilters } from "../types/student";

const pageSize = 5;

interface LocationState {
  studentSaved?: string;
}

type ListPageCapable = typeof studentsRepository & {
  listPage?: (filters: StudentsListFilters & { page: number; pageSize: number }) => Promise<{
    count: number;
    items: Student[];
  }>;
};

export function StudentsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<StudentsListFilters>(defaultStudentFilters);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [successMessage] = useState(() => {
    const state = location.state as LocationState | null;
    return state?.studentSaved ?? "";
  });

  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.studentSaved) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    let isMounted = true;
    const repo = studentsRepository as ListPageCapable;

    const request =
      !appConfig.useMockRepositories && repo.listPage
        ? repo.listPage({ ...filters, page, pageSize }).then((result) => {
            if (!isMounted) return;
            setStudents(result.items);
            setTotalCount(result.count);
            setStatus("loaded");
          })
        : studentsRepository.list().then((items) => {
            if (!isMounted) return;
            setStudents(items);
            setTotalCount(items.length);
            setStatus("loaded");
          });

    request.catch(() => {
      if (isMounted) setStatus("error");
    });

    return () => {
      isMounted = false;
    };
  }, [filters, page, reloadKey]);

  const filteredStudents = useMemo(() => {
    if (!appConfig.useMockRepositories) {
      return students;
    }
    return filterStudents(students, filters);
  }, [filters, students]);

  const pageCount = Math.max(
    1,
    Math.ceil((appConfig.useMockRepositories ? filteredStudents.length : totalCount) / pageSize)
  );
  const safePage = Math.min(page, pageCount);
  const pageStudents = appConfig.useMockRepositories
    ? paginateStudents(filteredStudents, safePage, pageSize)
    : students;

  const handleFiltersChange = (nextFilters: StudentsListFilters) => {
    if (!appConfig.useMockRepositories) {
      setStatus("loading");
    }
    setFilters(nextFilters);
    setPage(1);
  };

  const resetFilters = () => {
    if (!appConfig.useMockRepositories) {
      setStatus("loading");
    }
    setFilters(defaultStudentFilters);
    setPage(1);
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button iconStart={<Plus size={18} />} onClick={() => navigate("/students/new")}>
            افزودن شاگرد
          </Button>
        }
        breadcrumb={["داشبورد", "شاگردها"]}
        description="مدیریت و مشاهده اطلاعات تمام شاگردهای شما"
        title="لیست شاگردها"
      />

      <Stack gap="20px">
        {successMessage ? (
          <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
            {successMessage}
          </div>
        ) : null}

        <StudentFilters filters={filters} onChange={handleFiltersChange} onReset={resetFilters} />

        <ContentSection>
          {status === "loading" ? <StudentListLoading /> : null}

          {status === "error" ? (
            <Card padding="lg">
              <EmptyState
                action={
                  <Button
                    iconStart={<RefreshCcw size={18} />}
                    onClick={() => {
                      if (!appConfig.useMockRepositories) {
                        setStatus("loading");
                      }
                      setReloadKey((value) => value + 1);
                    }}
                    variant="secondary"
                  >
                    تلاش دوباره
                  </Button>
                }
                description="دریافت اطلاعات شاگردها با خطا روبه رو شد."
                title="خطای موقت"
              />
            </Card>
          ) : null}

          {status === "loaded" ? (
            <StudentList
              emptyDescription={
                hasActiveFilters(filters)
                  ? "عبارت جستجو یا فیلترها را تغییر دهید."
                  : "برای شروع، اولین شاگرد خود را اضافه کنید."
              }
              isFiltered={hasActiveFilters(filters)}
              onPageChange={(nextPage) => {
                if (!appConfig.useMockRepositories) {
                  setStatus("loading");
                }
                setPage(nextPage);
              }}
              page={safePage}
              pageCount={pageCount}
              pageStudents={pageStudents}
              total={appConfig.useMockRepositories ? filteredStudents.length : totalCount}
            />
          ) : null}
        </ContentSection>
      </Stack>
    </PageContainer>
  );
}

function StudentListLoading() {
  return (
    <Card>
      <Stack>
        <Skeleton height={48} />
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </Stack>
    </Card>
  );
}
