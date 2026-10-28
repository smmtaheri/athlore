import { useEffect, useMemo, useState } from "react";
import { GenerationVolumeFields } from "../components/GenerationVolumeFields";
import { FileDown, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Skeleton,
  Switch,
  Tabs
} from "../../../components/ui";
import { ApiError, firstFieldError, persianMessageForApiError } from "../../../shared/api/errors";
import { downloadCoachRulesPdf } from "../../../shared/api/exportPdf";
import styles from "../../programs/components/programFlow.module.css";
import { NutritionTemplatesSection } from "../components/NutritionTemplatesSection";
import { StructuredCatalogSection } from "../components/StructuredCatalogSection";
import { VisitFormTemplatesSection } from "../components/VisitFormTemplatesSection";
import { SupplementCatalogSection } from "../components/SupplementCatalogSection";
import { TrainingSystemsSection } from "../components/TrainingSystemsSection";
import { ProgramTemplateEditor } from "../components/ProgramTemplateEditor";
import { ExerciseNamePicker } from "../components/ExerciseNamePicker";
import { validateTemplatePlans } from "../services/templatePlans";
import {
  coachRulesRepository,
  cloneCoachRules,
  type CoachRulesRepository
} from "../services/coachRulesRepository";
import {
  nutritionSupplementTemplatesRepository,
  type NutritionSupplementTemplatesRepository
} from "../services/nutritionSupplementTemplatesRepository";
import type { CoachRuleSection, CoachRules, InjuryRule, LevelRule } from "../types/coachRules";

const sectionLabels: Record<CoachRuleSection, string> = {
  visitForms: "فرم‌های ویزیت",
  exercises: "کاتالوگ حرکات",
  trainingSystems: "سیستم‌های تمرینی",
  injuries: "آسیب ها و محدودیت ها",
  levels: "قوانین تولید برنامه",
  nutritionTemplates: "تغذیه و مکمل",
  supplementTemplates: "بانک مکمل‌ها",
  templates: "قالب های برنامه"
};

const sectionOrder: CoachRuleSection[] = [
  "levels",
  "exercises",
  "trainingSystems",
  "nutritionTemplates",
  "visitForms"
];

const levelOptions = [
  { label: "مبتدی", value: "beginner" },
  { label: "نیمه‌حرفه‌ای", value: "intermediate" },
  { label: "حرفه‌ای", value: "advanced" }
];

export interface CoachRulesPageProps {
  repository?: CoachRulesRepository;
  templatesRepository?: NutritionSupplementTemplatesRepository;
}

export function CoachRulesPage({
  repository = coachRulesRepository,
  templatesRepository = nutritionSupplementTemplatesRepository
}: CoachRulesPageProps) {
  const [rules, setRules] = useState<CoachRules>();
  const [feedback, setFeedback] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "saving">("loading");
  const [searchParams, setSearchParams] = useSearchParams();
  const section = getSection(searchParams.get("section"));
  const independentSection = [
    "exercises",
    "trainingSystems",
    "visitForms",
    "supplementTemplates"
  ].includes(section);
  const needsRules = !independentSection && !rules;

  useEffect(() => {
    if (!needsRules) return;
    let isMounted = true;
    repository
      .get()
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setRules(data);
        setRulesDirty(false);
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
  }, [repository, requestKey, needsRules]);

  const tabItems = useMemo(
    () =>
      sectionOrder.map((item) => ({
        id: item,
        label: sectionLabels[item]
      })),
    []
  );

  const updateRules = (updater: (rules: CoachRules) => CoachRules) => {
    setRulesDirty(true);
    setRules((current) => (current ? updater(cloneCoachRules(current)) : current));
  };

  const saveRules = async () => {
    if (!rules) {
      return;
    }

    const templateError = validateTemplatePlans(rules.templates);
    if (templateError) {
      setFeedback(templateError);
      return;
    }

    setStatus("saving");
    setFeedback("");

    try {
      const savedRules = await repository.save(rules);
      setRules(savedRules);
      setRulesDirty(false);
      setStatus("loaded");
      setFeedback("قوانین مربی ذخیره شد.");
    } catch (error) {
      setStatus("loaded");
      setFeedback(
        error instanceof ApiError
          ? (firstFieldError(
              error,
              "generation_rules",
              "execution_plan",
              "training_systems",
              "templates"
            ) ?? persianMessageForApiError(error))
          : "ذخیره قوانین انجام نشد. دوباره تلاش کنید."
      );
    }
  };

  const resetRules = async () => {
    setStatus("saving");
    setFeedback("");

    try {
      const nextRules = await repository.get();
      setRules(nextRules);
      setRulesDirty(false);
      setStatus("loaded");
      setFeedback("آخرین قوانین ذخیره‌شده دوباره دریافت شد.");
      setConfirmReset(false);
    } catch {
      setStatus("loaded");
      setFeedback("دریافت دوبارهٔ قوانین انجام نشد.");
    }
  };

  const exportRulesPdf = async () => {
    setExportingPdf(true);
    setFeedback("");
    try {
      await downloadCoachRulesPdf();
      setFeedback("خروجی PDF قوانین مربی آماده شد.");
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? persianMessageForApiError(error) : "خروجی PDF قوانین انجام نشد."
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className={styles.toolbarActions}>
            <Button
              disabled={exportingPdf || (!independentSection && status === "loading")}
              iconStart={<FileDown size={18} />}
              isLoading={exportingPdf}
              onClick={exportRulesPdf}
              variant="secondary"
            >
              خروجی PDF قوانین مربی
            </Button>
            {!independentSection ? (
              <Button
                iconStart={<RefreshCcw size={18} />}
                onClick={() => setConfirmReset(true)}
                variant="secondary"
              >
                دریافت دوباره
              </Button>
            ) : null}
            {!independentSection && !rulesDirty ? (
              <Button
                iconStart={<Save size={18} />}
                isLoading={status === "saving"}
                onClick={saveRules}
              >
                ذخیره قوانین
              </Button>
            ) : null}
          </div>
        }
        breadcrumb={["داشبورد", "قوانین مربی"]}
        description="یک محل برای قوانین تولید، حرکات، سیستم‌های تمرینی و فرم ویزیت"
        title="قوانین و سبک برنامه نویسی مربی"
      />

      <ContentSection>
        {!independentSection && status === "loading" ? <RulesLoading /> : null}
        {!independentSection && status === "error" ? (
          <Card padding="lg">
            <EmptyState
              action={
                <Button
                  iconStart={<RefreshCcw size={18} />}
                  onClick={() => {
                    setStatus("loading");
                    setRequestKey((current) => current + 1);
                  }}
                  variant="secondary"
                >
                  تلاش دوباره
                </Button>
              }
              description="دریافت قوانین مربی با خطا روبه رو شد."
              title="خطای دریافت قوانین"
            />
          </Card>
        ) : null}

        {independentSection || (rules && status !== "loading" && status !== "error") ? (
          <Stack gap="20px">
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

            <Card>
              <Tabs
                ariaLabel="بخش های قوانین مربی"
                items={tabItems}
                onChange={(nextSection) => setSearchParams({ section: nextSection })}
                renderPanels={false}
                value={section}
              />
            </Card>

            {section === "exercises" ? (
              <StructuredCatalogSection />
            ) : section === "trainingSystems" ? (
              <TrainingSystemsSection />
            ) : section === "visitForms" ? (
              <VisitFormTemplatesSection />
            ) : section === "supplementTemplates" ? (
              <SupplementCatalogSection />
            ) : rules ? (
              <RulesSection
                rules={rules}
                section={section}
                templatesRepository={templatesRepository}
                updateRules={updateRules}
              />
            ) : null}
          </Stack>
        ) : null}
      </ContentSection>

      {rules && rulesDirty && status !== "saving" ? (
        <div className={styles.rulesStickySave} role="status">
          <span>تغییرات قوانین ذخیره نشده‌اند.</span>
          <Button iconStart={<Save size={17} />} onClick={() => void saveRules()}>
            ذخیره قوانین
          </Button>
        </div>
      ) : null}

      <Modal
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)} variant="secondary">
              انصراف
            </Button>
            <Button
              iconStart={<RefreshCcw size={18} />}
              isLoading={status === "saving"}
              onClick={resetRules}
              variant="danger"
            >
              دریافت آخرین نسخه
            </Button>
          </>
        }
        onClose={() => setConfirmReset(false)}
        open={confirmReset}
        title="دریافت دوبارهٔ قوانین"
      >
        تغییرات ذخیره‌نشده کنار گذاشته می‌شود و آخرین نسخهٔ ذخیره‌شده دریافت می‌شود. اطلاعات سرور
        حذف یا بازنشانی نمی‌شود.
      </Modal>
    </PageContainer>
  );
}

function RulesLoading() {
  return (
    <Card aria-label="در حال بارگذاری قوانین مربی">
      <Stack>
        <Skeleton height={56} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </Stack>
    </Card>
  );
}

interface RulesSectionProps {
  rules: CoachRules;
  section: CoachRuleSection;
  templatesRepository: NutritionSupplementTemplatesRepository;
  updateRules: (updater: (rules: CoachRules) => CoachRules) => void;
}

type RulesEditorProps = Omit<RulesSectionProps, "section" | "templatesRepository">;

function RulesSection({ rules, section, templatesRepository, updateRules }: RulesSectionProps) {
  if (section === "templates") {
    return <ProgramTemplateEditor rules={rules} updateRules={updateRules} />;
  }
  if (section === "levels") {
    return (
      <Stack gap="20px">
        <GenerationPolicyEditor rules={rules} updateRules={updateRules} />
        <details>
          <summary>محدودیت‌های هر سطح</summary>
          <LevelRules rules={rules} updateRules={updateRules} />
        </details>
        <details>
          <summary>آسیب‌ها و محدودیت‌های ایمنی</summary>
          <InjuryRules rules={rules} updateRules={updateRules} />
        </details>
        <details>
          <summary>قالب دقیق برنامه (اختیاری)</summary>
          <ProgramTemplateEditor rules={rules} updateRules={updateRules} />
        </details>
      </Stack>
    );
  }
  if (section === "injuries") {
    return <InjuryRules rules={rules} updateRules={updateRules} />;
  }
  if (section === "exercises") {
    return <StructuredCatalogSection />;
  }
  if (section === "trainingSystems") {
    return <TrainingSystemsSection />;
  }
  if (section === "nutritionTemplates") {
    return (
      <Stack gap="20px">
        <NutritionTemplatesSection
          onTemplatesChange={(nutritionTemplates) =>
            updateRules((next) => ({ ...next, nutritionTemplates }))
          }
          repository={templatesRepository}
          templates={rules.nutritionTemplates}
        />
        <SupplementCatalogSection />
      </Stack>
    );
  }
  if (section === "visitForms") {
    return <VisitFormTemplatesSection />;
  }
  if (section === "supplementTemplates") {
    return <SupplementCatalogSection />;
  }
  return null;
}

function GenerationPolicyEditor({ rules, updateRules }: RulesEditorProps) {
  const policy = rules.generationRules;
  if (!policy) return null;
  const change = (values: Partial<typeof policy>) =>
    updateRules((next) => ({ ...next, generationRules: { ...policy, ...values } }));
  const fields = [
    ["sets", "ست پایه برای تقسیم حجم بین حرکت‌ها", 2, 5],
    ["reps_min", "حداقل تکرار", 1, 30],
    ["reps_max", "حداکثر تکرار", 1, 30],
    ["rest_seconds", "استراحت بین ست‌ها (ثانیه)", 30, 300],
    ["rir", "تکرار ذخیره (RIR)", 1, 5],
    ["warmup_minutes", "زمان گرم‌کردن (دقیقه)", 0, 20]
  ] as const;
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        title="قوانین اجرایی تولید خودکار"
        description="این اعداد مستقیماً دوز تمرین و سقف زمان را تعیین می‌کنند. سیستم تمرینی انتخاب‌شده می‌تواند روش اجرای حرکت را تغییر دهد؛ ایمنی همیشه مقدم است."
      />
      <div className={styles.threeColumnGrid}>
        {fields.map(([key, label, min, max]) => (
          <FormField key={key} label={label}>
            <Input
              type="number"
              min={min}
              max={max}
              value={policy[key]}
              onChange={(event) => change({ [key]: Number(event.target.value) })}
            />
          </FormField>
        ))}
      </div>
      <GenerationVolumeFields value={policy} onChange={change} />
      <Switch
        checked={policy.progression === "double_progression"}
        onCheckedChange={(checked) =>
          change({ progression: checked ? "double_progression" : "maintain" })
        }
        label="پیشرفت دوگانه: ابتدا افزایش تکرار، سپس وزنه با حفظ فرم و RIR"
      />
    </Card>
  );
}

function LevelRules({ rules, updateRules }: RulesEditorProps) {
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="این بخش فقط حرکات ممنوع در هر سطح را مشخص می‌کند. سیستم تمرینی را مربی در ویزیت انتخاب می‌کند؛ ست، تکرار، استراحت و پیشرفت از قوانین عددی بالا می‌آیند."
        title="قوانین سطح تمرین"
      />
      <div className={styles.threeColumnGrid}>
        {rules.levels.map((rule) => (
          <EditableLevelRule
            key={rule.id}
            rule={rule}
            onChange={(nextRule) =>
              updateRules((next) => ({
                ...next,
                levels: next.levels.map((item) => (item.id === nextRule.id ? nextRule : item))
              }))
            }
          />
        ))}
      </div>
    </Card>
  );
}

function EditableLevelRule({
  onChange,
  rule
}: {
  onChange: (rule: LevelRule) => void;
  rule: LevelRule;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <h3 className={styles.ruleCardTitle}>
        {levelOptions.find((item) => item.value === rule.id)?.label}
      </h3>
      <ExerciseNamePicker
        label="حرکات ممنوع در این سطح"
        onChange={(forbiddenExercises) => onChange({ ...rule, forbiddenExercises })}
        value={rule.forbiddenExercises}
      />
    </Card>
  );
}

function InjuryRules({ rules, updateRules }: RulesEditorProps) {
  const addRule = () =>
    updateRules((next) => ({
      ...next,
      injuries: [
        {
          alternatives: [],
          forbiddenExercises: [],
          id: `injury-${Date.now()}`,
          isActive: true,
          name: "آسیب جدید",
          notes: ""
        },
        ...next.injuries
      ]
    }));

  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        action={
          <Button iconStart={<Plus size={18} />} onClick={addRule}>
            افزودن قانون آسیب
          </Button>
        }
        description="این قانون فقط وقتی اعمال می‌شود که نام آسیب با نوع آسیب ثبت‌شده برای شاگرد هم‌خوان باشد. حرکات و جایگزین‌ها باید از کاتالوگ فعال انتخاب شوند."
        title="آسیب ها و محدودیت ها"
      />
      <div className={styles.cardGrid}>
        {rules.injuries.map((rule) => (
          <EditableInjuryRule
            key={rule.id}
            rule={rule}
            onChange={(nextRule) =>
              updateRules((next) => ({
                ...next,
                injuries: next.injuries.map((item) => (item.id === nextRule.id ? nextRule : item))
              }))
            }
            onRemove={() =>
              updateRules((next) => ({
                ...next,
                injuries: next.injuries.filter((item) => item.id !== rule.id)
              }))
            }
          />
        ))}
      </div>
    </Card>
  );
}

function EditableInjuryRule({
  onChange,
  onRemove,
  rule
}: {
  onChange: (rule: InjuryRule) => void;
  onRemove: () => void;
  rule: InjuryRule;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <div className={styles.ruleCardHeader}>
        <Switch
          checked={rule.isActive}
          label="فعال"
          onCheckedChange={(checked) => onChange({ ...rule, isActive: checked })}
        />
        <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
          حذف
        </Button>
      </div>
      <FormField
        hint="این عبارت با نوع آسیب ثبت‌شده در پروفایل یا ویزیت شاگرد تطبیق داده می‌شود؛ مثلاً «گردن درد»."
        label="نام / عبارت آسیب"
      >
        <Input
          value={rule.name}
          onChange={(event) => onChange({ ...rule, name: event.target.value })}
        />
      </FormField>
      <ExerciseNamePicker
        label="حرکات ممنوع برای این آسیب"
        onChange={(forbiddenExercises) => onChange({ ...rule, forbiddenExercises })}
        value={rule.forbiddenExercises}
      />
      <ExerciseNamePicker
        label="جایگزین‌های مجاز"
        onChange={(alternatives) => onChange({ ...rule, alternatives })}
        value={rule.alternatives}
      />
    </Card>
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

function getSection(value: string | null): CoachRuleSection {
  if (value === "assessment") {
    return "visitForms";
  }
  return sectionOrder.includes(value as CoachRuleSection) ? (value as CoachRuleSection) : "levels";
}
