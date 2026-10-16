import {
  ArrowLeft,
  BrainCircuit,
  Camera,
  Check,
  ClipboardList,
  Dumbbell,
  FileText,
  HeartPulse,
  Lightbulb,
  SlidersHorizontal,
  Sparkles,
  UsersRound
} from "lucide-react";
import { Link } from "react-router";
import { PublicLayout } from "./PublicLayout";
import styles from "./home.module.css";

const features = [
  {
    icon: UsersRound,
    title: "پرونده‌ی منظم هر ورزشکار",
    description: "اطلاعات، سوابق و برنامه‌های هر ورزشکار در یک فضای مشخص، در دسترس مربی و خود او."
  },
  {
    icon: SlidersHorizontal,
    title: "روش مربی، در دل برنامه‌ریزی",
    description:
      "بانک حرکات، ترجیح‌ها و قواعد اختصاصی مربی، برای آماده‌کردن برنامه‌ای نزدیک‌تر به روش او."
  },
  {
    icon: ClipboardList,
    title: "ارزیابی به سبک خودت",
    description:
      "فرم‌های قابل تنظیم برای ثبت اطلاعات و ویزیت‌ها، متناسب با چیزهایی که برای مربی مهم است."
  },
  {
    icon: FileText,
    title: "همه‌ی بخش‌های برنامه، یک‌جا",
    description:
      "ارائه‌ی برنامه‌ی تمرینی، غذایی و مکمل؛ با امکان بارگذاری فایل آماده و دسترسی ورزشکار."
  },
  {
    icon: Camera,
    title: "آرشیو عکس‌های ارزیابی",
    description: "عکس‌های هر ویزیت در کنار همان ارزیابی، برای مرور سوابق توسط مربی و ورزشکار."
  },
  {
    icon: HeartPulse,
    title: "پیگیری در طول مسیر",
    description: "ثبت بادی‌چک و مرور روند پیشرفت، برای دید روشن‌تر مربی نسبت به وضعیت ورزشکار."
  }
];

export function PublicHomePage() {
  return (
    <PublicLayout
      description="Athlore دانش، تجربه و روش مربی را به ابزارهایی برای مدیریت ورزشکاران و آماده‌کردن برنامه تبدیل می‌کند."
      title="دانش مربی، همراهِ هر تصمیم"
    >
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <Sparkles aria-hidden size={17} />
            از تجربه‌ی مربی، به یک دستیار همراه
          </p>
          <h1 id="home-title">
            ذهنیت مربی،
            <br />
            <span>همراهِ هر تصمیم.</span>
          </h1>
          <p className={styles.lead}>
            هر مربی روش خودش را دارد. Athlore دانش، تجربه و سبک تصمیم‌گیری تو را به قواعدی قابل
            استفاده در نرم‌افزار تبدیل می‌کند؛ تا مدیریت ورزشکاران و آماده‌کردن برنامه‌ها ساده‌تر و
            نزدیک‌تر به ذهنیت خودت باشد.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} to="/contact">
              آشنایی و شروع همکاری
              <ArrowLeft aria-hidden size={18} />
            </Link>
            <a className={styles.secondaryAction} href="#features">
              آشنایی با امکانات
            </a>
          </div>
          <p className={styles.heroNote}>دانش و تصمیم با مربی؛ نظم و ابزار همراه او.</p>
        </div>
        <aside className={styles.assistantVisual} aria-label="ایده‌ی دستیار Athlore">
          <div className={styles.visualHeading}>
            <span className={styles.iconTile}>
              <BrainCircuit aria-hidden size={26} />
            </span>
            <div>
              <p className={styles.visualEyebrow}>آنچه مربی را متمایز می‌کند</p>
              <h2>دانش و نگاه اختصاصی تو</h2>
            </div>
          </div>
          <div className={styles.knowledgeGrid}>
            <span>
              <Lightbulb aria-hidden size={19} /> تجربه و شناخت
            </span>
            <span>
              <SlidersHorizontal aria-hidden size={19} /> قواعد و ترجیح‌ها
            </span>
            <span>
              <Dumbbell aria-hidden size={19} /> روش تمرین
            </span>
            <span>
              <UsersRound aria-hidden size={19} /> نیاز هر ورزشکار
            </span>
          </div>
          <div className={styles.visualConnector} aria-hidden="true">
            <span />
          </div>
          <div className={styles.assistantCard}>
            <span className={styles.iconTile}>
              <Sparkles aria-hidden size={23} />
            </span>
            <div>
              <span className={styles.visualEyebrow}>چشم‌انداز Athlore</span>
              <h3>دستیاری که منطق تو را می‌شناسد</h3>
              <p>کمک هوش مصنوعی، با تکیه بر دانش و روش مربی.</p>
            </div>
          </div>
          <p className={styles.visualCaption}>
            <Check aria-hidden size={16} /> تصمیم نهایی، همیشه با مربی
          </p>
        </aside>
      </section>

      <section className={styles.featuresSection} id="features" aria-labelledby="features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>امکانات Athlore</p>
          <h2 id="features-title">فضای بیشتر برای مربیگری، نظم بیشتر برای کارها.</h2>
          <p>از اطلاعات ورزشکار تا برنامه و پیگیری؛ ابزارهای موردنیاز مربی در یک فضای مشترک.</p>
        </div>
        <div className={styles.features}>
          {features.map(({ icon: Icon, title, description }) => (
            <article className={styles.featureCard} key={title}>
              <span className={styles.iconTile}>
                <Icon aria-hidden size={22} />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.story} aria-labelledby="story-title">
        <div
          className={styles.wordmark}
          aria-label="Athlete به معنی ورزشکار، Lore به معنی دانش و تجربه انباشته"
        >
          <span dir="ltr">
            Athlete <span>+</span> Lore
          </span>
          <strong dir="ltr">Athlore</strong>
          <p>ورزشکار + دانش و تجربه‌ی انباشته</p>
        </div>
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>داستان نام ما</p>
          <h2 id="story-title">تجربه‌ی تو، ارزشِ ماندگار توست.</h2>
          <p>
            Athlore از کنار هم قرار گرفتن Athlete و Lore آمده است؛ برای ما، یعنی دانش و تجربه‌ی
            انباشته در دنیای ورزش. همان شناختی که مربی در طول سال‌ها به دست می‌آورد و در تصمیم‌هایش
            به کار می‌گیرد.
          </p>
          <p>
            هدف ما این است که این دانش به یک دستیار قابل استفاده تبدیل شود؛ دستیاری که با کمک هوش
            مصنوعی، روش فکر کردن مربی را یاد بگیرد و در برنامه‌ریزی و مدیریت همراهش باشد.
          </p>
          <Link className={styles.inlineLink} to="/about">
            بیشتر درباره Athlore <ArrowLeft aria-hidden size={17} />
          </Link>
        </div>
      </section>

      <section className={styles.callout} aria-labelledby="contact-title">
        <div>
          <h2 id="contact-title">روش مربیگری تو، نقطه‌ی شروع ماست.</h2>
          <p>برای آشنایی با Athlore و گفت‌وگو درباره‌ی نیازهای خودت، با ما در ارتباط باش.</p>
        </div>
        <Link className={styles.primaryAction} to="/contact">
          گفت‌وگو با ما <ArrowLeft aria-hidden size={18} />
        </Link>
      </section>
    </PublicLayout>
  );
}
