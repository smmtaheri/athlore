import { useEffect, useState } from "react";
import { ArrowRight, Eye, FileUp, RefreshCcw, Trash2, WandSparkles } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  ContentSection,
  PageContainer,
  PageHeader,
  ResponsiveGrid,
  Stack
} from "../../../components/layout";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Textarea
} from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import {
  coachRulesRepository,
  type CoachRulesRepository
} from "../../coach-rules/services/coachRulesRepository";
import type { CoachRules } from "../../coach-rules/types/coachRules";
import {
  studentProgramsRepository,
  type StudentProgramsRepository
} from "../../students/services/studentProgramsRepository";
import {
  studentVisitsRepository,
  type StudentVisitsRepository
} from "../../students/services/studentVisitsRepository";
import {
  studentsRepository,
  type StudentsRepository
} from "../../students/services/studentsRepository";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import type { Student, TrainingLevel } from "../../students/types/student";
import type { StudentProgramType } from "../../students/types/studentProgram";
import { generateProgram } from "../generator/programGenerator";
import {
  createProgramSummary,
  programsRepository,
  type ProgramsRepository
} from "../services/programsRepository";
import type { ProgramGenerationInput } from "../types/generatedProgram";
import styles from "../components/programFlow.module.css";
import { SupplementSelectionFields } from "../../coach-rules/components/SupplementSelectionFields";
import { emptySupplementSelection } from "../../coach-rules/services/supplementCatalogRepository";
import {
  calendarInputToIso,
  calendarPlaceholder,
  formatCalendarDate,
  todayCalendarInput
} from "../../../shared/dates/calendar";

const programTypeOptions = [
  { label: "کامل", value: "complete" },
  { label: "تمرینی", value: "workout" },
  { label: "غذایی", value: "nutrition" },
  { label: "مکمل", value: "supplement" }
];

const levelOptions = [
  { label: "مبتدی", value: "beginner" },
  { label: "نیمه‌حرفه‌ای", value: "intermediate" },
  { label: "حرفه‌ای", value: "advanced" }
];

const targetMuscleOptions = [
  { label: "بدون تمرکز ناحیه‌ای", value: "" },
  { label: "سینه", value: "سینه" }
];

const chestTargetRegionOptions = [
  { label: "انتخاب ناحیه", value: "" },
  { label: "کل سینه", value: "whole_chest" },
  { label: "بالاسینه", value: "upper_chest" },
  { label: "بخش میانی سینه", value: "mid_chest" },
  { label: "پایین سینه", value: "lower_chest" },
  { label: "داخل سینه", value: "inner_chest" },
  { label: "داخل بالاسینه", value: "inner_upper_chest" },
  { label: "داخل زیرسینه", value: "inner_lower_chest" }
];

export interface ProgramGenerationPageProps {
  coachRulesRepo?: CoachRulesRepository;
  programsRepo?: ProgramsRepository;
  studentProgramsRepo?: StudentProgramsRepository;
  studentsRepo?: StudentsRepository;
  visitsRepo?: StudentVisitsRepository;
}

export function ProgramGenerationPage({
  coachRulesRepo = coachRulesRepository,
  programsRepo = programsRepository,
  studentProgramsRepo = studentProgramsRepository,
  studentsRepo = studentsRepository,
  visitsRepo = studentVisitsRepository
}: ProgramGenerationPageProps) {
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [rules, setRules] = useState<CoachRules>();
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [feedback, setFeedback] = useState(
    () => (location.state as { visitSaved?: string } | null)?.visitSaved ?? ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creationMode, setCreationMode] = useState<"generated" | "uploaded_pdf">("generated");
  const [stagedPdf, setStagedPdf] = useState<{
    expiresAt: string;
    fileName: string;
    id: string;
    sizeBytes: number;
  } | null>(null);
  const [startDate, setStartDate] = useState(todayCalendarInput());
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [creatingUploadedDraft, setCreatingUploadedDraft] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [status, setStatus] = useState<"error" | "generating" | "loaded" | "loading">("loading");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialStudentId = searchParams.get("studentId") ?? "";
  const [form, setForm] = useState<ProgramGenerationInput>({
    applyExerciseBank: true,
    applyGeneralRules: true,
    applyInjuryRules: true,
    applyLevelRules: true,
    applyMusclePriorityRules: true,
    customInstructions: "",
    daysPerWeek: 4,
    durationWeeks: 4,
    goal: "افزایش حجم و بهبود فرم بدن",
    level: "intermediate",
    musclePriorities: ["سینه", "سرشانه"],
    programType: "complete",
    studentId: initialStudentId,
    supplementSelection: emptySupplementSelection(),
    targetExerciseCount: 2,
    targetMuscle: "",
    targetRegion: "",
    templateId: "",
    title: "برنامه کامل محمد طاهری"
  });

  useEffect(() => {
    let isMounted = true;
    Promise.all([studentsRepo.list(), coachRulesRepo.get().catch(() => undefined)])
      .then(([studentItems, coachRules]) => {
        if (!isMounted) {
          return;
        }
        const selectedStudent =
          studentItems.find((student) => student.id === initialStudentId) ?? studentItems[0];
        const studentDays = selectedStudent?.trainingConditions.trainingDaysPerWeek;
        const preferredName = "۴ روزه حجم متوسط";
        const matchingTemplates = studentDays
          ? coachRules?.templates.filter((item) => item.daysPerWeek === studentDays)
          : coachRules?.templates;
        const template =
          matchingTemplates?.find((item) => item.name === preferredName) ??
          matchingTemplates?.find((item) => item.daysPerWeek === 4) ??
          matchingTemplates?.[0];
        setStudents(studentItems);
        setRules(coachRules);
        if (!coachRules) {
          setCreationMode("uploaded_pdf");
          setFeedback("قوانین تولید برنامه در دسترس نیست؛ می‌توانید PDF آماده بارگذاری کنید.");
        }
        setForm((current) => ({
          ...current,
          daysPerWeek: studentDays ?? template?.daysPerWeek ?? 4,
          goal:
            selectedStudent?.goals.secondaryGoal ||
            selectedStudent?.goals.primaryGoal ||
            current.goal,
          level: selectedStudent?.trainingBackground.level ?? current.level,
          musclePriorities: selectedStudent?.goals.musclePriorities ?? current.musclePriorities,
          studentId: selectedStudent?.id ?? current.studentId,
          templateId: template?.id ?? "",
          title: selectedStudent ? `برنامه کامل ${selectedStudent.fullName}` : current.title
        }));
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
  }, [coachRulesRepo, initialStudentId, studentsRepo]);

  useEffect(() => {
    if (!form.studentId || status === "loading") {
      return;
    }

    let isMounted = true;
    visitsRepo
      .listByStudent(form.studentId)
      .then((items) => {
        if (isMounted) {
          setVisits(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVisits([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [form.studentId, status, visitsRepo]);

  const selectedStudent = students.find((student) => student.id === form.studentId);
  const latestVisit = visits[0];
  const selectedTemplate = rules?.templates.find((template) => template.id === form.templateId);
  const validationErrors = Object.values(errors);

  const studentOptions = students.map((student) => ({
    label: student.fullName,
    value: student.id
  }));
  const templateOptions =
    rules?.templates.map((template) => ({
      label: `${template.name} - ${template.daysPerWeek} روز`,
      value: template.id
    })) ?? [];

  const updateForm = <Key extends keyof ProgramGenerationInput>(
    field: Key,
    value: ProgramGenerationInput[Key]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const getProgramPeriod = () => {
    const startIso = calendarInputToIso(startDate);
    if (!startIso || form.durationWeeks < 1) return null;
    const endDate = new Date(`${startIso}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + form.durationWeeks * 7 - 1);
    const endIso = endDate.toISOString().slice(0, 10);
    return {
      endIso,
      label: `${formatCalendarDate(startIso)} تا ${formatCalendarDate(endIso)}`,
      startIso
    };
  };

  const handleStagePdf = async (file?: File) => {
    if (!file || !form.studentId) return;
    if (file.size > 25 * 1024 * 1024) {
      setFeedback("حجم PDF باید حداکثر ۲۵ مگابایت باشد.");
      setUploadInputKey((current) => current + 1);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setFeedback("فقط فایل PDF قابل بارگذاری است.");
      setUploadInputKey((current) => current + 1);
      return;
    }
    if (!programsRepo.uploadStagedPdf) {
      setFeedback("بارگذاری PDF در این محیط در دسترس نیست.");
      return;
    }
    setUploadingPdf(true);
    setFeedback("");
    try {
      const next = await programsRepo.uploadStagedPdf(form.studentId, file);
      const previous = stagedPdf;
      setStagedPdf(next);
      if (previous && programsRepo.deleteStagedPdf) {
        void programsRepo.deleteStagedPdf(previous.id).catch(() => undefined);
      }
      setFeedback("PDF بارگذاری شد و تا نهایی‌سازی فقط به‌صورت پیش‌نویس خصوصی می‌ماند.");
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "بارگذاری PDF انجام نشد؛ فایل قبلی همچنان حفظ شده است."
      );
    } finally {
      setUploadingPdf(false);
      setUploadInputKey((current) => current + 1);
    }
  };

  const handleRemoveStagedPdf = async () => {
    if (!stagedPdf) return;
    try {
      await programsRepo.deleteStagedPdf?.(stagedPdf.id);
      setStagedPdf(null);
      setFeedback("فایل موقت حذف شد.");
    } catch {
      setFeedback("حذف فایل موقت انجام نشد؛ دوباره تلاش کنید.");
    }
  };

  const handleStudentChange = (studentId: string) => {
    if (stagedPdf && programsRepo.deleteStagedPdf) {
      void programsRepo.deleteStagedPdf(stagedPdf.id).catch(() => undefined);
      setStagedPdf(null);
    }
    const student = students.find((item) => item.id === studentId);
    const studentDays = student?.trainingConditions.trainingDaysPerWeek;
    const preferredName = "۴ روزه حجم متوسط";
    const matchingTemplates = studentDays
      ? rules?.templates.filter((item) => item.daysPerWeek === studentDays)
      : rules?.templates;
    const template =
      matchingTemplates?.find((item) => item.name === preferredName) ??
      matchingTemplates?.find((item) => item.daysPerWeek === 4) ??
      matchingTemplates?.[0];
    setForm((current) => ({
      ...current,
      daysPerWeek: studentDays ?? template?.daysPerWeek ?? 4,
      goal: student?.goals.secondaryGoal || current.goal,
      level: student?.trainingBackground.level ?? current.level,
      musclePriorities: student?.goals.musclePriorities ?? current.musclePriorities,
      studentId,
      supplementSelection: emptySupplementSelection(),
      templateId: template?.id ?? "",
      title: student ? `برنامه کامل ${student.fullName}` : current.title
    }));
    setErrors({});
  };

  const handleGenerate = async () => {
    if (!selectedStudent || !rules) {
      return;
    }

    const period = getProgramPeriod();
    const nextErrors = validateForm(form, selectedTemplate);
    if (!period) nextErrors.startDate = "تاریخ شروع و مدت برنامه را بررسی کنید.";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback("لطفا خطاهای فرم تولید برنامه را بررسی کنید.");
      return;
    }

    setStatus("generating");
    setFeedback("");

    try {
      const generationInput = {
        ...form,
        dateRangeEnd: period!.endIso,
        dateRangeLabel: period!.label,
        dateRangeStart: period!.startIso
      };
      let savedProgram;
      let warnings: string[] = [];
      if (programsRepo.generate) {
        const result = await programsRepo.generate(generationInput);
        savedProgram = result.program;
        warnings = result.warnings;
      } else {
        // Test / mock path only — not used in normal API runtime.
        savedProgram = await programsRepo.create(
          generateProgram({
            input: generationInput,
            rules,
            student: selectedStudent,
            visit: latestVisit
          })
        );
      }
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      if (warnings.length > 0) {
        sessionStorage.setItem(
          `coach-assistant.program-warnings.${savedProgram.id}`,
          JSON.stringify(warnings)
        );
      }
      navigate(`/programs/${savedProgram.id}`);
    } catch (error) {
      setStatus("loaded");
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "خطا در تولید برنامه. لطفا دوباره تلاش کنید."
      );
    }
  };

  const handleCreateUploadedDraft = async () => {
    const period = getProgramPeriod();
    const nextErrors: Record<string, string> = {};
    if (!form.studentId) nextErrors.studentId = "انتخاب شاگرد الزامی است.";
    if (!form.title.trim()) nextErrors.title = "عنوان برنامه الزامی است.";
    if (!period) nextErrors.startDate = "تاریخ شروع و مدت برنامه را بررسی کنید.";
    if (!stagedPdf) nextErrors.file = "ابتدا PDF برنامه را بارگذاری کنید.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFeedback(Object.values(nextErrors)[0]);
      return;
    }
    if (!stagedPdf || !period || !programsRepo.createUploadedDraft) {
      setFeedback("ساخت پیش‌نویس PDF در این محیط در دسترس نیست.");
      return;
    }
    setCreatingUploadedDraft(true);
    setFeedback("");
    try {
      const savedProgram = await programsRepo.createUploadedDraft({
        dateRangeEnd: period.endIso,
        dateRangeLabel: period.label,
        dateRangeStart: period.startIso,
        programType: form.programType,
        stagedPdfId: stagedPdf.id,
        studentId: form.studentId,
        title: form.title
      });
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      setStagedPdf(null);
      navigate(`/programs/${savedProgram.id}`);
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "ساخت پیش‌نویس انجام نشد؛ فایل موقت را می‌توانید دوباره ارسال کنید."
      );
    } finally {
      setCreatingUploadedDraft(false);
    }
  };

  if (status === "loading") {
    return (
      <PageContainer>
        <PageHeader
          breadcrumb={["داشبورد", "برنامه ها", "تولید برنامه"]}
          description="در حال آماده سازی اطلاعات شاگرد و قوانین مربی"
          title="ساخت برنامه برای شاگرد"
        />
        <ContentSection>
          <Card>
            <Stack>
              <Skeleton height={64} />
              <Skeleton height={160} />
              <Skeleton height={220} />
            </Stack>
          </Card>
        </ContentSection>
      </PageContainer>
    );
  }

  if (status === "error") {
    return (
      <PageContainer>
        <PageHeader
          breadcrumb={["داشبورد", "برنامه ها", "ساخت برنامه"]}
          title="ساخت برنامه برای شاگرد"
        />
        <ContentSection>
          <Card padding="lg">
            <EmptyState
              action={
                <Button onClick={() => window.location.reload()} variant="secondary">
                  تلاش دوباره
                </Button>
              }
              description="دریافت شاگردها یا قوانین مربی با خطا روبه رو شد."
              title="خطای آماده سازی تولید"
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
          <Button
            iconStart={<ArrowRight size={18} />}
            onClick={() =>
              navigate(selectedStudent ? `/students/${selectedStudent.id}/programs` : "/programs")
            }
            variant="secondary"
          >
            بازگشت
          </Button>
        }
        breadcrumb={["داشبورد", "برنامه ها", "تولید برنامه"]}
        description="برنامه را با Athlore بسازید یا PDF آمادهٔ خودتان را بارگذاری کنید؛ در هر دو حالت بازبینی و ارسال در یک مسیر انجام می‌شود."
        title="ساخت برنامه برای شاگرد"
      />
      <ContentSection>
        <div className={styles.pageStack}>
          <GenerationStepper mode={creationMode} />
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
          {validationErrors.length > 0 ? (
            <div className={`${styles.alert} ${styles.alertWarning}`} role="alert">
              {validationErrors[0]}
            </div>
          ) : null}

          <Card>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>روش آماده‌کردن برنامه</h2>
                <p className={styles.sectionDescription}>
                  یا برنامه را با اطلاعات شاگرد تولید کنید، یا PDF آمادهٔ خودتان را بارگذاری کنید؛
                  بازبینی و ارسال در هر دو روش یکسان است.
                </p>
              </div>
            </div>
            <div className={styles.creationModeGrid}>
              <button
                aria-pressed={creationMode === "generated"}
                className={`${styles.creationModeCard} ${creationMode === "generated" ? styles.creationModeCardActive : ""}`}
                disabled={!rules}
                onClick={() => setCreationMode("generated")}
                type="button"
              >
                <WandSparkles aria-hidden size={22} />
                <strong>تولید برنامه با Athlore</strong>
                <span>برنامه با قوانین، سابقه و اطلاعات شاگرد ساخته می‌شود.</span>
              </button>
              <button
                aria-pressed={creationMode === "uploaded_pdf"}
                className={`${styles.creationModeCard} ${creationMode === "uploaded_pdf" ? styles.creationModeCardActive : ""}`}
                onClick={() => setCreationMode("uploaded_pdf")}
                type="button"
              >
                <FileUp aria-hidden size={22} />
                <strong>بارگذاری PDF آماده</strong>
                <span>فایل خودتان را موقتاً بارگذاری و پیش از ارسال بازبینی کنید.</span>
              </button>
            </div>
          </Card>

          <Card className={styles.pageStack}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>انتخاب شاگرد و مرور اطلاعات</h2>
                <p className={styles.sectionDescription}>
                  شاگرد، عنوان، نوع و بازهٔ زمانی در هر دو روش یکسان ثبت می‌شوند.
                </p>
              </div>
              <Button
                iconStart={<Eye size={18} />}
                onClick={() => selectedStudent && navigate(`/students/${selectedStudent.id}`)}
                variant="secondary"
              >
                نمایش جزئیات
              </Button>
            </div>

            <ResponsiveGrid columns={2}>
              <FormField error={errors.studentId} label="شاگرد" required>
                <Select
                  options={studentOptions}
                  value={form.studentId}
                  onChange={(event) => handleStudentChange(event.target.value)}
                />
              </FormField>
              <FormField error={errors.title} label="عنوان برنامه" required>
                <Input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                />
              </FormField>
              <FormField error={errors.programType} label="نوع برنامه" required>
                <Select
                  aria-label="نوع برنامه"
                  options={programTypeOptions}
                  value={form.programType}
                  onChange={(event) =>
                    updateForm("programType", event.target.value as StudentProgramType)
                  }
                />
              </FormField>
            </ResponsiveGrid>

            <ResponsiveGrid columns={2}>
              <FormField error={errors.startDate} label="شروع برنامه" required>
                <Input
                  aria-label="شروع برنامه"
                  inputMode="numeric"
                  placeholder={calendarPlaceholder()}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </FormField>
              <FormField label="مدت برنامه (هفته)" required>
                <Input
                  min={1}
                  max={52}
                  type="number"
                  value={form.durationWeeks}
                  onChange={(event) => updateForm("durationWeeks", Number(event.target.value))}
                />
              </FormField>
            </ResponsiveGrid>
            <p className={styles.sectionDescription}>
              {getProgramPeriod()
                ? `بازهٔ ثبت‌شده: ${getProgramPeriod()?.label}`
                : "تاریخ شروع را به تقویم انتخاب‌شده در تنظیمات وارد کنید."}
            </p>

            {selectedStudent ? (
              <StudentSummary student={selectedStudent} visit={latestVisit} />
            ) : null}
          </Card>

          {creationMode === "generated" ? (
            <Card className={styles.pageStack}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>تنظیمات برنامه</h2>
                  <p className={styles.sectionDescription}>
                    مربی می تواند قبل از تولید موارد قابل تغییر را اصلاح کند.
                  </p>
                </div>
                {selectedTemplate ? (
                  <StatusBadge variant="info">قالب: {selectedTemplate.name}</StatusBadge>
                ) : null}
              </div>

              <div className={styles.formGrid}>
                <FormField error={errors.templateId} label="قالب برنامه" required>
                  <Select
                    options={templateOptions}
                    value={form.templateId}
                    onChange={(event) => {
                      const template = rules?.templates.find(
                        (item) => item.id === event.target.value
                      );
                      setForm((current) => ({
                        ...current,
                        daysPerWeek: template?.daysPerWeek ?? current.daysPerWeek,
                        templateId: event.target.value
                      }));
                    }}
                  />
                </FormField>
                <FormField error={errors.daysPerWeek} label="تعداد روز تمرین" required>
                  <Input
                    min={1}
                    max={7}
                    type="number"
                    value={form.daysPerWeek}
                    onChange={(event) => updateForm("daysPerWeek", Number(event.target.value))}
                  />
                </FormField>
                <FormField label="هدف">
                  <Input
                    value={form.goal}
                    onChange={(event) => updateForm("goal", event.target.value)}
                  />
                </FormField>
                <FormField label="سطح">
                  <Select
                    options={levelOptions}
                    value={form.level}
                    onChange={(event) => updateForm("level", event.target.value as TrainingLevel)}
                  />
                </FormField>
                <FormField
                  hint="اختیاری؛ برای محدودکردن انتخاب حرکات به یک عضله و ناحیهٔ ساختاریافته."
                  htmlFor="program-target-muscle"
                  label="عضله هدف"
                >
                  <Select
                    id="program-target-muscle"
                    options={targetMuscleOptions}
                    value={form.targetMuscle ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetMuscle: event.target.value,
                        targetRegion: event.target.value ? current.targetRegion : ""
                      }))
                    }
                  />
                </FormField>
                {form.targetMuscle === "سینه" ? (
                  <>
                    <FormField
                      hint="فقط حرکاتی انتخاب می‌شوند که همین ناحیه را در catalog ساختاریافته داشته باشند."
                      htmlFor="program-target-region"
                      label="ناحیه هدف"
                    >
                      <Select
                        id="program-target-region"
                        options={chestTargetRegionOptions}
                        value={form.targetRegion ?? ""}
                        onChange={(event) => updateForm("targetRegion", event.target.value)}
                      />
                    </FormField>
                    <FormField
                      hint="تعداد حرکت سینه در هر جلسه؛ فقط وقتی ناحیه هدف انتخاب شده باشد اعمال می‌شود."
                      htmlFor="program-target-exercise-count"
                      label="تعداد حرکت هدف"
                    >
                      <Input
                        id="program-target-exercise-count"
                        min={1}
                        max={8}
                        type="number"
                        value={form.targetExerciseCount ?? 2}
                        onChange={(event) =>
                          updateForm("targetExerciseCount", Number(event.target.value))
                        }
                      />
                    </FormField>
                  </>
                ) : null}
                <FormField className={styles.fullField} label="اولویت عضلات">
                  <Input
                    value={form.musclePriorities.join("، ")}
                    onChange={(event) =>
                      updateForm(
                        "musclePriorities",
                        event.target.value
                          .split(/[،,]/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                      )
                    }
                  />
                </FormField>
                <FormField className={styles.fullField} label="توضیح یا دستور خاص مربی">
                  <Textarea
                    value={form.customInstructions}
                    onChange={(event) => updateForm("customInstructions", event.target.value)}
                  />
                </FormField>
              </div>
            </Card>
          ) : null}

          {creationMode === "generated" ? (
            <Card className={styles.pageStack}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>قوانین اعمال شونده</h2>
                  <p className={styles.sectionDescription}>
                    generator موقت فقط از همین قوانین انتخاب شده استفاده می کند.
                  </p>
                </div>
              </div>
              <div className={styles.checkboxGrid}>
                <Checkbox
                  checked={form.applyLevelRules}
                  label="قوانین سطح تمرین"
                  onChange={(event) => updateForm("applyLevelRules", event.target.checked)}
                />
                <Checkbox
                  checked={form.applyInjuryRules}
                  label="آسیب ها و محدودیت ها"
                  onChange={(event) => updateForm("applyInjuryRules", event.target.checked)}
                />
                <Checkbox
                  checked={form.applyMusclePriorityRules}
                  label="اولویت عضلات"
                  onChange={(event) => updateForm("applyMusclePriorityRules", event.target.checked)}
                />
                <Checkbox
                  checked={form.applyExerciseBank}
                  label="بانک حرکات"
                  onChange={(event) => updateForm("applyExerciseBank", event.target.checked)}
                />
                <Checkbox
                  checked={form.applyGeneralRules}
                  label="قوانین عمومی"
                  onChange={(event) => updateForm("applyGeneralRules", event.target.checked)}
                />
              </div>
            </Card>
          ) : null}

          {creationMode === "generated" &&
          (form.programType === "complete" || form.programType === "supplement") ? (
            <Card className={styles.pageStack}>
              <h2>مکمل‌های شاگرد</h2>
              <SupplementSelectionFields
                key={form.studentId}
                studentId={form.studentId}
                selection={form.supplementSelection || emptySupplementSelection()}
                onChange={(supplementSelection) =>
                  updateForm("supplementSelection", supplementSelection)
                }
              />
            </Card>
          ) : null}
          {creationMode === "uploaded_pdf" ? (
            <Card className={styles.uploadProgramCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>فایل برنامه</h2>
                  <p className={styles.sectionDescription}>
                    فایل تا وقتی در صفحهٔ بازبینی «نهایی‌سازی و ارسال» نزنید، برای شاگرد قابل مشاهده
                    نیست. می‌توانید قبل از ادامه آن را عوض یا حذف کنید.
                  </p>
                </div>
              </div>
              <FormField
                error={errors.file}
                hint="PDF، حداکثر ۲۵ مگابایت"
                label="PDF برنامه"
                required
              >
                <Input
                  key={uploadInputKey}
                  accept="application/pdf,.pdf"
                  aria-label="بارگذاری PDF برنامه"
                  disabled={uploadingPdf || !form.studentId}
                  type="file"
                  onChange={(event) => void handleStagePdf(event.currentTarget.files?.[0])}
                />
              </FormField>
              {stagedPdf ? (
                <div className={styles.stagedPdfRow}>
                  <div>
                    <strong>{stagedPdf.fileName}</strong>
                    <span>{formatFileSize(stagedPdf.sizeBytes)} · خصوصی تا نهایی‌سازی</span>
                  </div>
                  <Button
                    iconStart={<Trash2 size={17} />}
                    onClick={() => void handleRemoveStagedPdf()}
                    variant="danger"
                  >
                    حذف فایل
                  </Button>
                </div>
              ) : null}
              <Button
                iconStart={<Eye size={18} />}
                disabled={uploadingPdf || creatingUploadedDraft}
                isLoading={creatingUploadedDraft}
                onClick={() => void handleCreateUploadedDraft()}
                size="lg"
              >
                ادامه به بازبینی
              </Button>
            </Card>
          ) : null}
          {creationMode === "generated" ? (
            <Card className={styles.toolbar}>
              <span className={styles.sectionDescription}>
                برنامه ابتدا به‌صورت پیش‌نویس ساخته می‌شود و بعد از بازبینی، از همان مسیر نهایی و
                ارسال می‌شود.
              </span>
              <Button
                disabled={!rules}
                iconStart={
                  status === "generating" ? <RefreshCcw size={18} /> : <WandSparkles size={18} />
                }
                isLoading={status === "generating"}
                onClick={handleGenerate}
                size="lg"
              >
                تولید برنامه
              </Button>
            </Card>
          ) : null}
        </div>
      </ContentSection>
    </PageContainer>
  );
}

function GenerationStepper({ mode }: { mode: "generated" | "uploaded_pdf" }) {
  const steps = [
    "انتخاب شاگرد",
    "عنوان و بازهٔ برنامه",
    mode === "generated" ? "تنظیمات تولید" : "بارگذاری PDF",
    "بازبینی و ارسال"
  ];

  return (
    <div className={styles.stepper} aria-label="مراحل تولید برنامه">
      {steps.map((step, index) => (
        <div
          className={`${styles.stepItem} ${index === 3 ? styles.stepItemActive : ""}`}
          key={step}
        >
          <span className={styles.stepIndex}>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
    </div>
  );
}

function StudentSummary({ student, visit }: { student: Student; visit?: StudentVisit }) {
  return (
    <div className={styles.studentSummary}>
      <div>
        <h3 className={styles.ruleCardTitle}>{student.fullName}</h3>
        <p className={styles.sectionDescription}>
          {student.goals.secondaryGoal} - {student.trainingBackground.trainingExperience}
        </p>
        {student.injuries.hasInjury ? (
          <div className={`${styles.alert} ${styles.alertWarning}`}>
            محدودیت ثبت شده: {student.injuries.injuryType}
          </div>
        ) : null}
      </div>
      <div className={styles.summaryGrid}>
        <Metric label="هدف" value={student.goals.primaryGoal} />
        <Metric label="سطح" value={student.trainingBackground.level} />
        <Metric label="روز تمرین" value={`${student.trainingConditions.trainingDaysPerWeek} روز`} />
        <Metric label="آخرین وزن" value={`${visit?.currentWeightKg ?? student.weightKg} کیلو`} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metricBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} کیلوبایت`
    : `${(size / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function isErrorFeedback(message: string): boolean {
  return ["خطا", "لطفا", "نشد", "الزامی", "نامعتبر", "در دسترس نیست", "باید", "پاسخ سرور"].some(
    (phrase) => message.includes(phrase)
  );
}

function validateForm(
  form: ProgramGenerationInput,
  selectedTemplate?: { daysPerWeek: number; name: string } | null
) {
  const errors: Record<string, string> = {};

  if (!form.studentId) {
    errors.studentId = "انتخاب شاگرد الزامی است.";
  }
  if (!form.title.trim()) {
    errors.title = "عنوان برنامه الزامی است.";
  }
  if (!form.programType) {
    errors.programType = "نوع برنامه باید مشخص شود.";
  }
  if (!form.templateId) {
    errors.templateId = "قالب برنامه باید انتخاب شود.";
  }
  if (
    (form.programType === "complete" || form.programType === "supplement") &&
    form.supplementSelection?.items.length
  ) {
    if (!form.supplementSelection.confirmed || !form.supplementSelection.safety_reviewed) {
      errors.supplementSelection =
        "وضعیت فردی، مقدارها و زمان مصرف مکمل‌های شاگرد را بررسی و تأیید کنید.";
    }
    if (
      form.supplementSelection.items.some((item) =>
        item.doses.some(
          (dose) =>
            !Number.isFinite(Number(dose.amount)) ||
            Number(dose.amount) <= 0 ||
            (dose.timing === "custom" && !dose.custom_time.trim())
        )
      )
    ) {
      errors.supplementDoses = "مقدار مثبت و زمان معتبر برای همه نوبت‌های مصرف مشخص کنید.";
    }
  }
  if (form.durationWeeks < 1) {
    errors.durationWeeks = "مدت برنامه باید معتبر باشد.";
  }
  if ((form.programType === "workout" || form.programType === "complete") && form.daysPerWeek < 1) {
    errors.daysPerWeek = "تعداد روز تمرین باید معتبر باشد.";
  }
  if (selectedTemplate && form.daysPerWeek && selectedTemplate.daysPerWeek !== form.daysPerWeek) {
    errors.daysPerWeek = `تعداد روز تمرین (${form.daysPerWeek}) با قالب «${selectedTemplate.name}» (${selectedTemplate.daysPerWeek} روز) هم‌خوان نیست.`;
    errors.templateId = "قالب و تعداد روز تمرین باید یکسان باشند.";
  }

  return errors;
}
