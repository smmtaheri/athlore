import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui";
import styles from "./students.module.css";

export interface ProfileTabHeaderProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export function ProfileTabHeader({ action, description, title }: ProfileTabHeaderProps) {
  return (
    <div className={styles.tabHeader}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.tabHeaderAction}>{action}</div> : null}
    </div>
  );
}

export interface SummaryMetricCardProps {
  hint?: ReactNode;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}

export function SummaryMetricCard({ hint, icon: Icon, label, value }: SummaryMetricCardProps) {
  return (
    <Card className={styles.summaryMetricCard} padding="md">
      <span aria-hidden className={styles.summaryMetricIcon}>
        <Icon size={20} />
      </span>
      <span className={styles.summaryMetricLabel}>{label}</span>
      <strong className={styles.summaryMetricValue}>{value}</strong>
      {hint ? <span className={styles.summaryMetricHint}>{hint}</span> : null}
    </Card>
  );
}
