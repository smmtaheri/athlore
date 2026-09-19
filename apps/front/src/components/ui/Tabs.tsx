import type { ReactNode } from "react";
import { useId, useState } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export interface TabItem {
  content?: ReactNode;
  disabled?: boolean;
  id: string;
  label: string;
}

export interface TabsProps {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string;
  items: TabItem[];
  onChange?: (value: string) => void;
  renderPanels?: boolean;
  value?: string;
}

export function Tabs({
  ariaLabel = "تب ها",
  className,
  defaultValue,
  items,
  onChange,
  renderPanels = true,
  value
}: TabsProps) {
  const reactId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue ?? items[0]?.id ?? "");
  const activeValue = value ?? internalValue;
  const activeItem = items.find((item) => item.id === activeValue);

  const handleSelect = (nextValue: string) => {
    setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <div className={cx(styles.tabs, className)}>
      <div aria-label={ariaLabel} className={styles.tabList} role="tablist">
        {items.map((item) => {
          const tabId = `${reactId}-tab-${item.id}`;
          const panelId = `${reactId}-panel-${item.id}`;

          return (
            <button
              aria-controls={panelId}
              aria-selected={item.id === activeValue}
              className={styles.tab}
              disabled={item.disabled}
              id={tabId}
              key={item.id}
              onClick={() => handleSelect(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className={styles.tabMobileSelect}>
        <label className={styles.tabMobileLabel} htmlFor={`${reactId}-mobile-select`}>
          انتخاب بخش
        </label>
        <select
          aria-label={`${ariaLabel} در موبایل`}
          className={styles.select}
          id={`${reactId}-mobile-select`}
          onChange={(event) => handleSelect(event.target.value)}
          value={activeValue}
        >
          {items.map((item) => (
            <option disabled={item.disabled} key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {renderPanels && activeItem ? (
        <div
          aria-labelledby={`${reactId}-tab-${activeItem.id}`}
          className={styles.tabPanel}
          id={`${reactId}-panel-${activeItem.id}`}
          role="tabpanel"
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}
