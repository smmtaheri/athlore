import { ArrowLeft, Dumbbell, LineChart, UsersRound } from "lucide-react";
import { appConfig } from "../../app/config/appConfig";
import { coachPaths, absoluteSurfaceUrl, studentPaths } from "../../app/config/appOrigin";
import styles from "./home.module.css";

export function PublicHomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.brand}>
            <span aria-hidden className={styles.brandMark}>
              <Dumbbell size={22} />
            </span>
            <span>{appConfig.displayName}</span>
          </div>
          <p className={styles.eyebrow}>مربیگری منظم، مسیر روشن‌تر</p>
          <h1>همراه حرفه‌ای مربی و شاگرد برای پیشرفت واقعی</h1>
          <p className={styles.lead}>
            Athlore ابزار ساده‌ای برای مدیریت شاگردها، پیگیری روزانه و ادامه‌دادن مسیر تمرین در یک
            فضای مشترک است.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href={absoluteSurfaceUrl("coach", coachPaths.login)}>
              ورود مربی
              <ArrowLeft aria-hidden size={18} />
            </a>
            <a
              className={styles.secondaryAction}
              href={absoluteSurfaceUrl("student", studentPaths.login)}
            >
              ورود شاگرد
            </a>
          </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <img src="/athlore-hero.png" alt="" />
        </div>
      </section>

      <section className={styles.features} aria-label="ویژگی‌های Athlore">
        <article>
          <UsersRound aria-hidden size={22} />
          <h2>رابطه مربی و شاگرد</h2>
          <p>اطلاعات و ارتباط کاری هر شاگرد در فضای اختصاصی خودش دنبال می‌شود.</p>
        </article>
        <article>
          <LineChart aria-hidden size={22} />
          <h2>پیگیری قابل فهم</h2>
          <p>ثبت‌های روزانه و گزارش پیشرفت کمک می‌کنند تصمیم‌ها بر اساس روند واقعی باشند.</p>
        </article>
        <article>
          <Dumbbell aria-hidden size={22} />
          <h2>تمرکز روی تمرین</h2>
          <p>مربی زمان بیشتری برای همراهی شاگرد و طراحی مسیر مناسب در اختیار دارد.</p>
        </article>
      </section>
    </main>
  );
}
