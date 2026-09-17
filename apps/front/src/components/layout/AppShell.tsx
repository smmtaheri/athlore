import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { AppHeader } from "./AppHeader";
import { MobileNavigationDrawer } from "./MobileNavigationDrawer";
import { getNavigationTitle } from "./navigation";
import { Sidebar } from "./Sidebar";
import styles from "./layout.module.css";

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const drawerOpenRef = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathRef = useRef(location.pathname);
  const wasDrawerOpenRef = useRef(false);
  const title = getNavigationTitle(location.pathname);
  const showTagline = location.pathname === "/dashboard" || location.pathname === "/";

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) {
      return undefined;
    }

    previousPathRef.current = location.pathname;

    if (!drawerOpenRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(closeDrawer, 0);
    return () => window.clearTimeout(timeoutId);
  }, [closeDrawer, location.pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (wasDrawerOpenRef.current && !drawerOpen) {
      menuButtonRef.current?.focus();
    }

    wasDrawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <AppHeader
          menuButtonRef={menuButtonRef}
          onOpenDrawer={openDrawer}
          showTagline={showTagline}
          title={title}
        />
        <Outlet />
      </div>
      <MobileNavigationDrawer onClose={closeDrawer} open={drawerOpen} />
    </div>
  );
}
