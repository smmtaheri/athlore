import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./layout.module.css";

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <main className={cx(styles.pageContainer, className)} {...props}>
      {children}
    </main>
  );
}
