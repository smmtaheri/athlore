import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router";
import { Dumbbell, LogOut, X } from "lucide-react";
import { appConfig } from "../../app/config/appConfig";
import { useAuth } from "../../features/auth";
import { cx } from "../../utils/classNames";
import { Button, IconButton } from "../ui";
import { primaryNavigationItems } from "./navigation";
import styles from "./layout.module.css";

export interface MobileNavigationDrawerProps {
  onClose: () => void;
  open: boolean;
}

export function MobileNavigationDrawer({ onClose, open }: MobileNavigationDrawerProps) {
  const auth = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await auth.logout();
    navigate("/login", { replace: true });
  };
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div aria-hidden className={styles.drawerBackdrop} onClick={onClose} />
      <aside
        aria-label="منوی موبایل"
        aria-modal="true"
        className={styles.drawerPanel}
        role="dialog"
      >
        <div className={styles.drawerHeader}>
          <div className={styles.headerStart}>
            <span aria-hidden className={styles.brandMark}>
              <Dumbbell size={22} />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>{appConfig.displayName}</span>
              <span className={styles.brandSubtitle}>{appConfig.panelLabel}</span>
            </span>
          </div>
          <IconButton
            aria-label="بستن منوی ناوبری"
            icon={<X size={20} />}
            onClick={onClose}
            variant="ghost"
          />
        </div>

        <nav className={styles.nav}>
          {primaryNavigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
                end={item.end}
                key={item.path}
                onClick={onClose}
                to={item.path}
              >
                <Icon aria-hidden size={20} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Button
            fullWidth
            iconStart={<LogOut size={18} />}
            onClick={() => {
              onClose();
              void logout();
            }}
            variant="secondary"
          >
            خروج
          </Button>
        </div>
      </aside>
    </>
  );
}
