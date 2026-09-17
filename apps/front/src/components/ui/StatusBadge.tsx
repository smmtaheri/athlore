import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export type StatusBadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "purple";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: StatusBadgeVariant;
}

const variantClass: Record<StatusBadgeVariant, string> = {
  danger: styles.badgeDanger,
  info: styles.badgeInfo,
  neutral: styles.badgeNeutral,
  purple: styles.badgePurple,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning
};

export function StatusBadge({
  children,
  className,
  variant = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cx(styles.badge, variantClass[variant], className)} {...props}>
      {children}
    </span>
  );
}
