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
  FormField,
  Input,
  Modal,
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
  ProgramPreviewTab,
  SupplementItem,
  TrainingDay,
  TrainingExercise
} from "../types/generatedProgram";
import styles from "../components/programFlow.module.css";

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
  const [finalizeForPdfOpen, setFinalizeForPdfOpen] = useState(false);
  const [pdfCreating, setPdfCreating] = useState(false);
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
    if (program.training) {
      available.push("training");
    }
    if (program.nutrition) {
      available.push("nutrition");
    }
    if (program.supplements) {
      available.push("supplements");
    }
    available.push("pdf");
    return available;
  }, [program]);

  const activeTab = getPreviewTab(searchParams.get("tab"), tabs);

  const updateProgram = (updater: (program: GeneratedProgram) => GeneratedProgram) => {
    setProgram((current) => (current ? updater(structuredClone(current)) : current));
    setIsDirty(true);
  };

  const saveProgram = async (nextStatus?: GeneratedProgram["status"]) => {
    if (!program) {
      return;
    }
    setStatus("saving");
    setFeedback("");

    try {
      const savedProgram = await programsRepo.update(program.id, {
        ...program,
        status: nextStatus ?? program.status
      });
      await studentProgramsRepo.upsert?.(createProgramSummary(savedProgram));
      setProgram(savedProgram);
      setIsDirty(false);
      setStatus("loaded");
      setFeedback(nextStatus === "ready" ? "برنامه آماده سازی شد." : "تغییرات برنامه ذخیره شد.");
    } catch {
      setStatus("loaded");
      setFeedback("ذخیره برنامه انجام نشد.");
    }
  };

  const createRealPdf = async (sourceProgram: GeneratedProgram) => {
    if (!student) {
      return;
    }
    setPdfCreating(true);
    setStatus("saving");
    setFeedback("در حال ساخت فایل‌های PDF تمرین و تغذیه…");
    try {
      // Always persist PDF include flags before render (finalized versions allow pdf_settings).
      const saved = await programsRepo.update(sourceProgram.id, sourceProgram);
      setProgram(saved);
      const created = pdfFilesRepo.createForProgram
        ? await pdfFilesRepo.createForProgram(saved.id, { deliveryOutputs: "pair" })
        : await pdfFilesRepo.create({
            contentType: saved.programType,
            fileName: `${saved.pdfSettings.fileTitle.replace(/\s+/g, "_")}_v${saved.version}.pdf`,
            generatedAt: new Date().toLocaleString("fa-IR"),
            id: `pdf-${saved.id}-${Date.now()}`,
            programId: saved.id,
            programTitle: saved.title,
            size: "-",
            status: "ready",
            studentId: student.id,
            version: `v${saved.version}`
          });
      const artifacts =
        created && typeof created === "object" && "artifacts" in created
          ? created.artifacts
          : [created as { status?: string }];
      if (artifacts.some((item) => item.status === "failed")) {
        setStatus("loaded");
        setFeedback("ساخت PDF ناموفق بود.");
        return;
      }
      setIsDirty(false);
      setStatus("loaded");
      setFeedback(
        artifacts.length > 1 ? "فایل تمرین و فایل تغذیه/مکمل ساخته شد." : "فایل PDF تمرین ساخته شد."
      );
      navigate(`/students/${student.id}/pdf-files`);
    } catch (error) {
      const code = (error as { code?: string; message?: string }).code;
      setStatus("loaded");
      if (code === "program_not_finalized" || code === "version_not_finalized") {
        setFeedback("برای ساخت PDF باید ابتدا نسخه برنامه نهایی شود.");
        setFinalizeForPdfOpen(true);
      } else {
        setFeedback("ساخت فایل PDF انجام نشد. لطفا دوباره تلاش کنید.");
      }
    } finally {
      setPdfCreating(false);
    }
  };

  const requestCreatePdf = async () => {
    if (!program || !student) {
      return;
    }
    if (program.status === "draft") {
      setFeedback(
        "برای ساخت PDF رسمی، ابتدا باید نسخه فعلی برنامه را نهایی کنید. نهایی‌سازی با تایید شما انجام می‌شود."
      );
      setFinalizeForPdfOpen(true);
      return;
    }
    await createRealPdf(program);
  };

  const confirmFinalizeThenPdf = async () => {
    if (!program || !student) {
      return;
    }
    setFinalizeForPdfOpen(false);
    setStatus("saving");
    try {
      let next = program;
      if (isDirty) {
        next = await programsRepo.update(program.id, program);
      }
      if (programsRepo.finalize) {
        next = await programsRepo.finalize(program.id);
      } else {
        next = await programsRepo.update(program.id, { ...program, status: "ready" });
      }
      setProgram(next);
      setIsDirty(false);
      await createRealPdf(next);
    } catch {
      setStatus("loaded");
      setFeedback("نهایی‌سازی یا ساخت PDF انجام نشد.");
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
              onClick={() => saveProgram()}
              variant="secondary"
            >
              ذخیره تغییرات
            </Button>
            <Button
              isLoading={status === "saving"}
              onClick={() => saveProgram("ready")}
              variant="success"
            >
              نهایی سازی برنامه
            </Button>
          </div>
        }
        breadcrumb={["داشبورد", "برنامه ها", "پیش نمایش"]}
        description="پیش نمایش و ویرایش برنامه تمرینی، غذایی، مکمل و تنظیمات PDF"
        title="پیش نمایش برنامه"
      />
      <ContentSection>
        <div className={styles.pageStack}>
          {feedback ? (
            <div
              className={`${styles.alert} ${
                feedback.includes("نشد") ? styles.alertError : styles.alertSuccess
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
          <GenerationEvidencePanel program={program} />
          <Card>
            <Tabs
              ariaLabel="تب های پیش نمایش برنامه"
              items={tabs.map((tab) => ({ id: tab, label: previewTabLabels[tab] }))}
              onChange={(tab) => setSearchParams({ tab })}
              renderPanels={false}
              value={activeTab}
            />
          </Card>

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
            <PdfSettingsEditor
              onCreatePdf={requestCreatePdf}
              pdfCreating={pdfCreating}
              program={program}
              updateProgram={updateProgram}
            />
          ) : null}
        </div>
      </ContentSection>

      <Modal
        footer={
          <>
            <Button onClick={() => setFinalizeForPdfOpen(false)} variant="secondary">
              انصراف
            </Button>
            <Button data-testid="confirm-finalize-for-pdf" onClick={confirmFinalizeThenPdf}>
              نهایی‌سازی و ساخت PDF
            </Button>
          </>
        }
        onClose={() => setFinalizeForPdfOpen(false)}
        open={finalizeForPdfOpen}
        title="نهایی‌سازی برای PDF"
      >
        <p>
          ساخت PDF رسمی فقط از نسخه نهایی‌شده امکان‌پذیر است. با تایید شما، نسخه پیش‌نویس فعلی نهایی
          می‌شود و سپس فایل PDF ساخته خواهد شد. این کار به‌صورت خودکار با زدن «ساخت PDF» انجام
          نمی‌شود.
        </p>
      </Modal>
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
          {student?.fullName ?? "شاگرد نامشخص"} - نسخه {program.version} - {program.dateRange}
        </p>
      </div>
      <div className={styles.chipList}>
        <StatusBadge variant={program.status === "ready" ? "success" : "warning"}>
          {program.status === "ready" ? "آماده" : "پیش نویس"}
        </StatusBadge>
        <StatusBadge variant="info">
          {new Date(program.createdAt).toLocaleDateString("fa-IR")}
        </StatusBadge>
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
            استراحت بین حرکات: {exercise.supersetRestBetweenSeconds ?? 0} ثانیه؛ بعد از جفت: {exercise.supersetRestAfterSeconds ?? 90} ثانیه
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
  const updateItems = (updater: (items: SupplementItem[]) => SupplementItem[]) =>
    updateProgram((next) => ({
      ...next,
      supplements: next.supplements
        ? { ...next.supplements, items: updater(next.supplements.items) }
        : next.supplements
    }));

  return (
    <Card className={styles.pageStack}>
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
                      entry.id === item.id ? { ...entry, amount: event.target.value } : entry
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
            <FormField label="توضیح">
              <Input
                value={item.notes}
                onChange={(event) =>
                  updateItems((items) =>
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, notes: event.target.value } : entry
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
  onCreatePdf,
  pdfCreating,
  program,
  updateProgram
}: {
  onCreatePdf: () => void;
  pdfCreating?: boolean;
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
            این برنامه هنوز پیش‌نویس است. برای ساخت PDF رسمی باید ابتدا نهایی شود.
          </p>
        ) : null}
        <Button
          data-testid="create-program-pdf"
          disabled={pdfCreating}
          iconStart={<FileDown size={18} />}
          onClick={onCreatePdf}
          size="lg"
        >
          {pdfCreating ? "در حال ساخت PDF…" : "ساخت PDF"}
        </Button>
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
