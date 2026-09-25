import { useEffect, useMemo, useState } from "react";
import { Copy, FileDown, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { ContentSection, PageContainer, PageHeader, Stack } from "../../../components/layout";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  Switch,
  Tabs,
  Textarea
} from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { downloadCoachRulesPdf } from "../../../shared/api/exportPdf";
import styles from "../../programs/components/programFlow.module.css";
import { NutritionTemplatesSection } from "../components/NutritionTemplatesSection";
import { StructuredCatalogSection } from "../components/StructuredCatalogSection";
import { VisitFormTemplatesSection } from "../components/VisitFormTemplatesSection";
import { SupplementTemplatesSection } from "../components/SupplementTemplatesSection";
import {
  coachRulesRepository,
  cloneCoachRules,
  type CoachRulesRepository
} from "../services/coachRulesRepository";
import {
  nutritionSupplementTemplatesRepository,
  type NutritionSupplementTemplatesRepository
} from "../services/nutritionSupplementTemplatesRepository";
import type {
  CoachRuleSection,
  CoachRules,
  ExerciseBankGroup,
  GeneralCoachRule,
  InjuryRule,
  LevelRule,
  MusclePriorityRule,
  ProgramTemplate
} from "../types/coachRules";

const sectionLabels: Record<CoachRuleSection, string> = {
  visitForms: "فرم‌های ویزیت",
  exercises: "بانک حرکات",
  general: "قوانین عمومی",
  injuries: "آسیب ها و محدودیت ها",
  levels: "قوانین سطح تمرین",
  muscles: "اولویت عضلات",
  nutritionTemplates: "برنامه غذایی مرجع",
  supplementTemplates: "مکمل های مرجع",
  templates: "قالب های برنامه"
};

const sectionOrder: CoachRuleSection[] = [
  "templates",
  "levels",
  "injuries",
  "muscles",
  "exercises",
  "general",
  "visitForms",
  "nutritionTemplates",
  "supplementTemplates"
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

  useEffect(() => {
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
  }, [repository, requestKey]);

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

    setStatus("saving");
    setFeedback("");

    try {
      const savedRules = await repository.save(rules);
      setRules(savedRules);
      setRulesDirty(false);
      setStatus("loaded");
      setFeedback("قوانین مربی ذخیره شد.");
    } catch {
      setStatus("loaded");
      setFeedback("ذخیره قوانین انجام نشد. دوباره تلاش کنید.");
    }
  };

  const resetRules = async () => {
    setStatus("saving");
    setFeedback("");

    try {
      const nextRules = await repository.reset();
      setRules(nextRules);
      setRulesDirty(false);
      setStatus("loaded");
      setFeedback("قوانین به داده اولیه برگشت.");
      setConfirmReset(false);
    } catch {
      setStatus("loaded");
      setFeedback("بازنشانی قوانین انجام نشد.");
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
              disabled={exportingPdf || status === "loading"}
              iconStart={<FileDown size={18} />}
              isLoading={exportingPdf}
              onClick={exportRulesPdf}
              variant="secondary"
            >
              خروجی PDF قوانین مربی
            </Button>
            <Button
              iconStart={<RefreshCcw size={18} />}
              onClick={() => setConfirmReset(true)}
              variant="secondary"
            >
              بازنشانی
            </Button>
            {!rulesDirty ? (
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
        description="مدیریت سبک برنامه نویسی، قالب ها، آسیب ها و بانک حرکات مربی"
        title="قوانین و سبک برنامه نویسی مربی"
      />

      <ContentSection>
        {status === "loading" ? <RulesLoading /> : null}
        {status === "error" ? (
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

        {rules && status !== "loading" && status !== "error" ? (
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

            <RulesSection
              rules={rules}
              section={section}
              templatesRepository={templatesRepository}
              updateRules={updateRules}
            />
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
              بازنشانی قوانین
            </Button>
          </>
        }
        onClose={() => setConfirmReset(false)}
        open={confirmReset}
        title="بازنشانی قوانین مربی"
      >
        قوانین فعلی با داده اولیه جایگزین می شود.
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
    return <ProgramTemplates rules={rules} updateRules={updateRules} />;
  }
  if (section === "levels") {
    return <LevelRules rules={rules} updateRules={updateRules} />;
  }
  if (section === "injuries") {
    return <InjuryRules rules={rules} updateRules={updateRules} />;
  }
  if (section === "muscles") {
    return <MuscleRules rules={rules} updateRules={updateRules} />;
  }
  if (section === "exercises") {
    return (
      <>
        <StructuredCatalogSection />
        <ExerciseBank rules={rules} updateRules={updateRules} />
      </>
    );
  }
  if (section === "nutritionTemplates") {
    return (
      <NutritionTemplatesSection
        onTemplatesChange={(nutritionTemplates) =>
          updateRules((next) => ({ ...next, nutritionTemplates }))
        }
        repository={templatesRepository}
        templates={rules.nutritionTemplates}
      />
    );
  }
  if (section === "visitForms") {
    return <VisitFormTemplatesSection />;
  }
  if (section === "supplementTemplates") {
    return (
      <SupplementTemplatesSection
        onTemplatesChange={(supplementTemplates) =>
          updateRules((next) => ({ ...next, supplementTemplates }))
        }
        repository={templatesRepository}
        templates={rules.supplementTemplates}
      />
    );
  }
  return <GeneralRules rules={rules} updateRules={updateRules} />;
}

function ProgramTemplates({ rules, updateRules }: RulesEditorProps) {
  const addTemplate = () =>
    updateRules((next) => ({
      ...next,
      templates: [
        {
          daysPerWeek: 3,
          goal: "هدف قالب جدید",
          id: `template-${Date.now()}`,
          intensity: "متوسط",
          isActive: true,
          level: "intermediate",
          mainGoal: "قالب جدید",
          musclePriorityOrder: ["سینه"],
          name: "قالب جدید",
          restTime: "۹۰ ثانیه",
          specialRules: ["قانون ویژه"],
          split: ["روز اول", "روز دوم", "روز سوم"],
          volume: "متوسط"
        },
        ...next.templates
      ]
    }));

  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        action={
          <Button iconStart={<Plus size={18} />} onClick={addTemplate}>
            افزودن قالب
          </Button>
        }
        description="Fixture اولیه شامل فول بادی مبتدی ۳ روزه و ۴ روزه حجم متوسط است."
        title="قالب های برنامه"
      />
      <div className={styles.cardGrid}>
        {rules.templates.map((template) => (
          <EditableTemplate
            key={template.id}
            onChange={(nextTemplate) =>
              updateRules((next) => ({
                ...next,
                templates: next.templates.map((item) =>
                  item.id === nextTemplate.id ? nextTemplate : item
                )
              }))
            }
            onDuplicate={() =>
              updateRules((next) => ({
                ...next,
                templates: [
                  {
                    ...template,
                    id: `${template.id}-copy-${Date.now()}`,
                    name: `${template.name} - کپی`
                  },
                  ...next.templates
                ]
              }))
            }
            onRemove={() =>
              updateRules((next) => ({
                ...next,
                templates: next.templates.filter((item) => item.id !== template.id)
              }))
            }
            template={template}
          />
        ))}
      </div>
    </Card>
  );
}

function EditableTemplate({
  onChange,
  onDuplicate,
  onRemove,
  template
}: {
  onChange: (template: ProgramTemplate) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  template: ProgramTemplate;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <div className={styles.ruleCardHeader}>
        <StatusBadge variant={template.isActive ? "success" : "neutral"}>
          {template.isActive ? "فعال" : "غیرفعال"}
        </StatusBadge>
        <div className={styles.actionIconGroup}>
          <Button
            iconStart={<Copy size={16} />}
            onClick={onDuplicate}
            size="sm"
            variant="secondary"
          >
            تکثیر
          </Button>
          <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
            حذف
          </Button>
        </div>
      </div>
      <div className={styles.formGrid}>
        <FormField label="نام قالب">
          <Input
            value={template.name}
            onChange={(event) => onChange({ ...template, name: event.target.value })}
          />
        </FormField>
        <FormField label="سطح">
          <Select
            options={levelOptions}
            value={template.level}
            onChange={(event) =>
              onChange({ ...template, level: event.target.value as ProgramTemplate["level"] })
            }
          />
        </FormField>
        <FormField label="تعداد روز">
          <Input
            min={1}
            max={7}
            type="number"
            value={template.daysPerWeek}
            onChange={(event) => onChange({ ...template, daysPerWeek: Number(event.target.value) })}
          />
        </FormField>
        <FormField className={styles.fullField} label="هدف">
          <Input
            value={template.goal}
            onChange={(event) => onChange({ ...template, goal: event.target.value })}
          />
        </FormField>
        <FormField label="حجم تمرین">
          <Input
            value={template.volume}
            onChange={(event) => onChange({ ...template, volume: event.target.value })}
          />
        </FormField>
        <FormField label="شدت">
          <Input
            value={template.intensity}
            onChange={(event) => onChange({ ...template, intensity: event.target.value })}
          />
        </FormField>
        <FormField label="استراحت">
          <Input
            value={template.restTime}
            onChange={(event) => onChange({ ...template, restTime: event.target.value })}
          />
        </FormField>
        <FormField className={styles.fullField} label="تقسیم بندی روزها">
          <Textarea
            value={template.split.join("\n")}
            onChange={(event) => onChange({ ...template, split: splitLines(event.target.value) })}
          />
        </FormField>
        <FormField className={styles.fullField} label="قوانین خاص">
          <Textarea
            value={template.specialRules.join("\n")}
            onChange={(event) =>
              onChange({ ...template, specialRules: splitLines(event.target.value) })
            }
          />
        </FormField>
        <Switch
          checked={template.isActive}
          label="قالب فعال است"
          onCheckedChange={(checked) => onChange({ ...template, isActive: checked })}
        />
      </div>
    </Card>
  );
}

function LevelRules({ rules, updateRules }: RulesEditorProps) {
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="حجم، شدت، حرکات ممنوع و تکنیک های مجاز هر سطح تمرینی."
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
      <FormField label="حجم تمرین">
        <Input
          value={rule.volume}
          onChange={(event) => onChange({ ...rule, volume: event.target.value })}
        />
      </FormField>
      <FormField label="شدت">
        <Input
          value={rule.intensity}
          onChange={(event) => onChange({ ...rule, intensity: event.target.value })}
        />
      </FormField>
      <FormField label="حرکات ممنوع">
        <Textarea
          value={rule.forbiddenExercises.join("\n")}
          onChange={(event) =>
            onChange({ ...rule, forbiddenExercises: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="حرکات ضروری">
        <Textarea
          value={rule.requiredExercises.join("\n")}
          onChange={(event) =>
            onChange({ ...rule, requiredExercises: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="تکنیک های مجاز">
        <Textarea
          value={rule.allowedTechniques.join("\n")}
          onChange={(event) =>
            onChange({ ...rule, allowedTechniques: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="توضیحات مربی">
        <Textarea
          value={rule.coachNotes}
          onChange={(event) => onChange({ ...rule, coachNotes: event.target.value })}
        />
      </FormField>
    </Card>
  );
}

function InjuryRules({ rules, updateRules }: RulesEditorProps) {
  const addRule = () =>
    updateRules((next) => ({
      ...next,
      injuries: [
        {
          alternatives: ["جایگزین پیشنهادی"],
          forbiddenExercises: ["حرکت ممنوع"],
          id: `injury-${Date.now()}`,
          isActive: true,
          name: "آسیب جدید",
          notes: "توضیح مربی"
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
        description="قوانین گردن درد، کمر درد و زانو درد از مرجع مربی وارد شده اند."
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
      <FormField label="نام آسیب">
        <Input
          value={rule.name}
          onChange={(event) => onChange({ ...rule, name: event.target.value })}
        />
      </FormField>
      <FormField label="حرکات ممنوع">
        <Textarea
          value={rule.forbiddenExercises.join("\n")}
          onChange={(event) =>
            onChange({ ...rule, forbiddenExercises: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="جایگزین ها">
        <Textarea
          value={rule.alternatives.join("\n")}
          onChange={(event) => onChange({ ...rule, alternatives: splitLines(event.target.value) })}
        />
      </FormField>
      <FormField label="توضیحات">
        <Textarea
          value={rule.notes}
          onChange={(event) => onChange({ ...rule, notes: event.target.value })}
        />
      </FormField>
    </Card>
  );
}

function MuscleRules({ rules, updateRules }: RulesEditorProps) {
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="تغییر ترتیب تمرین و افزایش حجم برای عضلات ضعیف یا اولویت دار."
        title="اولویت عضلات"
      />
      <div className={styles.cardGrid}>
        {rules.musclePriorities.map((rule) => (
          <EditableMuscleRule
            key={rule.id}
            rule={rule}
            onChange={(nextRule) =>
              updateRules((next) => ({
                ...next,
                musclePriorities: next.musclePriorities.map((item) =>
                  item.id === nextRule.id ? nextRule : item
                )
              }))
            }
          />
        ))}
      </div>
    </Card>
  );
}

function EditableMuscleRule({
  onChange,
  rule
}: {
  onChange: (rule: MusclePriorityRule) => void;
  rule: MusclePriorityRule;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <FormField label="عضله">
        <Input
          value={rule.muscle}
          onChange={(event) => onChange({ ...rule, muscle: event.target.value })}
        />
      </FormField>
      <FormField label="تغییر ترتیب تمرین">
        <Input
          value={rule.orderChange}
          onChange={(event) => onChange({ ...rule, orderChange: event.target.value })}
        />
      </FormField>
      <FormField label="افزایش حرکت">
        <Input
          type="number"
          value={rule.extraExercises}
          onChange={(event) => onChange({ ...rule, extraExercises: Number(event.target.value) })}
        />
      </FormField>
      <FormField label="افزایش ست">
        <Input
          type="number"
          value={rule.extraSets}
          onChange={(event) => onChange({ ...rule, extraSets: Number(event.target.value) })}
        />
      </FormField>
      <FormField label="توضیح">
        <Textarea
          value={rule.notes}
          onChange={(event) => onChange({ ...rule, notes: event.target.value })}
        />
      </FormField>
    </Card>
  );
}

function ExerciseBank({ rules, updateRules }: RulesEditorProps) {
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="این بخش legacy برای داده‌های قدیمی حفظ شده است؛ کاتالوگ ساختاریافته بالای صفحه منبع اصلی generator است."
        title="بانک متنی قدیمی"
      />
      <div className={styles.cardGrid}>
        {rules.exerciseBank.map((group) => (
          <EditableExerciseGroup
            group={group}
            key={group.id}
            onChange={(nextGroup) =>
              updateRules((next) => ({
                ...next,
                exerciseBank: next.exerciseBank.map((item) =>
                  item.id === nextGroup.id ? nextGroup : item
                )
              }))
            }
          />
        ))}
      </div>
    </Card>
  );
}

function EditableExerciseGroup({
  group,
  onChange
}: {
  group: ExerciseBankGroup;
  onChange: (group: ExerciseBankGroup) => void;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <h3 className={styles.ruleCardTitle}>{group.group}</h3>
      <FormField label="حرکات مورد علاقه">
        <Textarea
          value={group.favoriteExercises.join("\n")}
          onChange={(event) =>
            onChange({ ...group, favoriteExercises: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="حرکات ممنوع">
        <Textarea
          value={group.forbiddenExercises.join("\n")}
          onChange={(event) =>
            onChange({ ...group, forbiddenExercises: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="مناسب مبتدی">
        <Textarea
          value={group.beginnerFriendly.join("\n")}
          onChange={(event) =>
            onChange({ ...group, beginnerFriendly: splitLines(event.target.value) })
          }
        />
      </FormField>
      <FormField label="مناسب حرفه ای">
        <Textarea
          value={group.professionalFriendly.join("\n")}
          onChange={(event) =>
            onChange({ ...group, professionalFriendly: splitLines(event.target.value) })
          }
        />
      </FormField>
    </Card>
  );
}

function GeneralRules({ rules, updateRules }: RulesEditorProps) {
  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="قوانین عمومی فعال در تولید برنامه و توضیحات تکمیلی مربی."
        title="قوانین عمومی"
      />
      <div className={styles.cardGrid}>
        {rules.generalRules.items.map((rule) => (
          <EditableGeneralRule
            key={rule.id}
            rule={rule}
            onChange={(nextRule) =>
              updateRules((next) => ({
                ...next,
                generalRules: {
                  ...next.generalRules,
                  items: next.generalRules.items.map((item) =>
                    item.id === nextRule.id ? nextRule : item
                  )
                }
              }))
            }
          />
        ))}
      </div>
      <FormField label="توضیحات تکمیلی مربی">
        <Textarea
          value={rules.generalRules.extraNotes}
          onChange={(event) =>
            updateRules((next) => ({
              ...next,
              generalRules: {
                ...next.generalRules,
                extraNotes: event.target.value
              }
            }))
          }
        />
      </FormField>
    </Card>
  );
}

function EditableGeneralRule({
  onChange,
  rule
}: {
  onChange: (rule: GeneralCoachRule) => void;
  rule: GeneralCoachRule;
}) {
  return (
    <Card className={styles.editableCard} padding="sm">
      <div className={styles.ruleCardHeader}>
        <Switch
          checked={rule.isActive}
          label="فعال"
          onCheckedChange={(checked) => onChange({ ...rule, isActive: checked })}
        />
        <StatusBadge
          variant={
            rule.importance === "high"
              ? "danger"
              : rule.importance === "medium"
                ? "warning"
                : "neutral"
          }
        >
          {rule.importance === "high" ? "مهم" : rule.importance === "medium" ? "متوسط" : "کم"}
        </StatusBadge>
      </div>
      <FormField label="عنوان">
        <Input
          value={rule.title}
          onChange={(event) => onChange({ ...rule, title: event.target.value })}
        />
      </FormField>
      <FormField label="دسته بندی">
        <Input
          value={rule.category}
          onChange={(event) => onChange({ ...rule, category: event.target.value })}
        />
      </FormField>
      <FormField label="توضیح">
        <Textarea
          value={rule.description}
          onChange={(event) => onChange({ ...rule, description: event.target.value })}
        />
      </FormField>
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
  return sectionOrder.includes(value as CoachRuleSection)
    ? (value as CoachRuleSection)
    : "templates";
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
