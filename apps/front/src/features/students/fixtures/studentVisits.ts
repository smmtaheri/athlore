import type { StudentVisit } from "../types/monthlyVisit";

const now = "2026-07-31T00:00:00.000Z";

export const studentVisitFixtures: StudentVisit[] = [
  {
    adherence: {
      nutritionPercent: 85,
      overallPercent: 90,
      supplementsPercent: 80,
      trainingPercent: 92
    },
    bodyFatPercentage: 16,
    bodyFeeling: "بهتر از قبل",
    coachAssessment: "عملکرد بسیار خوب بوده و پیشرفت قابل توجه است.",
    coachNotes: "ادامه مسیر عالیه، روی تغذیه و خواب بیشتر تمرکز کن.",
    createdAt: now,
    answers: {},
    coachPrivateNotes: "",
    formTemplateId: "tpl-default-v1",
    formTemplateKey: "default_v1",
    formTemplateName: "فرم ویزیت پایه",
    formTemplateSnapshot: {
      id: "tpl-default-v1",
      key: "default_v1",
      name: "فرم ویزیت پایه",
      version: 1
    },
    formTemplateVersion: 1,
    status: "finalized",
    currentWeightKg: 87.5,
    dailyEnergyLevel: "good",
    hasNewInjury: false,
    id: "visit-mohammad-1404-02-08",
    measurements: {
      armCm: 38,
      chestCm: 110,
      hipCm: 98,
      thighCm: 62,
      waistCm: 87
    },
    newInjuryNotes: "بدون مورد جدید",
    nextCycleGoal: "کاهش چربی و حفظ عضلات",
    previousWeightKg: 86,
    sleepQuality: "good",
    stressLevel: "low",
    studentFeedback: "انرژی خوبی داشتم و تمرینات بدنسازی خیلی بهتر اجرا شد.",
    studentId: "mohammad-taheri",
    trainingConditionChanges: "بدون تغییر جدی",
    updatedAt: now,
    visitDate: "۱۴۰۴/۰۲/۰۸"
  },
  {
    adherence: {
      nutritionPercent: 76,
      overallPercent: 80,
      supplementsPercent: 70,
      trainingPercent: 84
    },
    bodyFatPercentage: 15,
    bodyFeeling: "مشابه قبل",
    coachAssessment: "پیشرفت خوب است، اما گردن باید کنترل شود.",
    coachNotes: "پرس سرشانه سنگین حذف شود و گرم کردن گردن جدی تر باشد.",
    createdAt: now,
    answers: {},
    coachPrivateNotes: "",
    formTemplateId: "tpl-default-v1",
    formTemplateKey: "default_v1",
    formTemplateName: "فرم ویزیت پایه",
    formTemplateSnapshot: {
      id: "tpl-default-v1",
      key: "default_v1",
      name: "فرم ویزیت پایه",
      version: 1
    },
    formTemplateVersion: 1,
    status: "finalized",
    currentWeightKg: 86,
    dailyEnergyLevel: "medium",
    hasNewInjury: true,
    id: "visit-mohammad-1404-01-10",
    measurements: {
      armCm: 37,
      chestCm: 108,
      hipCm: 96,
      thighCm: 60,
      waistCm: 85
    },
    newInjuryNotes: "گردن درد خفیف بعد از پرس سرشانه",
    nextCycleGoal: "کاهش ۲٪ چربی بدن",
    previousWeightKg: 86.5,
    sleepQuality: "good",
    stressLevel: "medium",
    studentFeedback: "تمرین ها خوب بود ولی گاهی گردن اذیت شد.",
    studentId: "mohammad-taheri",
    trainingConditionChanges: "یک جلسه تمرین به دلیل کار حذف شد",
    updatedAt: now,
    visitDate: "۱۴۰۴/۰۱/۱۰"
  },
  {
    adherence: {
      nutritionPercent: 70,
      overallPercent: 70,
      supplementsPercent: 65,
      trainingPercent: 78
    },
    bodyFatPercentage: 15.5,
    bodyFeeling: "بهتر از شروع",
    coachAssessment: "برای حجم عضله نیاز به ثبات غذایی بیشتر دارد.",
    coachNotes: "پروتئین روزانه و خواب شبانه پیگیری شود.",
    createdAt: now,
    answers: {},
    coachPrivateNotes: "",
    formTemplateId: "tpl-default-v1",
    formTemplateKey: "default_v1",
    formTemplateName: "فرم ویزیت پایه",
    formTemplateSnapshot: {
      id: "tpl-default-v1",
      key: "default_v1",
      name: "فرم ویزیت پایه",
      version: 1
    },
    formTemplateVersion: 1,
    status: "finalized",
    currentWeightKg: 86.5,
    dailyEnergyLevel: "medium",
    hasNewInjury: false,
    id: "visit-mohammad-1403-12-07",
    measurements: {
      armCm: 37,
      chestCm: 107,
      hipCm: 96,
      thighCm: 60,
      waistCm: 86
    },
    newInjuryNotes: "بدون مورد جدید",
    nextCycleGoal: "افزایش حجم عضله",
    previousWeightKg: 86,
    sleepQuality: "medium",
    stressLevel: "medium",
    studentFeedback: "تمرین های سینه را بیشتر دوست داشتم.",
    studentId: "mohammad-taheri",
    trainingConditionChanges: "زمان جلسه ها گاهی کمتر از ۷۵ دقیقه بود",
    updatedAt: now,
    visitDate: "۱۴۰۳/۱۲/۰۷"
  },
  {
    adherence: {
      nutritionPercent: 82,
      overallPercent: 85,
      supplementsPercent: 75,
      trainingPercent: 88
    },
    bodyFatPercentage: 16.2,
    bodyFeeling: "خوب",
    coachAssessment: "شروع خوبی داشته و فرم حرکات قابل قبول است.",
    coachNotes: "حجم تمرین به تدریج بالا برود.",
    createdAt: now,
    answers: {},
    coachPrivateNotes: "",
    formTemplateId: "tpl-default-v1",
    formTemplateKey: "default_v1",
    formTemplateName: "فرم ویزیت پایه",
    formTemplateSnapshot: {
      id: "tpl-default-v1",
      key: "default_v1",
      name: "فرم ویزیت پایه",
      version: 1
    },
    formTemplateVersion: 1,
    status: "finalized",
    currentWeightKg: 85,
    dailyEnergyLevel: "good",
    hasNewInjury: false,
    id: "visit-mohammad-1403-11-05",
    measurements: {
      armCm: 36,
      chestCm: 106,
      hipCm: 95,
      thighCm: 59,
      waistCm: 85
    },
    newInjuryNotes: "بدون مورد جدید",
    nextCycleGoal: "افزایش قدرت بالاتنه",
    previousWeightKg: 86,
    sleepQuality: "medium",
    stressLevel: "low",
    studentFeedback: "با تمرین ها راحت بودم.",
    studentId: "mohammad-taheri",
    trainingConditionChanges: "برنامه طبق زمان بندی اجرا شد",
    updatedAt: now,
    visitDate: "۱۴۰۳/۱۱/۰۵"
  }
];
