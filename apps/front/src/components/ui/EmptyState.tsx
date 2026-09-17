import type { ReactNode } from "react";
import { FileQuestion } from "lucide-react";
import styles from "./ui.module.css";

export interface EmptyStateProps {
  action?: ReactNode;
  description?: string;
  icon?: ReactNode;
  title: string;
}

export function EmptyState({
  action,
  description,
  icon = <FileQuestion size={24} />,
  title
}: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span aria-hidden className={styles.emptyIcon}>
        {icon}
      </span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description ? <p className={styles.emptyDescription}>{description}</p> : null}
      {action}
    </div>
  );
}
