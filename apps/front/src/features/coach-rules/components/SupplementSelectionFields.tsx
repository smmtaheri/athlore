import { useEffect, useState } from "react";
import { Button, Checkbox, FormField, Input, Select, Textarea } from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import {
  supplementCatalogRepository as repository,
  type SupplementEntry,
  type SupplementOptions,
  type SupplementSelection
} from "../services/supplementCatalogRepository";
import { SupplementDoseFields } from "./SupplementDoseFields";
import styles from "../../programs/components/programFlow.module.css";
import catalogStyles from "./supplementCatalog.module.css";

export function SupplementSelectionFields({
  studentId,
  selection,
  onChange
}: {
  studentId: string;
  selection: SupplementSelection;
  onChange: (selection: SupplementSelection) => void;
}) {
  const [entries, setEntries] = useState<SupplementEntry[]>([]);
  const [options, setOptions] = useState<SupplementOptions>();
  const [entryId, setEntryId] = useState("");
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(2);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([repository.list(), repository.options()])
      .then(([items, opts]) => {
        if (mounted) {
          setEntries(items.filter((item) => item.is_active));
          setOptions(opts);
        }
      })
      .catch((error) => {
        if (mounted)
          setFeedback(
            error instanceof ApiError
              ? persianMessageForApiError(error)
              : "دریافت بانک مکمل انجام نشد."
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  const update = (patch: Partial<SupplementSelection>) =>
    onChange({ ...selection, ...patch, confirmed: false });
  const add = () => {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || selection.items.some((item) => item.entry_id === entry.id)) return;
    update({
      mode: "manual",
      items: [
        ...selection.items,
        { entry_id: entry.id, doses: structuredClone(entry.doses), reason: entry.reason }
      ]
    });
    setEntryId("");
  };
  const suggest = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const proposal = await repository.propose(studentId, selection.goal_ids, count);
      update({
        mode: "suggested",
        items: proposal.items.map((entry) => ({
          entry_id: entry.id,
          doses: structuredClone(entry.doses),
          reason: entry.reason
        }))
      });
      setFeedback(
        `${proposal.reason} (${proposal.items.length} مکمل؛ ${proposal.excluded.length} مورد کنار گذاشته شد)`
      );
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? persianMessageForApiError(error) : "پیشنهاد مکمل انجام نشد."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.pageStack}>
      <p>
        انتخاب مکمل برای همین شاگرد است؛ تغییر مقدار و زمان، بانک مرجع را تغییر نمی‌دهد. پیشنهاد
        سیستم جایگزین بررسی وضعیت پزشکی نیست.
      </p>
      {feedback ? <p role="status">{feedback}</p> : null}
      {options ? (
        <>
          <fieldset>
            <legend>هدف پیشنهاد مکمل</legend>
            {options.goals.map((goal) => (
              <Checkbox
                key={goal.id}
                label={goal.name}
                checked={selection.goal_ids.includes(goal.id)}
                onChange={(event) =>
                  update({
                    mode: "manual",
                    goal_ids: event.target.checked
                      ? [...selection.goal_ids, goal.id]
                      : selection.goal_ids.filter((id) => id !== goal.id)
                  })
                }
              />
            ))}
          </fieldset>
          <FormField label="تعداد مکمل پیشنهادی">
            <Input
              aria-label="تعداد مکمل پیشنهادی"
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </FormField>
          <Button
            variant="secondary"
            isLoading={busy}
            disabled={!studentId || !selection.goal_ids.length || count < 1 || count > 10}
            onClick={suggest}
          >
            پیشنهاد براساس هدف و اولویت
          </Button>
          <FormField label="جست‌وجوی بانک مکمل">
            <Input
              aria-label="جست‌وجوی بانک مکمل"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="انتخاب دستی مکمل">
            <Select
              aria-label="انتخاب دستی مکمل"
              placeholder="انتخاب کنید"
              value={entryId}
              onChange={(event) => setEntryId(event.target.value)}
              options={entries
                .filter(
                  (entry) =>
                    !selection.items.some((item) => item.entry_id === entry.id) &&
                    [entry.name, entry.name_en, ...entry.aliases]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase())
                )
                .map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          </FormField>
          <Button disabled={!entryId || selection.items.length >= 30} onClick={add}>
            افزودن از بانک مکمل
          </Button>
          {!entries.length ? (
            <p>بانک مکمل فعالی ندارید؛ ابتدا در قوانین مربی، بانک مکمل‌ها را تکمیل کنید.</p>
          ) : null}
          {selection.items.map((item, index) => (
            <div className={catalogStyles.entry} key={item.entry_id}>
              <h3>
                {entries.find((entry) => entry.id === item.entry_id)?.name || "مکمل انتخاب‌شده"}
              </h3>
              {entries.find((entry) => entry.id === item.entry_id)?.instructions ? (
                <p>
                  دستور مصرف: {entries.find((entry) => entry.id === item.entry_id)?.instructions}
                </p>
              ) : null}
              {entries.find((entry) => entry.id === item.entry_id)?.warnings ? (
                <p role="note">
                  هشدار: {entries.find((entry) => entry.id === item.entry_id)?.warnings}
                </p>
              ) : null}
              <FormField label="دلیل مصرف برای شاگرد">
                <Textarea
                  aria-label={`دلیل مکمل ${index + 1}`}
                  value={item.reason}
                  onChange={(event) =>
                    update({
                      items: selection.items.map((other, i) =>
                        i === index ? { ...other, reason: event.target.value } : other
                      )
                    })
                  }
                />
              </FormField>
              <SupplementDoseFields
                options={options}
                doses={item.doses}
                onChange={(doses) =>
                  update({
                    items: selection.items.map((other, i) =>
                      i === index ? { ...other, doses } : other
                    )
                  })
                }
              />
              <Button
                variant="danger"
                size="sm"
                onClick={() => update({ items: selection.items.filter((_, i) => i !== index) })}
              >
                حذف مکمل از انتخاب
              </Button>
            </div>
          ))}
          <Checkbox
            label="محدودیت‌ها و وضعیت فردی شاگرد را بررسی کرده‌ام"
            checked={selection.safety_reviewed}
            onChange={(event) => update({ safety_reviewed: event.target.checked })}
          />
          <Checkbox
            label="انتخاب‌ها، مقدارها و زمان مصرف این شاگرد را تأیید می‌کنم"
            checked={selection.confirmed}
            onChange={(event) => onChange({ ...selection, confirmed: event.target.checked })}
          />
        </>
      ) : null}
    </div>
  );
}
