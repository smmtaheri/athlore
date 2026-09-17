import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./layout.module.css";

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gap?: string;
}

export function Inline({ children, className, gap, style, ...props }: InlineProps) {
  return (
    <div
      className={cx(styles.inline, className)}
      style={{ "--inline-gap": gap, ...style } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}
