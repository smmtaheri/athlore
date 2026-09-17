import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./layout.module.css";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gap?: string;
}

export function Stack({ children, className, gap, style, ...props }: StackProps) {
  return (
    <div
      className={cx(styles.stack, className)}
      style={{ "--stack-gap": gap, ...style } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}
