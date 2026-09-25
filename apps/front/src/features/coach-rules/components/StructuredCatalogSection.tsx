import { useEffect, useMemo, useState } from "react";
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
import styles from "../../programs/components/programFlow.module.css";

type TaxonomyMuscle = {
  key: string;
  name: string;
  regions: Array<{ key: string; name: string }>;
};

type Taxonomy = {
  equipment: Array<{ key: string; name: string }>;
  levels: Array<{ key: string; name: string }>;
  muscles: TaxonomyMuscle[];
};

type ExerciseTarget = {
  muscle_key: string;
  region_key?: string | null;
  role: "primary" | "secondary";
};

type CatalogExercise = {
  id: string;
  name: string;
  name_en: string;
  aliases: string[];
  targets: ExerciseTarget[];
  levels: string[];
  equipment_keys: string[];
  movement_pattern: string;
  source_document: string;
  coach_notes: string;
  is_active: boolean;
  is_archived: boolean;
  is_preferred: boolean;
  is_prohibited: boolean;
  priority: number;
};

type Technique = {
  id: string | null;
  key: string;
  name: string;
  description: string;
  execution_method: string;
  allowed_levels: string[];
  max_per_session: number;
  parameters: Record<string, unknown>;
  enabled: boolean;
  source: "platform" | "coach_override" | "coach_private";
  base_technique_key: string | null;
  handler_key?: string;
  handler_status: "implemented" | "manual_only";
  parameter_schema?: Record<string, unknown>;
  public_definition?: { parameter_schema?: Record<string, unknown> } | null;
};

const pairingModeOptions = [
  { value: "same_muscle_isolation", label: "ایزوله‌های هم‌عضله" },
  { value: "same_muscle", label: "حرکات هم‌عضله" },
  { value: "antagonist", label: "عضلات مخالف" },
  { value: "any_eligible", label: "هر دو حرکت مجاز" }
];

function techniqueHandler(technique: Technique) {
  return technique.handler_key || technique.base_technique_key || "";
}

function defaultTechniqueParameters(handler: string): Record<string, unknown> {
  if (handler === "superset") {
    return {
      pairing_mode: "same_muscle_isolation",
      max_pairs: 1,
      allow_compound: false,
      rest_between_exercises_seconds: 0,
      rest_after_pair_seconds: 90
    };
  }
  if (handler === "drop_set") {
    return { drops: 1, reduction_percent: 20 };
  }
  return {};
}

function techniqueParameters(technique: Technique) {
  if (Object.keys(technique.parameters || {}).length > 0) {
    return technique.parameters;
  }
  const schema = technique.parameter_schema || technique.public_definition?.parameter_schema;
  if (schema) {
    return Object.fromEntries(
      Object.entries(schema).flatMap(([key, value]) =>
        value && typeof value === "object" && "default" in value
          ? [[key, (value as { default: unknown }).default]]
          : []
      )
    );
  }
  return defaultTechniqueParameters(techniqueHandler(technique));
}

function techniqueLogic(technique: Technique) {
  const handler = techniqueHandler(technique);
  const params = techniqueParameters(technique);
  if (handler === "superset") {
    const pairing =
      pairingModeOptions.find((option) => option.value === params.pairing_mode)?.label ||
      "تعریف نشده";
    return `جفت‌سازی: ${pairing} · حداکثر جفت: ${String(params.max_pairs ?? 1)} · استراحت بعد از جفت: ${String(params.rest_after_pair_seconds ?? 90)} ثانیه`;
  }
  if (handler === "drop_set") {
    return `${String(params.drops ?? 1)} دراپ · کاهش ${String(params.reduction_percent ?? 20)}٪`;
  }
  return "بدون handler خودکار";
}

type SecondaryTarget = { muscle_key: string; region_key: string };

type ExerciseDraft = {
  name: string;
  name_en: string;
  aliases: string;
  primary_muscle: string;
  primary_region: string;
  secondary_targets: SecondaryTarget[];
  secondary_muscle: string;
  secondary_region: string;
  levels: string[];
  equipment_keys: string[];
  movement_pattern: string;
  source_document: string;
  coach_notes: string;
  is_preferred: boolean;
  is_prohibited: boolean;
  priority: number;
  is_active: boolean;
};

const emptyDraft: ExerciseDraft = {
  name: "",
  name_en: "",
  aliases: "",
  primary_muscle: "",
  primary_region: "",
  secondary_targets: [],
  secondary_muscle: "",
  secondary_region: "",
  levels: [],
  equipment_keys: [],
  movement_pattern: "",
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

function exerciseFromRow(row: CatalogExercise, taxonomy: Taxonomy): ExerciseDraft {
  const primary = row.targets.find((target) => target.role === "primary");
  const secondary = row.targets.filter((target) => target.role === "secondary");
  return {
    ...emptyDraft,
    aliases: row.aliases.join(", "),
    coach_notes: row.coach_notes,
    equipment_keys: row.equipment_keys,
    is_active: row.is_active,
    is_preferred: row.is_preferred,
    is_prohibited: row.is_prohibited,
    levels: row.levels,
    movement_pattern: row.movement_pattern,
    name: row.name,
    name_en: row.name_en,
    priority: row.priority,
    primary_muscle: primary?.muscle_key || taxonomy.muscles[0]?.key || "",
    primary_region: primary?.region_key || "",
    secondary_targets: secondary.map((target) => ({
      muscle_key: target.muscle_key,
      region_key: target.region_key || ""
    })),
    source_document: row.source_document,
    secondary_muscle: "",
    secondary_region: ""
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
    source_document: draft.source_document,
    coach_notes: draft.coach_notes,
    is_preferred: draft.is_preferred,
    is_prohibited: draft.is_prohibited,
    priority: draft.priority,
    is_active: draft.is_active
  };
}

export function StructuredCatalogSection() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy>();
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string>();
  const [techniqueDraft, setTechniqueDraft] = useState<Technique>();
  const [techniqueBaseline, setTechniqueBaseline] = useState<Technique>();
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false);
  const [exerciseBaseline, setExerciseBaseline] = useState<ExerciseDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ equipment: "", level: "", muscle: "", region: "" });
  const [feedback, setFeedback] = useState("");

  const load = async () => {
    return Promise.all([
      apiRequest<Taxonomy>("/exercise-taxonomy/"),
      apiRequest<{ results?: CatalogExercise[] }>("/exercises/", { query: { limit: 100 } }),
      apiRequest<Technique[]>("/training-techniques/")
    ]);
  };

  useEffect(() => {
    void load()
      .then(([taxonomyDto, exerciseDto, techniqueDto]) => {
        setTaxonomy(taxonomyDto);
        setExercises(exerciseDto.results || []);
        setTechniques(techniqueDto);
      })
      .catch(() => setFeedback("دریافت کاتالوگ انجام نشد."));
  }, []);

  const visibleExercises = useMemo(
    () =>
      exercises.filter((exercise) => {
        const haystack = [exercise.name, exercise.name_en, ...exercise.aliases]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !search || haystack.includes(search.toLowerCase());
        const matchesMuscle =
          !filters.muscle ||
          exercise.targets.some((target) => target.muscle_key === filters.muscle);
        const matchesRegion =
          !filters.region ||
          exercise.targets.some((target) => target.region_key === filters.region);
        const matchesLevel = !filters.level || exercise.levels.includes(filters.level);
        const matchesEquipment =
          !filters.equipment || exercise.equipment_keys.includes(filters.equipment);
        return matchesSearch && matchesMuscle && matchesRegion && matchesLevel && matchesEquipment;
      }),
    [exercises, filters, search]
  );

  if (!taxonomy) {
    return (
      <Card>
        <EmptyState description="در حال دریافت taxonomy کاتالوگ..." title="کاتالوگ حرکات" />
      </Card>
    );
  }

  const muscleOptions = taxonomy.muscles.map((muscle) => ({
    label: muscle.name,
    value: muscle.key
  }));
  const regionOptions = taxonomy.muscles.flatMap((muscle) =>
    muscle.regions.map((region) => ({
      label: `${muscle.name} / ${region.name}`,
      value: region.key
    }))
  );

  const saveExercise = async () => {
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
      setDraft(emptyDraft);
      setEditingId(undefined);
      setExerciseEditorOpen(false);
      setFeedback("حرکت ذخیره شد.");
    } catch {
      setFeedback("ذخیره حرکت انجام نشد؛ اطلاعات ساختاریافته را بررسی کنید.");
    }
  };

  const archiveExercise = async (id: string) => {
    try {
      await apiRequest(`/exercises/${id}/`, { method: "DELETE" });
      setExercises((current) => current.filter((item) => item.id !== id));
      setFeedback("حرکت آرشیو شد.");
    } catch {
      setFeedback("آرشیو حرکت انجام نشد.");
    }
  };

  const addSecondaryTarget = () => {
    if (!draft.secondary_muscle) return;
    setDraft((current) => ({
      ...current,
      secondary_muscle: "",
      secondary_region: "",
      secondary_targets: [
        ...current.secondary_targets,
        { muscle_key: current.secondary_muscle, region_key: current.secondary_region }
      ]
    }));
  };

  const startNewExercise = () => {
    setDraft(emptyDraft);
    setEditingId(undefined);
    setExerciseBaseline(emptyDraft);
    setExerciseEditorOpen(true);
  };

  const startEditingExercise = (row: CatalogExercise) => {
    const nextDraft = exerciseFromRow(row, taxonomy);
    setEditingId(row.id);
    setDraft(nextDraft);
    setExerciseBaseline(nextDraft);
    setExerciseEditorOpen(true);
  };

  const closeExerciseEditor = () => {
    setExerciseEditorOpen(false);
    setEditingId(undefined);
    setDraft(emptyDraft);
  };

  const startEditingTechnique = (row: Technique) => {
    const nextDraft = { ...row, parameters: techniqueParameters(row) };
    setTechniqueBaseline(nextDraft);
    setTechniqueDraft(nextDraft);
  };

  const closeTechniqueEditor = () => {
    setTechniqueDraft(undefined);
    setTechniqueBaseline(undefined);
  };

  const saveTechnique = async () => {
    if (!techniqueDraft) return;
    const payload = {
      key: techniqueDraft.key,
      name: techniqueDraft.name,
      description: techniqueDraft.description,
      execution_method: techniqueDraft.execution_method,
      allowed_levels: techniqueDraft.allowed_levels,
      max_per_session: techniqueDraft.max_per_session,
      parameters: techniqueDraft.parameters,
      enabled: techniqueDraft.enabled,
      base_technique_key: techniqueDraft.base_technique_key
    };
    try {
      const dto = await apiRequest<Technique>(
        techniqueDraft.id ? `/training-techniques/${techniqueDraft.id}/` : "/training-techniques/",
        {
          body: payload,
          method: techniqueDraft.id ? "PATCH" : "POST"
        }
      );
      setTechniques((current) => {
        const exists = current.some((item) => item.id === dto.id);
        return exists
          ? current.map((item) => (item.id === dto.id ? dto : item))
          : [...current, dto];
      });
      closeTechniqueEditor();
      setFeedback("تنظیم تکنیک ذخیره شد.");
    } catch {
      setFeedback("ذخیره تکنیک انجام نشد.");
    }
  };

  const deleteTechnique = async (id: string) => {
    try {
      await apiRequest(`/training-techniques/${id}/`, { method: "DELETE" });
      setTechniques((current) => current.filter((item) => item.id !== id));
      closeTechniqueEditor();
      setFeedback("تکنیک اختصاصی حذف شد.");
    } catch {
      setFeedback("حذف تکنیک انجام نشد.");
    }
  };

  const startNewTechnique = () => {
    const nextDraft: Technique = {
      id: null,
      key: "custom-technique",
      name: "",
      description: "",
      execution_method: "",
      allowed_levels: [],
      max_per_session: 0,
      parameters: {},
      enabled: true,
      source: "coach_private",
      base_technique_key: null,
      handler_status: "manual_only"
    };
    setTechniqueBaseline(nextDraft);
    setTechniqueDraft(nextDraft);
  };

  return (
    <StackLike>
      <Card className={styles.pageStack}>
        <div className={styles.ruleCardHeader}>
          <div>
            <h2 className={styles.ruleCardTitle}>کاتالوگ حرکات</h2>
            <p>حرکت‌ها با عضله، ناحیه، سطح و تجهیزات ساختاریافته در generator استفاده می‌شوند.</p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={startNewExercise}>
            حرکت جدید
          </Button>
        </div>
        <div className={styles.formGrid}>
          <FormField label="جست‌وجو">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="نام یا نام جایگزین"
            />
          </FormField>
          <FormField label="فیلتر عضله">
            <Select
              options={muscleOptions}
              value={filters.muscle}
              onChange={(event) => setFilters({ ...filters, muscle: event.target.value })}
              placeholder="همه"
            />
          </FormField>
          <FormField label="فیلتر ناحیه">
            <Select
              options={regionOptions}
              value={filters.region}
              onChange={(event) => setFilters({ ...filters, region: event.target.value })}
              placeholder="همه"
            />
          </FormField>
          <FormField label="فیلتر سطح">
            <Select
              options={taxonomy.levels.map((level) => ({ label: level.name, value: level.key }))}
              value={filters.level}
              onChange={(event) => setFilters({ ...filters, level: event.target.value })}
              placeholder="همه"
            />
          </FormField>
          <FormField label="فیلتر تجهیزات">
            <Select
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
                        `${target.role === "primary" ? "اصلی" : "فرعی"}: ${target.muscle_key}${target.region_key ? ` / ${target.region_key}` : ""}`
                    )
                    .join(" | ")
              },
              { id: "levels", header: "سطح", cell: (row) => row.levels.join("، ") || "ثبت نشده" },
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
                        `${target.role === "primary" ? "اصلی" : "فرعی"} ${target.muscle_key}${target.region_key ? ` / ${target.region_key}` : ""}`
                    )
                    .join(" · ")}
                </span>
                <span>سطح: {row.levels.join("، ") || "ثبت نشده"}</span>
                <span>تجهیزات: {row.equipment_keys.join("، ") || "ثبت نشده"}</span>
              </div>
              <div className={styles.mobileCatalogActions}>
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
      </Card>

      <EditorDrawer
        footer={(requestClose) => (
          <>
            <Button iconStart={<Save size={17} />} onClick={() => void saveExercise()}>
              ذخیره حرکت
            </Button>
            <Button onClick={requestClose} variant="secondary">
              انصراف
            </Button>
          </>
        )}
        hasUnsavedChanges={JSON.stringify(draft) !== JSON.stringify(exerciseBaseline)}
        onClose={closeExerciseEditor}
        open={exerciseEditorOpen}
        title={editingId ? "ویرایش حرکت" : "حرکت جدید"}
      >
        <div className={styles.pageStack}>
          {feedback && exerciseEditorOpen ? <div role="status">{feedback}</div> : null}
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
            <FormField label="عضله اصلی" required>
              <Select
                options={muscleOptions}
                value={draft.primary_muscle}
                onChange={(event) =>
                  setDraft({ ...draft, primary_muscle: event.target.value, primary_region: "" })
                }
                placeholder="انتخاب کنید"
              />
            </FormField>
            <FormField label="ناحیه عضله اصلی">
              <Select
                options={(
                  taxonomy.muscles.find((muscle) => muscle.key === draft.primary_muscle)?.regions ||
                  []
                ).map((region) => ({ label: region.name, value: region.key }))}
                value={draft.primary_region}
                onChange={(event) => setDraft({ ...draft, primary_region: event.target.value })}
                placeholder="بدون ناحیه"
              />
            </FormField>
            <FormField label="عضله فرعی">
              <Select
                options={muscleOptions}
                value={draft.secondary_muscle}
                onChange={(event) =>
                  setDraft({ ...draft, secondary_muscle: event.target.value, secondary_region: "" })
                }
                placeholder="انتخاب عضله"
              />
            </FormField>
            <FormField label="ناحیه فرعی">
              <Select
                options={(
                  taxonomy.muscles.find((muscle) => muscle.key === draft.secondary_muscle)
                    ?.regions || []
                ).map((region) => ({ label: region.name, value: region.key }))}
                value={draft.secondary_region}
                onChange={(event) => setDraft({ ...draft, secondary_region: event.target.value })}
                placeholder="بدون ناحیه"
              />
            </FormField>
            <div>
              <Button size="sm" variant="secondary" onClick={addSecondaryTarget}>
                افزودن عضله فرعی
              </Button>
              <div>
                {draft.secondary_targets.map((target) => (
                  <StatusBadge key={`${target.muscle_key}-${target.region_key}`}>
                    {target.muscle_key}
                    {target.region_key ? ` / ${target.region_key}` : ""}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <FormField className={styles.fullField} label="الگو">
              <Input
                value={draft.movement_pattern}
                onChange={(event) => setDraft({ ...draft, movement_pattern: event.target.value })}
              />
            </FormField>
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
              {taxonomy.equipment.map((equipment) => (
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
            <FormField label="اولویت">
              <Input
                min={0}
                type="number"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
              />
            </FormField>
            <FormField className={styles.fullField} label="توضیح مربی">
              <Textarea
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

      <TechniquesSection
        techniques={techniques}
        onEdit={startEditingTechnique}
        onDelete={(id) => void deleteTechnique(id)}
        onCreate={startNewTechnique}
      />
      {techniqueDraft ? (
        <EditorDrawer
          footer={(requestClose) => (
            <>
              <Button iconStart={<Save size={17} />} onClick={() => void saveTechnique()}>
                ذخیره تکنیک
              </Button>
              <Button onClick={requestClose} variant="secondary">
                انصراف
              </Button>
            </>
          )}
          hasUnsavedChanges={JSON.stringify(techniqueDraft) !== JSON.stringify(techniqueBaseline)}
          onClose={closeTechniqueEditor}
          open
          title={
            techniqueDraft.base_technique_key
              ? "تنظیم تکنیک عمومی"
              : techniqueDraft.id
                ? "ویرایش تکنیک"
                : "تکنیک خصوصی جدید"
          }
        >
          {feedback ? (
            <div className={styles.alertError} role="status">
              {feedback}
            </div>
          ) : null}
          <TechniqueEditor
            draft={techniqueDraft}
            levels={taxonomy.levels}
            publicTechniques={techniques.filter((item) => item.source === "platform")}
            onChange={setTechniqueDraft}
          />
        </EditorDrawer>
      ) : null}
      {feedback ? <div role="status">{feedback}</div> : null}
    </StackLike>
  );
}

function TechniquesSection({
  techniques,
  onCreate,
  onEdit,
  onDelete
}: {
  techniques: Technique[];
  onCreate: () => void;
  onEdit: (technique: Technique) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className={styles.pageStack}>
      <div className={styles.ruleCardHeader}>
        <div>
          <h2 className={styles.ruleCardTitle}>تکنیک‌های تمرینی</h2>
          <p>
            منطق اجرایی عمومی اینجا دیده می‌شود. با «تنظیم برای من» پارامترهای خودت را تعریف کن؛
            تکنیک بدون handler فقط ذخیره می‌شود.
          </p>
        </div>
        <Button iconStart={<Plus size={18} />} onClick={onCreate}>
          تکنیک خصوصی
        </Button>
      </div>
      <div className={styles.catalogTable}>
        <Table
          ariaLabel="تکنیک‌های تمرینی"
          data={techniques}
          getRowKey={(row) => row.id || row.key}
          columns={[
            {
              id: "name",
              header: "تکنیک",
              cell: (row) => (
                <>
                  <strong>{row.name}</strong>
                  <br />
                  <small>{row.key}</small>
                  <br />
                  <small>{row.description || "بدون توضیح"}</small>
                </>
              )
            },
            {
              id: "logic",
              header: "منطق فعلی",
              cell: (row) => <small>{techniqueLogic(row)}</small>
            },
            {
              id: "source",
              header: "منبع",
              cell: (row) =>
                row.source === "platform"
                  ? "عمومی"
                  : row.source === "coach_override"
                    ? "تنظیم مربی"
                    : "خصوصی مربی"
            },
            {
              id: "handler",
              header: "اجرا",
              cell: (row) => (
                <StatusBadge variant={row.handler_status === "implemented" ? "success" : "warning"}>
                  {row.handler_status === "implemented" ? "قابل اجرا" : "فقط ذخیره اطلاعات"}
                </StatusBadge>
              )
            },
            {
              id: "enabled",
              header: "وضعیت",
              cell: (row) =>
                row.source === "platform" ? "پیکربندی نشده" : row.enabled ? "فعال" : "غیرفعال"
            },
            {
              id: "action",
              header: "عملیات",
              cell: (row) =>
                row.source === "platform" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit({ ...row, name: row.name, base_technique_key: row.key })}
                  >
                    تنظیم برای من
                  </Button>
                ) : (
                  <div className={styles.actionIconGroup}>
                    <Button size="sm" variant="secondary" onClick={() => onEdit(row)}>
                      ویرایش
                    </Button>
                    {row.id ? (
                      <Button size="sm" variant="danger" onClick={() => onDelete(row.id as string)}>
                        حذف
                      </Button>
                    ) : null}
                  </div>
                )
            }
          ]}
        />
      </div>
      <div className={styles.mobileCatalogList}>
        {techniques.map((row) => (
          <article className={styles.mobileCatalogCard} key={row.id || row.key}>
            <div className={styles.mobileCatalogHeader}>
              <div>
                <strong>{row.name}</strong>
                <small>{row.key}</small>
              </div>
              <StatusBadge variant={row.handler_status === "implemented" ? "success" : "warning"}>
                {row.handler_status === "implemented" ? "قابل اجرا" : "فقط ذخیره اطلاعات"}
              </StatusBadge>
            </div>
            <div className={styles.mobileCatalogMeta}>
              <span>{techniqueLogic(row)}</span>
              <span>
                منبع:{" "}
                {row.source === "platform"
                  ? "عمومی"
                  : row.source === "coach_override"
                    ? "تنظیم مربی"
                    : "خصوصی مربی"}
              </span>
              <span>
                وضعیت:{" "}
                {row.source === "platform" ? "پیکربندی نشده" : row.enabled ? "فعال" : "غیرفعال"}
              </span>
            </div>
            <div className={styles.mobileCatalogActions}>
              {row.source === "platform" ? (
                <Button
                  fullWidth
                  onClick={() => onEdit({ ...row, name: row.name, base_technique_key: row.key })}
                  variant="secondary"
                >
                  تنظیم برای من
                </Button>
              ) : (
                <>
                  <Button fullWidth onClick={() => onEdit(row)} variant="secondary">
                    ویرایش
                  </Button>
                  {row.id ? (
                    <Button fullWidth onClick={() => onDelete(row.id as string)} variant="danger">
                      حذف
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function TechniqueEditor({
  draft,
  levels,
  publicTechniques,
  onChange
}: {
  draft: Technique;
  levels: Array<{ key: string; name: string }>;
  publicTechniques: Technique[];
  onChange: (draft: Technique) => void;
}) {
  const handler = techniqueHandler(draft);
  const setParameter = (key: string, value: unknown) =>
    onChange({ ...draft, parameters: { ...draft.parameters, [key]: value } });
  const selectHandler = (value: string) =>
    onChange({
      ...draft,
      base_technique_key: value || null,
      handler_key: value || undefined,
      handler_status: value ? "implemented" : "manual_only",
      parameters: defaultTechniqueParameters(value)
    });
  return (
    <Card className={styles.pageStack}>
      <h2 className={styles.ruleCardTitle}>
        {draft.base_technique_key ? "تنظیم تکنیک عمومی" : "تکنیک خصوصی جدید"}
      </h2>
      <div className={styles.formGrid}>
        <FormField label="کلید">
          <Input
            disabled={Boolean(draft.id || draft.base_technique_key)}
            value={draft.key}
            onChange={(event) => onChange({ ...draft, key: event.target.value })}
          />
        </FormField>
        <FormField label="نام">
          <Input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </FormField>
        <FormField label="نوع اجرای خودکار" hint="برای اجرای واقعی یک handler انتخاب کن">
          <Select
            disabled={Boolean(draft.base_technique_key)}
            options={[
              { value: "", label: "فقط ذخیره اطلاعات" },
              ...publicTechniques
                .filter((item) => item.handler_key)
                .map((item) => ({ value: item.key, label: `${item.name} · ${item.key}` }))
            ]}
            value={handler}
            onChange={(event) => selectHandler(event.target.value)}
            placeholder="انتخاب handler"
          />
        </FormField>
        <FormField className={styles.fullField} label="توضیح">
          <Textarea
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
          />
        </FormField>
        <FormField className={styles.fullField} label="روش اجرا">
          <Textarea
            value={draft.execution_method}
            onChange={(event) => onChange({ ...draft, execution_method: event.target.value })}
          />
        </FormField>
        <FormField label="حداکثر در هر جلسه">
          <Input
            min={0}
            type="number"
            value={draft.max_per_session}
            onChange={(event) =>
              onChange({ ...draft, max_per_session: Number(event.target.value) })
            }
          />
        </FormField>
        {handler === "superset" ? (
          <>
            <FormField label="روش جفت‌سازی">
              <Select
                options={pairingModeOptions}
                value={String(draft.parameters.pairing_mode || "same_muscle_isolation")}
                onChange={(event) => setParameter("pairing_mode", event.target.value)}
              />
            </FormField>
            <FormField label="حداکثر جفت در هر روز">
              <Input
                min={1}
                max={10}
                type="number"
                value={Number(draft.parameters.max_pairs || 1)}
                onChange={(event) => setParameter("max_pairs", Number(event.target.value))}
              />
            </FormField>
            <FormField label="استراحت بین دو حرکت (ثانیه)">
              <Input
                min={0}
                type="number"
                value={Number(draft.parameters.rest_between_exercises_seconds || 0)}
                onChange={(event) =>
                  setParameter("rest_between_exercises_seconds", Number(event.target.value))
                }
              />
            </FormField>
            <FormField label="استراحت بعد از جفت (ثانیه)">
              <Input
                min={0}
                type="number"
                value={Number(draft.parameters.rest_after_pair_seconds ?? 90)}
                onChange={(event) =>
                  setParameter("rest_after_pair_seconds", Number(event.target.value))
                }
              />
            </FormField>
            <Checkbox
              checked={Boolean(draft.parameters.allow_compound)}
              label="اجازه استفاده از حرکات ترکیبی"
              onChange={(event) => setParameter("allow_compound", event.target.checked)}
            />
          </>
        ) : null}
        {handler === "drop_set" ? (
          <>
            <FormField label="تعداد دراپ">
              <Input
                min={1}
                max={3}
                type="number"
                value={Number(draft.parameters.drops || 1)}
                onChange={(event) => setParameter("drops", Number(event.target.value))}
              />
            </FormField>
            <FormField label="درصد کاهش بار">
              <Input
                min={1}
                max={80}
                type="number"
                value={Number(draft.parameters.reduction_percent || 20)}
                onChange={(event) => setParameter("reduction_percent", Number(event.target.value))}
              />
            </FormField>
          </>
        ) : null}
        {!handler ? (
          <FormField className={styles.fullField} label="پارامترهای دستی (JSON)">
            <Textarea
              value={JSON.stringify(draft.parameters, null, 2)}
              onChange={(event) => {
                try {
                  onChange({ ...draft, parameters: JSON.parse(event.target.value) });
                } catch {
                  /* Keep the last valid object while typing. */
                }
              }}
            />
          </FormField>
        ) : null}
        {handler ? (
          <div className={styles.fullField}>
            <small>
              این handler در generator پیاده‌سازی شده است و پارامترهای بالا در evidence تولید برنامه
              ثبت می‌شوند.
            </small>
          </div>
        ) : null}
        <div className={styles.fullField}>
          <strong>سطح‌های مجاز؛ خالی یعنی همه</strong>
          {levels.map((level) => (
            <Checkbox
              key={level.key}
              checked={draft.allowed_levels.includes(level.key)}
              label={level.name}
              onChange={(event) =>
                onChange({
                  ...draft,
                  allowed_levels: event.target.checked
                    ? [...draft.allowed_levels, level.key]
                    : draft.allowed_levels.filter((item) => item !== level.key)
                })
              }
            />
          ))}
        </div>
        <Switch
          checked={draft.enabled}
          label="فعال"
          onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
        />
      </div>
    </Card>
  );
}

function StackLike({ children }: { children: ReactNode }) {
  return <div className={styles.pageStack}>{children}</div>;
}
