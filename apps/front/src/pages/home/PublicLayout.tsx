import { useEffect, type ReactNode } from "react";
import { Dumbbell } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { absoluteSurfaceUrl, coachPaths, studentPaths } from "../../app/config/appOrigin";
import styles from "./home.module.css";

interface PublicLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

export function PublicLayout({ children, title, description }: PublicLayoutProps) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "start" });
    } else {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [pathname, hash]);

  return (
    <div className={styles.site}>
      <title>{`${title} | Athlore`}</title>
      <meta name="description" content={description} />
      <a className={styles.skipLink} href="#public-content">
        رفتن به محتوای صفحه
      </a>
      <header className={styles.header}>
        <Link aria-label="Athlore، صفحه اصلی" className={styles.brand} to="/">
          <span className={styles.brandMark}>
            <Dumbbell aria-hidden size={23} />
          </span>
          <span dir="ltr">Athlore</span>
        </Link>
        <nav aria-label="منوی سایت" className={styles.navigation}>
          <Link to="/#features">امکانات</Link>
          <NavLink to="/about">درباره Athlore</NavLink>
          <NavLink to="/contact">تماس با ما</NavLink>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.textAction} href={absoluteSurfaceUrl("student", studentPaths.login)}>
            ورود ورزشکار
          </a>
          <a className={styles.primaryAction} href={absoluteSurfaceUrl("coach", coachPaths.login)}>
            ورود مربی
          </a>
        </div>
      </header>
      <main className={styles.main} id="public-content" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div>
          <Link className={styles.brand} to="/">
            <Dumbbell aria-hidden size={22} />
            <span dir="ltr">Athlore</span>
          </Link>
          <p>دانش مربی، همراهِ مسیر ورزشکار.</p>
        </div>
        <nav aria-label="پیوندهای پایین سایت" className={styles.footerLinks}>
          <Link to="/about">درباره ما</Link>
          <Link to="/contact">تماس با ما</Link>
          <Link to="/privacy">حریم خصوصی</Link>
          <Link to="/terms">شرایط استفاده</Link>
        </nav>
        <p className={styles.footerNote}>Athlore · سامانه مدیریت مربیگری و همراهی ورزشکار</p>
      </footer>
    </div>
  );
}
