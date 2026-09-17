import type { RefObject } from "react";
import { Bell, Menu } from "lucide-react";
import { appConfig } from "../../app/config/appConfig";
import { IconButton } from "../ui";
import styles from "./layout.module.css";

export interface AppHeaderProps {
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenDrawer: () => void;
  showTagline?: boolean;
  title: string;
}

export function AppHeader({
  menuButtonRef,
  onOpenDrawer,
  showTagline = false,
  title
}: AppHeaderProps) {
  return (
    <header className={styles.appHeader}>
      <div className={styles.headerStart}>
        <IconButton
          aria-label="باز کردن منوی ناوبری"
          className={styles.mobileMenuButton}
          icon={<Menu size={22} />}
          onClick={onOpenDrawer}
          ref={menuButtonRef}
          variant="ghost"
        />
        <div>
          <p className={styles.headerTitle}>{title}</p>
          <span className={showTagline ? styles.dashboardTagline : styles.headerMeta}>
            {showTagline ? appConfig.tagline : appConfig.displayName}
          </span>
        </div>
      </div>

      <div className={styles.headerEnd}>
        <span className={styles.notification}>
          <IconButton aria-label="اعلان ها" icon={<Bell size={20} />} variant="ghost" />
          <span aria-hidden className={styles.notificationDot} />
        </span>
      </div>
    </header>
  );
}
