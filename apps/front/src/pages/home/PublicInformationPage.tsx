import type { ReactNode } from "react";
import { ArrowLeft, Camera, Mail, Phone, Send } from "lucide-react";
import { Link } from "react-router";
import { PublicLayout } from "./PublicLayout";
import styles from "./home.module.css";

type InformationPage = "about" | "contact" | "privacy" | "terms";

interface InformationContent {
  title: string;
  introduction: string;
  sections: { title: string; content: ReactNode }[];
}

const content: Record<InformationPage, InformationContent> = {
  about: {
    title: "درباره Athlore",
    introduction: "ما باور داریم ارزش مربیگری، در تجربه، شناخت و روش تصمیم‌گیری هر مربی است.",
    sections: [
      {
        title: "دانش مربی را به ابزار تبدیل می‌کنیم",
        content: (
          <p>
            Athlore سامانه‌ای برای مدیریت مربیگری و همراهی ورزشکار است. ما دانش، قواعد و ترجیح‌های
            مربی را وارد منطق نرم‌افزار می‌کنیم تا آماده‌کردن برنامه‌ها، مدیریت پرونده‌ها و پیگیری
            ورزشکاران منظم‌تر و ساده‌تر باشد.
          </p>
        )
      },
      {
        title: "Athlete + Lore؛ داستان نام Athlore",
        content: (
          <p>
            Athlete به ورزشکار اشاره دارد و Lore به دانش و تجربه‌ی انباشته. برای ما، Athlore بیانگر
            دانشی است که در دنیای ورزش شکل می‌گیرد؛ شناختی که مربی با تجربه به دست می‌آورد و
            می‌تواند پایه‌ی یک دستیار اختصاصی باشد.
          </p>
        )
      },
      {
        title: "دستیاری که با ذهنیت مربی رشد می‌کند",
        content: (
          <p>
            چشم‌انداز ما پرورش دستیاری با کمک هوش مصنوعی است که منطق و سبک تصمیم‌گیری مربی را یاد
            بگیرد و در کارهای روزمره و برنامه‌ریزی به او کمک کند. این مسیر با شناخت روش مربی و تبدیل
            آن به قواعد روشن شروع می‌شود. بررسی و تصمیم نهایی درباره‌ی هر ورزشکار با خود مربی است.
          </p>
        )
      },
      {
        title: "امروز چه کمکی می‌کنیم؟",
        content: (
          <p>
            پرونده‌ی ورزشکار، فرم ارزیابی، ویزیت و آرشیو عکس‌ها، بانک حرکات، قواعد مربی، برنامه‌های
            تمرینی و غذایی و مکمل و پیگیری بادی‌چک، در یک فضای مشترک در دسترس قرار می‌گیرند. مربی
            کارهایش را مدیریت می‌کند و ورزشکار برنامه‌ها و اطلاعات مربوط به خودش را می‌بیند.
          </p>
        )
      }
    ]
  },
  contact: {
    title: "تماس با ما",
    introduction:
      "برای آشنایی با Athlore، شروع همکاری، پرسش‌های مربوط به سامانه یا پیگیری حساب، از راه‌های زیر با ما در ارتباط باش.",
    sections: [
      {
        title: "راه‌های ارتباط با Athlore",
        content: (
          <div className={styles.contactGrid}>
            <a
              className={styles.contactCard}
              href="https://t.me/athloreir"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Send aria-hidden size={22} />
              <span>
                تلگرام<span dir="ltr">@athloreir</span>
              </span>
              <ArrowLeft aria-hidden size={18} />
            </a>
            <a
              className={styles.contactCard}
              href="https://www.instagram.com/athloreir/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Camera aria-hidden size={22} />
              <span>
                اینستاگرام<span dir="ltr">@athloreir</span>
              </span>
              <ArrowLeft aria-hidden size={18} />
            </a>
            <a className={styles.contactCard} href="tel:+989386759479">
              <Phone aria-hidden size={22} />
              <span>
                تلفن تماس<span dir="ltr">۰۹۳۸۶۷۵۹۴۷۹</span>
              </span>
              <ArrowLeft aria-hidden size={18} />
            </a>
            <a className={styles.contactCard} href="mailto:support@athlore.ir">
              <Mail aria-hidden size={22} />
              <span>
                ایمیل<span dir="ltr">support@athlore.ir</span>
              </span>
              <ArrowLeft aria-hidden size={18} />
            </a>
          </div>
        )
      },
      {
        title: "برای پیگیری بهتر",
        content: (
          <p>
            در پیام خود بنویس که مربی هستی یا ورزشکار و موضوع درخواستت چیست. برای حفظ حریم خصوصی،
            رمز عبور، کد ورود و عکس‌های شخصی را در پیام عمومی یا دیدگاه‌های شبکه‌های اجتماعی ارسال
            نکن.
          </p>
        )
      },
      {
        title: "پرسش درباره‌ی برنامه‌ی ورزشی",
        content: (
          <p>
            برای تغییر تمرین، تغذیه یا مکمل‌های برنامه‌ی خودت، با مربی‌ات هماهنگ کن. راه‌های ارتباطی
            این صفحه برای موضوعات مربوط به Athlore و استفاده از سامانه هستند.
          </p>
        )
      }
    ]
  },
  privacy: {
    title: "حریم خصوصی",
    introduction:
      "Athlore برای مدیریت خدمات مربیگری، اطلاعات حساب و داده‌هایی را که مربی یا ورزشکار ثبت می‌کنند نگهداری می‌کند.",
    sections: [
      {
        title: "چه اطلاعاتی در سامانه ثبت می‌شود؟",
        content: (
          <p>
            بسته به نحوه‌ی استفاده، اطلاعات حساب و تماس، مشخصات ورزشکار، پاسخ فرم‌های ارزیابی،
            ویزیت‌ها، اندازه‌گیری‌ها، عکس‌های ارزیابی، برنامه‌ها و ثبت‌های بادی‌چک در سامانه قرار
            می‌گیرند. این اطلاعات ممکن است شامل داده‌های شخصی و مرتبط با وضعیت بدنی باشد.
          </p>
        )
      },
      {
        title: "کاربرد و دسترسی به اطلاعات",
        content: (
          <p>
            این داده‌ها برای ارائه‌ی امکانات سامانه، مدیریت پرونده و برنامه‌ها و پیگیری روند ورزشکار
            استفاده می‌شوند. اطلاعات هر ورزشکار در چارچوب دسترسی‌های حساب او و مربی مرتبط نمایش داده
            می‌شود. رسیدگی فنی و درخواست‌های پشتیبانی نیز ممکن است نیازمند بررسی اطلاعات مرتبط توسط
            مسئول سامانه باشد.
          </p>
        )
      },
      {
        title: "عکس‌ها و فایل‌های شخصی",
        content: (
          <p>
            عکس‌های ارزیابی و فایل‌های برنامه بخشی از پرونده‌ی ورزشکار هستند. پیش از بارگذاری
            اطلاعات یا تصویر شخص دیگر، از اجازه‌ی او مطمئن شوید. اطلاعات شخصی، تصاویر و پیوندهای
            دسترسی به فایل‌ها را بدون اجازه‌ی صاحب آن‌ها در فضای عمومی منتشر نکنید.
          </p>
        )
      },
      {
        title: "نشست ورود در مرورگر",
        content: (
          <p>
            سامانه برای نگه‌داشتن وضعیت ورود از ذخیره‌سازی مرورگر و کوکی‌های مربوط به نشست استفاده
            می‌کند. در دستگاه‌های مشترک، پس از استفاده از حساب خود خارج شوید و اطلاعات ورود را در
            اختیار دیگران قرار ندهید.
          </p>
        )
      },
      {
        title: "اصلاح اطلاعات و درخواست حذف",
        content: (
          <p>
            برای اصلاح اطلاعات قابل ویرایش از پنل خود استفاده کنید. درخواست‌های مربوط به دسترسی،
            اصلاح یا حذف حساب و اطلاعات را از طریق{" "}
            <Link className={styles.inlineLink} to="/contact">
              صفحه‌ی تماس با ما
            </Link>{" "}
            مطرح کنید. برای رسیدگی به این درخواست‌ها ممکن است بررسی هویت و ارتباط حساب با مربی لازم
            باشد.
          </p>
        )
      }
    ]
  },
  terms: {
    title: "شرایط استفاده",
    introduction: "این موارد چارچوب استفاده از Athlore برای مربیان و ورزشکاران را توضیح می‌دهد.",
    sections: [
      {
        title: "ماهیت خدمات Athlore",
        content: (
          <p>
            Athlore ابزار مدیریت مربیگری، ثبت ارزیابی، آماده‌کردن و ارائه‌ی برنامه و پیگیری ورزشکار
            است. امکانات نرم‌افزار و ابزارهای هوشمند برای کمک به مربی طراحی شده‌اند و مسئولیت بررسی
            و تأیید نهایی برنامه‌ها با مربی ارائه‌دهنده‌ی آن‌هاست.
          </p>
        )
      },
      {
        title: "مسئولیت اطلاعات و برنامه‌ها",
        content: (
          <p>
            اطلاعاتی که درباره‌ی وضعیت جسمی و سوابق ثبت می‌کنید باید دقیق و به‌روز باشد. مربی باید
            تناسب برنامه‌ی تمرینی، غذایی و مکمل را با شرایط ورزشکار بررسی کند. استفاده از سامانه
            جایگزین تشخیص یا درمان پزشکی نیست و پرسش‌های مربوط به سلامت باید با متخصص مربوطه مطرح
            شوند.
          </p>
        )
      },
      {
        title: "حساب و دسترسی",
        content: (
          <p>
            از حساب و اطلاعات ورود خود محافظت کنید و فقط در محدوده‌ی دسترسی مجازتان از سامانه
            استفاده کنید. تلاش برای دسترسی به پرونده‌ی دیگران، انتشار اطلاعات بدون اجازه و ثبت
            محتوای غیرمجاز قابل قبول نیست.
          </p>
        )
      },
      {
        title: "محتوا، عکس‌ها و فایل‌ها",
        content: (
          <p>
            فقط اطلاعات و فایل‌هایی را بارگذاری کنید که اجازه‌ی استفاده از آن‌ها را دارید. اشتراک
            برنامه یا تصویر دیگران باید با رعایت اجازه‌ی صاحب محتوا و حریم خصوصی ورزشکار انجام شود.
          </p>
        )
      },
      {
        title: "ارتباط و پیگیری",
        content: (
          <p>
            برای پرسش‌های مربوط به حساب، امکانات سامانه و این شرایط، از راه‌های اعلام‌شده در{" "}
            <Link className={styles.inlineLink} to="/contact">
              صفحه‌ی تماس با ما
            </Link>{" "}
            استفاده کنید. توضیح نحوه‌ی استفاده از اطلاعات نیز در{" "}
            <Link className={styles.inlineLink} to="/privacy">
              صفحه‌ی حریم خصوصی
            </Link>{" "}
            آمده است.
          </p>
        )
      }
    ]
  }
};

export function PublicInformationPage({ page }: { page: InformationPage }) {
  const { title, introduction, sections } = content[page];
  return (
    <PublicLayout title={title} description={introduction}>
      <div className={styles.informationPage}>
        <Link className={styles.backLink} to="/">
          صفحه اصلی <ArrowLeft aria-hidden size={16} />
        </Link>
        <header className={styles.informationHeading}>
          <p className={styles.eyebrow}>Athlore</p>
          <h1>{title}</h1>
          <p>{introduction}</p>
        </header>
        <div className={styles.informationBody}>
          {sections.map((section) => (
            <section className={styles.informationSection} key={section.title}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
