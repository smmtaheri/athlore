import type { ReactNode } from "react";
import { PageTitle } from "../ui";
import styles from "./layout.module.css";

export interface PageHeaderProps {
  actions?: ReactNode;
  breadcrumb?: string[];
  description?: string;
  title: string;
}

export function PageHeader({ actions, breadcrumb, description, title }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      {breadcrumb?.length ? (
        <nav aria-label="مسیر صفحه" className={styles.breadcrumb}>
          {breadcrumb.map((item, index) => (
            <span key={`${item}-${index}`}>
              {item}
              {index < breadcrumb.length - 1 ? " /" : ""}
            </span>
          ))}
        </nav>
      ) : null}
      <PageTitle>{title}</PageTitle>
      {description ? <p className={styles.pageDescription}>{description}</p> : null}
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}
