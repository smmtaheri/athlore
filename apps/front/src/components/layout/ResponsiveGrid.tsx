import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./layout.module.css";

export interface ResponsiveGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  columns?: number;
  gap?: string;
}

export function ResponsiveGrid({
  children,
  className,
  columns = 2,
  gap,
  style,
  ...props
}: ResponsiveGridProps) {
  return (
    <div
      className={cx(styles.responsiveGrid, className)}
      style={
        {
          "--grid-columns": columns,
          "--grid-gap": gap,
          ...style
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </div>
  );
}
