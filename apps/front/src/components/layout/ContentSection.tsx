import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./layout.module.css";

export interface ContentSectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function ContentSection({ children, className, ...props }: ContentSectionProps) {
  return (
    <section className={cx(styles.contentSection, className)} {...props}>
      {children}
    </section>
  );
}
