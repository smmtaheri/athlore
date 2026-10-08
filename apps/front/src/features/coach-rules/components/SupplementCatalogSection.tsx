import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  EditorDrawer,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Textarea
} from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import {
  newSupplementDose,
  supplementCatalogRepository as repository,
  type SupplementEntry,
  type SupplementOptions
} from "../services/supplementCatalogRepository";
import { SupplementDoseFields } from "./SupplementDoseFields";
import styles from "../../programs/components/programFlow.module.css";
import catalogStyles from "./supplementCatalog.module.css";

const newEntry = (): SupplementEntry => ({
  id: "",
  name: "",
  name_en: "",
  aliases: [],
  category: "",
  goal_ids: [],
  reason: "",
  instructions: "",
  warnings: "",
  replacement_group: "",
  priority: 0,
  is_active: true,
  is_archived: false,
  auto_eligible: false,
  reviewed: false,
  doses: [newSupplementDose()]
});
const message = (error: unknown) =>
  error instanceof ApiError ? persianMessageForApiError(error) : "دریافت یا ذخیره مکمل انجام نشد.";

export function SupplementCatalogSection() {
  const [entries, setEntries] = useState<SupplementEntry[]>([]);
  const [options, setOptions] = useState<SupplementOptions>();
  const [draft, setDraft] = useState<SupplementEntry>();
  const [baseline, setBaseline] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [goalFilter, setGoalFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [archive, setArchive] = useState<SupplementEntry>();
  const [goalDraft, setGoalDraft] = useState<{ id?: string; name: string }>();
  const refresh = async () => {
    const [items, opts] = await Promise.all([repository.list(), repository.options()]);
    setEntries(items);
    setOptions(opts);
  };
  useEffect(() => {
    let mounted = true;
    void Promise.all([repository.list(), repository.options()])
      .then(([items, opts]) => {
        if (mounted) {
          setEntries(items);
          setOptions(opts);
        }
      })
      .catch((error) => {
        if (mounted) setFeedback(message(error));
      });
    return () => {
      mounted = false;
    };
  }, []);
  const edit = (entry: SupplementEntry) => {
    const copy = structuredClone(entry);
    setDraft(copy);
    setBaseline(JSON.stringify(copy));
    setFeedback("");
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFeedback("");
    try {
      await repository.save(draft);
      await refresh();
      setDraft(undefined);
      setFeedback("مکمل ذخیره شد.");
    } catch (error) {
      setFeedback(message(error));
    } finally {
      setBusy(false);
    }
  };
  const visible = entries.filter(
    (entry) =>
      (!goalFilter || entry.goal_ids.includes(goalFilter)) &&
      (!activeFilter || String(entry.is_active) === activeFilter) &&
      [entry.name, entry.name_en, entry.category, ...entry.aliases]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <Card className={styles.pageStack}>
      <div className={styles.sectionHeader}>
        <h2>بانک مکمل‌ها</h2>
        <Button disabled={!options} onClick={() => edit(newEntry())}>
          افزودن مکمل
        </Button>
      </div>
      <p>
        تعریف‌های این بانک فقط برای حساب شما هستند. مقدار و زمان مصرف باید با وضعیت فردی شاگرد بررسی
        شوند؛ پیشنهاد سیستم نسخه پزشکی نیست.
      </p>
      {feedback ? <p role="status">{feedback}</p> : null}
      <div className={styles.formGrid}>
        <FormField label="جست‌وجوی مکمل">
          <Input
            aria-label="جست‌وجوی مکمل"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </FormField>
        <FormField label="هدف مصرف">
          <Select
            aria-label="فیلتر هدف مصرف"
            value={goalFilter}
            placeholder="همه"
            options={(options?.goals || []).map((goal) => ({ value: goal.id, label: goal.name }))}
            onChange={(event) => setGoalFilter(event.target.value)}
          />
        </FormField>
        <FormField label="وضعیت">
          <Select
            aria-label="فیلتر وضعیت مکمل"
            value={activeFilter}
            placeholder="همه"
            options={[
              { value: "true", label: "فعال" },
              { value: "false", label: "غیرفعال" }
            ]}
            onChange={(event) => setActiveFilter(event.target.value)}
          />
        </FormField>
      </div>
      <details>
        <summary>مدیریت اهداف مصرف</summary>
        <Button size="sm" onClick={() => setGoalDraft({ name: "" })}>
          افزودن هدف
        </Button>
        {(options?.goals || []).map((goal) => (
          <div key={goal.id} className={styles.toolbar}>
            <span>{goal.name}</span>
            <Button size="sm" onClick={() => setGoalDraft(goal)}>
              ویرایش هدف {goal.name}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                void repository
                  .removeGoal(goal.id)
                  .then(refresh)
                  .catch((error) => setFeedback(message(error)));
              }}
            >
              حذف هدف {goal.name}
            </Button>
          </div>
        ))}
      </details>
      {!options ? (
        <EmptyState title="بانک مکمل‌ها" description="در حال دریافت اطلاعات…" />
      ) : !visible.length ? (
        <EmptyState
          title="مکملی یافت نشد"
          description="اولین مکمل را وارد کنید یا فیلترها را تغییر دهید."
        />
      ) : (
        <div className={styles.pageStack}>
          {visible.map((entry) => (
            <div key={entry.id} className={catalogStyles.entry}>
              <div className={catalogStyles.header}>
                <strong>{entry.name}</strong>
                <span>
                  {entry.category} · {entry.is_active ? "فعال" : "غیرفعال"} · اولویت{" "}
                  {entry.priority}
                </span>
              </div>
              <p>{entry.reason}</p>
              <p>
                {entry.doses.length} نوبت مصرف ·{" "}
                {entry.auto_eligible && entry.reviewed ? "مجاز برای پیشنهاد" : "انتخاب دستی"}
              </p>
              <div className={catalogStyles.actions}>
                <Button size="sm" aria-label={`ویرایش ${entry.name}`} onClick={() => edit(entry)}>
                  ویرایش
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void repository
                      .save({ ...entry, is_active: !entry.is_active })
                      .then(refresh)
                      .catch((error) => setFeedback(message(error)));
                  }}
                >
                  {entry.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`آرشیو ${entry.name}`}
                  onClick={() => setArchive(entry)}
                >
                  آرشیو
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <EditorDrawer
        open={!!draft}
        title={draft?.id ? "ویرایش مکمل" : "افزودن مکمل"}
        onClose={() => setDraft(undefined)}
        hasUnsavedChanges={!!draft && JSON.stringify(draft) !== baseline}
        footer={
          <Button isLoading={busy} onClick={save}>
            ذخیره مکمل
          </Button>
        }
      >
        {draft && options ? (
          <div className={styles.pageStack}>
            {feedback ? <p role="alert">{feedback}</p> : null}
            <div className={styles.formGrid}>
              <FormField label="نام مکمل" required>
                <Input
                  aria-label="نام مکمل"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </FormField>
              <FormField label="نام انگلیسی">
                <Input
                  aria-label="نام انگلیسی مکمل"
                  value={draft.name_en}
                  onChange={(event) => setDraft({ ...draft, name_en: event.target.value })}
                />
              </FormField>
              <FormField label="نام‌های جایگزین">
                <Input
                  value={draft.aliases.join("، ")}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      aliases: event.target.value
                        .split(/[,،]/)
                        .map((value) => value.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </FormField>
              <FormField label="نوع یا دسته" required>
                <Input
                  aria-label="نوع مکمل"
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </FormField>
              <FormField label="اولویت؛ عدد بیشتر، انتخاب زودتر">
                <Input
                  aria-label="اولویت مکمل"
                  type="number"
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
                />
              </FormField>
              <FormField label="گروه جایگزین">
                <Input
                  value={draft.replacement_group}
                  onChange={(event) =>
                    setDraft({ ...draft, replacement_group: event.target.value })
                  }
                />
              </FormField>
            </div>
            <p>از هر گروه جایگزین، فقط یک مکمل پیشنهاد می‌شود؛ خالی یعنی بدون گروه.</p>
            <fieldset>
              <legend>اهداف مصرف</legend>
              {options.goals.map((goal) => (
                <Checkbox
                  key={goal.id}
                  label={goal.name}
                  checked={draft.goal_ids.includes(goal.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      goal_ids: event.target.checked
                        ? [...draft.goal_ids, goal.id]
                        : draft.goal_ids.filter((id) => id !== goal.id)
                    })
                  }
                />
              ))}
            </fieldset>
            <FormField label="دلیل مصرف">
              <Textarea
                aria-label="دلیل مصرف"
                value={draft.reason}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
              />
            </FormField>
            <FormField label="دستور مصرف">
              <Textarea
                value={draft.instructions}
                onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              />
            </FormField>
            <FormField label="هشدار و محدودیت">
              <Textarea
                value={draft.warnings}
                onChange={(event) => setDraft({ ...draft, warnings: event.target.value })}
              />
            </FormField>
            <SupplementDoseFields
              doses={draft.doses}
              options={options}
              onChange={(doses) => setDraft({ ...draft, doses })}
            />
            <Checkbox
              label="فعال"
              checked={draft.is_active}
              onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })}
            />
            <Checkbox
              label="تعریف و مقدارها را بازبینی کرده‌ام"
              checked={draft.reviewed}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  reviewed: event.target.checked,
                  auto_eligible: event.target.checked && draft.auto_eligible
                })
              }
            />
            <Checkbox
              label="مجاز برای پیشنهاد خودکار"
              checked={draft.auto_eligible}
              onChange={(event) => setDraft({ ...draft, auto_eligible: event.target.checked })}
            />
          </div>
        ) : null}
      </EditorDrawer>
      <Modal
        open={!!archive}
        title="آرشیو مکمل"
        onClose={() => setArchive(undefined)}
        footer={
          <Button
            variant="danger"
            isLoading={busy}
            onClick={async () => {
              if (!archive) return;
              setBusy(true);
              try {
                await repository.archive(archive.id);
                await refresh();
                setArchive(undefined);
              } catch (error) {
                setFeedback(message(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            تأیید آرشیو
          </Button>
        }
      >
        «{archive?.name}» از انتخاب‌های آینده کنار می‌رود؛ برنامه‌های قبلی تغییر نمی‌کنند.
        {feedback ? <p role="alert">{feedback}</p> : null}
      </Modal>
      <Modal
        open={!!goalDraft}
        title={goalDraft?.id ? "ویرایش هدف مصرف" : "افزودن هدف مصرف"}
        onClose={() => setGoalDraft(undefined)}
        footer={
          <Button
            isLoading={busy}
            onClick={async () => {
              if (!goalDraft) return;
              setBusy(true);
              try {
                await repository.saveGoal(goalDraft.name, goalDraft.id);
                await refresh();
                setGoalDraft(undefined);
              } catch (error) {
                setFeedback(message(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            ذخیره هدف
          </Button>
        }
      >
        <Input
          aria-label="نام هدف مصرف"
          value={goalDraft?.name || ""}
          onChange={(event) => setGoalDraft({ ...goalDraft, name: event.target.value })}
        />
        {feedback ? <p role="alert">{feedback}</p> : null}
      </Modal>
    </Card>
  );
}
