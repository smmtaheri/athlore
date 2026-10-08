import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui";
import type { VisitFormTheme } from "../types/visitForm";
import styles from "./students.module.css";

export interface StudentFormSectionProps {
  children: ReactNode;
  icon: LucideIcon;
  theme?: VisitFormTheme;
  title: string;
}

export function StudentFormSection({
  children,
  icon: Icon,
  theme = "athlore",
  title
}: StudentFormSectionProps) {
  return (
    <Card
      className={`${styles.formSection} ${theme === "athlore_compact" ? styles.formSectionCompact : ""}`}
    >
      <div className={styles.sectionHeader}>
        <span aria-hidden className={styles.sectionIcon}>
          <Icon size={20} />
        </span>
        <h2>{title}</h2>
      </div>
      {children}
    </Card>
  );
}
