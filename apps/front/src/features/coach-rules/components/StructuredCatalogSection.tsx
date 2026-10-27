import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  EditorDrawer,
  EmptyState,
  FormField,
  Input,
  Select,
  StatusBadge,
  Switch,
  Table,
  Textarea
} from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import {
  CATALOG_PAGE_SIZE,
  useDebouncedSearch,
  usePagedList,
  type ListPage
} from "../../../shared/api/usePagedList";
import { PagedListFooter } from "../../../shared/api/PagedListFooter";
import { exerciseSaveErrorMessage } from "../services/exerciseSaveErrors";
import { ExerciseTaxonomyManager } from "./ExerciseTaxonomyManager";
import { ExerciseVideoManager } from "./ExerciseVideoManager";
import {
  uploadExerciseVideo,
  validateExerciseVideo,
  videoErrorMessage,
  videoIsPending,
  videoStatusLabel
} from "../services/exerciseMedia";
import type { ExerciseVideoState } from "../services/exerciseMedia";
import type { ExerciseTaxonomy } from "./exerciseTaxonomyTypes";
import styles from "../../programs/components/programFlow.module.css";

type ExerciseTarget = {
  muscle_key: string;
  region_key?: string | null;
  role: "primary" | "secondary";
};

type CatalogExercise = ExerciseVideoState & {
  tutorial_url?: string;
  tutorial_source_url?: string;
  execution_guide?: Record<string, string>;
  id: string;
  name: string;
  name_en: string;
  aliases: string[];
  targets: ExerciseTarget[];
  levels: string[];
  equipment_keys: string[];
  movement_pattern: string;
  mechanics?: string;
  joint_keys?: string[];
  prescription_unit?: string;
  metadata_issues?: string[];
  source_document: string;
  coach_notes: string;
  is_active: boolean;
  is_archived: boolean;
  is_preferred: boolean;
  is_prohibited: boolean;
  priority: number;
};

const standardExerciseEquipmentKeys = new Set([
  "bodyweight",
  "dumbbell",
  "barbell",
  "cable",
  "machine",
  "smith_machine",
  "kettlebell",
  "resistance_band"
]);

function normalizeExerciseSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s\u200c\u200d]+/g, "");
}

const metadataIssueLabels: Record<string, string> = {
  movement_pattern_missing: "الگوی حرکت ثبت نشده",
  mechanics_missing: "نوع مفصلی حرکت ثبت نشده",
  joint_keys_missing: "مفصل‌های درگیر ثبت نشده",
  prescription_unit_missing: "واحد تجویز ثبت نشده",
  primary_target_missing: "عضلهٔ اصلی معتبر نیست",
  pattern_joint_mismatch: "مفصل ثبت‌شده با الگوی حرکت سازگار نیست",
  pattern_primary_mismatch: "عضلهٔ اصلی با الگوی حرکت سازگار نیست",
  pattern_mechanics_mismatch: "حرکت چندمفصلی به‌عنوان تک‌مفصلی ثبت شده است"
};

function describeMetadataIssue(issue: string): string {
  return metadataIssueLabels[issue] || issue;
}

type SecondaryTarget = { muscle_key: string; region_key: string };

type ExerciseDraft = {
  tutorial_url: string;
  tutorial_source_url: string;
  execution_guide: Record<string, string>;
  default_guide: Record<string, string>;
  name: string;
  name_en: string;
  aliases: string;
  primary_muscle: string;
  primary_region: string;
  secondary_targets: SecondaryTarget[];
  levels: string[];
  equipment_keys: string[];
  movement_pattern: string;
  mechanics: string;
  joint_keys: string[];
  prescription_unit: string;
  source_document: string;
  coach_notes: string;
  is_preferred: boolean;
  is_prohibited: boolean;
  priority: number;
  is_active: boolean;
};

const emptyDraft: ExerciseDraft = {
  tutorial_url: "",
  tutorial_source_url: "",
  execution_guide: {},
  default_guide: {},
  name: "",
  name_en: "",
  aliases: "",
  primary_muscle: "",
  primary_region: "",
  secondary_targets: [],
  levels: [],
  equipment_keys: [],
  movement_pattern: "",
  mechanics: "",
  joint_keys: [],
  prescription_unit: "reps",
  source_document: "",
  coach_notes: "",
  is_preferred: false,
  is_prohibited: false,
  priority: 0,
  is_active: true
};

function splitComma(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function exerciseFromRow(row: CatalogExercise, taxonomy: ExerciseTaxonomy): ExerciseDraft {
  const primary = row.targets.find((target) => target.role === "primary");
  const secondary = row.targets.filter((target) => target.role === "secondary");
  return {
    ...emptyDraft,
    tutorial_url: row.tutorial_url ?? "",
    tutorial_source_url: row.tutorial_source_url ?? "",
    execution_guide: row.execution_guide ?? {},
    default_guide: {
      execution: (row.media?.education.steps ?? [])
        .map((step) => [step.title, step.text].filter(Boolean).join(": "))
        .join("\n"),
      tips: (row.media?.education.tips ?? []).join("\n"),
      mistakes: (row.media?.education.mistakes ?? [])
        .map((mistake) => [mistake.title, mistake.text].filter(Boolean).join(": "))
        .join("\n")
    },
    aliases: row.aliases.join(", "),
    coach_notes: row.coach_notes,
    equipment_keys: row.equipment_keys,
    is_active: row.is_active,
    is_preferred: row.is_preferred,
    is_prohibited: row.is_prohibited,
    levels: row.levels,
    movement_pattern: row.movement_pattern,
    mechanics: row.mechanics ?? "",
    joint_keys: row.joint_keys ?? [],
    prescription_unit: row.prescription_unit ?? "reps",
    name: row.name,
    name_en: row.name_en,
    priority: row.priority,
    primary_muscle: primary?.muscle_key || taxonomy.muscles[0]?.key || "",
    primary_region: primary?.region_key || "",
    secondary_targets: secondary.map((target) => ({
      muscle_key: target.muscle_key,
      region_key: target.region_key || ""
    })),
    source_document: row.source_document
  };
}

function exercisePayload(draft: ExerciseDraft) {
  return {
    name: draft.name,
    name_en: draft.name_en,
    aliases: splitComma(draft.aliases),
    targets: [
      {
        muscle_key: draft.primary_muscle,
        region_key: draft.primary_region || null,
        role: "primary"
      },
      ...draft.secondary_targets.map((target) => ({
        muscle_key: target.muscle_key,
        region_key: target.region_key || null,
        role: "secondary"
      }))
    ],
    levels: draft.levels,
    equipment_keys: draft.equipment_keys,
    movement_pattern: draft.movement_pattern,
    mechanics: draft.mechanics,
    joint_keys: draft.joint_keys,
    prescription_unit: draft.prescription_unit,
    source_document: draft.source_document,
    execution_guide: draft.execution_guide,
    coach_notes: draft.coach_notes,
    is_preferred: draft.is_preferred,
    is_prohibited: draft.is_prohibited,
    priority: draft.priority,
    is_active: draft.is_active
  };
}

export function StructuredCatalogSection() {
  const [taxonomy, setTaxonomy] = useState<ExerciseTaxonomy>();
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string>();
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false);
  const [exerciseBaseline, setExerciseBaseline] = useState<ExerciseDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ equipment: "", level: "", muscle: "", region: "" });
  const debouncedSearch = useDebouncedSearch(search);
  const pages = usePagedList<CatalogExercise>(
    (offset, signal) =>
      apiRequest<ListPage<CatalogExercise>>("/exercises/", {
        signal,
        query: { limit: CATALOG_PAGE_SIZE, offset, search: debouncedSearch, ...filters }
      }),
    JSON.stringify([debouncedSearch, filters])
  );
  const { items: exercises, setItems: setExercises } = pages;
  const visibleExercises = exercises;
  const [feedback, setFeedback] = useState("");
  const [isSavingExercise, setIsSavingExercise] = useState(false);
  const [videoEditorId, setVideoEditorId] = useState<string>();
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoPollError, setVideoPollError] = useState("");
  const [newVideoFile, setNewVideoFile] = useState<File>();
  const [newVideoProgress, setNewVideoProgress] = useState(0);
  const exerciseErrorRef = useRef<HTMLDivElement>(null);
  const updateVideo = useCallback(
    (id: string, state: ExerciseVideoState) => {
      setExercises((current) => current.map((row) => (row.id === id ? { ...row, ...state } : row)));
    },
    [setExercises]
  );
  const pendingVideoIds = exercises
    .filter(videoIsPending)
    .map((row) => row.id)
    .join(",");
  useEffect(() => {
    if (!pendingVideoIds) return undefined;
    const controller = new AbortController();
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const values = await Promise.all(
          pendingVideoIds.split(",").map(async (id) => ({
            id,
            value: await apiRequest<ExerciseVideoState>(`/exercises/${id}/media/`, {
              signal: controller.signal
            })
          }))
        );
        if (!controller.signal.aborted) {
          values.forEach(({ id, value }) => updateVideo(id, value));
          setVideoPollError("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setVideoPollError(`دریافت وضعیت ویدئو انجام نشد. ${videoErrorMessage(error)}`);
      } finally {
        polling = false;
      }
    };
    const interval = window.setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [pendingVideoIds, updateVideo]);

  useEffect(() => {
    if (exerciseEditorOpen && feedback) exerciseErrorRef.current?.focus();
  }, [exerciseEditorOpen, feedback]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<ExerciseTaxonomy>("/exercise-taxonomy/", {
      signal: controller.signal,
      query: { include_inactive: true }
    }).then(
      (value) => {
        if (!controller.signal.aborted) setTaxonomy(value);
      },
      () => {
        if (!controller.signal.aborted) setFeedback("دریافت کاتالوگ انجام نشد.");
      }
    );
    return () => controller.abort();
  }, []);

  if (!taxonomy) {
    return (
      <Card>
        <EmptyState
          description={feedback || "در حال دریافت کاتالوگ حرکات..."}
          title="کاتالوگ حرکات"
        />
      </Card>
    );
  }

  const activeMuscles = taxonomy.muscles.filter((muscle) => muscle.is_active !== false);
  const muscleOptions = activeMuscles.map((muscle) => ({
    label: muscle.name,
    value: muscle.key
  }));
  const regionOptions = activeMuscles
    .filter((muscle) => !filters.muscle || muscle.key === filters.muscle)
    .flatMap((muscle) =>
      muscle.regions
        .filter((region) => region.is_active !== false)
        .map((region) => ({
          label: `${muscle.name} — ${region.name}`,
          value: `${muscle.key}:${region.key}`
        }))
    );
  const describeTarget = (target: ExerciseTarget) => {
    const muscle = taxonomy.muscles.find((item) => item.key === target.muscle_key);
    const region = muscle?.regions.find((item) => item.key === target.region_key);
    return `${muscle?.name || target.muscle_key}${region ? ` — ${region.name}` : ""}`;
  };
  const editorMuscleOptions = (selectedKeys: string[]) => {
    const selected = new Set(selectedKeys.filter(Boolean));
    return taxonomy.muscles
      .filter((muscle) => muscle.is_active !== false || selected.has(muscle.key))
      .map((muscle) => ({
        label: `${muscle.name}${muscle.is_active === false ? " (غیرفعال؛ فقط برای حفظ اتصال فعلی)" : ""}`,
        value: muscle.key,
        disabled: muscle.is_active === false
      }));
  };
  const editorRegionOptions = (muscleKey: string, selectedKey: string) => {
    const muscle = taxonomy.muscles.find((item) => item.key === muscleKey);
    return (muscle?.regions || [])
      .filter((region) => region.is_active !== false || region.key === selectedKey)
      .map((region) => ({
        label: `${region.name}${region.is_active === false ? " (غیرفعال؛ فقط برای حفظ اتصال فعلی)" : ""}`,
        value: region.key,
        disabled: region.is_active === false
      }));
  };
  const exerciseEquipmentOptions = editingId
    ? taxonomy.equipment
    : taxonomy.equipment.filter((equipment) => standardExerciseEquipmentKeys.has(equipment.key));

  const saveExercise = async () => {
    if (videoBusy) return;
    setFeedback("");
    const duplicate = exercises.some(
      (exercise) =>
        exercise.id !== editingId &&
        normalizeExerciseSearch(exercise.name) === normalizeExerciseSearch(draft.name) &&
        exercise.targets.some(
          (target) => target.role === "primary" && target.muscle_key === draft.primary_muscle
        )
    );
    if (duplicate) {
      setFeedback(
        "این حرکت تکراری است و قبلاً برای همین عضله ثبت شده است. حرکت موجود را ویرایش کنید یا نام دیگری وارد کنید."
      );
      return;
    }
    setIsSavingExercise(true);
    try {
      const dto = await apiRequest<CatalogExercise>(
        editingId ? `/exercises/${editingId}/` : "/exercises/",
        {
          body: exercisePayload(draft),
          method: editingId ? "PATCH" : "POST"
        }
      );
      setExercises((current) =>
        editingId ? current.map((item) => (item.id === dto.id ? dto : item)) : [dto, ...current]
      );
      if (newVideoFile) {
        try {
          updateVideo(dto.id, await uploadExerciseVideo(dto.id, newVideoFile, setNewVideoProgress));
        } catch (error) {
          const savedDraft = exerciseFromRow(dto, taxonomy);
          setEditingId(dto.id);
          setDraft(savedDraft);
          setExerciseBaseline(savedDraft);
          setNewVideoFile(undefined);
          setFeedback(
            `حرکت ذخیره شد، اما ویدئو ارسال نشد. ${videoErrorMessage(error)} از بخش ویدئو دوباره انتخاب کنید.`
          );
          return;
        }
      }
      setNewVideoFile(undefined);
      setDraft(emptyDraft);
      setEditingId(undefined);
      setExerciseEditorOpen(false);
      setFeedback("حرکت ذخیره شد.");
      pages.reload();
    } catch (error) {
      setFeedback(exerciseSaveErrorMessage(error));
    } finally {
      setIsSavingExercise(false);
    }
  };

  const archiveExercise = async (id: string) => {
    try {
      await apiRequest(`/exercises/${id}/`, { method: "DELETE" });
      setExercises((current) => current.filter((item) => item.id !== id));
      setFeedback("حرکت آرشیو شد.");
      pages.reload();
    } catch {
      setFeedback("آرشیو حرکت انجام نشد.");
    }
  };

  const startNewExercise = () => {
    setNewVideoFile(undefined);
    setNewVideoProgress(0);
    setFeedback("");
    setDraft(emptyDraft);
    setEditingId(undefined);
    setExerciseBaseline(emptyDraft);
    setExerciseEditorOpen(true);
  };

  const startEditingExercise = (row: CatalogExercise) => {
    setNewVideoFile(undefined);
    setFeedback("");
    const nextDraft = exerciseFromRow(row, taxonomy);
    setEditingId(row.id);
    setDraft(nextDraft);
    setExerciseBaseline(nextDraft);
    setExerciseEditorOpen(true);
  };

  const closeExerciseEditor = () => {
    if (videoBusy || isSavingExercise) return;
    setExerciseEditorOpen(false);
    setEditingId(undefined);
    setDraft(emptyDraft);
    setNewVideoFile(undefined);
  };

  return (
    <StackLike>
      {feedback && !exerciseEditorOpen ? (
        <div
          className={feedback.includes("نشد") ? styles.alertError : styles.alertSuccess}
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      <Card className={styles.pageStack}>
        {videoPollError ? (
          <p className={styles.alertError} role="alert">
            {videoPollError}
          </p>
        ) : null}
        <div className={styles.ruleCardHeader}>
          <div>
            <h2 className={styles.ruleCardTitle}>کاتالوگ حرکات</h2>
            <p>حرکت‌ها با عضله، ناحیه، سطح و تجهیزات ساختاریافته در generator استفاده می‌شوند.</p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={startNewExercise}>
            حرکت جدید
          </Button>
        </div>
        <ExerciseTaxonomyManager taxonomy={taxonomy} onTaxonomyChanged={setTaxonomy} />
        <div className={styles.formGrid}>
          <FormField htmlFor="exercise-catalog-search" label="جست‌وجو">
            <Input
              id="exercise-catalog-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="نام حرکت، نام جایگزین یا عضله"
            />
          </FormField>
          <FormField htmlFor="exercise-catalog-filter-muscle" label="فیلتر عضله">
            <Select
              id="exercise-catalog-filter-muscle"
              options={muscleOptions}
              value={filters.muscle}
              onChange={(event) =>
                setFilters({ ...filters, muscle: event.target.value, region: "" })
              }
              placeholder="همه"
            />
          </FormField>
          <FormField htmlFor="exercise-catalog-filter-region" label="فیلتر ناحیه">
            <Select
              id="exercise-catalog-filter-region"
              options={regionOptions}
              value={filters.region}
              onChange={(event) => setFilters({ ...filters, region: event.target.value })}
              placeholder="همه"
            />
          </FormField>
          <FormField htmlFor="exercise-catalog-filter-level" label="فیلتر سطح">
            <Select
              id="exercise-catalog-filter-level"
              options={taxonomy.levels.map((level) => ({ label: level.name, value: level.key }))}
              value={filters.level}
              onChange={(event) => setFilters({ ...filters, level: event.target.value })}
              placeholder="همه"
            />
          </FormField>
          <FormField htmlFor="exercise-catalog-filter-equipment" label="فیلتر تجهیزات">
            <Select
              id="exercise-catalog-filter-equipment"
              options={taxonomy.equipment.map((equipment) => ({
                label: equipment.name,
                value: equipment.key
              }))}
              value={filters.equipment}
              onChange={(event) => setFilters({ ...filters, equipment: event.target.value })}
              placeholder="همه"
            />
          </FormField>
        </div>
        <div className={styles.catalogTable}>
          <Table
            ariaLabel="کاتالوگ حرکات"
            data={visibleExercises}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: "name",
                header: "حرکت",
                cell: (row) => (
                  <>
                    <strong>{row.name}</strong>
                    <br />
                    <small>{row.name_en || row.aliases.join("، ")}</small>
                  </>
                )
              },
              {
                id: "target",
                header: "هدف",
                cell: (row) =>
                  row.targets
                    .map(
                      (target) =>
                        `${target.role === "primary" ? "اصلی" : "فرعی"}: ${describeTarget(target)}`
                    )
                    .join(" | ")
              },
              { id: "levels", header: "سطح", cell: (row) => row.levels.join("، ") || "ثبت نشده" },
              {
                id: "generator-readiness",
                header: "آمادگی برای تولید خودکار",
                cell: (row) =>
                  row.metadata_issues?.length ? (
                    <div className={styles.pageStack}>
                      <StatusBadge variant="warning">
                        از انتخاب خودکار کنار گذاشته می‌شود
                      </StatusBadge>
                      <small>{row.metadata_issues.map(describeMetadataIssue).join("؛ ")}</small>
                    </div>
                  ) : (
                    <StatusBadge variant="success">آماده</StatusBadge>
                  )
              },
              {
                id: "state",
                header: "وضعیت",
                cell: (row) => (
                  <StatusBadge
                    variant={row.is_prohibited ? "danger" : row.is_active ? "success" : "neutral"}
                  >
                    {row.is_prohibited ? "ممنوع" : row.is_active ? "فعال" : "غیرفعال"}
                  </StatusBadge>
                )
              },
              {
                id: "video",
                header: "ویدئو",
                cell: (row) => (
                  <div className={styles.pageStack}>
                    <small>{videoStatusLabel(row)}</small>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`ویدئوی ${row.name}`}
                      onClick={() => setVideoEditorId(row.id)}
                    >
                      {row.media ? "مدیریت ویدئو" : "آپلود ویدئو"}
                    </Button>
                  </div>
                )
              },
              {
                id: "actions",
                header: "عملیات",
                cell: (row) => (
                  <div className={styles.actionIconGroup}>
                    <Button size="sm" variant="secondary" onClick={() => startEditingExercise(row)}>
                      ویرایش
                    </Button>
                    <Button
                      iconStart={<Trash2 size={15} />}
                      size="sm"
                      variant="danger"
                      onClick={() => void archiveExercise(row.id)}
                    >
                      آرشیو
                    </Button>
                  </div>
                )
              }
            ]}
          />
        </div>
        <div className={styles.mobileCatalogList}>
          {visibleExercises.map((row) => (
            <article className={styles.mobileCatalogCard} key={row.id}>
              <div className={styles.mobileCatalogHeader}>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.name_en || row.aliases.join("، ") || "نام انگلیسی ثبت نشده"}</small>
                </div>
                <StatusBadge
                  variant={row.is_prohibited ? "danger" : row.is_active ? "success" : "neutral"}
                >
                  {row.is_prohibited ? "ممنوع" : row.is_active ? "فعال" : "غیرفعال"}
                </StatusBadge>
              </div>
              <div className={styles.mobileCatalogMeta}>
                <span>
                  هدف:{" "}
                  {row.targets
                    .map(
                      (target) =>
                        `${target.role === "primary" ? "اصلی" : "فرعی"} ${describeTarget(target)}`
                    )
                    .join(" · ")}
                </span>
                <span>سطح: {row.levels.join("، ") || "ثبت نشده"}</span>
                <span>تجهیزات: {row.equipment_keys.join("، ") || "ثبت نشده"}</span>
                {row.metadata_issues?.length ? (
                  <div className={styles.pageStack}>
                    <StatusBadge variant="warning">از انتخاب خودکار کنار گذاشته می‌شود</StatusBadge>
                    <small>{row.metadata_issues.map(describeMetadataIssue).join("؛ ")}</small>
                  </div>
                ) : (
                  <StatusBadge variant="success">آمادهٔ انتخاب خودکار</StatusBadge>
                )}
              </div>
              <div className={styles.mobileCatalogActions}>
                <div className={styles.fullField}>
                  <small>{videoStatusLabel(row)}</small>
                  <Button fullWidth onClick={() => setVideoEditorId(row.id)} variant="secondary">
                    {row.media ? "مدیریت ویدئو" : "آپلود ویدئو"}
                  </Button>
                </div>
                <Button fullWidth onClick={() => startEditingExercise(row)} variant="secondary">
                  ویرایش
                </Button>
                <Button
                  fullWidth
                  iconStart={<Trash2 size={15} />}
                  onClick={() => void archiveExercise(row.id)}
                  variant="danger"
                >
                  آرشیو
                </Button>
              </div>
            </article>
          ))}
        </div>
        <PagedListFooter {...pages} />
      </Card>

      {videoEditorId ? (
        <EditorDrawer
          open
          title={`ویدئوی ${exercises.find((row) => row.id === videoEditorId)?.name || "حرکت"}`}
          onClose={() => {
            if (!videoBusy) setVideoEditorId(undefined);
          }}
          footer={
            <Button
              disabled={videoBusy}
              onClick={() => setVideoEditorId(undefined)}
              variant="secondary"
            >
              بستن
            </Button>
          }
        >
          <ExerciseVideoManager
            key={videoEditorId}
            exerciseId={videoEditorId}
            name={exercises.find((row) => row.id === videoEditorId)?.name || "حرکت"}
            state={exercises.find((row) => row.id === videoEditorId) || {}}
            onChange={updateVideo}
            onBusyChange={setVideoBusy}
          />
        </EditorDrawer>
      ) : null}

      <EditorDrawer
        footer={(requestClose) => (
          <>
            <Button
              iconStart={<Save size={17} />}
              isLoading={isSavingExercise}
              disabled={videoBusy}
              onClick={() => void saveExercise()}
            >
              ذخیره حرکت
            </Button>
            <Button onClick={requestClose} variant="secondary">
              انصراف
            </Button>
          </>
        )}
        hasUnsavedChanges={
          Boolean(newVideoFile) || JSON.stringify(draft) !== JSON.stringify(exerciseBaseline)
        }
        onClose={closeExerciseEditor}
        open={exerciseEditorOpen}
        title={editingId ? "ویرایش حرکت" : "حرکت جدید"}
      >
        <div className={styles.pageStack}>
          {feedback ? (
            <div className={styles.alertError} ref={exerciseErrorRef} role="alert" tabIndex={-1}>
              {feedback}
            </div>
          ) : null}
          <div className={styles.formGrid}>
            <FormField label="نام فارسی" required>
              <Input
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </FormField>
            <FormField label="نام انگلیسی">
              <Input
                value={draft.name_en}
                onChange={(event) => setDraft({ ...draft, name_en: event.target.value })}
              />
            </FormField>
            <FormField hint="با کاما جدا کنید" label="نام‌های جایگزین">
              <Input
                value={draft.aliases}
                onChange={(event) => setDraft({ ...draft, aliases: event.target.value })}
              />
            </FormField>
            <FormField htmlFor="exercise-primary-muscle" label="عضله اصلی" required>
              <Select
                id="exercise-primary-muscle"
                options={editorMuscleOptions([draft.primary_muscle])}
                value={draft.primary_muscle}
                onChange={(event) =>
                  setDraft({ ...draft, primary_muscle: event.target.value, primary_region: "" })
                }
                placeholder="انتخاب کنید"
              />
            </FormField>
            <FormField htmlFor="exercise-primary-region" label="ناحیه عضله اصلی">
              <Select
                id="exercise-primary-region"
                options={editorRegionOptions(draft.primary_muscle, draft.primary_region)}
                value={draft.primary_region}
                onChange={(event) => setDraft({ ...draft, primary_region: event.target.value })}
                placeholder="بدون ناحیه"
              />
            </FormField>
            <FormField
              className={styles.fullField}
              label="الگوی حرکت"
              htmlFor="exercise-movement-pattern"
              hint="مثلاً پرس سینه: فشار افقی؛ برای تعادل برنامه و پیشنهاد جایگزین استفاده می‌شود."
            >
              <Select
                id="exercise-movement-pattern"
                options={(taxonomy.movement_patterns ?? []).map((item) => ({
                  value: item.key,
                  label: item.name
                }))}
                placeholder="انتخاب الگوی حرکت"
                value={draft.movement_pattern}
                onChange={(event) => setDraft({ ...draft, movement_pattern: event.target.value })}
              />
            </FormField>
            <FormField
              label="نوع حرکت"
              htmlFor="exercise-mechanics"
              hint="مثلاً جلوپا تک‌مفصلی و اسکوات چندمفصلی است؛ در ترتیب و ترکیب حرکت‌ها اثر دارد."
            >
              <Select
                id="exercise-mechanics"
                placeholder="انتخاب کنید"
                options={(taxonomy.mechanics ?? []).map((item) => ({
                  value: item.key,
                  label: item.name
                }))}
                value={draft.mechanics}
                onChange={(event) => setDraft({ ...draft, mechanics: event.target.value })}
              />
            </FormField>
            <FormField
              label="واحد اجرای حرکت"
              htmlFor="exercise-prescription-unit"
              hint="مثلاً پرس با تعداد تکرار و پلانک با ثانیه ثبت می‌شود."
            >
              <Select
                id="exercise-prescription-unit"
                options={(taxonomy.prescription_units ?? []).map((item) => ({
                  value: item.key,
                  label: item.name
                }))}
                value={draft.prescription_unit}
                onChange={(event) => setDraft({ ...draft, prescription_unit: event.target.value })}
              />
            </FormField>
            <div className={styles.fullField}>
              <strong>مفاصل درگیر</strong>
              <p>این انتخاب‌ها طبق قوانین محدودیت مربی در تولید برنامه استفاده می‌شوند.</p>
              {(taxonomy.joints ?? []).map((item) => (
                <Checkbox
                  key={item.key}
                  label={item.name}
                  checked={draft.joint_keys.includes(item.key)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      joint_keys: event.target.checked
                        ? [...draft.joint_keys, item.key]
                        : draft.joint_keys.filter((key) => key !== item.key)
                    })
                  }
                />
              ))}
              {!draft.movement_pattern || !draft.mechanics || !draft.joint_keys.length ? (
                <p role="status">
                  اطلاعات تصمیم‌ساز این حرکت کامل نیست؛ الگو، نوع حرکت و مفاصل را بررسی کنید.
                </p>
              ) : null}
            </div>
            <div className={styles.fullField}>
              <strong>سطح‌های مناسب</strong>
              {taxonomy.levels.map((level) => (
                <Checkbox
                  key={level.key}
                  checked={draft.levels.includes(level.key)}
                  label={level.name}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      levels: event.target.checked
                        ? [...draft.levels, level.key]
                        : draft.levels.filter((item) => item !== level.key)
                    })
                  }
                />
              ))}
            </div>
            <div className={styles.fullField}>
              <strong>تجهیزات</strong>
              {exerciseEquipmentOptions.map((equipment) => (
                <Checkbox
                  key={equipment.key}
                  checked={draft.equipment_keys.includes(equipment.key)}
                  label={equipment.name}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      equipment_keys: event.target.checked
                        ? [...draft.equipment_keys, equipment.key]
                        : draft.equipment_keys.filter((item) => item !== equipment.key)
                    })
                  }
                />
              ))}
            </div>
            <FormField label="منبع داده">
              <Input
                value={draft.source_document}
                onChange={(event) => setDraft({ ...draft, source_document: event.target.value })}
              />
            </FormField>
            <div className={styles.fullField}>
              {editingId ? (
                <ExerciseVideoManager
                  key={editingId}
                  exerciseId={editingId}
                  name={draft.name}
                  state={exercises.find((row) => row.id === editingId) || {}}
                  onChange={updateVideo}
                  onBusyChange={setVideoBusy}
                />
              ) : (
                <FormField
                  label="ویدئوی آموزش حرکت — اختیاری"
                  htmlFor="new-exercise-video"
                  hint="فقط ویدئوی اصلی؛ پوستر و پیش‌نمایش خودکار ساخته می‌شوند. حداکثر ۱۰۰ مگابایت و دو دقیقه."
                >
                  <Input
                    id="new-exercise-video"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    type="file"
                    disabled={isSavingExercise}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      const error = file ? validateExerciseVideo(file) : "";
                      setFeedback(error);
                      setNewVideoFile(error ? undefined : file);
                    }}
                  />
                  {isSavingExercise && newVideoFile ? (
                    <progress aria-label="پیشرفت ارسال ویدئو" max={100} value={newVideoProgress} />
                  ) : null}
                </FormField>
              )}
            </div>
            {(
              [
                ["execution", "اجرای درست"],
                ["tips", "نکات مهم"],
                ["mistakes", "اشتباهات رایج"]
              ] as const
            ).map(([key, label]) => (
              <FormField
                key={key}
                className={styles.fullField}
                label={label}
                htmlFor={`exercise-guide-${key}`}
                hint="برای شاگرد نمایش داده می‌شود؛ هر مورد را در یک خط بنویسید. پاک‌کردن متن این بخش، آموزش پیش‌فرض آن را هم پنهان می‌کند."
              >
                <Textarea
                  id={`exercise-guide-${key}`}
                  maxLength={4000}
                  value={draft.execution_guide[key] ?? draft.default_guide[key] ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      execution_guide: { ...draft.execution_guide, [key]: event.target.value }
                    })
                  }
                />
              </FormField>
            ))}
            <FormField label="اولویت">
              <Input
                min={0}
                type="number"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
              />
            </FormField>
            <FormField
              className={styles.fullField}
              label="توضیح مربی"
              htmlFor="exercise-coach-notes"
            >
              <Textarea
                id="exercise-coach-notes"
                value={draft.coach_notes}
                onChange={(event) => setDraft({ ...draft, coach_notes: event.target.value })}
              />
            </FormField>
            <Checkbox
              checked={draft.is_preferred}
              label="محبوب"
              onChange={(event) => setDraft({ ...draft, is_preferred: event.target.checked })}
            />
            <Checkbox
              checked={draft.is_prohibited}
              label="ممنوع"
              onChange={(event) => setDraft({ ...draft, is_prohibited: event.target.checked })}
            />
            <Switch
              checked={draft.is_active}
              label="فعال"
              onCheckedChange={(checked) => setDraft({ ...draft, is_active: checked })}
            />
          </div>
        </div>
      </EditorDrawer>
    </StackLike>
  );
}

function StackLike({ children }: { children: ReactNode }) {
  return <div className={styles.pageStack}>{children}</div>;
}
