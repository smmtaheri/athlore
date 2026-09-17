import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export interface TitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export function PageTitle({ children, className, ...props }: TitleProps) {
  return (
    <h1 className={cx(styles.pageTitle, className)} {...props}>
      {children}
    </h1>
  );
}

export function SectionTitle({ children, className, ...props }: TitleProps) {
  return (
    <h2 className={cx(styles.sectionTitle, className)} {...props}>
      {children}
    </h2>
  );
}

export function Divider() {
  return <div aria-hidden className={styles.divider} />;
}
