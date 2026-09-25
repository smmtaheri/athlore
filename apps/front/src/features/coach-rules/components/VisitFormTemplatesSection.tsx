import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Plus, RefreshCcw, Save, Star, Trash2 } from "lucide-react";
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
  VisitFormTemplate
} from "../../students/types/visitForm";
import styles from "../../programs/components/programFlow.module.css";

export interface VisitFormTemplatesSectionProps {
  repository?: VisitFormTemplatesRepository;
}

const fieldTypeOptions: Array<{ label: string; value: VisitFormFieldType }> = [
  { label: "متن", value: "text" },
  { label: "عدد", value: "number" },
  { label: "بله/خیر", value: "boolean" },
  { label: "انتخاب تکی", value: "single_select" },
  { label: "انتخاب چندتایی", value: "multi_select" },
  { label: "متن بلند", value: "textarea" },
  { label: "تاریخ", value: "date" }
];

function createEmptyField(order: number): VisitFormFieldDefinition {
  return {
    coachEditable: true,
    coachHelpText: "",
    enabled: true,
    helpText: "",
    key: `custom_field_${Date.now()}`,
    label: "فیلد جدید",
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

export function VisitFormTemplatesSection({
  repository = visitFormTemplatesRepository
}: VisitFormTemplatesSectionProps) {
  const [templates, setTemplates] = useState<VisitFormTemplate[]>([]);
  const [draft, setDraft] = useState<VisitFormTemplate | null>(null);
  const [baseline, setBaseline] = useState<VisitFormTemplate | null>(null);
  const [creating, setCreating] = useState(false);
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
    const next: VisitFormTemplate = {
      description: "",
      id: "new-template",
      isActive: true,
      isDefault: templates.length === 0,
      key: "",
      name: "",
      sections: [],
      version: 1
    };
    setCreating(true);
    setBaseline(structuredClone(next));
    setDraft(next);
    setFeedback("");
  };

  const beginEdit = (template: VisitFormTemplate) => {
    listScrollPosition.current = window.scrollY;
    if (window.scrollY > 0) window.scrollTo(0, 0);
    const next = structuredClone(template);
    setCreating(false);
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
        showFeedback("نام و کلید قالب الزامی است.", "error");
        setStatus("loaded");
        return;
      }
      const saved = creating
        ? await repository.create({
            key: draft.key.trim(),
            name: draft.name.trim(),
            description: draft.description,
            isActive: draft.isActive,
            sections: draft.sections
          })
        : await repository.update(draft.id, {
            description: draft.description,
            isActive: draft.isActive,
            name: draft.name,
            sections: draft.sections
          });
      setTemplates((current) =>
        creating
          ? [saved, ...current]
          : current.map((item) => (item.id === saved.id ? saved : item))
      );
      setStatus("loaded");
      leaveEditor();
      showFeedback(creating ? "قالب فرم ویزیت ایجاد شد." : "قالب فرم ویزیت ذخیره شد.");
    } catch {
      setStatus("loaded");
      showFeedback("ذخیره قالب فرم ویزیت انجام نشد.", "error");
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
      showFeedback("قالب پیش‌فرض تنظیم شد.");
    } catch {
      showFeedback("تنظیم پیش‌فرض انجام نشد.", "error");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const archived = await repository.archive(id);
      setTemplates((current) => current.map((item) => (item.id === id ? archived : item)));
      showFeedback("قالب بایگانی شد.");
    } catch {
      showFeedback("بایگانی قالب انجام نشد.", "error");
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

  if (draft) {
    const dirty = Boolean(baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
    return (
      <>
        <Card className={styles.templateEditorPage}>
          <div className={styles.templateEditorHeader}>
            <div>
              <p className={styles.sectionDescription}>قوانین مربی / فرم‌های ویزیت</p>
              <h2 className={styles.sectionTitle}>
                {creating ? "ساخت قالب ویزیت" : `ویرایش قالب: ${draft.name}`}
              </h2>
              <p className={styles.sectionDescription}>
                تغییرات را در همین صفحه انجام دهید؛ بعد از ذخیره به فهرست قالب‌ها برمی‌گردید.
              </p>
            </div>
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
            <FormField htmlFor="visit-form-template-name" label="نام قالب" required>
              <Input
                autoFocus={creating}
                id="visit-form-template-name"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, name: event.target.value }))
                }
                value={draft.name}
              />
            </FormField>
            <FormField htmlFor="visit-form-template-key" label="کلید قالب" required>
              <Input
                disabled={!creating}
                id="visit-form-template-key"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, key: event.target.value }))
                }
                value={draft.key}
              />
            </FormField>
            <FormField label="فعال">
              <Switch
                checked={draft.isActive}
                label={draft.isActive ? "فعال" : "غیرفعال"}
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
              <h3 className={styles.ruleCardTitle}>بخش‌ها و فیلدهای قالب</h3>
              <p className={styles.sectionDescription}>
                فیلد تازه در ابتدای بخش مربوط قرار می‌گیرد.
              </p>
            </div>
            <Button
              iconStart={<Plus size={16} />}
              onClick={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: [
                    { fields: [], key: `section_${Date.now()}`, label: "بخش جدید", order: 0 },
                    ...current.sections.map((section) => ({
                      ...section,
                      order: section.order + 1
                    }))
                  ]
                }))
              }
              size="sm"
              variant="secondary"
            >
              افزودن بخش
            </Button>
          </div>

          {[...draft.sections]
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <SectionEditor
                key={section.key}
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
                section={section}
              />
            ))}

          <div className={styles.templateEditorActions}>
            <span>{dirty ? "تغییرات ذخیره‌نشده" : "همه‌چیز ذخیره است"}</span>
            <div>
              <Button
                iconStart={<Save size={18} />}
                isLoading={status === "saving"}
                onClick={() => void saveTemplate()}
              >
                {creating ? "ایجاد قالب" : "ذخیره قالب"}
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
    <div className={styles.pageStack}>
      <Card>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>فرم‌های ویزیت</h2>
            <p className={styles.sectionDescription}>
              مدیریت قالب‌های فرم ویزیت: ایجاد، ویرایش، کپی، بایگانی و تعیین پیش‌فرض.
            </p>
          </div>
          <Button iconStart={<Plus size={18} />} onClick={beginCreate} variant="secondary">
            قالب جدید
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
          <EmptyState description="هنوز قالب فرم ویزیتی تعریف نشده است." title="قالبی نیست" />
        ) : (
          <ul className={styles.reviewList}>
            {templates.map((template) => (
              <li className={styles.editableCard} key={template.id}>
                <div className={styles.ruleCardHeader}>
                  <div>
                    <strong>{template.name}</strong>
                    <p>
                      {template.key} · v{template.version}
                    </p>
                  </div>
                  <div className={styles.actionIconGroup}>
                    {template.isDefault ? (
                      <StatusBadge variant="success">پیش‌فرض</StatusBadge>
                    ) : null}
                    <StatusBadge variant={template.isActive ? "success" : "neutral"}>
                      {template.isActive ? "فعال" : "بایگانی"}
                    </StatusBadge>
                    <Button onClick={() => beginEdit(template)} size="sm" variant="secondary">
                      ویرایش
                    </Button>
                    <Button
                      iconStart={<Copy size={16} />}
                      onClick={() => handleDuplicate(template.id)}
                      size="sm"
                      variant="secondary"
                    >
                      کپی
                    </Button>
                    {!template.isDefault && template.isActive ? (
                      <Button
                        iconStart={<Star size={16} />}
                        onClick={() => handleSetDefault(template.id)}
                        size="sm"
                        variant="secondary"
                      >
                        پیش‌فرض
                      </Button>
                    ) : null}
                    {template.isActive ? (
                      <Button
                        iconStart={<Trash2 size={16} />}
                        onClick={() => handleArchive(template.id)}
                        size="sm"
                        variant="danger"
                      >
                        بایگانی
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
  onChange,
  onRemove,
  section
}: {
  onChange: (section: VisitFormSectionDefinition) => void;
  onRemove: () => void;
  section: VisitFormSectionDefinition;
}) {
  const fields = [...section.fields].sort((a, b) => a.order - b.order);

  const updateField = (key: string, next: VisitFormFieldDefinition) => {
    onChange({
      ...section,
      fields: section.fields.map((field) => (field.key === key ? next : field))
    });
  };

  const addField = () => {
    onChange({
      ...section,
      fields: [
        createEmptyField(0),
        ...section.fields.map((field) => ({ ...field, order: field.order + 1 }))
      ]
    });
  };

  const removeField = (key: string) => {
    onChange({
      ...section,
      fields: section.fields.filter((field) => field.key !== key)
    });
  };

  return (
    <div className={styles.editableCard}>
      <div className={styles.ruleCardHeader}>
        <div>
          <strong>{section.label || section.key}</strong>
          <p>ترتیب بخش: {section.order}</p>
        </div>
        <Button iconStart={<Plus size={16} />} onClick={addField} size="sm" variant="secondary">
          افزودن فیلد
        </Button>
        <Button iconStart={<Trash2 size={16} />} onClick={onRemove} size="sm" variant="danger">
          حذف بخش
        </Button>
      </div>

      <div className={styles.cardGrid}>
        <FormField label="برچسب بخش">
          <Input
            onChange={(event) => onChange({ ...section, label: event.target.value })}
            value={section.label}
          />
        </FormField>
        <FormField label="ترتیب بخش">
          <Input
            onChange={(event) => onChange({ ...section, order: Number(event.target.value) || 0 })}
            type="number"
            value={String(section.order)}
          />
        </FormField>
      </div>

      <ul className={styles.reviewList}>
        {fields.map((field) => (
          <li className={styles.editableCard} key={field.key}>
            <div className={styles.ruleCardHeader}>
              <strong>{field.label || field.key}</strong>
              <div className={styles.actionIconGroup}>
                <Switch
                  checked={field.enabled}
                  label={field.enabled ? "فعال" : "غیرفعال"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, { ...field, enabled: checked })
                  }
                />
                <Button
                  iconStart={<Trash2 size={16} />}
                  onClick={() => removeField(field.key)}
                  size="sm"
                  variant="danger"
                >
                  حذف
                </Button>
              </div>
            </div>

            <div className={styles.cardGrid}>
              <FormField label="برچسب">
                <Input
                  onChange={(event) =>
                    updateField(field.key, { ...field, label: event.target.value })
                  }
                  value={field.label}
                />
              </FormField>
              <FormField label="کلید فیلد">
                <Input
                  onChange={(event) =>
                    updateField(field.key, {
                      ...field,
                      key: event.target.value.trim() || field.key
                    })
                  }
                  value={field.key}
                />
              </FormField>
              <FormField label="نوع">
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
              <FormField label="ترتیب">
                <Input
                  onChange={(event) =>
                    updateField(field.key, { ...field, order: Number(event.target.value) || 0 })
                  }
                  type="number"
                  value={String(field.order)}
                />
              </FormField>
              <FormField label="semantic key">
                <Input
                  onChange={(event) =>
                    updateField(field.key, { ...field, semanticKey: event.target.value })
                  }
                  value={field.semanticKey}
                />
              </FormField>
              <FormField label="الزامی">
                <Switch
                  checked={field.required}
                  label={field.required ? "الزامی" : "اختیاری"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, { ...field, required: checked })
                  }
                />
              </FormField>
            </div>

            <div className={styles.cardGrid}>
              <FormField
                hint="آیا شاگرد هنگام تکمیل فرم باز این فیلد را ببیند؟"
                label="قابل مشاهده برای شاگرد (باز)"
              >
                <Switch
                  checked={Boolean(field.studentVisible)}
                  label={field.studentVisible ? "بله" : "خیر"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, {
                      ...field,
                      studentEditable: checked ? field.studentEditable : false,
                      studentVisible: checked
                    })
                  }
                />
              </FormField>
              <FormField
                hint="آیا شاگرد بتواند این فیلد را وارد یا تغییر دهد؟ (در صورت فعال بودن، مشاهده هم اجباری است)"
                label="قابل ویرایش توسط شاگرد"
              >
                <Switch
                  checked={Boolean(field.studentEditable)}
                  label={field.studentEditable ? "بله" : "خیر"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, {
                      ...field,
                      studentEditable: checked,
                      studentVisible: checked ? true : field.studentVisible
                    })
                  }
                />
              </FormField>
              <FormField
                hint="آیا مربی بتواند این فیلد را در پیش‌نویس یا مرحلهٔ بررسی ویرایش کند؟"
                label="قابل ویرایش توسط مربی"
              >
                <Switch
                  checked={field.coachEditable !== false}
                  label={field.coachEditable === false ? "خیر" : "بله"}
                  onCheckedChange={(checked) =>
                    updateField(field.key, { ...field, coachEditable: checked })
                  }
                />
              </FormField>
              <FormField
                hint="آیا شاگرد بعد از نهایی‌شدن ویزیت این فیلد را ببیند؟"
                label="قابل مشاهده پس از نهایی‌سازی"
              >
                <Switch
                  checked={Boolean(field.studentVisibleWhenFinalized ?? field.studentVisible)}
                  label={
                    (field.studentVisibleWhenFinalized ?? field.studentVisible) ? "بله" : "خیر"
                  }
                  onCheckedChange={(checked) =>
                    updateField(field.key, {
                      ...field,
                      studentVisibleWhenFinalized: checked
                    })
                  }
                />
              </FormField>
            </div>

            {(field.type === "single_select" || field.type === "multi_select") && (
              <FormField hint="هر خط: value|label" label="گزینه‌ها">
                <Textarea
                  onChange={(event) => {
                    const options = event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [value, ...labelParts] = line.split("|");
                        const label = labelParts.join("|").trim() || value;
                        return { label, value: value.trim() };
                      });
                    updateField(field.key, { ...field, options });
                  }}
                  rows={4}
                  value={field.options
                    .map((option) =>
                      option.label === option.value
                        ? option.value
                        : `${option.value}|${option.label}`
                    )
                    .join("\n")}
                />
              </FormField>
            )}

            <FormField hint="این متن در فرم شاگرد نمایش داده می‌شود." label="راهنمای شاگرد">
              <Input
                onChange={(event) =>
                  updateField(field.key, { ...field, helpText: event.target.value })
                }
                value={field.helpText}
              />
            </FormField>
            <FormField
              hint="این یادداشت فقط در پنل مربی نمایش داده می‌شود."
              label="یادداشت داخلی مربی"
            >
              <Input
                onChange={(event) =>
                  updateField(field.key, { ...field, coachHelpText: event.target.value })
                }
                value={field.coachHelpText ?? ""}
              />
            </FormField>
          </li>
        ))}
      </ul>
    </div>
  );
}
