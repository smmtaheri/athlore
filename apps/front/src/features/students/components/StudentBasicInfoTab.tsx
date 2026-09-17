import {
  Activity,
  ClipboardPenLine,
  Dumbbell,
  HeartPulse,
  ShieldAlert,
  Star,
  Target,
  UserRound,
  Utensils
} from "lucide-react";
import { StatusBadge } from "../../../components/ui";
import type { Student } from "../types/student";
import { genderLabels, goalLabels, trainingLevelLabels } from "../types/options";
import { InfoSectionCard, type InfoItem } from "./InfoSectionCard";
import styles from "./students.module.css";

export interface StudentBasicInfoTabProps {
  student: Student;
}

const emptyValue = "ثبت نشده";

export function StudentBasicInfoTab({ student }: StudentBasicInfoTabProps) {
  const personalItems: InfoItem[] = [
    { label: "نام شاگرد", value: valueOrEmpty(student.fullName) },
    { label: "سن", value: `${student.age} سال` },
    { label: "جنسیت", value: genderLabels[student.gender] },
    { label: "قد", value: `${student.heightCm} سانتی متر` },
    { label: "وزن", value: `${student.weightKg} کیلوگرم` },
    { label: "شماره تماس", value: valueOrEmpty(student.phoneNumber) }
  ];

  const goalItems: InfoItem[] = [
    { label: "هدف اصلی", value: goalLabels[student.goals.primaryGoal] },
    { label: "هدف فرعی", value: valueOrEmpty(student.goals.secondaryGoal) },
    {
      label: "اولویت عضلات",
      value: <ChipList items={student.goals.musclePriorities} />
    },
    { label: "عضلات ضعیف", value: <ChipList items={student.goals.weakMuscles} /> },
    { label: "عضلات قوی", value: <ChipList items={student.goals.strongMuscles} /> }
  ];

  const trainingItems: InfoItem[] = [
    {
      label: "سابقه تمرین",
      value: valueOrEmpty(student.trainingBackground.trainingExperience)
    },
    {
      label: "سطح فعلی",
      value: trainingLevelLabels[student.trainingBackground.level]
    },
    {
      label: "کار با وزنه آزاد",
      value: booleanBadge(student.trainingBackground.hasFreeWeightExperience)
    },
    {
      label: "تسلط به فرم حرکات پایه",
      value: valueOrEmpty(student.trainingBackground.basicMovementFamiliarity)
    }
  ];

  const conditionItems: InfoItem[] = [
    {
      label: "روزهای تمرین در هفته",
      value: `${student.trainingConditions.trainingDaysPerWeek} روز`
    },
    {
      label: "مدت هر جلسه",
      value: `${student.trainingConditions.sessionDurationMinutes} دقیقه`
    },
    {
      label: "ترجیح تمرین",
      value: valueOrEmpty(student.trainingConditions.trainingPreference)
    },
    {
      label: "علاقه به تمرین سنگین",
      value: valueOrEmpty(student.trainingConditions.heavyTrainingInterest)
    },
    {
      label: "علاقه به هوازی",
      value: valueOrEmpty(student.trainingConditions.cardioInterest)
    }
  ];

  const injuryItems: InfoItem[] = [
    { label: "آسیب دیدگی", value: booleanBadge(student.injuries.hasInjury) },
    { label: "نوع آسیب", value: valueOrEmpty(student.injuries.injuryType) },
    {
      label: "حرکات آزاردهنده",
      value: valueOrEmpty(student.injuries.aggravatingMovements.join("، "))
    },
    {
      label: "تمرین های نامطلوب",
      value: valueOrEmpty(student.injuries.disallowedExercises.join("، "))
    }
  ];

  const equipmentItems: InfoItem[] = [
    { label: "باشگاه کامل", value: booleanBadge(student.equipment.hasFullGym) },
    { label: "دمبل", value: booleanBadge(student.equipment.hasDumbbell) },
    { label: "هالتر", value: booleanBadge(student.equipment.hasBarbell) },
    { label: "دستگاه", value: booleanBadge(student.equipment.hasMachines) },
    { label: "کابل", value: booleanBadge(student.equipment.hasCable) }
  ];

  const lifestyleItems: InfoItem[] = [
    { label: "شغل", value: valueOrEmpty(student.lifestyle.occupation) },
    {
      label: "میزان فعالیت روزانه",
      value: valueOrEmpty(student.lifestyle.dailyActivityLevel)
    },
    { label: "خواب", value: valueOrEmpty(student.lifestyle.sleepQuality) },
    { label: "استرس", value: valueOrEmpty(student.lifestyle.stressLevel) }
  ];

  const nutritionSafetyItems: InfoItem[] = [
    {
      label: "حساسیت‌های غذایی",
      value: <ChipList items={student.foodAllergies ?? []} />
    },
    {
      label: "عدم تحمل‌های غذایی",
      value: <ChipList items={student.foodIntolerances ?? []} />
    },
    {
      label: "محدودیت‌های غذایی",
      value: <ChipList items={student.dietaryRestrictions ?? []} />
    },
    {
      label: "ترجیحات غذایی",
      value: <ChipList items={student.dietaryPreferences ?? []} />
    },
    {
      label: "محدودیت‌های مکمل",
      value: <ChipList items={student.supplementRestrictions ?? []} />
    },
    {
      label: "یادداشت‌های پزشکی مرتبط",
      value: valueOrEmpty(student.relevantMedicalNotes)
    },
    {
      label: "یادداشت‌های تغذیه",
      value: valueOrEmpty(student.nutritionNotes)
    }
  ];

  const preferencesItems: InfoItem[] = [
    {
      label: "تمرین مورد علاقه",
      value: valueOrEmpty(student.preferences.favoriteExercises)
    },
    {
      label: "تمرین های دوست نداشتنی",
      value: valueOrEmpty(student.preferences.dislikedTrainingStyles)
    },
    {
      label: "ترجیح تنوع",
      value: valueOrEmpty(student.preferences.varietyPreference)
    },
    {
      label: "ترجیح شدت",
      value: valueOrEmpty(student.preferences.intensityPreference)
    }
  ];

  return (
    <div className={styles.profileInfoGrid}>
      <InfoSectionCard icon={UserRound} items={personalItems} title="اطلاعات شخصی" />
      <InfoSectionCard icon={Target} items={goalItems} title="هدف اصلی و فرعی" />
      <InfoSectionCard icon={Activity} items={trainingItems} title="سطح و سابقه تمرینی" />
      <InfoSectionCard icon={Dumbbell} items={conditionItems} title="شرایط تمرین" />
      <InfoSectionCard icon={ShieldAlert} items={injuryItems} title="آسیب ها و محدودیت ها" />
      <InfoSectionCard icon={Utensils} items={nutritionSafetyItems} title="ایمنی تغذیه و مکمل" />
      <InfoSectionCard icon={Dumbbell} items={equipmentItems} title="تجهیزات در دسترس" />
      <InfoSectionCard icon={HeartPulse} items={lifestyleItems} title="سبک زندگی" />
      <InfoSectionCard icon={Star} items={preferencesItems} title="ترجیحات شخصی" />
      <InfoSectionCard icon={ClipboardPenLine} title="یادداشت مربی">
        <p className={styles.coachNoteText}>{valueOrEmpty(student.coachNotes)}</p>
      </InfoSectionCard>
    </div>
  );
}

function valueOrEmpty(value?: string): string {
  const normalized = value?.trim();
  return normalized || emptyValue;
}

function booleanBadge(value: boolean) {
  return <StatusBadge variant={value ? "success" : "neutral"}>{value ? "بله" : "خیر"}</StatusBadge>;
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) {
    return <span className={styles.emptyInfoValue}>{emptyValue}</span>;
  }

  return (
    <span className={styles.infoChipList}>
      {items.map((item) => (
        <StatusBadge key={item} variant="info">
          {item}
        </StatusBadge>
      ))}
    </span>
  );
}
