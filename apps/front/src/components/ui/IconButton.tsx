import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "../../utils/classNames";
import styles from "./ui.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  icon: ReactNode;
  variant?: "default" | "ghost";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, icon, type = "button", variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cx(styles.iconButton, variant === "ghost" && styles.iconButtonGhost, className)}
      type={type}
      {...props}
    >
      {icon}
    </button>
  )
);

IconButton.displayName = "IconButton";
