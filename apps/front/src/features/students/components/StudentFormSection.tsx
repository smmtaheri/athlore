import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui";
import type { VisitFormTheme } from "../types/visitForm";
import styles from "./students.module.css";

export interface StudentFormSectionProps {
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: string;
  icon: LucideIcon;
  theme?: VisitFormTheme;
  title: string;
}

export function StudentFormSection({
  children,
  collapsible = false,
  defaultOpen = false,
  description,
  icon: Icon,
  theme = "athlore",
  title
}: StudentFormSectionProps) {
  return (
    <Card
      className={`${styles.formSection} ${theme === "athlore_compact" ? styles.formSectionCompact : ""}`}
    >
      {collapsible ? (
        <details className={styles.collapsibleSection} open={defaultOpen}>
          <summary className={`${styles.sectionHeader} ${styles.collapsibleSummary}`}>
            <span aria-hidden className={styles.sectionIcon}>
              <Icon size={20} />
            </span>
            <span className={styles.sectionHeaderText}>
              <span aria-level={2} className={styles.sectionTitle} role="heading">
                {title}
              </span>
              {description ? (
                <span className={styles.sectionDescription}>{description}</span>
              ) : null}
            </span>
            <ChevronDown aria-hidden className={styles.sectionChevron} size={20} />
          </summary>
          <div className={styles.collapsibleContent}>{children}</div>
        </details>
      ) : (
        <>
          <div className={styles.sectionHeader}>
            <span aria-hidden className={styles.sectionIcon}>
              <Icon size={20} />
            </span>
            <h2>{title}</h2>
          </div>
          {children}
        </>
      )}
    </Card>
  );
}
