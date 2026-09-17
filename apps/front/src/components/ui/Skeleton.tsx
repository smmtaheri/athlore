import type { HTMLAttributes } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  height?: number | string;
  width?: number | string;
}

export function Skeleton({ className, height, style, width = "100%", ...props }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cx(styles.skeleton, className)}
      style={{ height, width, ...style }}
      {...props}
    />
  );
}
