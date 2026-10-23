import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, FileUp, Plus, RefreshCcw, Trash2, WandSparkles, X } from "lucide-react";
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
  StatusBadge
} from "../../../components/ui";
import { ApiError, firstFieldError, persianMessageForApiError } from "../../../shared/api/errors";
import {
  coachRulesRepository,
  type CoachRulesRepository
} from "../../coach-rules/services/coachRulesRepository";
import type { CoachRules } from "../../coach-rules/types/coachRules";
import type { TrainingSystem } from "../../coach-rules/types/coachRules";
import {
  trainingSystemsRepository,
  type TrainingSystemsRepository
} from "../../coach-rules/services/trainingSystemsRepository";
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
import type {
  GeneratedProgram,
  ProgramGenerationInput,
  ProgramPdfSection,
  ProgramPdfSectionMethod,
  ProgramPdfSectionMethods,
  StagedProgramPdf
} from "../types/generatedProgram";
import styles from "../components/programFlow.module.css";
import { SupplementSelectionFields } from "../../coach-rules/components/SupplementSelectionFields";
import { emptySupplementSelection } from "../../coach-rules/services/supplementCatalogRepository";
import { programRequestRepository } from "../../program-requests/services/programRequestRepository";
import type { ProgramRequest } from "../../program-requests/types/programRequest";
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

const programSections: Array<{ id: ProgramPdfSection; label: string }> = [
  { id: "workout", label: "برنامه تمرینی" },
  { id: "nutrition", label: "برنامه غذایی" },
  { id: "supplement", label: "برنامه مکمل" }
];

const levelOptions = [
  { label: "مبتدی", value: "beginner" },
  { label: "نیمه‌حرفه‌ای", value: "intermediate" },
  { label: "حرفه‌ای", value: "advanced" }
];

const quickMuscleOptions = [
  "سینه",
  "زیربغل",
  "پا",
  "سرشانه",
  "پشت بازو",
  "جلو بازو",
  "شکم",
  "ساق",
  "ساعد"
].map((muscle) => ({ label: muscle, value: muscle }));

const exerciseVarietyOptions = [
  { label: "ثابت؛ اولویت با گزینه‌های منتخب", value: "stable" },
  { label: "متعادل؛ تنوع محدود بین حرکت‌های مناسب", value: "balanced" },
  { label: "متنوع؛ انتخاب گسترده‌تر از کاتالوگ", value: "varied" }
];

function emptySessionMuscles(days: number): string[][] {
  return Array.from({ length: Math.max(0, Math.min(7, days)) }, () => []);
}

function resizeSessionMuscles(value: string[][] | undefined, days: number): string[][] {
  const next = (value ?? []).slice(0, days).map((muscles) => [...muscles]);
  while (next.length < days) next.push([]);
  return next;
}

const partialRepVariantOptions = [
  { label: "تکرار یک‌ونیم", value: "one_and_half" },
  { label: "نیم‌تکرار پس از ناتوانی", value: "after_failure" },
  { label: "کل ست در دامنهٔ نیمه", value: "partial_only" }
] as const;

export interface ProgramGenerationPageProps {
  coachRulesRepo?: CoachRulesRepository;
  programsRepo?: ProgramsRepository;
  studentProgramsRepo?: StudentProgramsRepository;
  studentsRepo?: StudentsRepository;
  visitsRepo?: StudentVisitsRepository;
  trainingSystemsRepo?: TrainingSystemsRepository;
}

export function ProgramGenerationPage({
  coachRulesRepo = coachRulesRepository,
  programsRepo = programsRepository,
  studentProgramsRepo = studentProgramsRepository,
  studentsRepo = studentsRepository,
  visitsRepo = studentVisitsRepository,
  trainingSystemsRepo = trainingSystemsRepository
}: ProgramGenerationPageProps) {
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [rules, setRules] = useState<CoachRules>();
  const [trainingSystems, setTrainingSystems] = useState<TrainingSystem[]>([]);
  const [visits, setVisits] = useState<StudentVisit[]>([]);
  const [visitsLoadedFor, setVisitsLoadedFor] = useState("");
  const [programRequest, setProgramRequest] = useState<ProgramRequest | null>(null);
  const [quickSettingsNotice, setQuickSettingsNotice] = useState("");
  const quickSettingsLoadedFor = useRef(new Set<string>());
  const quickSettingsTouchedFor = useRef(new Set<string>());
  const [feedback, setFeedback] = useState(
    () => (location.state as { visitSaved?: string } | null)?.visitSaved ?? ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deliverySections, setDeliverySections] = useState<ProgramPdfSectionMethods>({
    workout: "generated",
    nutrition: "generated",
    supplement: "generated"
  });
  const [stagedPdfs, setStagedPdfs] = useState<
    Partial<Record<ProgramPdfSection, StagedProgramPdf>>
  >({});
  const [startDate, setStartDate] = useState(todayCalendarInput());
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [creatingUploadedDraft, setCreatingUploadedDraft] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [status, setStatus] = useState<"error" | "generating" | "loaded" | "loading">("loading");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialStudentId = searchParams.get("studentId") ?? "";
  const programRequestId = searchParams.get("programRequestId") ?? "";
  const initialVisitId = searchParams.get("visitId") ?? "";
  const [form, setForm] = useState<ProgramGenerationInput>({
    applyExerciseCatalog: true,
    applyGeneralRules: true,
    applyInjuryRules: true,
    applyLevelRules: true,
    applyMusclePriorityRules: true,
    customInstructions: "",
    daysPerWeek: 4,
    durationWeeks: 4,
    exerciseVariety: "balanced",
    goal: "افزایش حجم و بهبود فرم بدن",
    level: "intermediate",
    musclePriorities: [],
    programType: "complete",
    sessionMuscles: emptySessionMuscles(4),
    studentId: initialStudentId,
    supplementSelection: emptySupplementSelection(),
    targetExerciseCount: 2,
    targetMuscle: "",
    targetRegion: "",
    trainingSystems: [],
    templateId: "",
    title: "برنامه کامل محمد طاهری"
  });

  const visitToPrefillId = initialVisitId || programRequest?.visitId || "";

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      studentsRepo.list(),
      coachRulesRepo.get().catch(() => undefined),
      programRequestId
        ? programRequestRepository.getCoach(programRequestId)
        : Promise.resolve(null),
      trainingSystemsRepo
        .list()
        .then((items) => items)
        .catch(() => [])
    ])
      .then(([studentItems, coachRules, requestItem, trainingSystemItems]) => {
        if (!isMounted) {
          return;
        }
        const activeStudentItems = studentItems.filter((student) => student.status === "active");
        const requestedStudent = studentItems.find((student) => student.id === initialStudentId);
        setProgramRequest(requestItem);
        setTrainingSystems(trainingSystemItems);
        const selectedStudent =
          activeStudentItems.find((student) => student.id === initialStudentId) ??
          (requestedStudent ? undefined : activeStudentItems[0]);
        const studentDays =
          requestItem?.sessionsPerWeek ?? selectedStudent?.trainingConditions.trainingDaysPerWeek;
        const resolvedDays = studentDays ?? 4;
        setStudents(activeStudentItems);
        setRules(coachRules);
        if (requestedStudent && requestedStudent.status !== "active") {
          setFeedback(
            `شاگرد «${requestedStudent.fullName}» غیرفعال یا بایگانی شده است؛ برای او نمی‌توانید برنامهٔ جدید بسازید.`
          );
        } else if (activeStudentItems.length === 0) {
          setFeedback("شاگرد فعالی برای ساخت برنامه وجود ندارد. ابتدا وضعیت شاگرد را فعال کنید.");
        }
        if (!coachRules) {
          setDeliverySections({
            workout: "uploaded",
            nutrition: "uploaded",
            supplement: "uploaded"
          });
          setFeedback("قوانین تولید برنامه در دسترس نیست؛ می‌توانید PDF آماده بارگذاری کنید.");
        }
        setForm((current) => ({
          ...current,
          daysPerWeek: resolvedDays,
          sessionMuscles: resizeSessionMuscles(current.sessionMuscles, resolvedDays),
          programType: requestItem
            ? programTypeForRequest(requestItem.sections)
            : current.programType,
          goal:
            requestItem?.goal ||
            selectedStudent?.goals.secondaryGoal ||
            selectedStudent?.goals.primaryGoal ||
            current.goal,
          level: selectedStudent?.trainingBackground.level ?? current.level,
          musclePriorities: selectedStudent?.goals.musclePriorities ?? current.musclePriorities,
          studentId: selectedStudent?.id ?? "",
          trainingSystems: [],
          templateId: "",
          title: selectedStudent
            ? `برنامه ${requestItem ? programTitleForRequest(requestItem.sections) : "کامل"} ${selectedStudent.fullName}`
            : "برنامه جدید"
        }));
        if (requestItem) {
          setFeedback(
            `درخواست برنامهٔ ${requestItem.studentName} باز است؛ فقط بخش‌های انتخاب‌شده در درخواست نمایش داده می‌شوند.`
          );
        }
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
  }, [coachRulesRepo, initialStudentId, programRequestId, studentsRepo, trainingSystemsRepo]);

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
          setVisitsLoadedFor(form.studentId);
          const shouldPrefillFromVisit = programRequest ? Boolean(programRequest.visitId) : true;
          if (shouldPrefillFromVisit && !quickSettingsTouchedFor.current.has(form.studentId)) {
            const visit = visitToPrefillId
              ? items.find((item) => item.id === visitToPrefillId)
              : items[0];
            const visitDays = sessionCountFromVisit(visit);
            const visitGoal = goalFromVisit(visit);
            const visitLevel = levelFromVisit(visit);
            if (visitGoal || visitLevel) {
              setForm((current) =>
                current.templateId
                  ? current
                  : {
                      ...current,
                      ...(visitGoal ? { goal: visitGoal } : {}),
                      ...(visitLevel ? { level: visitLevel } : {})
                    }
              );
            }
            if (visitDays) {
              setForm((current) =>
                current.templateId
                  ? current
                  : {
                      ...current,
                      daysPerWeek: visitDays,
                      sessionMuscles: resizeSessionMuscles(current.sessionMuscles, visitDays)
                    }
              );
            }
            const visitMethods = trainingMethodsFromVisit(
              visit,
              trainingSystems,
              visitLevel ?? form.level
            );
            if (visitMethods !== null) {
              setForm((current) =>
                current.templateId ? current : { ...current, trainingSystems: visitMethods }
              );
            }
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setVisits([]);
          setVisitsLoadedFor(form.studentId);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    form.studentId,
    form.level,
    initialVisitId,
    programRequest,
    status,
    trainingSystems,
    visitsRepo,
    visitToPrefillId
  ]);

  useEffect(() => {
    const studentId = form.studentId;
    if (
      status !== "loaded" ||
      !studentId ||
      visitsLoadedFor !== studentId ||
      !programsRepo.getLatestQuickSettings ||
      quickSettingsLoadedFor.current.has(studentId)
    ) {
      return;
    }

    let isMounted = true;
    quickSettingsLoadedFor.current.add(studentId);
    setQuickSettingsNotice("");
    programsRepo
      .getLatestQuickSettings(studentId)
      .then((settings) => {
        if (!isMounted || !settings || quickSettingsTouchedFor.current.has(studentId)) {
          return;
        }
        const availableSystems = new Set(
          trainingSystems
            .filter(
              (system) =>
                (system.source === "platform" || system.enabled) &&
                (!system.allowed_levels.length || system.allowed_levels.includes(form.level))
            )
            .map((system) => system.key)
        );
        const sourceVisit = visitToPrefillId
          ? visits.find((visit) => visit.id === visitToPrefillId)
          : programRequest
            ? undefined
            : visits[0];
        if (
          sessionCountFromVisit(sourceVisit) !== undefined ||
          trainingMethodsFromVisit(
            sourceVisit,
            trainingSystems,
            levelFromVisit(sourceVisit) ?? form.level
          ) !== null
        ) {
          return;
        }
        setForm((current) => {
          if (current.studentId !== studentId || current.templateId) {
            return current;
          }
          return {
            ...current,
            ...(current.daysPerWeek === settings.daysPerWeek
              ? {
                  sessionMuscles: resizeSessionMuscles(settings.sessionMuscles, current.daysPerWeek)
                }
              : {}),
            exerciseVariety: settings.exerciseVariety,
            trainingSystems: settings.trainingSystems.filter((item) =>
              availableSystems.has(item.key)
            )
          };
        });
        if (isMounted) {
          setQuickSettingsNotice(
            "تنظیمات آخرین برنامه پیشنهاد شد؛ تقسیم عضلات فقط با تعداد جلسهٔ فعلی یکسان اعمال می‌شود."
          );
        }
      })
      .catch(() => {
        if (isMounted) {
          setQuickSettingsNotice("تنظیمات برنامهٔ قبلی دریافت نشد؛ می‌توانید همین‌جا ادامه دهید.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    form.studentId,
    form.level,
    programRequest,
    programsRepo,
    status,
    trainingSystems,
    visits,
    visitsLoadedFor,
    visitToPrefillId
  ]);

  const selectedStudent = students.find((student) => student.id === form.studentId);
  const selectedVisitId = visitToPrefillId;
  const latestVisit = selectedVisitId
    ? visits.find((visit) => visit.id === selectedVisitId)
    : programRequest
      ? undefined
      : visits[0];
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
  const includedSections = programRequest
    ? programSections.filter((section) => programRequest.sections.includes(section.id))
    : form.programType === "complete"
      ? programSections
      : programSections.filter((section) => section.id === form.programType);
  const generatedSections = includedSections.filter(
    (section) => deliverySections[section.id] === "generated"
  );
  const uploadedSections = includedSections.filter(
    (section) => deliverySections[section.id] === "uploaded"
  );
  const stepMode =
    generatedSections.length && uploadedSections.length
      ? "mixed"
      : generatedSections.length
        ? "generated"
        : "uploaded_pdf";

  const updateForm = <Key extends keyof ProgramGenerationInput>(
    field: Key,
    value: ProgramGenerationInput[Key]
  ) => {
    if (["exerciseVariety", "sessionMuscles", "trainingSystems"].includes(field)) {
      quickSettingsTouchedFor.current.add(form.studentId);
    }
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const handleDaysPerWeekChange = (days: number) => {
    quickSettingsTouchedFor.current.add(form.studentId);
    setForm((current) => ({
      ...current,
      daysPerWeek: days,
      sessionMuscles: resizeSessionMuscles(current.sessionMuscles, days)
    }));
    setErrors((current) => ({ ...current, daysPerWeek: "" }));
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

  const handleStagePdf = async (section: ProgramPdfSection, file?: File) => {
    if (!file || !form.studentId || !selectedStudent) return;
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
      const next = await programsRepo.uploadStagedPdf(form.studentId, file, section);
      const previous = stagedPdfs[section];
      setStagedPdfs((current) => ({ ...current, [section]: next }));
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

  const handleRemoveStagedPdf = async (section: ProgramPdfSection) => {
    const stagedPdf = stagedPdfs[section];
    if (!stagedPdf) return;
    try {
      await programsRepo.deleteStagedPdf?.(stagedPdf.id);
      setStagedPdfs((current) => {
        const next = { ...current };
        delete next[section];
        return next;
      });
      setFeedback("فایل موقت حذف شد.");
    } catch {
      setFeedback("حذف فایل موقت انجام نشد؛ دوباره تلاش کنید.");
    }
  };

  const handleStudentChange = (studentId: string) => {
    quickSettingsLoadedFor.current.delete(studentId);
    quickSettingsTouchedFor.current.delete(studentId);
    if (programsRepo.deleteStagedPdf) {
      Object.values(stagedPdfs).forEach((staged) => {
        if (staged) void programsRepo.deleteStagedPdf?.(staged.id).catch(() => undefined);
      });
      setStagedPdfs({});
    }
    const student = students.find((item) => item.id === studentId);
    const studentDays = student?.trainingConditions.trainingDaysPerWeek;
    const studentLevel = (student?.trainingBackground.level ?? "intermediate") as TrainingLevel;
    const resolvedDays = studentDays ?? 4;
    setForm((current) => ({
      ...current,
      daysPerWeek: resolvedDays,
      sessionMuscles: emptySessionMuscles(resolvedDays),
      goal: student?.goals.secondaryGoal || current.goal,
      level: studentLevel,
      musclePriorities: student?.goals.musclePriorities ?? current.musclePriorities,
      studentId,
      supplementSelection: emptySupplementSelection(),
      trainingSystems: [],
      templateId: "",
      title: student ? `برنامه کامل ${student.fullName}` : current.title
    }));
    setErrors({});
    setFeedback("");
    setQuickSettingsNotice("");
  };

  const setSectionMethod = (section: ProgramPdfSection, method: ProgramPdfSectionMethod) => {
    setDeliverySections((current) => ({ ...current, [section]: method }));
    setErrors((current) => ({ ...current, [section]: "" }));
    if (method !== "uploaded" && stagedPdfs[section]) {
      void handleRemoveStagedPdf(section);
    }
  };

  const handleProgramTypeChange = (programType: StudentProgramType) => {
    const nextSections =
      programType === "complete"
        ? programSections
        : programSections.filter((section) => section.id === programType);
    const retained = new Set(nextSections.map((section) => section.id));
    Object.entries(stagedPdfs).forEach(([section, staged]) => {
      if (staged && !retained.has(section as ProgramPdfSection)) {
        void programsRepo.deleteStagedPdf?.(staged.id).catch(() => undefined);
      }
    });
    setStagedPdfs((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([section]) => retained.has(section as ProgramPdfSection))
      )
    );
    updateForm("programType", programType);
  };

  const handleGenerate = async () => {
    if (!selectedStudent || !rules) {
      return;
    }

    const period = getProgramPeriod();
    const nextErrors = validateForm(
      form,
      selectedTemplate,
      generatedSections.map((section) => section.id)
    );
    uploadedSections.forEach((section) => {
      if (!stagedPdfs[section.id]) {
        nextErrors[section.id] = `PDF ${section.label} را بارگذاری کنید.`;
      }
    });
    if (!period) nextErrors.startDate = "تاریخ شروع و مدت برنامه را بررسی کنید.";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setFeedback("لطفا خطاهای فرم تولید برنامه را بررسی کنید.");
      return;
    }

    setStatus("generating");
    setFeedback("");

    try {
      const { exerciseVariety, sessionMuscles, ...generationBase } = form;
      const generationInput = {
        ...generationBase,
        ...(selectedTemplate
          ? {}
          : {
              exerciseVariety: exerciseVariety ?? "balanced",
              sessionMuscles: resizeSessionMuscles(sessionMuscles, form.daysPerWeek)
            }),
        trainingSystems: selectedTemplate?.executionPlan ? undefined : (form.trainingSystems ?? []),
        ...(selectedTemplate?.executionPlan
          ? {
              applyInjuryRules: true,
              applyLevelRules: true,
              applyExerciseCatalog: true,
              applyGeneralRules: true,
              applyMusclePriorityRules: true,
              targetMuscle: "",
              targetRegion: ""
            }
          : {}),
        ...(programRequestId ? { programRequestId } : {}),
        ...(selectedVisitId ? { visitId: selectedVisitId } : {}),
        dateRangeEnd: period!.endIso,
        dateRangeLabel: period!.label,
        dateRangeStart: period!.startIso
      };
      let savedProgram: GeneratedProgram;
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
      const versionId = savedProgram.draftId ?? "";
      if (uploadedSections.length && (!versionId || !programsRepo.attachStagedPdf)) {
        throw new Error("اتصال فایل‌ها به نسخهٔ برنامه در دسترس نیست.");
      }
      for (const section of uploadedSections) {
        const staged = stagedPdfs[section.id];
        if (!staged) continue;
        savedProgram = await programsRepo.attachStagedPdf!(
          savedProgram.id,
          versionId,
          staged.id,
          section.id
        );
      }
      const methods = Object.fromEntries(
        includedSections.map((section) => [section.id, deliverySections[section.id]])
      ) as ProgramPdfSectionMethods;
      savedProgram = await programsRepo.update(savedProgram.id, {
        ...savedProgram,
        pdfSettings: { ...savedProgram.pdfSettings, deliverySections: methods }
      });
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      setStagedPdfs({});
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
          ? (firstFieldError(error, "execution_plan", "training_systems") ??
              persianMessageForApiError(error))
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
    uploadedSections.forEach((section) => {
      if (!stagedPdfs[section.id]) {
        nextErrors[section.id] = `PDF ${section.label} را بارگذاری کنید.`;
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFeedback(Object.values(nextErrors)[0]);
      return;
    }
    if (!period || !programsRepo.createUploadedDraft) {
      setFeedback("ساخت پیش‌نویس PDF در این محیط در دسترس نیست.");
      return;
    }
    setCreatingUploadedDraft(true);
    setFeedback("");
    try {
      const firstSection = uploadedSections[0];
      const firstStaged = firstSection ? stagedPdfs[firstSection.id] : undefined;
      if (!firstSection || !firstStaged) {
        throw new Error("فایل PDF یکی از بخش‌های انتخاب‌شده را بارگذاری کنید.");
      }
      let savedProgram = await programsRepo.createUploadedDraft({
        dateRangeEnd: period.endIso,
        dateRangeLabel: period.label,
        dateRangeStart: period.startIso,
        programType: form.programType,
        ...(programRequestId ? { programRequestId } : {}),
        ...(selectedVisitId ? { visitId: selectedVisitId } : {}),
        stagedPdfId: firstStaged.id,
        studentId: form.studentId,
        title: form.title
      });
      const versionId = savedProgram.draftId ?? "";
      if (!versionId || !programsRepo.attachStagedPdf) {
        throw new Error("اتصال فایل‌های برنامه در دسترس نیست.");
      }
      for (const section of uploadedSections.slice(1)) {
        const staged = stagedPdfs[section.id];
        if (!staged) continue;
        savedProgram = await programsRepo.attachStagedPdf(
          savedProgram.id,
          versionId,
          staged.id,
          section.id
        );
      }
      const methods = Object.fromEntries(
        includedSections.map((section) => [section.id, deliverySections[section.id]])
      ) as ProgramPdfSectionMethods;
      savedProgram = await programsRepo.update(savedProgram.id, {
        ...savedProgram,
        pdfSettings: { ...savedProgram.pdfSettings, deliverySections: methods }
      });
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      setStagedPdfs({});
      navigate(`/programs/${savedProgram.id}`);
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : error instanceof Error
            ? error.message
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
          <GenerationStepper mode={stepMode} />
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
              <FormField
                error={errors.studentId}
                htmlFor="program-student-select"
                label="شاگرد"
                required
              >
                <Select
                  placeholder="انتخاب شاگرد فعال"
                  disabled={Boolean(programRequestId)}
                  id="program-student-select"
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
                  disabled={Boolean(programRequestId)}
                  options={programTypeOptions}
                  value={form.programType}
                  onChange={(event) =>
                    handleProgramTypeChange(event.target.value as StudentProgramType)
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

          <Card className={styles.pageStack}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>بخش‌های برنامه</h2>
                <p className={styles.sectionDescription}>
                  برای هر بخش تولید، بارگذاری PDF یا عدم ارسال را انتخاب کنید. لازم نیست هر سه بخش
                  را پر کنید؛ فقط بخش‌های انتخاب‌شده در همین برنامه ثبت می‌شوند.
                </p>
              </div>
            </div>
            <div className={styles.deliverySectionGrid}>
              {includedSections.map((section) => {
                const method = deliverySections[section.id] ?? "generated";
                const staged = stagedPdfs[section.id];
                return (
                  <div className={styles.deliverySectionCard} key={section.id}>
                    <h3>{section.label}</h3>
                    <div className={styles.deliveryMethodChoices}>
                      <Button
                        aria-pressed={method === "generated"}
                        disabled={!rules}
                        onClick={() => setSectionMethod(section.id, "generated")}
                        size="sm"
                        variant={method === "generated" ? "primary" : "secondary"}
                      >
                        <WandSparkles aria-hidden size={16} /> تولید با Athlore
                      </Button>
                      <Button
                        aria-label={`بارگذاری PDF برای ${section.label}`}
                        aria-pressed={method === "uploaded"}
                        onClick={() => setSectionMethod(section.id, "uploaded")}
                        size="sm"
                        variant={method === "uploaded" ? "primary" : "secondary"}
                      >
                        <FileUp aria-hidden size={16} /> بارگذاری PDF
                      </Button>
                      {!programRequest ? (
                        <Button
                          aria-label={`عدم ارسال بخش ${section.label}`}
                          aria-pressed={method === "omitted"}
                          onClick={() => setSectionMethod(section.id, "omitted")}
                          size="sm"
                          variant={method === "omitted" ? "primary" : "secondary"}
                        >
                          عدم ارسال
                        </Button>
                      ) : null}
                    </div>
                    {method === "uploaded" ? (
                      <>
                        <FormField
                          error={errors[section.id]}
                          hint="PDF، حداکثر ۲۵ مگابایت؛ تا نهایی‌سازی خصوصی می‌ماند."
                          label={`فایل ${section.label}`}
                        >
                          <Input
                            key={`${section.id}-${uploadInputKey}`}
                            accept="application/pdf,.pdf"
                            aria-label={`بارگذاری PDF ${section.label}`}
                            disabled={uploadingPdf || !form.studentId}
                            type="file"
                            onChange={(event) =>
                              void handleStagePdf(section.id, event.currentTarget.files?.[0])
                            }
                          />
                        </FormField>
                        {staged ? (
                          <div className={styles.stagedPdfRow}>
                            <div>
                              <strong>{staged.fileName}</strong>
                              <span>{formatFileSize(staged.sizeBytes)} · آمادهٔ بازبینی</span>
                            </div>
                            <Button
                              iconStart={<Trash2 size={16} />}
                              onClick={() => void handleRemoveStagedPdf(section.id)}
                              size="sm"
                              variant="danger"
                            >
                              حذف
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.sectionDescription}>
                        {method === "omitted"
                          ? "این بخش در این برنامه برای ورزشکار ارسال نمی‌شود."
                          : "این بخش با اطلاعات برنامه ساخته می‌شود و پیش از ارسال قابل بازبینی است."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {generatedSections.length > 0 && !selectedTemplate?.executionPlan ? (
            <Card className={styles.pageStack}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>سیستم‌های تمرینی این دوره</h2>
                  <p className={styles.sectionDescription}>
                    ویزیتِ متصل به درخواست و اطلاعات برنامه در تولید استفاده می‌شوند؛ اینجا مربی
                    روش‌های اجرایی همین دوره را تأیید می‌کند. سیستم انتخاب‌نشده به‌صورت خودکار اضافه
                    نمی‌شود.
                  </p>
                </div>
                <StatusBadge variant="info">
                  {programRequest
                    ? "متصل به درخواست برنامه"
                    : selectedVisitId
                      ? "متصل به ویزیت"
                      : "انتخاب مربی"}
                </StatusBadge>
              </div>
              <details className={styles.formAdvancedDetails}>
                <summary>
                  انتخاب سیستم تمرینی (اختیاری)
                  {form.trainingSystems?.length
                    ? ` · ${form.trainingSystems.length} انتخاب`
                    : " · بدون سیستم خاص"}
                </summary>
                <div className={styles.checkboxGrid}>
                  {trainingSystems.map((system) => {
                    const selected = form.trainingSystems?.find((item) => item.key === system.key);
                    const levelAllowed =
                      system.allowed_levels.length === 0 ||
                      system.allowed_levels.includes(form.level);
                    const configuredOff = system.source !== "platform" && !system.enabled;
                    const recognizedHandler = ["superset", "drop_set", "partial_reps"].includes(
                      system.handler_key ?? ""
                    );
                    const canRun =
                      levelAllowed &&
                      !configuredOff &&
                      (recognizedHandler ||
                        system.recipe?.version === 1 ||
                        system.handler_status === "manual_only");
                    const variants = trainingSystemVariants(system);
                    return (
                      <div className={styles.pageStack} key={system.id ?? system.key}>
                        <Checkbox
                          checked={Boolean(selected)}
                          disabled={!canRun}
                          label={`${system.name}${canRun ? "" : " · در این سطح قابل انتخاب نیست"}`}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [
                                  ...(form.trainingSystems ?? []),
                                  {
                                    key: system.key,
                                    ...(system.handler_key === "partial_reps" ? { variants } : {})
                                  }
                                ]
                              : (form.trainingSystems ?? []).filter(
                                  (item) => item.key !== system.key
                                );
                            updateForm("trainingSystems", next);
                          }}
                        />
                        <p className={styles.sectionDescription}>
                          {system.handler_status === "manual_only"
                            ? "این روش به‌صورت یادداشت مربی به روزهای برنامه افزوده می‌شود و اجرای خودکار ندارد؛ قبل از ارسال بازبینی کنید."
                            : system.description}
                        </p>
                        {selected && system.handler_key === "partial_reps" ? (
                          <div className={styles.checkboxGrid}>
                            {partialRepVariantOptions
                              .filter((option) => variants.includes(option.value))
                              .map((option) => (
                                <Checkbox
                                  checked={selected.variants?.includes(option.value) ?? false}
                                  key={option.value}
                                  label={option.label}
                                  onChange={(event) => {
                                    const previousVariants = selected.variants ?? [];
                                    if (!event.target.checked && previousVariants.length === 1) {
                                      updateForm(
                                        "trainingSystems",
                                        (form.trainingSystems ?? []).filter(
                                          (item) => item.key !== system.key
                                        )
                                      );
                                      return;
                                    }
                                    const nextVariants = event.target.checked
                                      ? [...new Set([...previousVariants, option.value])]
                                      : previousVariants.filter((item) => item !== option.value);
                                    const nextSelection = (form.trainingSystems ?? []).map(
                                      (item) =>
                                        item.key === system.key
                                          ? { ...item, variants: nextVariants }
                                          : item
                                    );
                                    updateForm("trainingSystems", nextSelection);
                                  }}
                                />
                              ))}
                            <span className={styles.sectionDescription}>
                              مقدارهای سه‌گانه و ۳ نیم‌تکرار پس از ناتوانی، پیش‌فرض‌های اولیه‌اند؛
                              دامنهٔ نیمه برای هر حرکت در بازبینی مربی مشخص می‌شود.
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {trainingSystems.length === 0 ? (
                  <p className={styles.sectionDescription} role="status">
                    فهرست سیستم‌ها در دسترس نیست؛ از «قوانین مربی ← سیستم‌های تمرینی» دوباره دریافتش
                    کنید.
                  </p>
                ) : null}
              </details>
            </Card>
          ) : null}

          {generatedSections.length > 0 ? (
            <Card className={styles.pageStack}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    {selectedTemplate ? "تنظیمات قالب انتخاب‌شده" : "تنظیم سریع برنامه"}
                  </h2>
                  <p className={styles.sectionDescription}>
                    {selectedTemplate
                      ? "قالب، چیدمان و اجرای حرکت‌ها را مشخص می‌کند."
                      : "تعداد جلسه از درخواست، ویزیت یا اطلاعات شاگرد پر شده؛ تنظیم عضله و تنوع اختیاری است."}
                  </p>
                </div>
                {selectedTemplate ? (
                  <StatusBadge variant="info">قالب: {selectedTemplate.name}</StatusBadge>
                ) : (
                  <StatusBadge variant="success">بدون قالب</StatusBadge>
                )}
              </div>

              <details className={styles.formAdvancedDetails}>
                <summary>انتخاب قالب دقیق (اختیاری)</summary>
                <p>
                  برای استفاده از یک تقسیم‌بندی و چیدمان ازپیش‌ساخته، قالب را انتخاب کنید؛ در غیر
                  این صورت تنظیم سریع استفاده می‌شود.
                </p>
                <FormField label="قالب برنامه">
                  <Select
                    options={templateOptions}
                    placeholder="بدون قالب؛ تنظیم سریع"
                    value={form.templateId ?? ""}
                    onChange={(event) => {
                      quickSettingsTouchedFor.current.add(form.studentId);
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
              </details>

              {!selectedTemplate && quickSettingsNotice ? (
                <p className={styles.sectionDescription} role="status">
                  {quickSettingsNotice}
                </p>
              ) : null}

              <div className={styles.formGrid}>
                <FormField error={errors.daysPerWeek} label="جلسه در هفته" required>
                  <Input
                    min={1}
                    max={7}
                    type="number"
                    value={form.daysPerWeek}
                    onChange={(event) => handleDaysPerWeekChange(Number(event.target.value))}
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
                    onChange={(event) => {
                      const level = event.target.value as TrainingLevel;
                      setForm((current) => ({
                        ...current,
                        level,
                        trainingSystems: (current.trainingSystems ?? []).filter((selected) => {
                          const system = trainingSystems.find((item) => item.key === selected.key);
                          return (
                            system &&
                            (system.allowed_levels.length === 0 ||
                              system.allowed_levels.includes(level))
                          );
                        })
                      }));
                    }}
                  />
                </FormField>
                {!selectedTemplate ? (
                  <>
                    <FormField
                      hint="این گزینه فقط از بین حرکت‌های مجاز و متناسب با کاتالوگ انتخاب می‌کند."
                      label="تنوع انتخاب حرکت"
                    >
                      <Select
                        options={exerciseVarietyOptions}
                        value={form.exerciseVariety ?? "balanced"}
                        onChange={(event) =>
                          updateForm(
                            "exerciseVariety",
                            event.target.value as ProgramGenerationInput["exerciseVariety"]
                          )
                        }
                      />
                    </FormField>
                    <div className={`${styles.fullField} ${styles.quickSplitSection}`}>
                      <div>
                        <h3>عضلات هر جلسه (اختیاری)</h3>
                        <p className={styles.sectionDescription}>
                          اگر خالی بماند، موتور با توجه به تعداد جلسه و اولویت‌های شاگرد تقسیم
                          پیشنهادی می‌سازد. در هر جلسه می‌توانید هر تعداد عضله لازم است اضافه کنید.
                        </p>
                      </div>
                      <div className={styles.quickSplitGrid}>
                        {Array.from({ length: Math.max(0, Math.min(7, form.daysPerWeek)) }).map(
                          (_, dayIndex) => {
                            const selectedMuscles = form.sessionMuscles?.[dayIndex] ?? [];
                            return (
                              <div className={styles.quickSplitDay} key={`session-${dayIndex}`}>
                                <strong>جلسهٔ {dayIndex + 1}</strong>
                                {selectedMuscles.map((muscle, muscleIndex) => (
                                  <div
                                    className={styles.quickSplitRow}
                                    key={`session-${dayIndex}-muscle-${muscleIndex}`}
                                  >
                                    <Select
                                      aria-label={`عضله ${muscleIndex + 1} جلسه ${dayIndex + 1}`}
                                      options={quickMuscleOptions.map((option) => ({
                                        ...option,
                                        disabled:
                                          option.value !== muscle &&
                                          selectedMuscles.includes(option.value)
                                      }))}
                                      placeholder="انتخاب عضله"
                                      value={muscle}
                                      onChange={(event) => {
                                        const next = resizeSessionMuscles(
                                          form.sessionMuscles,
                                          form.daysPerWeek
                                        );
                                        next[dayIndex][muscleIndex] = event.target.value;
                                        updateForm("sessionMuscles", next);
                                      }}
                                    />
                                    <Button
                                      aria-label={`حذف عضله ${muscleIndex + 1} از جلسه ${dayIndex + 1}`}
                                      iconStart={<X size={16} />}
                                      onClick={() => {
                                        const next = resizeSessionMuscles(
                                          form.sessionMuscles,
                                          form.daysPerWeek
                                        );
                                        next[dayIndex].splice(muscleIndex, 1);
                                        updateForm("sessionMuscles", next);
                                      }}
                                      size="sm"
                                      variant="secondary"
                                    />
                                  </div>
                                ))}
                                {selectedMuscles.length === 0 ? (
                                  <span className={styles.quickSplitAuto}>تقسیم خودکار</span>
                                ) : null}
                                {selectedMuscles.length < quickMuscleOptions.length &&
                                !selectedMuscles.includes("") ? (
                                  <Button
                                    iconStart={<Plus size={16} />}
                                    onClick={() => {
                                      const next = resizeSessionMuscles(
                                        form.sessionMuscles,
                                        form.daysPerWeek
                                      );
                                      next[dayIndex].push("");
                                      updateForm("sessionMuscles", next);
                                    }}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    افزودن عضله
                                  </Button>
                                ) : null}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
                {!selectedTemplate?.executionPlan ? (
                  <>
                    <details className={`${styles.formAdvancedDetails} ${styles.fullField}`}>
                      <summary>تمرکز عضلانی این دوره (اختیاری)</summary>
                      <div className={styles.formGrid}>
                        <FormField
                          className={styles.fullField}
                          hint="ضعف ثبت‌شده در ویزیت جداگانه از این انتخاب اعمال می‌شود؛ این‌ها تمرکز اضافهٔ همین برنامه‌اند و حرکت‌ها را حذف یا محدود نمی‌کنند."
                          label="عضلاتی که این دوره بیشتر روی آن‌ها کار شود"
                        >
                          <div className={styles.checkboxGrid}>
                            {quickMuscleOptions.map((option) => (
                              <Checkbox
                                checked={form.musclePriorities.includes(option.value)}
                                key={option.value}
                                label={option.label}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...new Set([...form.musclePriorities, option.value])]
                                    : form.musclePriorities.filter(
                                        (muscle) => muscle !== option.value
                                      );
                                  updateForm("musclePriorities", next);
                                }}
                              />
                            ))}
                          </div>
                        </FormField>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className={styles.sectionDescription}>
                    چیدمان حرکت‌ها، مقدار اجرا و روش اجرای آن‌ها از همین قالب خوانده می‌شوند. برای
                    تغییر آن‌ها به «قوانین مربی ← قالب‌های برنامه» بروید؛ آسیب، سطح و تجهیزات شاگرد
                    همچنان بررسی می‌شوند.
                  </p>
                )}
              </div>
            </Card>
          ) : null}

          {generatedSections.length > 0 && !selectedTemplate?.executionPlan ? (
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
                  checked={form.applyExerciseCatalog}
                  label="کاتالوگ حرکات"
                  onChange={(event) => updateForm("applyExerciseCatalog", event.target.checked)}
                />
                <Checkbox
                  checked={form.applyGeneralRules}
                  label="قوانین عمومی"
                  onChange={(event) => updateForm("applyGeneralRules", event.target.checked)}
                />
              </div>
            </Card>
          ) : null}

          {generatedSections.some((section) => section.id === "supplement") ? (
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
          <Card className={styles.toolbar}>
            <span className={styles.sectionDescription}>
              فقط بخش‌هایی که برایشان تولید یا PDF انتخاب کرده‌اید پس از نهایی‌سازی برای ورزشکار در
              دسترس قرار می‌گیرند.
            </span>
            {!generatedSections.length && !uploadedSections.length ? (
              <span className={styles.sectionDescription} role="status">
                برای ادامه، حداقل یک بخش را برای تولید یا بارگذاری انتخاب کنید.
              </span>
            ) : null}
            <Button
              disabled={
                !selectedStudent ||
                uploadingPdf ||
                (!generatedSections.length && !uploadedSections.length)
              }
              iconStart={
                status === "generating" || creatingUploadedDraft ? (
                  <RefreshCcw size={18} />
                ) : generatedSections.length ? (
                  <WandSparkles size={18} />
                ) : (
                  <Eye size={18} />
                )
              }
              isLoading={status === "generating" || creatingUploadedDraft}
              onClick={() =>
                generatedSections.length ? void handleGenerate() : void handleCreateUploadedDraft()
              }
              size="lg"
            >
              {generatedSections.length ? "ساخت پیش‌نویس و بازبینی" : "ادامه به بازبینی"}
            </Button>
          </Card>
        </div>
      </ContentSection>
    </PageContainer>
  );
}

function GenerationStepper({ mode }: { mode: "generated" | "uploaded_pdf" | "mixed" }) {
  const steps = [
    "انتخاب شاگرد",
    "عنوان و بازهٔ برنامه",
    mode === "generated"
      ? "تنظیمات و تولید بخش‌ها"
      : mode === "uploaded_pdf"
        ? "بارگذاری بخش‌ها"
        : "انتخاب روش هر بخش",
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

function programTypeForRequest(sections: ProgramRequest["sections"]): StudentProgramType {
  return sections.length === 1 ? sections[0] : "complete";
}

function programTitleForRequest(sections: ProgramRequest["sections"]): string {
  if (sections.length !== 1) return "کامل";
  if (sections[0] === "workout") return "تمرینی";
  if (sections[0] === "nutrition") return "غذایی";
  return "مکمل";
}

function sessionCountFromVisit(visit?: StudentVisit): number | undefined {
  if (!visit) return undefined;
  const snapshotSections = visit.formTemplateSnapshot.sections ?? [];
  const fields = snapshotSections.flatMap((section) => section.fields ?? []);
  const field = fields.find((item) => item.semanticKey === "sessions_per_week");
  const rawValue = field ? visit.answers[field.key] : visit.answers.sessions_per_week;
  if (typeof rawValue !== "number" && typeof rawValue !== "string") return undefined;
  const normalized = String(rawValue).replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  const days = Number(normalized);
  return Number.isInteger(days) && days >= 1 && days <= 7 ? days : undefined;
}

function semanticVisitAnswer(visit: StudentVisit | undefined, semanticKey: string): unknown {
  if (!visit) return undefined;
  const field = (visit.formTemplateSnapshot.sections ?? [])
    .flatMap((section) => section.fields ?? [])
    .find((item) => item.semanticKey === semanticKey);
  return field ? visit.answers[field.key] : visit.answers[semanticKey];
}

function goalFromVisit(visit?: StudentVisit): string | undefined {
  const value = semanticVisitAnswer(visit, "goal");
  if (typeof value !== "string" || !value.trim()) return undefined;
  return (
    {
      gain_weight: "افزایش وزن و حجم عضلانی",
      lose_weight: "کاهش وزن و چربی",
      maintain_weight: "حفظ وزن و آمادگی",
      hypertrophy: "افزایش حجم عضلانی",
      fat_loss: "کاهش چربی",
      maintain: "حفظ آمادگی"
    }[value] ?? value
  );
}

function levelFromVisit(visit?: StudentVisit): TrainingLevel | undefined {
  const value = semanticVisitAnswer(visit, "training_level");
  if (typeof value !== "string") return undefined;
  if (value === "beginner" || value === "intermediate" || value === "advanced") return value;
  if (value === "semi_professional" || value === "professional") return "advanced";
  return undefined;
}

function trainingMethodsFromVisit(
  visit: StudentVisit | undefined,
  systems: TrainingSystem[],
  level: string
): Array<{ key: string }> | null {
  if (!visit) return null;
  const fields = (visit.formTemplateSnapshot.sections ?? []).flatMap(
    (section) => section.fields ?? []
  );
  const methodField = fields.find((field) => field.semanticKey === "training_methods");
  const raw = methodField ? visit.answers[methodField.key] : visit.answers.training_methods;
  if (
    raw === undefined ||
    raw === null ||
    (Array.isArray(raw) && raw.length === 0) ||
    (typeof raw === "string" && !raw.trim())
  ) {
    return null;
  }
  const requested = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  const aliases: Record<string, string> = {
    "21": "21s",
    twenty_one: "21s",
    fstv: "fst_7",
    fst_v: "fst_7",
    five_ten_twenty: "5_10_20",
    hundred_rep: "100_reps",
    gvt: "gvt_10x10",
    partial: "partial_reps"
  };
  const availableSystems = systems.filter(
    (system) =>
      (system.source === "platform" || system.enabled) &&
      (!system.allowed_levels.length || system.allowed_levels.includes(level))
  );
  const available = new Set(availableSystems.map((system) => system.key));
  return [
    ...new Set(requested.map((key) => key.trim().toLowerCase()).map((key) => aliases[key] ?? key))
  ]
    .filter((key) => available.has(key))
    .map((key) => {
      const system = availableSystems.find((item) => item.key === key);
      return {
        key,
        ...(system?.handler_key === "partial_reps"
          ? { variants: trainingSystemVariants(system) }
          : {})
      };
    });
}

function trainingSystemVariants(system: TrainingSystem): string[] {
  const schema = system.parameter_schema ?? system.public_definition?.parameter_schema ?? {};
  const variantSchema = schema.variants;
  const schemaDefault =
    variantSchema && typeof variantSchema === "object" && "default" in variantSchema
      ? (variantSchema as { default?: unknown }).default
      : undefined;
  const configured = system.parameters?.variants;
  const values = Array.isArray(configured)
    ? configured
    : Array.isArray(schemaDefault)
      ? schemaDefault
      : partialRepVariantOptions.map((item) => item.value);
  const available = new Set(partialRepVariantOptions.map((item) => item.value));
  return values.filter((item): item is (typeof partialRepVariantOptions)[number]["value"] =>
    available.has(item as (typeof partialRepVariantOptions)[number]["value"])
  );
}

function isErrorFeedback(message: string): boolean {
  return [
    "خطا",
    "لطفا",
    "نشد",
    "الزامی",
    "نامعتبر",
    "در دسترس نیست",
    "باید",
    "پاسخ سرور",
    "غیرفعال",
    "بایگانی"
  ].some((phrase) => message.includes(phrase));
}

function validateForm(
  form: ProgramGenerationInput,
  selectedTemplate?: { daysPerWeek: number; name: string } | null,
  generatedSections: ProgramPdfSection[] = ["workout", "nutrition", "supplement"]
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
  if (generatedSections.includes("supplement") && form.supplementSelection?.items.length) {
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
  if (
    generatedSections.includes("workout") &&
    (!Number.isInteger(form.daysPerWeek) || form.daysPerWeek < 1 || form.daysPerWeek > 7)
  ) {
    errors.daysPerWeek = "تعداد جلسه باید عددی بین ۱ تا ۷ باشد.";
  }
  if (selectedTemplate && form.daysPerWeek && selectedTemplate.daysPerWeek !== form.daysPerWeek) {
    errors.daysPerWeek = `تعداد روز تمرین (${form.daysPerWeek}) با قالب «${selectedTemplate.name}» (${selectedTemplate.daysPerWeek} روز) هم‌خوان نیست.`;
    errors.templateId = "قالب و تعداد روز تمرین باید یکسان باشند.";
  }

  return errors;
}
