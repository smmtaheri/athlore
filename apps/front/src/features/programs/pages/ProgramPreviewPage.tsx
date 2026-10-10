import { formatCalendarDate, formatCalendarText } from "../../../shared/dates/calendar";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FileDown,
  Plus,
  RefreshCcw,
  Save,
  Trash2
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  EditorDrawer,
  FormField,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea
} from "../../../components/ui";
import { GenerationEvidencePanel } from "../components/GenerationEvidencePanel";
import {
  studentPdfFilesRepository,
  type StudentPdfFilesRepository
} from "../../students/services/studentPdfFilesRepository";
import {
  studentProgramsRepository,
  type StudentProgramsRepository
} from "../../students/services/studentProgramsRepository";
import {
  studentsRepository,
  type StudentsRepository
} from "../../students/services/studentsRepository";
import type { Student } from "../../students/types/student";
import {
  createProgramSummary,
  programsRepository,
  type ProgramsRepository
} from "../services/programsRepository";
import type {
  GeneratedProgram,
  NutritionFood,
  NutritionMeal,
  ProgramPdfSection,
  StagedProgramPdf,
  ProgramPreviewTab,
  SupplementItem,
  TrainingDay,
  TrainingExercise
} from "../types/generatedProgram";
import styles from "../components/programFlow.module.css";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { SupplementSelectionFields } from "../../coach-rules/components/SupplementSelectionFields";
import {
  emptySupplementSelection,
  supplementCatalogRepository
} from "../../coach-rules/services/supplementCatalogRepository";

const previewTabLabels: Record<ProgramPreviewTab, string> = {
  nutrition: "برنامه غذایی",
  pdf: "تنظیمات PDF",
  supplements: "مکمل ها",
  training: "برنامه تمرینی"
};

export interface ProgramPreviewPageProps {
  pdfFilesRepo?: StudentPdfFilesRepository;
  programsRepo?: ProgramsRepository;
  studentProgramsRepo?: StudentProgramsRepository;
  studentsRepo?: StudentsRepository;
}

export function ProgramPreviewPage({
  pdfFilesRepo = studentPdfFilesRepository,
  programsRepo = programsRepository,
  studentProgramsRepo = studentProgramsRepository,
  studentsRepo = studentsRepository
}: ProgramPreviewPageProps) {
  const [program, setProgram] = useState<GeneratedProgram>();
  const [student, setStudent] = useState<Student>();
  const [feedback, setFeedback] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [stagedPdfPreviews, setStagedPdfPreviews] = useState<Record<string, string>>({});
  const [uploadingReplacement, setUploadingReplacement] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "notFound" | "saving">(
    "loading"
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const { programId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    programsRepo
      .getById(programId ?? "")
      .then(async (item) => {
        if (!isMounted) {
          return;
        }
        if (!item) {
          setStatus("notFound");
          return;
        }
        const owner = await studentsRepo.getById(item.studentId);
        if (!isMounted) {
          return;
        }
        setProgram(item);
        setStudent(owner);
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
  }, [programId, programsRepo, studentsRepo]);

  const tabs = useMemo(() => {
    if (!program) {
      return [];
    }
    const available: ProgramPreviewTab[] = [];
    const deliverySections = program.pdfSettings.deliverySections;
    if (program.training && (!deliverySections || deliverySections.workout === "generated")) {
      available.push("training");
    }
    if (program.nutrition && (!deliverySections || deliverySections.nutrition === "generated")) {
      available.push("nutrition");
    }
    if (program.supplements && (!deliverySections || deliverySections.supplement === "generated")) {
      available.push("supplements");
    }
    const hasGeneratedDelivery = deliverySections
      ? Object.values(deliverySections).includes("generated")
      : program.deliverySource !== "uploaded_pdf";
    if (hasGeneratedDelivery) available.push("pdf");
    return available;
  }, [program]);

  const stagedUploads = useMemo(() => getStagedUploads(program), [program]);

  useEffect(() => {
    if (!stagedUploads.length || !programsRepo.downloadStagedPdf) {
      return;
    }
    let mounted = true;
    const objectUrls: string[] = [];
    Promise.all(
      stagedUploads.map(async (staged) => {
        try {
          const blob = await programsRepo.downloadStagedPdf!(staged.id);
          if (!mounted) return null;
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return [staged.id, url] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!mounted) return;
      const previews = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => entry !== null)
      );
      setStagedPdfPreviews(previews);
      if (Object.keys(previews).length < stagedUploads.length) {
        setFeedback("پیش‌نمایش بعضی PDFها بارگذاری نشد؛ می‌توانید فایل مربوط را جایگزین کنید.");
      }
    });
    return () => {
      mounted = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [programsRepo, stagedUploads]);

  const activeTab = getPreviewTab(searchParams.get("tab"), tabs);
  const deliverySections = program?.pdfSettings.deliverySections;
  const uploadSectionIds: Array<ProgramPdfSection | undefined> = deliverySections
    ? (Object.entries(deliverySections)
        .filter(([, method]) => method === "uploaded")
        .map(([section]) => section) as ProgramPdfSection[])
    : program?.deliverySource === "uploaded_pdf"
      ? [undefined]
      : [];
  const hasGeneratedSections = deliverySections
    ? Object.values(deliverySections).includes("generated")
    : program?.deliverySource !== "uploaded_pdf";

  const updateProgram = (updater: (program: GeneratedProgram) => GeneratedProgram) => {
    setProgram((current) => (current ? updater(structuredClone(current)) : current));
    setIsDirty(true);
  };

  const saveProgram = async () => {
    if (!program) {
      return;
    }
    setStatus("saving");
    setFeedback("");

    try {
      const savedProgram = await programsRepo.update(program.id, program);
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      setProgram(savedProgram);
      setIsDirty(false);
      setStatus("loaded");
      setFeedback("تغییرات پیش‌نویس ذخیره شد.");
    } catch {
      setStatus("loaded");
      setFeedback("ذخیره برنامه انجام نشد.");
    }
  };

  const publishProgram = async () => {
    if (!program || !student) return;
    setStatus("saving");
    setFeedback("");
    try {
      let next = program;
      if (isDirty) next = await programsRepo.update(program.id, program);
      const versionId = next.draftId ?? next.finalizedVersionId ?? "";
      if (next.status === "draft" && programsRepo.finalize) {
        next = await programsRepo.finalize(program.id);
      }
      const sectionMethods = next.pdfSettings.deliverySections;
      if (sectionMethods) {
        const existing = await pdfFilesRepo.listByProgram?.(program.id);
        const expectedVersion = `v${next.version}`;
        for (const section of Object.entries(sectionMethods)) {
          const [sectionId, method] = section as [ProgramPdfSection, string];
          if (method === "uploaded") {
            const uploaded = existing?.find(
              (file) =>
                file.status === "ready" &&
                file.version === expectedVersion &&
                file.section === sectionId
            );
            if (!uploaded) {
              throw new Error(`فایل ${programSectionLabel(sectionId)} آماده نشد.`);
            }
            continue;
          }
          if (method !== "generated") continue;
          const generated = existing?.find(
            (file) =>
              file.status === "ready" &&
              file.version === expectedVersion &&
              file.section === sectionId
          );
          if (generated) continue;
          if (!pdfFilesRepo.createForProgram) {
            throw new Error("ساخت فایل PDF در دسترس نیست.");
          }
          const result = await pdfFilesRepo.createForProgram(program.id, {
            deliveryOutputs: "section",
            fileName: `${next.title}_${programSectionLabel(sectionId)}_${expectedVersion}.pdf`,
            programType: next.programType,
            programVersionId: versionId,
            section: sectionId,
            pdfSettingsOverride: {
              includeNutrition: sectionId === "nutrition",
              includeSupplements: sectionId === "supplement",
              includeTraining: sectionId === "workout",
              fileTitle: `${next.title} — ${programSectionLabel(sectionId)}`
            }
          });
          const artifacts =
            result && typeof result === "object" && "artifacts" in result
              ? result.artifacts
              : [result as { status?: string }];
          if (artifacts.some((artifact) => artifact.status !== "ready")) {
            throw new Error(
              `ساخت PDF ${programSectionLabel(sectionId)} ناموفق بود؛ دوباره تلاش کنید.`
            );
          }
        }
      } else if (next.deliverySource !== "uploaded_pdf") {
        const existing = await pdfFilesRepo.listByProgram?.(program.id);
        const expectedVersion = `v${next.version}`;
        if (
          !existing?.some((file) => file.status === "ready" && file.version === expectedVersion)
        ) {
          if (!pdfFilesRepo.createForProgram) {
            throw new Error("ساخت فایل PDF در دسترس نیست.");
          }
          const result = await pdfFilesRepo.createForProgram(program.id, {
            deliveryOutputs: "pair",
            programVersionId: versionId
          });
          const artifacts =
            result && typeof result === "object" && "artifacts" in result
              ? result.artifacts
              : [result as { status?: string }];
          if (artifacts.some((artifact) => artifact.status !== "ready")) {
            throw new Error("ساخت PDF ناموفق بود؛ دوباره از همین صفحه تلاش کنید.");
          }
        }
      }
      await studentProgramsRepo.activate(program.id);
      setIsDirty(false);
      setStatus("loaded");
      navigate(`/students/${student.id}/programs`);
    } catch (error) {
      setStatus("loaded");
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : error instanceof Error
            ? error.message
            : "نهایی‌سازی و ارسال انجام نشد؛ اطلاعات پیش‌نویس حفظ شده است."
      );
    }
  };

  const replaceUploadedPdf = async (section: ProgramPdfSection | undefined, file?: File) => {
    if (!file || !student || !program || !programsRepo.uploadStagedPdf) return;
    if (file.size > 25 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) {
      setFeedback("فقط PDF معتبر تا سقف ۲۵ مگابایت پذیرفته می‌شود.");
      setUploadKey((current) => current + 1);
      return;
    }
    const versionId = program.draftId ?? "";
    if (!versionId || !programsRepo.attachStagedPdf) {
      setFeedback("نسخهٔ پیش‌نویس برای جایگزینی فایل پیدا نشد.");
      return;
    }
    setUploadingReplacement(true);
    try {
      const staged = await programsRepo.uploadStagedPdf(student.id, file, section);
      try {
        const updated = await programsRepo.attachStagedPdf(
          program.id,
          versionId,
          staged.id,
          section
        );
        setProgram(updated);
        setFeedback("PDF جایگزین شد؛ فایل قبلی از فضای موقت پاک می‌شود.");
      } catch (error) {
        await programsRepo.deleteStagedPdf?.(staged.id).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "جایگزینی PDF انجام نشد؛ فایل قبلی حفظ شده است."
      );
    } finally {
      setUploadingReplacement(false);
      setUploadKey((current) => current + 1);
    }
  };

  const removeUploadedPdf = async (stagedPdfId: string) => {
    if (!program || !programsRepo.deleteStagedPdf) return;
    try {
      await programsRepo.deleteStagedPdf(stagedPdfId);
      const updated = await programsRepo.getById(program.id);
      if (updated) setProgram(updated);
      setFeedback("PDF موقت حذف شد؛ پیش از نهایی‌سازی می‌توانید فایل دیگری بارگذاری کنید.");
    } catch {
      setFeedback("حذف PDF انجام نشد؛ دوباره تلاش کنید.");
    }
  };

  if (status === "loading") {
    return <PreviewState title="پیش نمایش برنامه" />;
  }

  if (status === "notFound") {
    return (
      <PageContainer>
        <PageHeader breadcrumb={["داشبورد", "برنامه ها"]} title="برنامه پیدا نشد" />
        <ContentSection>
          <Card padding="lg">
            <EmptyState
              action={<Button onClick={() => navigate("/programs/new")}>تولید برنامه جدید</Button>}
              description="شناسه برنامه در repository موقت پیدا نشد."
              title="برنامه پیدا نشد"
            />
          </Card>
        </ContentSection>
      </PageContainer>
    );
  }

  if (status === "error" || !program) {
    return (
      <PageContainer>
        <PageHeader breadcrumb={["داشبورد", "برنامه ها"]} title="خطای برنامه" />
        <ContentSection>
          <Card padding="lg">
            <EmptyState
              action={
                <Button
                  iconStart={<RefreshCcw size={18} />}
                  onClick={() => window.location.reload()}
                  variant="secondary"
                >
                  تلاش دوباره
                </Button>
              }
              description="دریافت برنامه با خطا روبه رو شد."
              title="خطای دریافت برنامه"
            />
          </Card>
        </ContentSection>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className={styles.toolbarActions}>
            <Button
              iconStart={<ArrowRight size={18} />}
              onClick={() => navigate(student ? `/students/${student.id}/programs` : "/programs")}
              variant="secondary"
            >
              بازگشت
            </Button>
            <Button
              iconStart={<Save size={18} />}
              isLoading={status === "saving"}
              onClick={saveProgram}
              variant="secondary"
            >
              ذخیره پیش‌نویس
            </Button>
            <Button
              isLoading={status === "saving"}
              onClick={() => void publishProgram()}
              variant="success"
            >
              نهایی‌سازی و ارسال به شاگرد
            </Button>
          </div>
        }
        breadcrumb={["داشبورد", "برنامه ها", "پیش نمایش"]}
        description="بخش‌های برنامه و فایل‌هایشان را همین‌جا بازبینی کنید؛ پس از نهایی‌سازی همهٔ فایل‌ها در پروندهٔ همین برنامه برای شاگرد قرار می‌گیرند."
        title="پیش نمایش برنامه"
      />
      <ContentSection>
        <div className={styles.pageStack}>
          {feedback ? (
            <div
              className={`${styles.alert} ${
                isErrorFeedback(feedback) ? styles.alertError : styles.alertSuccess
              }`}
              role="status"
            >
              {feedback}
            </div>
          ) : null}
          {isDirty ? (
            <div className={`${styles.alert} ${styles.alertWarning}`} role="status">
              تغییرات ذخیره نشده دارید.
            </div>
          ) : null}

          <ProgramHeader program={program} student={student} />
          {uploadSectionIds.length ? (
            <Card className={styles.pageStack}>
              <SectionHeader
                description="فایل‌ها تا نهایی‌سازی خصوصی هستند. هر بخش را جداگانه بازبینی، جایگزین یا حذف کنید."
                title="فایل‌های بارگذاری‌شدهٔ برنامه"
              />
              <div className={styles.deliverySectionGrid}>
                {uploadSectionIds.map((section) => {
                  const staged = section
                    ? stagedUploads.find((item) => item.section === section)
                    : stagedUploads[0];
                  const previewUrl = staged ? stagedPdfPreviews[staged.id] : "";
                  const sectionLabel = section ? programSectionLabel(section) : "PDF برنامه";
                  return (
                    <div className={styles.deliverySectionCard} key={section ?? "legacy"}>
                      <h3>{sectionLabel}</h3>
                      {staged ? (
                        <>
                          <div className={styles.pdfPreview}>
                            {previewUrl ? (
                              <iframe
                                className={styles.uploadedPdfFrame}
                                src={previewUrl}
                                title={`پیش‌نمایش ${sectionLabel}`}
                              />
                            ) : (
                              <div className={styles.alert} role="status">
                                در حال آماده‌کردن پیش‌نمایش PDF…
                              </div>
                            )}
                          </div>
                          <div className={styles.stagedPdfRow}>
                            <div>
                              <strong>{staged.fileName}</strong>
                              <span>
                                {formatProgramFileSize(staged.sizeBytes)} · خصوصی تا نهایی‌سازی
                              </span>
                            </div>
                            <div className={styles.toolbarActions}>
                              <Button
                                disabled={!previewUrl}
                                iconStart={<FileDown size={17} />}
                                onClick={() =>
                                  previewUrl &&
                                  window.open(previewUrl, "_blank", "noopener,noreferrer")
                                }
                                variant="secondary"
                              >
                                مشاهده
                              </Button>
                              <Button
                                iconStart={<Trash2 size={17} />}
                                onClick={() => void removeUploadedPdf(staged.id)}
                                variant="danger"
                              >
                                حذف فایل
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className={`${styles.alert} ${styles.alertWarning}`} role="alert">
                          فایل موقت موجود نیست یا منقضی شده؛ پیش از ارسال دوباره بارگذاری کنید.
                        </div>
                      )}
                      <FormField label={`جایگزینی ${sectionLabel}`} hint="PDF، حداکثر ۲۵ مگابایت">
                        <Input
                          key={`${section ?? "legacy"}-${uploadKey}`}
                          accept="application/pdf,.pdf"
                          disabled={uploadingReplacement || program.status !== "draft"}
                          type="file"
                          onChange={(event) =>
                            void replaceUploadedPdf(section, event.currentTarget.files?.[0])
                          }
                        />
                      </FormField>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
          {hasGeneratedSections ? <GenerationEvidencePanel program={program} /> : null}
          {tabs.length > 0 ? (
            <Card>
              <Tabs
                ariaLabel="تب های پیش نمایش برنامه"
                items={tabs.map((tab) => ({ id: tab, label: previewTabLabels[tab] }))}
                onChange={(tab) => setSearchParams({ tab })}
                renderPanels={false}
                value={activeTab}
              />
            </Card>
          ) : null}

          {activeTab === "training" && program.training ? (
            <TrainingEditor program={program} updateProgram={updateProgram} />
          ) : null}
          {activeTab === "nutrition" && program.nutrition ? (
            <NutritionEditor program={program} updateProgram={updateProgram} />
          ) : null}
          {activeTab === "supplements" && program.supplements ? (
            <SupplementsEditor program={program} updateProgram={updateProgram} />
          ) : null}
          {activeTab === "pdf" ? (
            <PdfSettingsEditor program={program} updateProgram={updateProgram} />
          ) : null}

          <div className={styles.mobilePreviewActions}>
            <Button
              iconStart={<Save size={18} />}
              isLoading={status === "saving"}
              onClick={saveProgram}
              variant="secondary"
            >
              ذخیره پیش‌نویس
            </Button>
            <Button
              isLoading={status === "saving"}
              onClick={() => void publishProgram()}
              variant="success"
            >
              نهایی‌سازی و ارسال به شاگرد
            </Button>
          </div>
        </div>
      </ContentSection>
    </PageContainer>
  );
}

function PreviewState({ title }: { title: string }) {
  return (
    <PageContainer>
      <PageHeader breadcrumb={["داشبورد", "برنامه ها"]} title={title} />
      <ContentSection>
        <Card>
          <Stack>
            <Skeleton height={88} />
            <Skeleton height={52} />
            <Skeleton height={280} />
          </Stack>
        </Card>
      </ContentSection>
    </PageContainer>
  );
}

function ProgramHeader({ program, student }: { program: GeneratedProgram; student?: Student }) {
  return (
    <Card className={styles.previewHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{program.title}</h2>
        <p className={styles.sectionDescription}>
          {student?.fullName ?? "شاگرد نامشخص"} - نسخه {program.version} -{" "}
          {formatCalendarText(program.dateRange)}
        </p>
      </div>
      <div className={styles.chipList}>
        <StatusBadge variant={program.status === "ready" ? "success" : "warning"}>
          {program.status === "ready" ? "آماده" : "پیش نویس"}
        </StatusBadge>
        <StatusBadge variant="info">{formatCalendarDate(program.createdAt)}</StatusBadge>
      </div>
    </Card>
  );
}

function TrainingEditor({
  program,
  updateProgram
}: {
  program: GeneratedProgram;
  updateProgram: (updater: (program: GeneratedProgram) => GeneratedProgram) => void;
}) {
  const [activeDayId, setActiveDayId] = useState(program.training?.days[0]?.id ?? "");
  const day =
    program.training?.days.find((item) => item.id === activeDayId) ?? program.training?.days[0];

  const updateDay = (dayId: string, updater: (day: TrainingDay) => TrainingDay) => {
    updateProgram((next) => ({
      ...next,
      training: next.training
        ? {
            ...next.training,
            days: next.training.days.map((item) => (item.id === dayId ? updater(item) : item))
          }
        : next.training
    }));
  };

  const addDay = () =>
    updateProgram((next) => {
      const days = next.training?.days ?? [];
      const order = days.length + 1;
      const newDay: TrainingDay = {
        exercises: [],
        id: `day-${Date.now()}`,
        notes: "",
        order,
        targetMuscles: ["سینه"],
        title: `روز ${order}`
      };
      setActiveDayId(newDay.id);
      return {
        ...next,
        training: next.training
          ? { ...next.training, days: [...days, newDay] }
          : { days: [newDay], summary: "" }
      };
    });

  const removeDay = (dayId: string) =>
    updateProgram((next) => {
      const days = next.training?.days.filter((item) => item.id !== dayId) ?? [];
      setActiveDayId(days[0]?.id ?? "");
      return {
        ...next,
        training: next.training ? { ...next.training, days: normalizeOrders(days) } : next.training
      };
    });

  return (
    <div className={styles.previewLayout}>
      <Card className={styles.dayNav}>
        <Button iconStart={<Plus size={18} />} onClick={addDay} variant="secondary">
          افزودن روز
        </Button>
        {program.training?.days.map((item) => (
          <button
            className={`${styles.dayButton} ${item.id === day?.id ? styles.dayButtonActive : ""}`}
            key={item.id}
            onClick={() => setActiveDayId(item.id)}
            type="button"
          >
            {item.title}
          </button>
        ))}
      </Card>
      {day ? (
        <Card className={styles.pageStack}>
          <div className={`${styles.toolbar} ${styles.trainingToolbar}`}>
            <FormField label="عنوان روز">
              <Input
                value={day.title}
                onChange={(event) =>
                  updateDay(day.id, (nextDay) => ({
                    ...nextDay,
                    title: event.target.value
                  }))
                }
              />
            </FormField>
            <div className={styles.toolbarActions}>
              <Button
                iconStart={<Plus size={18} />}
                onClick={() =>
                  updateDay(day.id, (nextDay) => ({
                    ...nextDay,
                    exercises: [...nextDay.exercises, createExercise(nextDay.exercises.length + 1)]
                  }))
                }
                variant="secondary"
              >
                افزودن حرکت
              </Button>
              <Button
                iconStart={<Trash2 size={18} />}
                onClick={() => removeDay(day.id)}
                variant="danger"
              >
                حذف روز
              </Button>
            </div>
          </div>
          <FormField label="توضیح روز">
            <Textarea
              value={day.notes}
              onChange={(event) =>
                updateDay(day.id, (nextDay) => ({
                  ...nextDay,
                  notes: event.target.value
                }))
              }
            />
          </FormField>
          <div className={styles.exerciseList}>
            {day.exercises.length === 0 ? (
              <EmptyState title="حرکتی ثبت نشده" description="برای این روز حرکت اضافه کنید." />
            ) : null}
            {day.exercises.map((exercise, index) => (
              <ExerciseEditor
                exercise={exercise}
                isFirst={index === 0}
                isLast={index === day.exercises.length - 1}
                key={exercise.id}
                onChange={(nextExercise) =>
                  updateDay(day.id, (nextDay) => ({
                    ...nextDay,
                    exercises: nextDay.exercises.map((item) =>
                      item.id === nextExercise.id ? nextExercise : item
                    )
                  }))
                }
                onMove={(direction) =>
                  updateDay(day.id, (nextDay) => ({
                    ...nextDay,
                    exercises: moveItem(nextDay.exercises, index, direction)
                  }))
                }
                onRemove={() =>
                  updateDay(day.id, (nextDay) => ({
                    ...nextDay,
                    exercises: normalizeOrders(
                      nextDay.exercises.filter((item) => item.id !== exercise.id)
                    )
                  }))
                }
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ExerciseEditor({
  exercise,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove
}: {
  exercise: TrainingExercise;
  isFirst: boolean;
  isLast: boolean;
  onChange: (exercise: TrainingExercise) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className={styles.editableRow} data-superset-group={exercise.supersetGroupId || undefined}>
      <FormField
        label={
          exercise.supersetGroupId
            ? exercise.supersetWithPrevious
              ? "نام حرکت (زوج سوپرست)"
              : "نام حرکت (سوپرست)"
            : "نام حرکت"
        }
      >
        <Input
          value={exercise.name}
          onChange={(event) => onChange({ ...exercise, name: event.target.value })}
        />
        {exercise.supersetGroupId &&
        !exercise.supersetWithPrevious &&
        exercise.supersetPartnerName ? (
          <span className={styles.supersetBadge} data-testid="superset-badge">
            {exercise.name}
            <br />+<br />
            {exercise.supersetPartnerName}
          </span>
        ) : exercise.supersetWithPrevious ? (
          <span className={styles.supersetBadge} data-testid="superset-partner-badge">
            + {exercise.name}
          </span>
        ) : null}
        {exercise.supersetGroupId && !exercise.supersetWithPrevious ? (
          <small>
            استراحت بین حرکات: {exercise.supersetRestBetweenSeconds ?? 0} ثانیه؛ بعد از جفت:{" "}
            {exercise.supersetRestAfterSeconds ?? 90} ثانیه
          </small>
        ) : null}
        {exercise.dropSet ? (
          <span className={styles.supersetBadge} data-testid="drop-set-badge">
            دراپ‌ست: {exercise.dropSet.drops} دراپ با کاهش {exercise.dropSet.reduction_percent}٪
          </span>
        ) : null}
      </FormField>
      <FormField label="ست">
        <Input
          type="number"
          value={exercise.sets}
          onChange={(event) => onChange({ ...exercise, sets: Number(event.target.value) })}
        />
      </FormField>
      <FormField label="تکرار">
        <Input
          value={exercise.reps}
          onChange={(event) => onChange({ ...exercise, reps: event.target.value })}
        />
      </FormField>
      <FormField label="استراحت">
        <Input
          value={exercise.rest}
          onChange={(event) => onChange({ ...exercise, rest: event.target.value })}
        />
      </FormField>
      <FormField label="توضیح">
        <Input
          value={exercise.notes}
          onChange={(event) => onChange({ ...exercise, notes: event.target.value })}
        />
      </FormField>
      <div className={styles.actionIconGroup}>
        <Button
          disabled={isFirst}
          iconStart={<ArrowUp size={16} />}
          onClick={() => onMove(-1)}
          size="sm"
          variant="secondary"
        >
          بالا
        </Button>
        <Button
          disabled={isLast}
          iconStart={<ArrowDown size={16} />}
          onClick={() => onMove(1)}
          size="sm"
          variant="secondary"
        >
          پایین
        </Button>
        <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
          حذف
        </Button>
      </div>
    </div>
  );
}

function NutritionEditor({
  program,
  updateProgram
}: {
  program: GeneratedProgram;
  updateProgram: (updater: (program: GeneratedProgram) => GeneratedProgram) => void;
}) {
  const updateMeals = (updater: (meals: NutritionMeal[]) => NutritionMeal[]) =>
    updateProgram((next) => ({
      ...next,
      nutrition: next.nutrition
        ? { ...next.nutrition, meals: updater(next.nutrition.meals) }
        : next.nutrition
    }));

  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        action={
          <Button
            iconStart={<Plus size={18} />}
            onClick={() =>
              updateMeals((meals) => [
                ...meals,
                {
                  foods: [],
                  id: `meal-${Date.now()}`,
                  notes: "",
                  order: meals.length + 1,
                  title: "وعده جدید"
                }
              ])
            }
          >
            افزودن وعده جدید
          </Button>
        }
        description={program.nutrition?.notes ?? ""}
        title="برنامه غذایی"
      />
      <div className={styles.mealList}>
        {program.nutrition?.meals.map((meal, index) => (
          <MealEditor
            isFirst={index === 0}
            isLast={index === (program.nutrition?.meals.length ?? 0) - 1}
            key={meal.id}
            meal={meal}
            onChange={(nextMeal) =>
              updateMeals((meals) =>
                meals.map((item) => (item.id === nextMeal.id ? nextMeal : item))
              )
            }
            onMove={(direction) => updateMeals((meals) => moveItem(meals, index, direction))}
            onRemove={() =>
              updateMeals((meals) => normalizeOrders(meals.filter((item) => item.id !== meal.id)))
            }
          />
        ))}
      </div>
    </Card>
  );
}

function MealEditor({
  isFirst,
  isLast,
  meal,
  onChange,
  onMove,
  onRemove
}: {
  isFirst: boolean;
  isLast: boolean;
  meal: NutritionMeal;
  onChange: (meal: NutritionMeal) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const updateFood = (food: NutritionFood) =>
    onChange({
      ...meal,
      foods: meal.foods.map((item) => (item.id === food.id ? food : item))
    });

  return (
    <Card className={styles.pageStack} padding="sm">
      <div className={styles.toolbar}>
        <FormField label="عنوان وعده">
          <Input
            value={meal.title}
            onChange={(event) => onChange({ ...meal, title: event.target.value })}
          />
        </FormField>
        <div className={styles.toolbarActions}>
          <Button
            disabled={isFirst}
            iconStart={<ArrowUp size={16} />}
            onClick={() => onMove(-1)}
            size="sm"
            variant="secondary"
          >
            بالا
          </Button>
          <Button
            disabled={isLast}
            iconStart={<ArrowDown size={16} />}
            onClick={() => onMove(1)}
            size="sm"
            variant="secondary"
          >
            پایین
          </Button>
          <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
            حذف وعده
          </Button>
        </div>
      </div>
      <FormField label="توضیحات">
        <Textarea
          value={meal.notes}
          onChange={(event) => onChange({ ...meal, notes: event.target.value })}
        />
      </FormField>
      {meal.foods.map((food) => (
        <div className={styles.foodRow} key={food.id}>
          <FormField label="ماده غذایی">
            <Input
              value={food.name}
              onChange={(event) => updateFood({ ...food, name: event.target.value })}
            />
          </FormField>
          <FormField label="مقدار">
            <Input
              value={food.amount}
              onChange={(event) => updateFood({ ...food, amount: event.target.value })}
            />
          </FormField>
          <FormField label="جایگزین">
            <Input
              value={food.alternatives}
              onChange={(event) => updateFood({ ...food, alternatives: event.target.value })}
            />
          </FormField>
          <Button
            iconStart={<Trash2 size={16} />}
            onClick={() =>
              onChange({ ...meal, foods: meal.foods.filter((item) => item.id !== food.id) })
            }
            size="sm"
            variant="danger"
          >
            حذف
          </Button>
        </div>
      ))}
      <Button
        iconStart={<Plus size={18} />}
        onClick={() =>
          onChange({
            ...meal,
            foods: [
              ...meal.foods,
              {
                amount: "",
                alternatives: "",
                id: `food-${Date.now()}`,
                name: "ماده غذایی جدید"
              }
            ]
          })
        }
        variant="secondary"
      >
        افزودن غذا
      </Button>
    </Card>
  );
}

function SupplementsEditor({
  program,
  updateProgram
}: {
  program: GeneratedProgram;
  updateProgram: (updater: (program: GeneratedProgram) => GeneratedProgram) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState(emptySupplementSelection);
  const [feedback, setFeedback] = useState("");
  const [applying, setApplying] = useState(false);
  const updateItems = (updater: (items: SupplementItem[]) => SupplementItem[]) =>
    updateProgram((next) => ({
      ...next,
      supplements: next.supplements
        ? { ...next.supplements, items: updater(next.supplements.items) }
        : next.supplements
    }));

  return (
    <Card className={styles.pageStack}>
      <Button
        onClick={() => {
          setSelection(emptySupplementSelection());
          setFeedback("");
          setPickerOpen(true);
        }}
      >
        انتخاب از بانک مکمل
      </Button>
      <EditorDrawer
        open={pickerOpen}
        title="انتخاب مکمل برای شاگرد"
        onClose={() => setPickerOpen(false)}
        hasUnsavedChanges={selection.items.length > 0}
        footer={
          <Button
            disabled={!selection.confirmed || !selection.safety_reviewed || !selection.items.length}
            isLoading={applying}
            onClick={async () => {
              setApplying(true);
              setFeedback("");
              try {
                const result = await supplementCatalogRepository.prescribe(
                  program.studentId,
                  selection
                );
                updateItems((items) =>
                  [
                    ...items.filter(
                      (item) =>
                        !selection.items.some((selected) => selected.entry_id === item.entry_id)
                    ),
                    ...result.items
                  ].map((item, index) => ({ ...item, order: index + 1 }))
                );
                setPickerOpen(false);
              } catch (error) {
                setFeedback(
                  error instanceof ApiError
                    ? persianMessageForApiError(error)
                    : "افزودن مکمل به برنامه انجام نشد."
                );
              } finally {
                setApplying(false);
              }
            }}
          >
            افزودن انتخاب‌ها به برنامه
          </Button>
        }
      >
        {feedback ? <p role="alert">{feedback}</p> : null}
        {pickerOpen ? (
          <SupplementSelectionFields
            studentId={program.studentId}
            selection={selection}
            onChange={setSelection}
          />
        ) : null}
      </EditorDrawer>
      <SectionHeader
        action={
          <Button
            iconStart={<Plus size={18} />}
            onClick={() =>
              updateItems((items) => [
                ...items,
                {
                  amount: "",
                  id: `supplement-${Date.now()}`,
                  name: "مکمل جدید",
                  notes: "",
                  order: items.length + 1,
                  timing: "بعد تمرین"
                }
              ])
            }
          >
            افزودن مکمل
          </Button>
        }
        description={program.supplements?.summary ?? ""}
        title="مکمل ها"
      />
      {program.supplements?.medicalNote ? (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          {program.supplements.medicalNote}
        </div>
      ) : null}
      <div className={styles.supplementList}>
        {program.supplements?.items.map((item, index) => (
          <div className={styles.editableRow} key={item.id}>
            <FormField label="نام مکمل">
              <Input
                value={item.name}
                onChange={(event) =>
                  updateItems((items) =>
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, name: event.target.value } : entry
                    )
                  )
                }
              />
            </FormField>
            <FormField label="مقدار">
              <Input
                value={item.amount}
                onChange={(event) =>
                  updateItems((items) =>
                    items.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, amount: event.target.value, dose: undefined }
                        : entry
                    )
                  )
                }
              />
            </FormField>
            <FormField label="زمان مصرف">
              <Input
                value={item.timing}
                onChange={(event) =>
                  updateItems((items) =>
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, timing: event.target.value } : entry
                    )
                  )
                }
              />
            </FormField>
            <FormField label="دلیل مصرف / توضیح">
              <Input
                value={item.notes}
                onChange={(event) =>
                  updateItems((items) =>
                    items.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, notes: event.target.value, reason: event.target.value }
                        : entry
                    )
                  )
                }
              />
            </FormField>
            <div />
            <div className={styles.actionIconGroup}>
              <Button
                disabled={index === 0}
                iconStart={<ArrowUp size={16} />}
                onClick={() => updateItems((items) => moveItem(items, index, -1))}
                size="sm"
                variant="secondary"
              >
                بالا
              </Button>
              <Button
                disabled={index === (program.supplements?.items.length ?? 0) - 1}
                iconStart={<ArrowDown size={16} />}
                onClick={() => updateItems((items) => moveItem(items, index, 1))}
                size="sm"
                variant="secondary"
              >
                پایین
              </Button>
              <Button
                iconStart={<Trash2 size={16} />}
                onClick={() =>
                  updateItems((items) =>
                    normalizeOrders(items.filter((entry) => entry.id !== item.id))
                  )
                }
                size="sm"
                variant="danger"
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PdfSettingsEditor({
  program,
  updateProgram
}: {
  program: GeneratedProgram;
  updateProgram: (updater: (program: GeneratedProgram) => GeneratedProgram) => void;
}) {
  const settings = program.pdfSettings;
  const updateSettings = <Key extends keyof typeof settings>(
    field: Key,
    value: (typeof settings)[Key]
  ) =>
    updateProgram((next) => ({
      ...next,
      pdfSettings: {
        ...next.pdfSettings,
        [field]: value
      }
    }));

  return (
    <div className={styles.cardGrid}>
      <Card className={styles.pageStack}>
        <SectionHeader
          description="تنظیمات در پیش‌نویس ذخیره می‌شود. PDF واقعی فقط از نسخه نهایی‌شده ساخته می‌شود."
          title="تنظیمات PDF"
        />
        <div className={styles.formGrid}>
          <FormField className={styles.fullField} label="عنوان فایل یا برنامه">
            <Input
              value={settings.fileTitle}
              onChange={(event) => updateSettings("fileTitle", event.target.value)}
            />
          </FormField>
          <Checkbox
            checked={settings.includeCoachName}
            label="نمایش نام مربی"
            onChange={(event) => updateSettings("includeCoachName", event.target.checked)}
          />
          <Checkbox
            checked={settings.includeStudentName}
            label="نمایش نام شاگرد"
            onChange={(event) => updateSettings("includeStudentName", event.target.checked)}
          />
          <Checkbox
            checked={settings.includeCoachNotes}
            label="نمایش یادداشت های مربی"
            onChange={(event) => updateSettings("includeCoachNotes", event.target.checked)}
          />
          <Checkbox
            checked={settings.includeTraining}
            disabled={!program.training}
            label="برنامه تمرینی"
            onChange={(event) => updateSettings("includeTraining", event.target.checked)}
          />
          <Checkbox
            checked={settings.includeNutrition}
            disabled={!program.nutrition}
            label="برنامه غذایی"
            onChange={(event) => updateSettings("includeNutrition", event.target.checked)}
          />
          <Checkbox
            checked={settings.includeSupplements}
            disabled={!program.supplements}
            label="مکمل ها"
            onChange={(event) => updateSettings("includeSupplements", event.target.checked)}
          />
          <FormField label="قالب خروجی">
            <Select
              options={[
                { label: "ساده", value: "simple" },
                { label: "مدرن", value: "modern" },
                { label: "رنگی", value: "colorful" }
              ]}
              value={settings.style}
              onChange={(event) =>
                updateSettings("style", event.target.value as typeof settings.style)
              }
            />
          </FormField>
          <FormField className={styles.wideField} label="اطلاعات تماس">
            <Input
              value={settings.contactInfo}
              onChange={(event) => updateSettings("contactInfo", event.target.value)}
            />
          </FormField>
        </div>
        {program.status === "draft" ? (
          <p role="status">
            با «نهایی‌سازی و ارسال به شاگرد»، PDFهای قابل دانلود به‌صورت خودکار آماده می‌شوند.
          </p>
        ) : null}
      </Card>
      <Card className={styles.pdfPreview}>
        <div>
          <strong>{settings.fileTitle}</strong>
          <p>پیش نمایش صفحه PDF - A4 - {settings.style}</p>
          <p>نسخه {program.version}</p>
        </div>
      </Card>
    </div>
  );
}

function SectionHeader({
  action,
  description,
  title
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {action}
    </div>
  );
}

function createExercise(order: number): TrainingExercise {
  return {
    id: `exercise-${Date.now()}-${order}`,
    name: "حرکت جدید",
    notes: "",
    order,
    reps: "۱۰-۱۲",
    rest: "۹۰ ثانیه",
    rpe: "متوسط",
    sets: 3,
    targetMuscle: "سینه",
    supersetGroupId: null,
    supersetWithPrevious: false
  };
}

function getPreviewTab(value: string | null, tabs: ProgramPreviewTab[]) {
  if (tabs.includes(value as ProgramPreviewTab)) {
    return value as ProgramPreviewTab;
  }
  return tabs[0] ?? "pdf";
}

function getStagedUploads(program?: GeneratedProgram): StagedProgramPdf[] {
  if (!program) return [];
  const sectionFiles = Object.values(program.stagedPdfs ?? {}).filter(
    (file): file is StagedProgramPdf => Boolean(file)
  );
  if (sectionFiles.length) return sectionFiles;
  return program.stagedPdf ? [program.stagedPdf] : [];
}

function programSectionLabel(section: ProgramPdfSection): string {
  switch (section) {
    case "workout":
      return "برنامه تمرینی";
    case "nutrition":
      return "برنامه غذایی";
    case "supplement":
      return "برنامه مکمل";
  }
}

function formatProgramFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} کیلوبایت`
    : `${(size / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function isErrorFeedback(message: string): boolean {
  return ["خطا", "نشد", "نمی‌شود", "نیست", "نامعتبر", "باید", "الزامی"].some((phrase) =>
    message.includes(phrase)
  );
}

function moveItem<Item extends { order: number }>(
  items: Item[],
  index: number,
  direction: -1 | 1
): Item[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const current = nextItems[index];
  nextItems[index] = nextItems[targetIndex];
  nextItems[targetIndex] = current;
  return normalizeOrders(nextItems);
}

function normalizeOrders<Item extends { order: number }>(items: Item[]): Item[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}
