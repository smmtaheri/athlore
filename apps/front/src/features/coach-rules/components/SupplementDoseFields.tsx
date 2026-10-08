import { Button, FormField, Input, Select } from "../../../components/ui";
import type { SupplementDose, SupplementOptions } from "../services/supplementCatalogRepository";
import { newSupplementDose } from "../services/supplementCatalogRepository";
import styles from "../../programs/components/programFlow.module.css";
import catalogStyles from "./supplementCatalog.module.css";

export function SupplementDoseFields({
  doses,
  options,
  onChange
}: {
  doses: SupplementDose[];
  options: SupplementOptions;
  onChange: (doses: SupplementDose[]) => void;
}) {
  const update = (index: number, patch: Partial<SupplementDose>) =>
    onChange(doses.map((dose, i) => (i === index ? { ...dose, ...patch } : dose)));
  return (
    <div className={styles.pageStack}>
      {doses.map((dose, index) => (
        <fieldset key={index} className={`${catalogStyles.entry} ${catalogStyles.dose}`}>
          <legend>نوبت مصرف {index + 1}</legend>
          <div className={styles.formGrid}>
            <FormField label="مقدار">
              <Input
                aria-label={`مقدار نوبت ${index + 1}`}
                type="number"
                min="0.001"
                step="0.001"
                value={dose.amount}
                onChange={(event) => update(index, { amount: event.target.value })}
              />
            </FormField>
            <FormField label="واحد">
              <Select
                aria-label={`واحد نوبت ${index + 1}`}
                value={dose.unit}
                options={options.units.map((item) => ({ value: item.key, label: item.name }))}
                onChange={(event) => update(index, { unit: event.target.value })}
              />
            </FormField>
            <FormField label="زمان مصرف">
              <Select
                aria-label={`زمان نوبت ${index + 1}`}
                value={dose.timing}
                options={options.timings.map((item) => ({ value: item.key, label: item.name }))}
                onChange={(event) => update(index, { timing: event.target.value })}
              />
            </FormField>
            {dose.timing === "custom" ? (
              <FormField label="زمان دلخواه">
                <Input
                  aria-label={`زمان دلخواه نوبت ${index + 1}`}
                  value={dose.custom_time}
                  onChange={(event) => update(index, { custom_time: event.target.value })}
                />
              </FormField>
            ) : null}
            <FormField label="روزهای مصرف">
              <Select
                aria-label={`روزهای نوبت ${index + 1}`}
                value={dose.days}
                options={options.days.map((item) => ({ value: item.key, label: item.name }))}
                onChange={(event) => update(index, { days: event.target.value })}
              />
            </FormField>
          </div>
          <Button
            size="sm"
            variant="danger"
            disabled={doses.length === 1}
            onClick={() => onChange(doses.filter((_, i) => i !== index))}
          >
            حذف نوبت {index + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        disabled={doses.length >= 20}
        onClick={() => onChange([...doses, newSupplementDose()])}
      >
        افزودن نوبت مصرف
      </Button>
      <p className={styles.sectionDescription}>
        اسکوپ و سروینگ خودکار به گرم تبدیل نمی‌شوند؛ مقدار را برای محصول موردنظر مشخص کنید.
      </p>
    </div>
  );
}
