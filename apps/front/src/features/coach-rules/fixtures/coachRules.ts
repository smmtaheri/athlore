import type { CoachRules } from "../types/coachRules";

const now = "2026-07-31T00:00:00.000Z";

export const coachRulesFixture: CoachRules = {
  exerciseBank: [
    {
      beginnerFriendly: ["پرس سینه دستگاه", "فلای دستگاه"],
      favoriteExercises: ["پرس سینه هالتر", "پرس بالا سینه دمبل", "کراس اور"],
      forbiddenExercises: ["دیپ سنگین برای درد شانه"],
      group: "سینه",
      id: "chest",
      professionalFriendly: ["پرس سینه هالتر", "دیپ کنترل شده", "پرس بالا سینه هالتر"]
    },
    {
      beginnerFriendly: ["لت سیم کش", "قایقی دستگاه"],
      favoriteExercises: ["لت دست باز", "بارفیکس کمکی", "روئینگ هالتر"],
      forbiddenExercises: ["شراگ سنگین برای گردن درد"],
      group: "زیربغل",
      id: "back",
      professionalFriendly: ["بارفیکس", "روئینگ هالتر", "ددلیفت سبک کنترل شده"]
    },
    {
      beginnerFriendly: ["پرس پا", "جلوپا دستگاه"],
      favoriteExercises: ["اسکوات", "پرس پا", "لانج"],
      forbiddenExercises: ["اسکوات پرشی برای زانو درد"],
      group: "پا",
      id: "legs",
      professionalFriendly: ["اسکوات", "ددلیفت رومانیایی", "لانج راه رفتنی"]
    }
  ],
  generalRules: {
    extraNotes: "تنوع برنامه حفظ شود، اما حرکات اصلی و قابل اندازه گیری ستون اصلی برنامه بمانند.",
    items: [
      {
        category: "ترتیب تمرین",
        description: "حرکات چندمفصلی و اصلی اول جلسه قرار بگیرند.",
        id: "main-first",
        importance: "high",
        isActive: true,
        order: 1,
        title: "حرکات اصلی اول برنامه باشند"
      },
      {
        category: "ایمنی",
        description: "شاگرد مبتدی تا ناتوانی تمرین نکند.",
        id: "beginner-no-failure",
        importance: "high",
        isActive: true,
        order: 2,
        title: "کنترل شدت مبتدی"
      },
      {
        category: "اولویت عضلات",
        description: "برای عضله ضعیف حجم بیشتر داده شود.",
        id: "weak-muscle-volume",
        importance: "medium",
        isActive: true,
        order: 3,
        title: "حجم بیشتر برای عضله ضعیف"
      },
      {
        category: "تکنیک",
        description: "تمرکز اصلی روی اجرای صحیح باشد.",
        id: "correct-form",
        importance: "high",
        isActive: true,
        order: 4,
        title: "فرم صحیح"
      },
      {
        category: "ترتیب تمرین",
        description: "تمرین شکم آخر جلسه باشد.",
        id: "abs-last",
        importance: "low",
        isActive: true,
        order: 5,
        title: "شکم آخر جلسه"
      }
    ]
  },
  injuries: [
    {
      alternatives: ["لت سیم کش سبک", "نشر جانب سبک", "پرس دستگاه کنترل شده"],
      forbiddenExercises: ["پرس سرشانه سنگین", "شراگ سنگین"],
      id: "neck-pain",
      isActive: true,
      name: "گردن درد",
      notes: "حرکات بالای سر سنگین محدود شود و کنترل گردن بررسی شود."
    },
    {
      alternatives: ["پرس پا", "هیپ تراست", "ددلیفت رومانیایی سبک"],
      forbiddenExercises: ["ددلیفت سنگین", "اسکوات سنگین"],
      id: "back-pain",
      isActive: true,
      name: "کمر درد",
      notes: "فشار محوری و خم شدن کنترل نشده حذف شود."
    },
    {
      alternatives: ["پرس پا دامنه کنترل شده", "جلوپا سبک", "پل باسن"],
      forbiddenExercises: ["اسکوات پرشی", "لانج پرشی"],
      id: "knee-pain",
      isActive: true,
      name: "زانو درد",
      notes: "پرش و دامنه دردناک حذف شود."
    }
  ],
  levels: [
    {
      allowedTechniques: ["ست های ساده", "ریتم کنترل شده"],
      coachNotes: "تمرکز روی یادگیری فرم و ثبات اجرای حرکت باشد.",
      forbiddenExercises: ["تکنیک های شدت پیشرفته", "حرکت تا ناتوانی"],
      id: "beginner",
      intensity: "سبک تا متوسط",
      requiredExercises: ["حرکات دستگاه", "حرکات پایه قابل کنترل"],
      volume: "۲ تا ۳ ست برای هر حرکت"
    },
    {
      allowedTechniques: ["سوپرست محدود", "افزایش تدریجی فشار"],
      coachNotes: "حجم برنامه متوسط و قابل ریکاوری بماند.",
      forbiddenExercises: ["دراپ ست زیاد", "تکرارهای اجباری"],
      id: "intermediate",
      intensity: "متوسط رو به سنگین",
      requiredExercises: ["حرکات پایه", "ترکیب دستگاه و وزنه آزاد"],
      volume: "۳ تا ۴ ست برای حرکات اصلی"
    },
    {
      allowedTechniques: ["دراپ ست کنترل شده", "رست pause محدود"],
      coachNotes: "شدت بالا فقط با فرم صحیح و ریکاوری کافی اعمال شود.",
      forbiddenExercises: ["حجم بی هدف", "تکنیک شدید روی آسیب"],
      id: "advanced",
      intensity: "سنگین و کنترل شده",
      requiredExercises: ["حرکات چندمفصلی", "حرکات تخصصی عضله هدف"],
      volume: "۴ تا ۵ ست برای اولویت ها"
    }
  ],
  musclePriorities: [
    {
      extraExercises: 1,
      extraSets: 2,
      id: "chest-priority",
      muscle: "سینه",
      notes: "سینه در ابتدای هفته و ابتدای جلسه قرار بگیرد.",
      orderChange: "شروع جلسه با پرس یا حرکت اصلی سینه"
    },
    {
      extraExercises: 1,
      extraSets: 2,
      id: "back-priority",
      muscle: "زیربغل",
      notes: "ترکیب کشش عمودی و روئینگ حفظ شود.",
      orderChange: "زیربغل قبل از بازو تمرین داده شود"
    },
    {
      extraExercises: 1,
      extraSets: 1,
      id: "legs-priority",
      muscle: "پا",
      notes: "حرکت چندمفصلی پا اول جلسه قرار بگیرد.",
      orderChange: "پا در جلسه مستقل یا شروع هفته"
    }
  ],
  templates: [
    {
      daysPerWeek: 3,
      goal: "یادگیری فرم، عضله سازی پایه و ریکاوری مناسب",
      id: "full-body-beginner-3",
      intensity: "متوسط",
      isActive: true,
      level: "beginner",
      mainGoal: "فول بادی مبتدی",
      musclePriorityOrder: ["سینه", "زیربغل", "پا"],
      name: "فول بادی مبتدی ۳ روزه",
      restTime: "۶۰ تا ۹۰ ثانیه",
      specialRules: ["تمرین تا ناتوانی انجام نشود", "حرکات اصلی اول جلسه باشند"],
      split: ["فول بادی A", "فول بادی B", "فول بادی C"],
      volume: "کم تا متوسط"
    },
    {
      daysPerWeek: 4,
      goal: "افزایش حجم با تمرکز روی عضلات ضعیف",
      id: "hypertrophy-medium-4",
      intensity: "متوسط رو به سنگین",
      isActive: true,
      level: "intermediate",
      mainGoal: "حجم متوسط",
      musclePriorityOrder: ["سینه", "زیربغل", "پا", "سرشانه"],
      name: "۴ روزه حجم متوسط",
      restTime: "۷۵ تا ۱۲۰ ثانیه",
      specialRules: ["عضلات پشت سر هم نیفتند", "حجم عضله ضعیف بیشتر شود"],
      split: ["سینه و پشت بازو", "زیربغل و جلو بازو", "پا", "سرشانه و شکم"],
      volume: "متوسط"
    }
  ],
  updatedAt: now
};
