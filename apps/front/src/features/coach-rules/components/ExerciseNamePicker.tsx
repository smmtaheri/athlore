import { useState } from "react";
import { Button, Checkbox, EmptyState, FormField, Input, Modal } from "../../../components/ui";
import { apiRequest } from "../../../shared/api/client";
import { useDebouncedSearch, usePagedList, type ListPage } from "../../../shared/api/usePagedList";
import styles from "./ruleOptionPicker.module.css";

interface ExerciseOption {
  id: string;
  is_active: boolean;
  is_archived: boolean;
  name: string;
}

interface ExerciseNamePickerProps {
  label: string;
  onChange: (value: string[]) => void;
  value: string[];
}

export function ExerciseNamePicker({ label, onChange, value }: ExerciseNamePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <FormField
      hint="حرکت جدید را ابتدا در تب کاتالوگ حرکات ثبت کنید؛ اینجا فقط از حرکات فعال کاتالوگ انتخاب می‌شود."
      label={label}
    >
      <div className={styles.selection}>
        <Button onClick={() => setOpen(true)} variant="secondary">
          انتخاب از کاتالوگ ({value.length})
        </Button>
        {value.length ? (
          <div className={styles.selectedValues}>
            {value.map((name) => (
              <Button
                aria-label={`حذف ${name}`}
                key={name}
                onClick={() => onChange(value.filter((item) => item !== name))}
                size="sm"
                variant="secondary"
              >
                {name} ×
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {open ? (
        <ExerciseNamePickerDialog
          onChange={onChange}
          onClose={() => setOpen(false)}
          value={value}
        />
      ) : null}
    </FormField>
  );
}

function ExerciseNamePickerDialog({
  onChange,
  onClose,
  value
}: {
  onChange: (value: string[]) => void;
  onClose: () => void;
  value: string[];
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedSearch(query);
  const pages = usePagedList<ExerciseOption>(
    (offset, signal) =>
      apiRequest<ListPage<ExerciseOption>>("/exercises/", {
        signal,
        query: { limit: 20, offset, search: debouncedQuery }
      }),
    debouncedQuery
  );
  const exercises = pages.items.filter((item) => item.is_active && !item.is_archived);

  const toggle = (exercise: ExerciseOption, checked: boolean) => {
    onChange(checked ? [...value, exercise.name] : value.filter((name) => name !== exercise.name));
  };

  return (
    <Modal
      footer={<Button onClick={onClose}>تأیید انتخاب‌ها</Button>}
      onClose={onClose}
      open
      title="انتخاب حرکت از کاتالوگ"
    >
      <div className={styles.dialogContent}>
        <FormField label="جست‌وجوی حرکت">
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />
        </FormField>
        {pages.error ? (
          <div className={styles.error} role="alert">
            دریافت کاتالوگ حرکات انجام نشد.
            <Button onClick={pages.retry} size="sm" variant="secondary">
              تلاش دوباره
            </Button>
          </div>
        ) : null}
        {pages.loading && exercises.length === 0 ? <p>در حال دریافت حرکات…</p> : null}
        {!pages.loading && !pages.error && exercises.length === 0 ? (
          <EmptyState title="حرکتی با این جست‌وجو پیدا نشد" />
        ) : null}
        {exercises.length ? (
          <div aria-label="حرکات کاتالوگ" className={styles.options}>
            {exercises.map((exercise) => (
              <Checkbox
                checked={value.includes(exercise.name)}
                key={exercise.id}
                label={exercise.name}
                onChange={(event) => toggle(exercise, event.target.checked)}
              />
            ))}
          </div>
        ) : null}
        {pages.hasMore ? (
          <Button disabled={pages.loading} onClick={pages.loadMore} variant="secondary">
            {pages.loading ? "در حال دریافت…" : "نمایش حرکات بیشتر"}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
