import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, RefreshCcw, Save, Star, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VisitFormTemplate | null>(null);
  const [draftSourceId, setDraftSourceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const [status, setStatus] = useState<"error" | "loaded" | "loading" | "saving">("loading");
  const [requestKey, setRequestKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let isMounted = true;
    repository
      .list()
      .then((items) => {
        if (!isMounted) {
          return;
        }
        setTemplates(items);
        setSelectedId((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? null;
        });
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

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [selectedId, templates]
  );

  if ((selected?.id ?? null) !== draftSourceId) {
    setDraftSourceId(selected?.id ?? null);
    setDraft(selected ? structuredClone(selected) : null);
  }

  const showFeedback = (message: string, tone: "error" | "success" = "success") => {
    setFeedback(message);
    setFeedbackTone(tone);
  };

  const updateDraft = (updater: (current: VisitFormTemplate) => VisitFormTemplate) => {
    setDraft((current) => (current ? updater(structuredClone(current)) : current));
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
      const saved = await repository.update(draft.id, {
        description: draft.description,
        isActive: draft.isActive,
        name: draft.name,
        sections: draft.sections
      });
      setTemplates((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setDraft(saved);
      setStatus("loaded");
      showFeedback("قالب فرم ویزیت ذخیره شد.");
    } catch {
      setStatus("loaded");
      showFeedback("ذخیره قالب فرم ویزیت انجام نشد.", "error");
    }
  };

  const handleCreate = async () => {
    if (!newKey.trim() || !newName.trim()) {
      showFeedback("کلید و نام قالب الزامی است.", "error");
      return;
    }
    setStatus("saving");
    try {
      const created = await repository.create({
        key: newKey.trim(),
        name: newName.trim(),
        sections: []
      });
      setTemplates((current) => [created, ...current]);
      setSelectedId(created.id);
      setCreating(false);
      setNewKey("");
      setNewName("");
      setStatus("loaded");
      showFeedback("قالب جدید ایجاد شد.");
    } catch {
      setStatus("loaded");
      showFeedback("ایجاد قالب انجام نشد.", "error");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await repository.duplicate(id);
      setTemplates((current) => [dup, ...current]);
      setSelectedId(dup.id);
      showFeedback("قالب کپی شد.");
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
          <Button
            iconStart={<Plus size={18} />}
            onClick={() => setCreating((current) => !current)}
            variant="secondary"
          >
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

        {creating ? (
          <div className={styles.cardGrid}>
            <FormField htmlFor="visit-form-new-key" label="کلید قالب" required>
              <Input
                id="visit-form-new-key"
                onChange={(event) => setNewKey(event.target.value)}
                value={newKey}
              />
            </FormField>
            <FormField htmlFor="visit-form-new-name" label="نام قالب" required>
              <Input
                id="visit-form-new-name"
                onChange={(event) => setNewName(event.target.value)}
                value={newName}
              />
            </FormField>
            <div className={styles.actionIconGroup}>
              <Button isLoading={status === "saving"} onClick={handleCreate}>
                ایجاد
              </Button>
              <Button onClick={() => setCreating(false)} variant="secondary">
                انصراف
              </Button>
            </div>
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
                    <Button
                      onClick={() => setSelectedId(template.id)}
                      size="sm"
                      variant={selectedId === template.id ? "primary" : "secondary"}
                    >
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

      {draft ? (
        <Card className={styles.pageStack}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>ویرایش قالب</h2>
              <p className={styles.sectionDescription}>
                فعال/غیرفعال کردن فیلدها، ویرایش برچسب‌ها و افزودن فیلد.
              </p>
            </div>
            <Button
              iconStart={<Save size={18} />}
              isLoading={status === "saving"}
              onClick={saveTemplate}
            >
              ذخیره قالب
            </Button>
          </div>

          <div className={styles.cardGrid}>
            <FormField htmlFor="visit-form-template-name" label="نام قالب">
              <Input
                id="visit-form-template-name"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, name: event.target.value }))
                }
                value={draft.name}
              />
            </FormField>
            <FormField htmlFor="visit-form-template-key" label="کلید قالب">
              <Input disabled id="visit-form-template-key" value={draft.key} />
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
            <p className={styles.sectionDescription}>بخش‌ها و فیلدهای قالب</p>
            <Button
              iconStart={<Plus size={16} />}
              onClick={() =>
                updateDraft((current) => {
                  const nextOrder =
                    current.sections.reduce((max, section) => Math.max(max, section.order), -1) + 1;
                  return {
                    ...current,
                    sections: [
                      ...current.sections,
                      {
                        fields: [],
                        key: `section_${Date.now()}`,
                        label: "بخش جدید",
                        order: nextOrder
                      }
                    ]
                  };
                })
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
                section={section}
              />
            ))}
        </Card>
      ) : null}
    </div>
  );
}

function SectionEditor({
  onChange,
  section
}: {
  onChange: (section: VisitFormSectionDefinition) => void;
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
    const nextOrder = section.fields.reduce((max, field) => Math.max(max, field.order), -1) + 1;
    onChange({
      ...section,
      fields: [...section.fields, createEmptyField(nextOrder)]
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
