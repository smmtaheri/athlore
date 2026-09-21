import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Activity, ClipboardList, Dumbbell, Home, LogOut, Menu, X } from "lucide-react";
import { Button, IconButton } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { studentPaths } from "../../../app/config/appOrigin";
import { cx } from "../../../utils/classNames";
import { useAuth } from "../../auth";
import styles from "./studentPortal.module.css";

const studentNavItems = [
  { end: true, icon: Home, label: "داشبورد", path: studentPaths.dashboard },
  { end: true, icon: Dumbbell, label: "برنامه‌های من", path: studentPaths.programs },
  { end: true, icon: Activity, label: "بادی چک", path: studentPaths.bodyCheck },
  { end: false, icon: ClipboardList, label: "ویزیت‌های من", path: studentPaths.visits }
] as const;

function titleForPath(pathname: string): string {
  if (pathname.startsWith(`${studentPaths.programs}/`) && pathname !== studentPaths.programs) {
    return "جزئیات برنامه";
  }
  if (pathname.startsWith(studentPaths.programs)) {
    return "برنامه‌های من";
  }
  if (pathname.startsWith(`${studentPaths.visits}/`) && pathname !== studentPaths.visits) {
    return "جزئیات ویزیت";
  }
  if (pathname.startsWith(studentPaths.visits)) {
    return "ویزیت‌های من";
  }
  if (pathname.startsWith(studentPaths.bodyCheck)) {
    return "بادی چک";
  }
  return "داشبورد";
}

export function StudentShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const name = auth.session?.student?.fullName || auth.session?.user.fullName || "شاگرد";

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  useEffect(() => {
    if (!drawerOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDrawer, drawerOpen]);

  const logout = async () => {
    await auth.logout();
    navigate(studentPaths.login, { replace: true });
  };

  return (
    <div className={styles.shell}>
      <aside aria-label="ناوبری پنل شاگرد" className={styles.sidebar}>
        <StudentBrand />
        <StudentNav />
        <div className={styles.sidebarFooter}>
          <div className={styles.userBlock}>
            <span className={styles.userName}>{name}</span>
            <span>شاگرد</span>
          </div>
          <Button
            fullWidth
            iconStart={<LogOut size={18} />}
            onClick={() => void logout()}
            variant="secondary"
          >
            خروج از حساب
          </Button>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.appHeader}>
          <IconButton
            aria-label="باز کردن منوی ناوبری"
            className={styles.mobileMenuButton}
            icon={<Menu size={22} />}
            onClick={openDrawer}
            ref={menuButtonRef}
            variant="ghost"
          />
          <p className={styles.headerTitle}>{titleForPath(location.pathname)}</p>
        </header>
        <Outlet />
      </div>

      {drawerOpen ? (
        <>
          <div aria-hidden className={styles.drawerBackdrop} onClick={closeDrawer} />
          <aside
            aria-label="منوی موبایل شاگرد"
            aria-modal="true"
            className={styles.drawerPanel}
            role="dialog"
          >
            <div className={styles.drawerHeader}>
              <StudentBrand compact />
              <IconButton
                aria-label="بستن منوی ناوبری"
                icon={<X size={20} />}
                onClick={closeDrawer}
                variant="ghost"
              />
            </div>
            <StudentNav onNavigate={closeDrawer} />
            <div className={styles.sidebarFooter}>
              <div className={styles.userBlock}>
                <span className={styles.userName}>{name}</span>
                <span>شاگرد</span>
              </div>
              <Button
                fullWidth
                iconStart={<LogOut size={18} />}
                onClick={() => {
                  closeDrawer();
                  void logout();
                }}
                variant="secondary"
              >
                خروج از حساب
              </Button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function StudentBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.brand} style={compact ? { borderBlockEnd: "none", minHeight: 0 } : undefined}>
      <span aria-hidden className={styles.brandMark}>
        <Dumbbell size={22} />
      </span>
      <span className={styles.brandText}>
        <span className={styles.brandTitle}>{appConfig.displayName}</span>
        <span className={styles.brandSubtitle}>پنل شاگرد</span>
      </span>
    </div>
  );
}

function StudentNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="منوی اصلی شاگرد" className={styles.nav}>
      {studentNavItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            className={({ isActive }) => cx(styles.navLink, isActive && styles.navLinkActive)}
            end={item.end}
            key={item.path}
            onClick={onNavigate}
            to={item.path}
          >
            <Icon aria-hidden size={20} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
