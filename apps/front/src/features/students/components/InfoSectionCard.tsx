import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui";
import styles from "./students.module.css";

export interface InfoItem {
  label: string;
  value: ReactNode;
}

export interface InfoSectionCardProps {
  icon: LucideIcon;
  items?: InfoItem[];
  children?: ReactNode;
  title: string;
}

export function InfoSectionCard({ children, icon: Icon, items = [], title }: InfoSectionCardProps) {
  return (
    <Card className={styles.infoSectionCard}>
      <header className={styles.infoSectionHeader}>
        <span aria-hidden className={styles.sectionIcon}>
          <Icon size={20} />
        </span>
        <h2>{title}</h2>
      </header>
      {items.length ? (
        <dl className={styles.infoList}>
          {items.map((item) => (
            <div className={styles.infoRow} key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </Card>
  );
}
