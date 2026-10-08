import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Copy,
  GripVertical,
  LayoutTemplate,
  Plus,
  RefreshCcw,
  Save,
  Star,
  Trash2
} from "lucide-react";
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
  Textarea
} from "../../../components/ui";
import {
  visitFormTemplatesRepository,
  type VisitFormTemplatesRepository
} from "../../students/services/visitFormTemplatesRepository";
import type {
  VisitFormFieldDefinition,
  VisitFormFieldType,
  VisitFormSectionDefinition,
  VisitFormTemplate,
  VisitFormTheme
} from "../../students/types/visitForm";
import { visitFormTemplateSamples } from "../../students/fixtures/visitFormTemplateSamples";
import { VisitDynamicForm } from "../../students/components/VisitDynamicForm";
import styles from "../../programs/components/programFlow.module.css";

export interface VisitFormTemplatesSectionProps {
  repository?: VisitFormTemplatesRepository;
}

const fieldTypeOptions: Array<{ label: string; value: VisitFormFieldType }> = [
  { label: "متن کوتاه", value: "text" },
  { label: "عدد", value: "number" },
  { label: "بله یا خیر", value: "boolean" },
  { label: "انتخاب یک مورد", value: "single_select" },
  { label: "انتخاب چند مورد", value: "multi_select" },
  { label: "متن بلند", value: "textarea" },
  { label: "تاریخ", value: "date" }
];

function createEmptyField(order: number): VisitFormFieldDefinition {
  return {
    coachEditable: true,
    coachHelpText: "",
    enabled: true,
    helpText: "",
    key: `custom_field_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    label: "سؤال جدید",
    options: [],
    order,
    prefillFrom: "",
    required: false,
    semanticKey: "",
    studentEditable: false,
    studentVisible: false,
    studentVisibleWhenFinalized: false,
    type: "text"
  };
}

function insertField(
  section: VisitFormSectionDefinition,
  type: VisitFormFieldType,
  targetKey?: string,
  after = false
): VisitFormSectionDefinition {
  const fields = [...section.fields].sort((a, b) => a.order - b.order);
  const targetIndex = targetKey ? fields.findIndex((field) => field.key === targetKey) : -1;
  const insertAt = targetIndex < 0 ? fields.length : targetIndex + (after ? 1 : 0);
  const next = createEmptyField(insertAt);
  next.type = type;
  next.label = `سؤال ${fieldTypeLabels[type]}`;
  fields.splice(insertAt, 0, next);
  return { ...section, fields: fields.map((field, index) => ({ ...field, order: index })) };
}

function moveField(
  section: VisitFormSectionDefinition,
  movingKey: string,
  targetKey: string,
  after: boolean
): VisitFormSectionDefinition {
  const fields = [...section.fields].sort((a, b) => a.order - b.order);
  const from = fields.findIndex((field) => field.key === movingKey);
  const target = fields.findIndex((field) => field.key === targetKey);
  if (from < 0 || target < 0 || from === target) return section;
  const [moving] = fields.splice(from, 1);
  const adjustedTarget = fields.findIndex((field) => field.key === targetKey);
  fields.splice(adjustedTarget + (after ? 1 : 0), 0, moving);
  return { ...section, fields: fields.map((field, index) => ({ ...field, order: index })) };
}

function moveSection(
  sections: VisitFormSectionDefinition[],
  sectionKey: string,
  amount: -1 | 1
): VisitFormSectionDefinition[] {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((section) => section.key === sectionKey);
  const target = index + amount;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  const [moving] = ordered.splice(index, 1);
  ordered.splice(target, 0, moving);
  return ordered.map((section, order) => ({ ...section, order }));
}

type StartPanel = "choose" | "catalog" | "theme";
type PreviewMode = "coach" | "student";

const themeOptions: Array<{ description: string; label: string; value: VisitFormTheme }> = [
  {
    description: "بخش‌ها در کارت‌های سفید و خوانا نمایش داده می‌شوند.",
    label: "روشن و استاندارد Athlore",
    value: "athlore"
  },
  {
    description: "فاصله‌ها کمتر است و فرم جمع‌وجورتر دیده می‌شود.",
    label: "فشرده Athlore",
    value: "athlore_compact"
  }
];

const fieldTypeLabels: Record<VisitFormFieldType, string> = {
  boolean: "بله یا خیر",
  date: "تاریخ",
  multi_select: "انتخاب چند مورد",
  number: "عدد",
  single_select: "انتخاب یک مورد",
  text: "متن کوتاه",
  textarea: "متن بلند"
};

export function VisitFormTemplatesSection({
  repository = visitFormTemplatesRepository
}: VisitFormTemplatesSectionProps) {
  const [templates, setTemplates] = useState<VisitFormTemplate[]>([]);
  const [draft, setDraft] = useState<VisitFormTemplate | null>(null);
  const [baseline, setBaseline] = useState<VisitFormTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [startPanel, setStartPanel] = useState<StartPanel | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "saving">("loading");
  const [requestKey, setRequestKey] = useState(0);
  const listScrollPosition = useRef(0);

  useEffect(() => {
    let isMounted = true;
    repository
      .list()
      .then((items) => {
        if (!isMounted) {
          return;
        }
        setTemplates(items);
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

  const showFeedback = (message: string, tone: "error" | "success" = "success") => {
    setFeedback(message);
    setFeedbackTone(tone);
  };

  const beginCreate = () => {
    listScrollPosition.current = window.scrollY;
    if (window.scrollY > 0) window.scrollTo(0, 0);
    setStartPanel("choose");
    setFeedback("");
  };

  const beginScratch = (theme: VisitFormTheme) => {
    const next: VisitFormTemplate = {
      description: "",
      id: "new-template",
      isActive: true,
      isDefault: templates.length === 0,
      key: `coach_form_${Date.now()}`,
      name: "فرم ویزیت جدید",
      sections: [{ fields: [], key: `section_${Date.now()}`, label: "بخش اول", order: 0 }],
      theme,
      version: 1
    };
    setStartPanel(null);
    setPreviewMode(null);
    setCreating(true);
    setBaseline(structuredClone(next));
    setDraft(next);
    setFeedback("");
  };

  const addSampleToCoach = async (sample: VisitFormTemplate, openForEditing: boolean) => {
    setStatus("saving");
    setFeedback("");
    const matchingNames = templates.filter((item) => item.name.startsWith(sample.name)).length;
    const name = openForEditing
      ? `${sample.name} - نسخه قابل ویرایش`
      : matchingNames === 0
        ? sample.name
        : `${sample.name} - نسخه ${matchingNames + 1}`;
    try {
      const saved = await repository.create({
        description: sample.description,
        isActive: true,
        isDefault: false,
        key: `${sample.key.slice(0, 58)}_${Date.now()}`,
        name,
        sections: structuredClone(sample.sections),
        theme: sample.theme
      });
      setTemplates((current) => [saved, ...current]);
      setStartPanel(null);
      setStatus("loaded");
      if (openForEditing) {
        beginEdit(saved);
        showFeedback("یک نسخه مستقل ساخته شد؛ تغییرات را انجام دهید و ذخیره کنید.");
      } else {
        showFeedback("قالب به فهرست شما اضافه شد و برای انتخاب در ویزیت آماده است.");
      }
    } catch {
      setStatus("loaded");
      showFeedback("ساخت نسخه از فرم آماده انجام نشد.", "error");
    }
  };

  const beginEdit = (template: VisitFormTemplate) => {
    listScrollPosition.current = window.scrollY;
    if (window.scrollY > 0) window.scrollTo(0, 0);
    const next = structuredClone(template);
    setCreating(false);
    setPreviewMode(null);
    setBaseline(structuredClone(next));
    setDraft(next);
    setFeedback("");
  };

  const updateDraft = (updater: (current: VisitFormTemplate) => VisitFormTemplate) => {
    setDraft((current) => (current ? updater(structuredClone(current)) : current));
  };

  const leaveEditor = () => {
    const restoreScrollPosition = listScrollPosition.current;
    setDraft(null);
    setBaseline(null);
    setCreating(false);
    setStartPanel(null);
    setPreviewMode(null);
    setConfirmDiscard(false);
    if (restoreScrollPosition > 0) {
      window.requestAnimationFrame(() => window.scrollTo(0, restoreScrollPosition));
    }
  };

  const requestLeaveEditor = () => {
    if (draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline)) {
      setConfirmDiscard(true);
      return;
    }
    leaveEditor();
  };

  const reload = () => {
    setStatus("loading");
    setRequestKey((current) => current + 1);
  };

  const saveTemplate = async () => {
    if (!draft) {
      return;
    }
    setStatus("saving");
    setFeedback("");
    try {
      if (!draft.name.trim() || !draft.key.trim()) {
        showFeedback("نام فرم الزامی است.", "error");
        setStatus("loaded");
        return;
      }
      const saved = creating
        ? await repository.create({
            key: draft.key.trim(),
            name: draft.name.trim(),
            description: draft.description,
            isActive: draft.isActive,
            theme: draft.theme,
            sections: draft.sections
          })
        : await repository.update(draft.id, {
            description: draft.description,
            isActive: draft.isActive,
            name: draft.name,
            theme: draft.theme,
            sections: draft.sections
          });
      setTemplates((current) =>
        creating
          ? [saved, ...current]
          : current.map((item) => (item.id === saved.id ? saved : item))
      );
      setStatus("loaded");
      leaveEditor();
      showFeedback(creating ? "فرم ویزیت ساخته شد." : "تغییرات فرم ذخیره شد.");
    } catch {
      setStatus("loaded");
      showFeedback("ذخیره فرم انجام نشد.", "error");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await repository.duplicate(id);
      setTemplates((current) => [dup, ...current]);
      beginEdit(dup);
      showFeedback("کپی ساخته شد؛ تغییرات را بررسی و ذخیره کنید.");
    } catch {
      showFeedback("کپی قالب انجام نشد.", "error");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const updated = await repository.setDefault(id);
      setTemplates((current) =>
        current.map((item) => ({
          ...item,
          isDefault: item.id === updated.id
        }))
      );
      showFeedback("این فرم برای ویزیت‌های جدید پیش‌فرض شد.");
    } catch {
      showFeedback("تغییر فرم پیش‌فرض انجام نشد.", "error");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const archived = await repository.archive(id);
      setTemplates((current) => current.map((item) => (item.id === id ? archived : item)));
      showFeedback("فرم بایگانی شد؛ ویزیت‌های قبلی آن حفظ می‌شوند.");
    } catch {
      showFeedback("بایگانی فرم انجام نشد.", "error");
    }
  };

  if (status === "loading") {
    return (
      <Card aria-label="در حال بارگذاری فرم‌های ویزیت">
        <Skeleton height={56} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card padding="lg">
        <EmptyState
          action={
            <Button iconStart={<RefreshCcw size={18} />} onClick={reload} variant="secondary">
              تلاش دوباره
            </Button>
          }
          description="دریافت فرم‌های ویزیت با خطا روبه‌رو شد."
          title="خطای دریافت قالب"
        />
      </Card>
    );
  }

  if (startPanel) {
    return (
      <div className={`${styles.pageStack} ${styles.visitTemplates}`}>
        <Card>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionDescription}>قالب‌های فرم ویزیت</p>
              <h2 className={styles.sectionTitle}>
                {startPanel === "choose"
                  ? "فرم را چطور شروع می‌کنید؟"
                  : startPanel === "catalog"
                    ? "انتخاب فرم آماده"
                    : "ظاهر فرم جدید را انتخاب کنید"}
              </h2>
            </div>
            <Button onClick={() => setStartPanel("choose")} variant="secondary">
              {startPanel === "choose" ? "بازگشت به قالب‌ها" : "بازگشت"}
            </Button>
          </div>

          {startPanel === "choose" ? (
            <div className={styles.formStartGrid}>
              <button
                className={styles.formStartCard}
                onClick={() => setStartPanel("catalog")}
                type="button"
              >
                <LayoutTemplate aria-hidden size={26} />
                <strong>انتخاب فرم آماده</strong>
                <span>یک فرم ورزشی آماده را همان‌طور ذخیره کنید یا نسخه‌اش را ویرایش کنید.</span>
              </button>
              <button
                className={styles.formStartCard}
                onClick={() => setStartPanel("theme")}
                type="button"
              >
                <Plus aria-hidden size={26} />
                <strong>ساخت فرم از صفر</strong>
                <span>ظاهر را انتخاب کنید، بخش بسازید و سؤال‌ها را اضافه کنید.</span>
              </button>
              <div className={styles.formStartHint}>
                برای کپی و ویرایش قالب‌های قبلی خودتان، از دکمهٔ «ساخت نسخه برای ویرایش» کنار همان
                قالب در فهرست استفاده کنید.
              </div>
            </div>
          ) : null}

          {startPanel === "catalog" ? (
            <div className={styles.formSampleGrid}>
              {visitFormTemplateSamples.map((sample) => (
                <article className={styles.formSampleCard} key={sample.key}>
                  <div>
                    <StatusBadge variant="info">
                      {sample.sections.length} بخش ·{" "}
                      {sample.sections.reduce((total, section) => total + section.fields.length, 0)}{" "}
                      سؤال
                    </StatusBadge>
                    <h3>{sample.name}</h3>
                    <p>{sample.description}</p>
                  </div>
                  <div className={styles.formSampleActions}>
                    <Button
                      isLoading={status === "saving"}
                      onClick={() => void addSampleToCoach(sample, false)}
                      variant="secondary"
                    >
                      ذخیره برای استفاده در ویزیت
                    </Button>
                    <Button
                      isLoading={status === "saving"}
                      onClick={() => void addSampleToCoach(sample, true)}
                    >
                      ساخت نسخه و ویرایش
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {startPanel === "theme" ? (
            <div className={styles.formThemeGrid}>
              {themeOptions.map((theme) => (
                <button
                  className={styles.formThemeChoice}
                  key={theme.value}
                  onClick={() => beginScratch(theme.value)}
                  type="button"
                >
                  <div
                    className={
                      theme.value === "athlore_compact"
                        ? styles.formThemePreviewCompact
                        : styles.formThemePreview
                    }
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                  <strong>{theme.label}</strong>
                  <span>{theme.description}</span>
                </button>
              ))}
            </div>
          ) : null}
        </Card>
        {feedback ? (
          <div
            className={`${styles.alert} ${feedbackTone === "error" ? styles.alertError : styles.alertSuccess}`}
            role="status"
          >
            {feedback}
          </div>
        ) : null}
      </div>
    );
  }

  if (draft) {
    const dirty = Boolean(baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
    if (previewMode) {
      return (
        <Card className={`${styles.templateEditorPage} ${styles.visitTemplates}`}>
          <div className={styles.templateEditorHeader}>
            <div>
              <p className={styles.sectionDescription}>
                {previewMode === "student"
                  ? "نمایش شاگرد هنگام تکمیل ویزیت"
                  : "نمایش فرم در پنل مربی"}
              </p>
              <h2>{draft.name || "فرم ویزیت جدید"}</h2>
              {draft.description ? (
                <p className={styles.sectionDescription}>{draft.description}</p>
              ) : null}
            </div>
            <Button onClick={() => setPreviewMode(null)} variant="secondary">
              بازگشت به طراحی فرم
            </Button>
          </div>
          <VisitDynamicForm
            answers={{}}
            disabled
            onAnswersChange={() => undefined}
            sections={[...draft.sections]
              .sort((a, b) => a.order - b.order)
              .map((section) => ({
                ...section,
                fields: section.fields
                  .filter(
                    (field) => field.enabled && (previewMode === "coach" || field.studentVisible)
                  )
                  .sort((a, b) => a.order - b.order)
              }))
              .filter((section) => section.fields.length > 0)}
            theme={draft.theme}
          />
          {previewMode === "student" &&
          !draft.sections.some((section) =>
            section.fields.some((field) => field.enabled && field.studentVisible)
          ) ? (
            <EmptyState
              description="هنوز سؤالی برای نمایش یا تکمیل توسط شاگرد انتخاب نشده است."
              title="این فرم برای شاگرد فیلدی ندارد"
            />
          ) : null}
        </Card>
      );
    }
    return (
      <>
        <Card
          className={`${styles.templateEditorPage} ${styles.visitTemplates} ${
            draft.theme === "athlore_compact" ? styles.formEditorCompact : styles.formEditorStandard
          }`}
        >
          <div className={styles.templateEditorHeader}>
            <div>
              <p className={styles.sectionDescription}>قوانین مربی / فرم‌های ویزیت</p>
              <h2 className={styles.sectionTitle}>
                {creating ? "ساخت فرم ویزیت" : `ویرایش فرم: ${draft.name}`}
              </h2>
              <p className={styles.sectionDescription}>
                سؤال‌ها را از پنل کناری اضافه کنید یا با دکمه‌های جابه‌جایی مرتب کنید.
              </p>
            </div>
            <Button onClick={() => setPreviewMode("coach")} variant="secondary">
              پیش‌نمایش پنل مربی
            </Button>
            <Button onClick={() => setPreviewMode("student")} variant="secondary">
              پیش‌نمایش پنل شاگرد
            </Button>
            <Button
              iconStart={<ArrowRight size={18} />}
              onClick={requestLeaveEditor}
              variant="secondary"
            >
              بازگشت به قالب‌ها
            </Button>
          </div>

          {feedback ? (
            <div
              className={`${styles.alert} ${feedbackTone === "error" ? styles.alertError : styles.alertSuccess}`}
              role="status"
            >
              {feedback}
            </div>
          ) : null}

          <div className={styles.cardGrid}>
            <FormField htmlFor="visit-form-template-name" label="نام فرم" required>
              <Input
                autoFocus={creating}
                id="visit-form-template-name"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, name: event.target.value }))
                }
                value={draft.name}
              />
            </FormField>
            <FormField htmlFor="visit-form-theme" label="ظاهر فرم">
              <Select
                id="visit-form-theme"
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    theme: event.target.value as VisitFormTheme
                  }))
                }
                options={themeOptions.map((item) => ({ label: item.label, value: item.value }))}
                value={draft.theme}
              />
            </FormField>
            <FormField label="نمایش در فهرست قالب‌ها">
              <Switch
                checked={draft.isActive}
                label={draft.isActive ? "قابل انتخاب" : "بایگانی‌شده"}
                onCheckedChange={(checked) =>
                  updateDraft((current) => ({
                    ...current,
                    isActive: checked,
                    isDefault: checked ? current.isDefault : false
                  }))
                }
              />
            </FormField>
          </div>

          <FormField htmlFor="visit-form-template-description" label="توضیحات">
            <Textarea
              id="visit-form-template-description"
              onChange={(event) =>
                updateDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              value={draft.description}
            />
          </FormField>

          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.ruleCardTitle}>بخش‌های فرم</h3>
              <p className={styles.sectionDescription}>
                بخش‌ها را به ترتیب نمایش مرتب کنید؛ برای افزودن سؤال، نوع آن را از پنل کنار فرم
                بکشید و در بخش موردنظر رها کنید.
              </p>
            </div>
            <Button
              iconStart={<Plus size={16} />}
              onClick={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: [
                    ...current.sections,
                    {
                      fields: [],
                      key: `section_${Date.now()}`,
                      label: `بخش ${current.sections.length + 1}`,
                      order: current.sections.length
                    }
                  ]
                }))
              }
              size="sm"
              variant="secondary"
            >
              افزودن بخش جدید
            </Button>
          </div>

          <div className={styles.formBuilderLayout}>
            <aside className={styles.formFieldPalette}>
              <h3>افزودن سؤال</h3>
              <p>نوع سؤال را بکشید و در محل دلخواه رها کنید؛ با لمس هم به بخش اول اضافه می‌شود.</p>
              <div>
                {fieldTypeOptions.map((option) => (
                  <button
                    className={styles.formPaletteButton}
                    draggable
                    key={option.value}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        sections: current.sections.map((section, index) =>
                          index === 0 ? insertField(section, option.value) : section
                        )
                      }))
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-athlore-field-type", option.value);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    type="button"
                  >
                    <Plus aria-hidden size={16} />
                    {option.label}
                  </button>
                ))}
              </div>
              <p className={styles.formPaletteHint}>
                سؤال‌های دلخواه پاسخ را ثبت می‌کنند. فقط فیلدهای استانداردِ متصل به اطلاعات تمرین،
                روی تولید برنامه اثر دارند.
              </p>
            </aside>
            <div className={styles.formBuilderCanvas}>
              {[...draft.sections]
                .sort((a, b) => a.order - b.order)
                .map((section, sectionIndex, orderedSections) => (
                  <SectionEditor
                    key={section.key}
                    canMoveUp={sectionIndex > 0}
                    canMoveDown={sectionIndex < orderedSections.length - 1}
                    onChange={(nextSection) =>
                      updateDraft((current) => ({
                        ...current,
                        sections: current.sections.map((item) =>
                          item.key === nextSection.key ? nextSection : item
                        )
                      }))
                    }
                    onRemove={() =>
                      updateDraft((current) => ({
                        ...current,
                        sections: current.sections
                          .filter((item) => item.key !== section.key)
                          .map((item, index) => ({ ...item, order: index }))
                      }))
                    }
                    onDropField={(type, targetKey, after) =>
                      updateDraft((current) => ({
                        ...current,
                        sections: current.sections.map((item) =>
                          item.key === section.key
                            ? insertField(item, type, targetKey, after)
                            : item
                        )
                      }))
                    }
                    onMoveUp={() =>
                      updateDraft((current) => ({
                        ...current,
                        sections: moveSection(current.sections, section.key, -1)
                      }))
                    }
                    onMoveDown={() =>
                      updateDraft((current) => ({
                        ...current,
                        sections: moveSection(current.sections, section.key, 1)
                      }))
                    }
                    section={section}
                  />
                ))}
            </div>
          </div>

          <div className={styles.templateEditorActions}>
            <span>{dirty ? "تغییرات ذخیره‌نشده" : "تغییری برای ذخیره نیست"}</span>
            <div>
              <Button
                iconStart={<Save size={18} />}
                isLoading={status === "saving"}
                onClick={() => void saveTemplate()}
              >
                {creating ? "ذخیره فرم" : "ذخیره تغییرات"}
              </Button>
              <Button onClick={requestLeaveEditor} variant="secondary">
                انصراف
              </Button>
            </div>
          </div>
        </Card>

        <Modal
          footer={
            <>
              <Button onClick={() => setConfirmDiscard(false)} variant="secondary">
                ادامه ویرایش
              </Button>
              <Button onClick={leaveEditor} variant="danger">
                خروج بدون ذخیره
              </Button>
            </>
          }
          onClose={() => setConfirmDiscard(false)}
          open={confirmDiscard}
          title="تغییرات ذخیره نشده‌اند"
        >
          <p>اگر خارج شوید، تغییرات این قالب کنار گذاشته می‌شود.</p>
        </Modal>
      </>
    );
  }

  return (
    <div className={`${styles.pageStack} ${styles.visitTemplates}`}>
      <Card>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>قالب‌های فرم ویزیت</h2>
            <p className={styles.sectionDescription}>
              فرم آماده انتخاب کنید، از فرم‌های خودتان نسخه بسازید یا یک فرم تازه طراحی کنید.
            </p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={beginCreate} variant="secondary">
            ساخت فرم جدید
          </Button>
        </div>

        {feedback ? (
          <div
            className={`${styles.alert} ${
              feedbackTone === "error" ? styles.alertError : styles.alertSuccess
            }`}
            role="status"
          >
            {feedback}
          </div>
        ) : null}

        {templates.length === 0 ? (
          <EmptyState
            description="هنوز قالب فرم ویزیتی نساخته‌اید."
            title="فهرست فرم‌ها خالی است"
          />
        ) : (
          <ul className={styles.reviewList}>
            {templates.map((template) => (
              <li className={styles.editableCard} key={template.id}>
                <div className={styles.ruleCardHeader}>
                  <div>
                    <strong>{template.name}</strong>
                    <p>
                      نسخه {template.version} · {template.sections.length} بخش
                    </p>
                  </div>
                  <div className={styles.actionIconGroup}>
                    {template.isDefault ? (
                      <StatusBadge variant="success">پیش‌فرض ویزیت‌های جدید</StatusBadge>
                    ) : null}
                    <StatusBadge variant={template.isActive ? "success" : "neutral"}>
                      {template.isActive ? "قابل انتخاب" : "بایگانی‌شده"}
                    </StatusBadge>
                    <Button onClick={() => beginEdit(template)} size="sm" variant="secondary">
                      ویرایش فرم
                    </Button>
                    <Button
                      iconStart={<Copy size={16} />}
                      onClick={() => handleDuplicate(template.id)}
                      size="sm"
                      variant="secondary"
                    >
                      ساخت نسخه برای ویرایش
                    </Button>
                    {!template.isDefault && template.isActive ? (
                      <Button
                        iconStart={<Star size={16} />}
                        onClick={() => handleSetDefault(template.id)}
                        size="sm"
                        variant="secondary"
                      >
                        انتخاب برای ویزیت‌های جدید
                      </Button>
                    ) : null}
                    {template.isActive ? (
                      <Button
                        iconStart={<Trash2 size={16} />}
                        onClick={() => handleArchive(template.id)}
                        size="sm"
                        variant="danger"
                      >
                        بایگانی فرم
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SectionEditor({
  canMoveDown,
  canMoveUp,
  onChange,
  onDropField,
  onMoveDown,
  onMoveUp,
  onRemove,
  section
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  onChange: (section: VisitFormSectionDefinition) => void;
  onDropField: (type: VisitFormFieldType, targetKey?: string, after?: boolean) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  section: VisitFormSectionDefinition;
}) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [showFieldTypes, setShowFieldTypes] = useState(false);
  const fields = [...section.fields].sort((a, b) => a.order - b.order);

  const updateField = (key: string, next: VisitFormFieldDefinition) => {
    onChange({
      ...section,
      fields: section.fields.map((field) => (field.key === key ? next : field))
    });
  };

  const removeField = (key: string) => {
    const nextFields = fields
      .filter((field) => field.key !== key)
      .map((field, index) => ({ ...field, order: index }));
    onChange({ ...section, fields: nextFields });
    if (editingFieldKey === key) setEditingFieldKey(null);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetKey?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const type = event.dataTransfer.getData("application/x-athlore-field-type");
    if (fieldTypeOptions.some((option) => option.value === type)) {
      onDropField(type as VisitFormFieldType, targetKey, after);
      return;
    }
    const movingKey = event.dataTransfer.getData("application/x-athlore-field-key");
    if (movingKey && targetKey) onChange(moveField(section, movingKey, targetKey, after));
    else if (movingKey && fields.length > 1) {
      onChange(moveField(section, movingKey, fields[fields.length - 1].key, true));
    }
  };

  const moveBy = (key: string, amount: -1 | 1) => {
    const index = fields.findIndex((field) => field.key === key);
    const target = fields[index + amount];
    if (!target) return;
    onChange(moveField(section, key, target.key, amount > 0));
  };

  return (
    <section
      className={styles.formSectionEditor}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => handleDrop(event)}
    >
      <div className={styles.formSectionEditorHeader}>
        <FormField label="نام بخش">
          <Input
            onChange={(event) => onChange({ ...section, label: event.target.value })}
            value={section.label}
          />
        </FormField>
        <div className={styles.formSectionHeaderActions}>
          <Button
            aria-label="انتقال بخش به بالا"
            disabled={!canMoveUp}
            iconStart={<ArrowUp size={16} />}
            onClick={onMoveUp}
            size="sm"
            variant="secondary"
          />
          <Button
            aria-label="انتقال بخش به پایین"
            disabled={!canMoveDown}
            iconStart={<ArrowDown size={16} />}
            onClick={onMoveDown}
            size="sm"
            variant="secondary"
          />
          <Button
            iconStart={<Plus size={16} />}
            onClick={() => setShowFieldTypes((current) => !current)}
            size="sm"
            variant="secondary"
          >
            افزودن سؤال
          </Button>
          <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
            حذف این بخش
          </Button>
        </div>
      </div>

      {showFieldTypes ? (
        <div className={styles.formInlineTypes}>
          {fieldTypeOptions.map((option) => (
            <Button
              key={option.value}
              onClick={() => {
                onDropField(option.value);
                setShowFieldTypes(false);
              }}
              size="sm"
              variant="secondary"
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}

      {fields.length === 0 ? (
        <div className={styles.formEmptyDropZone}>
          اینجا سؤال‌ها را رها کنید یا روی «افزودن سؤال» بزنید.
        </div>
      ) : null}

      <ul className={styles.formQuestionList}>
        {fields.map((field, index) => (
          <li
            className={styles.formQuestionCard}
            data-field-key={field.key}
            key={field.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, field.key)}
          >
            <div className={styles.formQuestionHeader}>
              <button
                aria-label={`گرفتن برای جابه‌جایی سؤال ${field.label}`}
                className={styles.formDragHandle}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-athlore-field-key", field.key);
                  event.dataTransfer.effectAllowed = "move";
                }}
                type="button"
              >
                <GripVertical aria-hidden size={18} />
              </button>
              <div className={styles.formQuestionTitle}>
                <strong>{field.label || "سؤال بدون عنوان"}</strong>
                <span>
                  {fieldTypeLabels[field.type]}
                  {field.required ? " · الزامی" : " · اختیاری"}
                </span>
              </div>
              <div className={styles.formQuestionActions}>
                <Button
                  aria-label="انتقال سؤال به بالا"
                  disabled={index === 0}
                  iconStart={<ArrowUp size={16} />}
                  onClick={() => moveBy(field.key, -1)}
                  size="sm"
                  variant="secondary"
                />
                <Button
                  aria-label="انتقال سؤال به پایین"
                  disabled={index === fields.length - 1}
                  iconStart={<ArrowDown size={16} />}
                  onClick={() => moveBy(field.key, 1)}
                  size="sm"
                  variant="secondary"
                />
                <Switch
                  checked={field.enabled}
                  label={field.enabled ? "نمایش" : "پنهان"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, { ...field, enabled: checked })
                  }
                />
                <Button
                  onClick={() =>
                    setEditingFieldKey((current) => (current === field.key ? null : field.key))
                  }
                  size="sm"
                  variant="secondary"
                >
                  {editingFieldKey === field.key ? "بستن تنظیمات" : "ویرایش سؤال"}
                </Button>
                <Button
                  iconStart={<Trash2 size={16} />}
                  onClick={() => removeField(field.key)}
                  size="sm"
                  variant="danger"
                >
                  حذف سؤال
                </Button>
              </div>
            </div>

            {editingFieldKey === field.key ? (
              <div className={styles.formQuestionSettings}>
                <div className={styles.cardGrid}>
                  <FormField label="عنوانی که نمایش داده می‌شود">
                    <Input
                      onChange={(event) =>
                        updateField(field.key, { ...field, label: event.target.value })
                      }
                      value={field.label}
                    />
                  </FormField>
                  <FormField label="نوع پاسخ">
                    <Select
                      onChange={(event) =>
                        updateField(field.key, {
                          ...field,
                          type: event.target.value as VisitFormFieldType
                        })
                      }
                      options={fieldTypeOptions}
                      value={field.type}
                    />
                  </FormField>
                  <FormField label="پاسخ الزامی است؟">
                    <Switch
                      checked={field.required}
                      label={field.required ? "بله، باید پاسخ دهد" : "خیر، اختیاری است"}
                      onCheckedChange={(checked) =>
                        updateField(field.key, { ...field, required: checked })
                      }
                    />
                  </FormField>
                </div>

                {field.type === "single_select" || field.type === "multi_select" ? (
                  <FormField hint="هر گزینه را در یک خط بنویسید." label="گزینه‌های پاسخ">
                    <Textarea
                      onChange={(event) => {
                        const labels = event.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean);
                        const options = labels.map((label, optionIndex) => ({
                          label,
                          value: field.options[optionIndex]?.value || `option_${optionIndex + 1}`
                        }));
                        updateField(field.key, { ...field, options });
                      }}
                      rows={4}
                      value={field.options.map((option) => option.label).join("\n")}
                    />
                  </FormField>
                ) : null}

                <div className={styles.cardGrid}>
                  <FormField
                    hint="چه کسی این پاسخ را وارد یا اصلاح می‌کند؟"
                    label="چه کسی پاسخ می‌دهد؟"
                  >
                    <Select
                      onChange={(event) => {
                        const respondent = event.target.value;
                        updateField(field.key, {
                          ...field,
                          coachEditable: respondent !== "student",
                          studentEditable: respondent === "student" || respondent === "both",
                          studentVisible: respondent !== "coach"
                        });
                      }}
                      options={[
                        { label: "فقط مربی", value: "coach" },
                        { label: "فقط شاگرد", value: "student" },
                        { label: "مربی و شاگرد", value: "both" },
                        { label: "شاگرد فقط می‌بیند", value: "readonly" }
                      ]}
                      value={
                        field.studentEditable
                          ? field.coachEditable === false
                            ? "student"
                            : "both"
                          : field.studentVisible
                            ? "readonly"
                            : "coach"
                      }
                    />
                  </FormField>
                  <FormField
                    hint="پس از نهایی‌شدن ویزیت، پاسخ شاگرد نمایش داده شود؟"
                    label="نمایش پس از نهایی‌سازی"
                  >
                    <Select
                      onChange={(event) =>
                        updateField(field.key, {
                          ...field,
                          studentVisibleWhenFinalized: event.target.value === "yes"
                        })
                      }
                      options={[
                        { label: "بله، شاگرد ببیند", value: "yes" },
                        { label: "خیر، فقط نزد مربی بماند", value: "no" }
                      ]}
                      value={
                        Boolean(field.studentVisibleWhenFinalized ?? field.studentVisible)
                          ? "yes"
                          : "no"
                      }
                    />
                  </FormField>
                </div>

                <FormField hint="این راهنما برای شاگرد دیده می‌شود." label="راهنمای پاسخ">
                  <Input
                    onChange={(event) =>
                      updateField(field.key, { ...field, helpText: event.target.value })
                    }
                    value={field.helpText}
                  />
                </FormField>
                <FormField hint="این یادداشت فقط برای مربی است." label="یادداشت داخلی مربی">
                  <Input
                    onChange={(event) =>
                      updateField(field.key, { ...field, coachHelpText: event.target.value })
                    }
                    value={field.coachHelpText ?? ""}
                  />
                </FormField>

                <details className={styles.formAdvancedDetails}>
                  <summary>اطلاعات فنی و اثر بر تولید برنامه</summary>
                  <p>
                    {field.semanticKey
                      ? `این سؤال با دادهٔ استاندارد «${field.semanticKey}» ذخیره شده است.`
                      : "این سؤال سفارشی است؛ پاسخ آن ذخیره می‌شود اما به‌تنهایی در تولید برنامه استفاده نمی‌شود."}
                  </p>
                  <code>{field.key}</code>
                </details>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
