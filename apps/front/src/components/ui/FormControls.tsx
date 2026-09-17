import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { forwardRef } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cx(styles.input, invalid && styles.inputInvalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);

Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx(styles.textarea, invalid && styles.textareaInvalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: readonly SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid = false, options, placeholder, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cx(styles.select, invalid && styles.selectInvalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  )
);

Select.displayName = "Select";

export interface FormFieldProps {
  children: ReactNode;
  className?: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  label: string;
  required?: boolean;
}

export function FormField({
  children,
  className,
  error,
  hint,
  htmlFor,
  label,
  required = false
}: FormFieldProps) {
  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.fieldHeader}>
        <label className={styles.label} htmlFor={htmlFor}>
          {label} {required ? <span className={styles.requiredMark}>*</span> : null}
        </label>
      </div>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  description?: string;
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, description, label, ...props }, ref) => (
    <label className={cx(styles.choice, className)}>
      <input ref={ref} className={styles.checkboxInput} type="checkbox" {...props} />
      <span className={styles.choiceText}>
        <span>{label}</span>
        {description ? <span className={styles.choiceDescription}>{description}</span> : null}
      </span>
    </label>
  )
);

Checkbox.displayName = "Checkbox";

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  description?: string;
  label: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, description, label, ...props }, ref) => (
    <label className={cx(styles.choice, className)}>
      <input ref={ref} className={styles.radioInput} type="radio" {...props} />
      <span className={styles.choiceText}>
        <span>{label}</span>
        {description ? <span className={styles.choiceDescription}>{description}</span> : null}
      </span>
    </label>
  )
);

Radio.displayName = "Radio";

export interface SwitchProps {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  label?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  checked,
  className,
  disabled = false,
  label,
  onCheckedChange
}: SwitchProps) {
  return (
    <span className={cx(styles.switch, className)}>
      <button
        aria-checked={checked}
        aria-label={label}
        className={styles.switchButton}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        role="switch"
        type="button"
      >
        <span className={styles.switchThumb} />
      </button>
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  );
}
