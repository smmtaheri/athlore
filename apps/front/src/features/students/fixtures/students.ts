import type { Student } from "../types/student";

const now = "2026-07-31T00:00:00.000Z";

export const studentFixtures: Student[] = [
  {
    age: 27,
    coachNotes:
      "شاگرد انگیزه خوبی دارد ولی گردنش زود خسته می شود. روی فرم حرکات سینه باید دقت شود. برای upper body تمرکز بیشتری می خواهم.",
    createdAt: now,
    equipment: {
      hasBarbell: true,
      hasCable: true,
      hasDumbbell: true,
      hasFullGym: true,
      hasMachines: true
    },
    fullName: "محمد طاهری",
    gender: "male",
    goals: {
      musclePriorities: ["سینه", "سرشانه"],
      primaryGoal: "hypertrophy",
      secondaryGoal: "تقویت upper body و بهتر شدن فرم بدن",
      strongMuscles: ["پا"],
      weakMuscles: ["سینه بالا", "پشت بازو"]
    },
    heightCm: 182,
    id: "mohammad-taheri",
    injuries: {
      aggravatingMovements: ["پرس سرشانه سنگین", "شراگ سنگین"],
      disallowedExercises: ["Burpee", "تمرینات کراسفیت"],
      hasInjury: true,
      injuryType: "گردن درد خفیف"
    },
    lifestyle: {
      dailyActivityLevel: "کم",
      occupation: "برنامه نویس",
      sleepQuality: "متوسط",
      stressLevel: "متوسط رو به زیاد"
    },
    phoneNumber: "09123456789",
    preferences: {
      dislikedTrainingStyles: "هوازی طولانی",
      favoriteExercises: "حرکات سینه و بازو",
      intensityPreference: "متوسط، سنگین",
      varietyPreference: "متنوع باشند"
    },
    status: "active",
    summary: {
      currentProgramTitle: "سینه و سرشانه",
      lastVisitDate: "۸ مرداد ۱۴۰۵",
      medicalNote: "گردن درد خفیف"
    },
    trainingBackground: {
      basicMovementFamiliarity: "تقریبا خوب",
      hasFreeWeightExperience: true,
      level: "intermediate",
      trainingExperience: "حدود ۲ سال"
    },
    trainingConditions: {
      cardioInterest: "کم",
      heavyTrainingInterest: "متوسط رو به سنگین",
      sessionDurationMinutes: 75,
      trainingDaysPerWeek: 4,
      trainingPreference: "بدنسازی کلاسیک"
    },
    updatedAt: now,
    weightKg: 86
  },
  {
    age: 31,
    coachNotes: "",
    createdAt: now,
    equipment: {
      hasBarbell: true,
      hasCable: true,
      hasDumbbell: true,
      hasFullGym: true,
      hasMachines: true
    },
    fullName: "سارا رضایی",
    gender: "female",
    goals: {
      musclePriorities: ["پا", "شکم"],
      primaryGoal: "fat_loss",
      secondaryGoal: "کاهش چربی و افزایش انرژی",
      strongMuscles: ["پا"],
      weakMuscles: ["شکم"]
    },
    heightCm: 168,
    id: "sara-rezaei",
    injuries: {
      aggravatingMovements: [],
      disallowedExercises: [],
      hasInjury: false,
      injuryType: ""
    },
    lifestyle: {
      dailyActivityLevel: "متوسط",
      occupation: "کارمند",
      sleepQuality: "خوب",
      stressLevel: "متوسط"
    },
    phoneNumber: "09120000002",
    preferences: {
      dislikedTrainingStyles: "هوازی طولانی",
      favoriteExercises: "تمرین پا",
      intensityPreference: "متوسط",
      varietyPreference: "متنوع باشند"
    },
    status: "active",
    summary: {
      currentProgramTitle: "کاهش چربی",
      lastVisitDate: "۵ مرداد ۱۴۰۵",
      medicalNote: "بدون محدودیت"
    },
    trainingBackground: {
      basicMovementFamiliarity: "خوب",
      hasFreeWeightExperience: true,
      level: "beginner",
      trainingExperience: "۶ ماه"
    },
    trainingConditions: {
      cardioInterest: "متوسط",
      heavyTrainingInterest: "کم",
      sessionDurationMinutes: 60,
      trainingDaysPerWeek: 3,
      trainingPreference: "ترکیبی"
    },
    updatedAt: now,
    weightKg: 68
  },
  {
    age: 24,
    coachNotes: "",
    createdAt: now,
    equipment: {
      hasBarbell: true,
      hasCable: false,
      hasDumbbell: true,
      hasFullGym: false,
      hasMachines: false
    },
    fullName: "علی مرادی",
    gender: "male",
    goals: {
      musclePriorities: ["سینه"],
      primaryGoal: "strength",
      secondaryGoal: "افزایش رکورد حرکات پایه",
      strongMuscles: ["پا"],
      weakMuscles: ["سینه"]
    },
    heightCm: 178,
    id: "ali-moradi",
    injuries: {
      aggravatingMovements: [],
      disallowedExercises: [],
      hasInjury: false,
      injuryType: ""
    },
    lifestyle: {
      dailyActivityLevel: "زیاد",
      occupation: "دانشجو",
      sleepQuality: "متوسط",
      stressLevel: "کم"
    },
    phoneNumber: "09120000003",
    preferences: {
      dislikedTrainingStyles: "تمرین خیلی طولانی",
      favoriteExercises: "ددلیفت",
      intensityPreference: "سنگین",
      varietyPreference: "ثابت باشند"
    },
    status: "active",
    summary: {
      currentProgramTitle: "قدرتی چهار روزه",
      lastVisitDate: "۲ مرداد ۱۴۰۵",
      medicalNote: "بدون محدودیت"
    },
    trainingBackground: {
      basicMovementFamiliarity: "خوب",
      hasFreeWeightExperience: true,
      level: "advanced",
      trainingExperience: "۳ سال"
    },
    trainingConditions: {
      cardioInterest: "کم",
      heavyTrainingInterest: "سنگین",
      sessionDurationMinutes: 90,
      trainingDaysPerWeek: 4,
      trainingPreference: "قدرتی"
    },
    updatedAt: now,
    weightKg: 82
  },
  {
    age: 35,
    coachNotes: "",
    createdAt: now,
    equipment: {
      hasBarbell: false,
      hasCable: false,
      hasDumbbell: true,
      hasFullGym: false,
      hasMachines: false
    },
    fullName: "نیما کریمی",
    gender: "male",
    goals: {
      musclePriorities: ["کمر"],
      primaryGoal: "general_health",
      secondaryGoal: "بهبود آمادگی عمومی",
      strongMuscles: [],
      weakMuscles: ["کمر"]
    },
    heightCm: 176,
    id: "nima-karimi",
    injuries: {
      aggravatingMovements: ["اسکوات سنگین"],
      disallowedExercises: ["پرش های شدید"],
      hasInjury: true,
      injuryType: "کمردرد"
    },
    lifestyle: {
      dailyActivityLevel: "کم",
      occupation: "طراح",
      sleepQuality: "متوسط",
      stressLevel: "زیاد"
    },
    phoneNumber: "09120000004",
    preferences: {
      dislikedTrainingStyles: "حرکات پرشی",
      favoriteExercises: "تمرین کششی",
      intensityPreference: "سبک",
      varietyPreference: "متنوع باشند"
    },
    status: "inactive",
    summary: {
      currentProgramTitle: "بازگشت به تمرین",
      lastVisitDate: "۲۰ تیر ۱۴۰۵",
      medicalNote: "کمردرد"
    },
    trainingBackground: {
      basicMovementFamiliarity: "نیاز به آموزش",
      hasFreeWeightExperience: false,
      level: "beginner",
      trainingExperience: "کمتر از ۳ ماه"
    },
    trainingConditions: {
      cardioInterest: "متوسط",
      heavyTrainingInterest: "کم",
      sessionDurationMinutes: 45,
      trainingDaysPerWeek: 2,
      trainingPreference: "اصلاحی"
    },
    updatedAt: now,
    weightKg: 90
  },
  {
    age: 29,
    coachNotes: "",
    createdAt: now,
    equipment: {
      hasBarbell: true,
      hasCable: true,
      hasDumbbell: true,
      hasFullGym: true,
      hasMachines: true
    },
    fullName: "مریم احمدی",
    gender: "female",
    goals: {
      musclePriorities: ["پا"],
      primaryGoal: "body_recomposition",
      secondaryGoal: "فرم دهی و افزایش توان",
      strongMuscles: ["پا"],
      weakMuscles: ["سرشانه"]
    },
    heightCm: 164,
    id: "maryam-ahmadi",
    injuries: {
      aggravatingMovements: [],
      disallowedExercises: [],
      hasInjury: false,
      injuryType: ""
    },
    lifestyle: {
      dailyActivityLevel: "متوسط",
      occupation: "معلم",
      sleepQuality: "خوب",
      stressLevel: "متوسط"
    },
    phoneNumber: "09120000005",
    preferences: {
      dislikedTrainingStyles: "تمرین بسیار تکراری",
      favoriteExercises: "لانج و اسکوات",
      intensityPreference: "متوسط",
      varietyPreference: "متنوع باشند"
    },
    status: "active",
    summary: {
      currentProgramTitle: "فرم دهی پایین تنه",
      lastVisitDate: "۱ مرداد ۱۴۰۵",
      medicalNote: "بدون محدودیت"
    },
    trainingBackground: {
      basicMovementFamiliarity: "خوب",
      hasFreeWeightExperience: true,
      level: "intermediate",
      trainingExperience: "۱ سال"
    },
    trainingConditions: {
      cardioInterest: "متوسط",
      heavyTrainingInterest: "متوسط",
      sessionDurationMinutes: 70,
      trainingDaysPerWeek: 3,
      trainingPreference: "بدنسازی"
    },
    updatedAt: now,
    weightKg: 62
  },
  {
    age: 22,
    coachNotes: "",
    createdAt: now,
    equipment: {
      hasBarbell: true,
      hasCable: true,
      hasDumbbell: true,
      hasFullGym: true,
      hasMachines: true
    },
    fullName: "حسام نادری",
    gender: "male",
    goals: {
      musclePriorities: ["زیربغل", "بازو"],
      primaryGoal: "hypertrophy",
      secondaryGoal: "افزایش حجم بالاتنه",
      strongMuscles: ["پا"],
      weakMuscles: ["زیربغل"]
    },
    heightCm: 181,
    id: "hesam-naderi",
    injuries: {
      aggravatingMovements: [],
      disallowedExercises: [],
      hasInjury: false,
      injuryType: ""
    },
    lifestyle: {
      dailyActivityLevel: "متوسط",
      occupation: "دانشجو",
      sleepQuality: "متوسط",
      stressLevel: "کم"
    },
    phoneNumber: "09120000006",
    preferences: {
      dislikedTrainingStyles: "هوازی زیاد",
      favoriteExercises: "لت و جلو بازو",
      intensityPreference: "سنگین",
      varietyPreference: "متنوع باشند"
    },
    status: "active",
    summary: {
      currentProgramTitle: "حجم بالاتنه",
      lastVisitDate: "۳۰ تیر ۱۴۰۵",
      medicalNote: "بدون محدودیت"
    },
    trainingBackground: {
      basicMovementFamiliarity: "تقریبا خوب",
      hasFreeWeightExperience: true,
      level: "intermediate",
      trainingExperience: "۱.۵ سال"
    },
    trainingConditions: {
      cardioInterest: "کم",
      heavyTrainingInterest: "سنگین",
      sessionDurationMinutes: 75,
      trainingDaysPerWeek: 4,
      trainingPreference: "حجمی"
    },
    updatedAt: now,
    weightKg: 78
  }
];
