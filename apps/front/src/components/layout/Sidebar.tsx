import { NavLink, useNavigate } from "react-router";
import { Dumbbell, LogOut } from "lucide-react";
import { appConfig } from "../../app/config/appConfig";
import { useAuth } from "../../features/auth";
import { Button } from "../ui";
import { cx } from "../../utils/classNames";
import { primaryNavigationItems } from "./navigation";
import styles from "./layout.module.css";

export function Sidebar() {
  const auth = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await auth.logout();
    navigate("/login", { replace: true });
  };
  return (
    <aside aria-label="ناوبری اصلی" className={styles.sidebar}>
      <div className={styles.brand}>
        <span aria-hidden className={styles.brandMark}>
          <Dumbbell size={22} />
        </span>
        <span className={styles.brandText}>
          <span className={styles.brandTitle}>{appConfig.displayName}</span>
          <span className={styles.brandSubtitle}>{appConfig.panelLabel}</span>
        </span>
      </div>

      <nav className={styles.nav}>
        {primaryNavigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
              end={item.end}
              key={item.path}
              to={item.path}
            >
              <Icon aria-hidden size={20} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        {auth.session ? (
          <div className={styles.brandSubtitle} style={{ marginBottom: 8 }}>
            {auth.session.user.fullName}
          </div>
        ) : null}
        <Button
          fullWidth
          iconStart={<LogOut size={18} />}
          onClick={() => void logout()}
          variant="secondary"
        >
          خروج
        </Button>
      </div>
    </aside>
  );
}
