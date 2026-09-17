import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: CardPadding;
}

const paddingClass: Record<CardPadding, string> = {
  lg: styles.cardPaddingLarge,
  md: styles.cardPaddingMedium,
  none: styles.cardPaddingNone,
  sm: styles.cardPaddingSmall
};

export function Card({ children, className, padding = "md", ...props }: CardProps) {
  return (
    <div className={cx(styles.card, paddingClass[padding], className)} {...props}>
      {children}
    </div>
  );
}
