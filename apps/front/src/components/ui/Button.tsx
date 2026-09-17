import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
  iconEnd?: ReactNode;
  iconStart?: ReactNode;
  isLoading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClass: Record<ButtonVariant, string> = {
  danger: styles.buttonDanger,
  ghost: styles.buttonGhost,
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  success: styles.buttonSuccess
};

const sizeClass: Record<ButtonSize, string> = {
  lg: styles.buttonLarge,
  md: styles.buttonMedium,
  sm: styles.buttonSmall
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      fullWidth = false,
      iconEnd,
      iconStart,
      isLoading = false,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      aria-busy={isLoading || undefined}
      className={cx(
        styles.button,
        variantClass[variant],
        sizeClass[size],
        fullWidth && styles.buttonFullWidth,
        isLoading && styles.buttonLoading,
        className
      )}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? <span aria-hidden className={styles.spinner} /> : iconStart}
      {children}
      {iconEnd}
    </button>
  )
);

Button.displayName = "Button";
