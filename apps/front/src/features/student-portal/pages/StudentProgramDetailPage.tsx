import { formatCalendarDate, formatCalendarText } from "../../../shared/dates/calendar";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowRight, CalendarDays, Download, FileText } from "lucide-react";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import type {
  GeneratedProgram,
  TrainingExercise,
  TrainingDay
} from "../../programs/types/generatedProgram";
import type { StudentPdfFile } from "../../students/types/pdfFile";
import {
  studentProgramsRepository,
  type StudentProgramsRepository
} from "../services/studentProgramsRepository";
import styles from "../components/studentPortal.module.css";

function formatDate(value: string): string {
  return formatCalendarDate(value);
}

function programStatusLabel(program: GeneratedProgram): string {
  return program.status === "active" ? "برنامه فعلی" : "آماده اجرا";
}

function dayExercises(day: TrainingDay): TrainingExercise[] {
  return Array.isArray(day.exercises) ? day.exercises : [];
}

export function StudentProgramDetailPage({
  repository = studentProgramsRepository
}: {
  repository?: StudentProgramsRepository;
}) {
  const { programId } = useParams();
  const navigate = useNavigate();
  const [program, setProgram] = useState<GeneratedProgram | null>(null);
  const [loadedProgramId, setLoadedProgramId] = useState<string>();
  const [pdfFiles, setPdfFiles] = useState<StudentPdfFile[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error" | "notFound">("loading");
  const [pdfStatus, setPdfStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [pdfError, setPdfError] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  useEffect(() => {
    if (!programId) return;
    let mounted = true;
    let programLoaded = false;
    repository
      .getById(programId)
      .then((item) => {
        if (!mounted) return;
        if (!item) {
          setLoadedProgramId(programId);
          setStatus("notFound");
          return;
        }
        programLoaded = true;
        setProgram(item);
        setLoadedProgramId(programId);
        setStatus("loaded");
        return repository.listPdfFiles(programId);
      })
      .then((files) => {
        if (!mounted || !files) return;
        setPdfFiles(files);
        setPdfStatus("loaded");
      })
      .catch(() => {
        if (mounted) {
          setLoadedProgramId(programId);
          if (!programLoaded) setStatus("error");
          setPdfStatus("error");
        }
      });
    return () => {
      mounted = false;
    };
  }, [programId, repository]);

  const visibleStatus = loadedProgramId === programId ? status : "loading";

  const days = useMemo(() => program?.training?.days ?? [], [program]);
  const readyFiles = pdfFiles.filter((file) => file.status === "ready");

  const download = async (file: StudentPdfFile) => {
    setDownloadingId(file.id);
    setPdfError("");
    try {
      await repository.downloadPdf(file.id, file.fileName);
    } catch {
      setPdfError("دانلود فایل PDF انجام نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setDownloadingId("");
    }
  };

  if (!programId || visibleStatus === "notFound") {
    return (
      <div className={styles.page}>
        <EmptyState
          action={
            <Button onClick={() => navigate(studentPaths.programs)} variant="secondary">
              بازگشت به برنامه‌ها
            </Button>
          }
          description="این برنامه پیدا نشد یا دیگر برای شما قابل مشاهده نیست."
          title="برنامه پیدا نشد"
        />
      </div>
    );
  }
  if (visibleStatus === "loading") {
    return (
      <div className={styles.page}>
        <Skeleton height={280} />
      </div>
    );
  }
  if (visibleStatus === "error" || !program) {
    return (
      <div className={styles.page}>
        <EmptyState description="دریافت برنامه ممکن نشد." title="خطا در دریافت برنامه" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <nav aria-label="مسیر صفحه" className={styles.breadcrumb}>
          <Link className={styles.breadcrumbLink} to={studentPaths.programs}>
            برنامه‌های من
          </Link>
          <span aria-hidden>←</span>
          <span>{program.title}</span>
        </nav>

        <header className={styles.detailHeader}>
          <div className={styles.detailTitleRow}>
            <h1 className={styles.welcomeTitle}>{program.title}</h1>
            <StatusBadge variant={program.status === "active" ? "success" : "info"}>
              {programStatusLabel(program)}
            </StatusBadge>
          </div>
          <div className={styles.programDetailMeta}>
            <span>نسخه {program.version}</span>
            <span>
              {program.deliverySource === "uploaded_pdf"
                ? "فایل بارگذاری‌شده توسط مربی"
                : "تولیدشده با Athlore"}
            </span>
            {program.dateRange ? <span>{formatCalendarText(program.dateRange)}</span> : null}
            <span>
              <CalendarDays aria-hidden size={15} /> به‌روزرسانی {formatDate(program.updatedAt)}
            </span>
          </div>
        </header>

        <Card className={styles.programDownloadCard} padding="md">
          <div className={styles.programDownloadIcon} aria-hidden>
            <FileText size={22} />
          </div>
          <div className={styles.programDownloadBody}>
            <h2 className={styles.sectionTitle}>نسخه قابل دانلود</h2>
            <p className={styles.muted}>
              {program.deliverySource === "uploaded_pdf"
                ? "PDF برنامه‌ای که مربی برای این دوره بارگذاری کرده است."
                : "فایل‌های تمرین و در صورت وجود، تغذیه و مکمل که مربی هنگام ارسال برنامه آماده کرده است."}
            </p>
            {pdfError ? <p className={styles.errorAlert}>{pdfError}</p> : null}
          </div>
          <div className={styles.programDownloadActions}>
            {readyFiles.map((file) => (
              <Button
                iconStart={<Download size={17} />}
                isLoading={downloadingId === file.id}
                key={file.id}
                onClick={() => void download(file)}
                size="sm"
                variant="secondary"
              >
                {program.deliverySource === "uploaded_pdf"
                  ? "دانلود برنامه"
                  : `دانلود ${file.contentType === "workout" ? "تمرین" : "تغذیه و مکمل"}`}
              </Button>
            ))}
            {pdfStatus !== "loading" && readyFiles.length === 0 ? (
              <p className={styles.muted}>
                هنوز فایل آماده‌ای برای این برنامه ثبت نشده است؛ برای دریافت آن با مربی تماس بگیرید.
              </p>
            ) : null}
          </div>
        </Card>

        {days.length > 0 ? (
          <section className={styles.stackTight} aria-labelledby="training-heading">
            <h2 className={styles.sectionTitle} id="training-heading">
              برنامه تمرینی
            </h2>
            <div className={styles.programDays}>
              {days.map((day) => (
                <Card className={styles.programDayCard} key={day.id} padding="md">
                  <div className={styles.programDayHeader}>
                    <div>
                      <p className={styles.eyebrow}>روز {day.order}</p>
                      <h3 className={styles.programDayTitle}>{day.title || `روز ${day.order}`}</h3>
                    </div>
                    {day.targetMuscles.length > 0 ? (
                      <p className={styles.programDayMuscles}>{day.targetMuscles.join("، ")}</p>
                    ) : null}
                  </div>
                  {day.notes ? <p className={styles.muted}>{day.notes}</p> : null}
                  <div className={styles.exerciseList}>
                    {dayExercises(day).map((exercise) => (
                      <div
                        className={styles.exerciseRow}
                        key={`${day.id}-${exercise.id}-${exercise.order}`}
                      >
                        <div className={styles.exerciseMain}>
                          <strong>
                            {exercise.order}. {exercise.name}
                          </strong>
                          {exercise.notes ? <span>{exercise.notes}</span> : null}
                        </div>
                        <div className={styles.exercisePrescription}>
                          <span>{exercise.sets} ست</span>
                          <span>{exercise.reps} تکرار</span>
                          {exercise.rest ? <span>استراحت {exercise.rest}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {program.nutrition?.meals?.length ? (
          <section className={styles.stackTight} aria-labelledby="nutrition-heading">
            <h2 className={styles.sectionTitle} id="nutrition-heading">
              برنامه تغذیه
            </h2>
            <Card padding="md">
              <div className={styles.mealList}>
                {program.nutrition.meals.map((meal) => (
                  <div className={styles.mealRow} key={meal.id}>
                    <strong>{meal.title}</strong>
                    <span>
                      {meal.foods
                        .map((food) => `${food.name}${food.amount ? ` (${food.amount})` : ""}`)
                        .join("، ")}
                    </span>
                  </div>
                ))}
              </div>
              {program.nutrition.notes ? (
                <p className={styles.muted}>{program.nutrition.notes}</p>
              ) : null}
            </Card>
          </section>
        ) : null}

        {program.supplements?.items?.length ? (
          <section className={styles.stackTight} aria-labelledby="supplements-heading">
            <h2 className={styles.sectionTitle} id="supplements-heading">
              مکمل‌ها
            </h2>
            <Card padding="md">
              <div className={styles.mealList}>
                {program.supplements.items.map((item) => (
                  <div className={styles.mealRow} key={item.id}>
                    <strong>{item.name}</strong>
                    <span>
                      {[item.amount, item.timing, item.notes].filter(Boolean).join(" · ")}
                    </span>
                    {item.instructions ? <span>دستور مصرف: {item.instructions}</span> : null}
                    {item.warnings ? <span>هشدار: {item.warnings}</span> : null}
                  </div>
                ))}
              </div>
            </Card>
          </section>
        ) : null}

        <Button
          iconStart={<ArrowRight size={17} />}
          onClick={() => navigate(studentPaths.programs)}
          variant="ghost"
        >
          بازگشت به برنامه‌های من
        </Button>
      </div>
    </div>
  );
}
