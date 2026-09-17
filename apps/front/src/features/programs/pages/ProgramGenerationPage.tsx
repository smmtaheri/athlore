import { useEffect, useState } from "react";
import { ArrowRight, Eye, RefreshCcw, WandSparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
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

const programTypeOptions = [
  { label: "کامل", value: "complete" },
  { label: "تمرینی", value: "workout" },
  { label: "غذایی", value: "nutrition" },
  { label: "مکمل", value: "supplement" }
];

const levelOptions = [
  { label: "مبتدی", value: "beginner" },
  { label: "متوسط", value: "intermediate" },
  { label: "حرفه ای", value: "advanced" }
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
  const [students, setStudents] = useState<Student[]>([]);
  const [rules, setRules] = useState<CoachRules>();
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [feedback, setFeedback] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    templateId: "",
    title: "برنامه کامل محمد طاهری"
  });

  useEffect(() => {
    let isMounted = true;
    Promise.all([studentsRepo.list(), coachRulesRepo.get()])
      .then(([studentItems, coachRules]) => {
        if (!isMounted) {
          return;
        }
        const selectedStudent =
          studentItems.find((student) => student.id === initialStudentId) ?? studentItems[0];
        const studentDays = selectedStudent?.trainingConditions.trainingDaysPerWeek;
        const preferredName = "۴ روزه حجم متوسط";
        const matchingTemplates = studentDays
          ? coachRules.templates.filter((item) => item.daysPerWeek === studentDays)
          : coachRules.templates;
        const template =
          matchingTemplates.find((item) => item.name === preferredName) ??
          matchingTemplates.find((item) => item.daysPerWeek === 4) ??
          matchingTemplates[0];
        setStudents(studentItems);
        setRules(coachRules);
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

  const handleStudentChange = (studentId: string) => {
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
      templateId: template?.id ?? "",
      title: student ? `برنامه کامل ${student.fullName}` : current.title
    }));
    setErrors({});
  };

  const handleGenerate = async () => {
    if (!selectedStudent || !rules) {
      return;
    }

    const nextErrors = validateForm(form, selectedTemplate);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback("لطفا خطاهای فرم تولید برنامه را بررسی کنید.");
      return;
    }

    setStatus("generating");
    setFeedback("");

    try {
      let savedProgram;
      let warnings: string[] = [];
      if (programsRepo.generate) {
        const result = await programsRepo.generate(form);
        savedProgram = result.program;
        warnings = result.warnings;
      } else {
        // Test / mock path only — not used in normal API runtime.
        savedProgram = await programsRepo.create(
          generateProgram({
            input: form,
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

  if (status === "loading") {
    return (
      <PageContainer>
        <PageHeader
          breadcrumb={["داشبورد", "برنامه ها", "تولید برنامه"]}
          description="در حال آماده سازی اطلاعات شاگرد و قوانین مربی"
          title="تولید برنامه"
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
        <PageHeader breadcrumb={["داشبورد", "برنامه ها", "تولید برنامه"]} title="تولید برنامه" />
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
        description="انتخاب شاگرد، بررسی آخرین اطلاعات و تولید draft قابل ویرایش"
        title="تولید برنامه"
      />
      <ContentSection>
        <div className={styles.pageStack}>
          <GenerationStepper />
          {feedback ? (
            <div
              className={`${styles.alert} ${
                feedback.includes("خطا") || feedback.includes("لطفا")
                  ? styles.alertError
                  : styles.alertSuccess
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

          <Card className={styles.pageStack}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>انتخاب شاگرد و مرور اطلاعات</h2>
                <p className={styles.sectionDescription}>
                  اطلاعات موجود به صورت خودکار از پروفایل و آخرین ویزیت پر شده است.
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
            </ResponsiveGrid>

            {selectedStudent ? (
              <StudentSummary student={selectedStudent} visit={latestVisit} />
            ) : null}
          </Card>

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
              <FormField error={errors.programType} label="نوع برنامه" required>
                <Select
                  options={programTypeOptions}
                  value={form.programType}
                  onChange={(event) =>
                    updateForm("programType", event.target.value as StudentProgramType)
                  }
                />
              </FormField>
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
              <FormField error={errors.durationWeeks} label="مدت برنامه" required>
                <Input
                  min={1}
                  type="number"
                  value={form.durationWeeks}
                  onChange={(event) => updateForm("durationWeeks", Number(event.target.value))}
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

          <Card className={styles.toolbar}>
            <span className={styles.sectionDescription}>
              خروجی با وضعیت پیش نویس ذخیره می شود و بعد از تولید وارد صفحه پیش نمایش می شوید.
            </span>
            <Button
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
        </div>
      </ContentSection>
    </PageContainer>
  );
}

function GenerationStepper() {
  const steps = ["انتخاب شاگرد", "بررسی آخرین اطلاعات و ویزیت", "تنظیمات برنامه", "مرور و تولید"];

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
