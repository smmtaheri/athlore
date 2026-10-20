import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Textarea
} from "../../../components/ui";
import { studentPaths } from "../../../app/config/appOrigin";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { programRequestRepository } from "../services/programRequestRepository";
import type {
  ProgramAssessmentMode,
  ProgramRequest,
  ProgramRequestDraft,
  ProgramRequestPurpose,
  ProgramRequestSection
} from "../types/programRequest";
import styles from "../components/programRequest.module.css";

const sectionOptions: Array<{ id: ProgramRequestSection; label: string }> = [
  { id: "workout", label: "تمرینی" },
  { id: "nutrition", label: "غذایی" },
  { id: "supplement", label: "مکمل" }
];

const purposeLabels: Record<ProgramRequestPurpose, string> = {
  first: "اولین برنامه",
  next: "برنامهٔ دورهٔ بعد",
  revision: "بازبینی برنامهٔ فعلی"
};

const statusLabels: Record<ProgramRequest["status"], string> = {
  submitted: "درخواست ثبت شد",
  awaiting_info: "در انتظار ویزیت یا اطلاعات",
  in_progress: "در حال آماده‌سازی برنامه",
  fulfilled: "برنامه آماده است",
  cancelled: "درخواست لغو شد"
};

const emptyDraft: ProgramRequestDraft = {
  assessmentMode: "online",
  goal: "",
  injuryNotes: "",
  nutritionNotes: "",
  purpose: "next",
  sections: ["workout"],
  sessionsPerWeek: null,
  sleepNotes: "",
  trainingEnvironment: "",
  trainingTimeNotes: ""
};

export function StudentProgramRequestPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProgramRequestDraft>(emptyDraft);
  const [openRequest, setOpenRequest] = useState<ProgramRequest | null>(null);
  const [status, setStatus] = useState<"error" | "loaded" | "loading">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([programRequestRepository.getDefaults(), programRequestRepository.listMine()])
      .then(([defaults, requests]) => {
        if (!mounted) return;
        setDraft(defaults);
        setOpenRequest(
          requests.find((item) =>
            ["submitted", "awaiting_info", "in_progress"].includes(item.status)
          ) ?? null
        );
        setStatus("loaded");
      })
      .catch(() => mounted && setStatus("error"));
    return () => {
      mounted = false;
    };
  }, []);

  const update = <Key extends keyof ProgramRequestDraft>(
    field: Key,
    value: ProgramRequestDraft[Key]
  ) => setDraft((current) => ({ ...current, [field]: value }));

  const toggleSection = (section: ProgramRequestSection, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      sections: checked
        ? [...new Set([...current.sections, section])]
        : current.sections.filter((item) => item !== section)
    }));
  };

  const submit = async () => {
    if (draft.sections.length === 0) {
      setFeedback("حداقل یک نوع برنامه را انتخاب کنید.");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const created = await programRequestRepository.createMine(draft);
      setOpenRequest(created);
      setFeedback("درخواست شما برای مربی ارسال شد.");
    } catch (error) {
      setFeedback(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "ثبت درخواست انجام نشد. دوباره تلاش کنید."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <Skeleton height={420} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.page}>
        <EmptyState
          description="اطلاعات درخواست برنامه دریافت نشد. دوباره صفحه را باز کنید."
          title="خطا در دریافت اطلاعات"
        />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>همراهی با مربی</p>
        <h1>درخواست برنامه</h1>
        <p>بخش‌هایی را که لازم دارید انتخاب کنید و شرایط فعلی تمرینتان را کوتاه بنویسید.</p>
      </header>

      {openRequest ? (
        <Card className={styles.openRequest} padding="lg">
          <div className={styles.statusLine}>
            <h2>درخواست جاری شما</h2>
            <StatusBadge variant={openRequest.status === "in_progress" ? "info" : "warning"}>
              {statusLabels[openRequest.status]}
            </StatusBadge>
          </div>
          <p>{purposeLabels[openRequest.purpose]}</p>
          <p>بخش‌ها: {openRequest.sections.map(sectionLabel).join("، ")}</p>
          <p className={styles.hint}>
            برای جلوگیری از درخواست تکراری، تا بسته‌شدن این درخواست، درخواست تازه ثبت نمی‌شود.
          </p>
          <Button onClick={() => navigate(studentPaths.programs)} variant="secondary">
            مشاهدهٔ برنامه‌های من
          </Button>
        </Card>
      ) : (
        <div className={styles.formStack}>
          <Card padding="lg">
            <h2>چه برنامه‌ای لازم دارید؟</h2>
            <div className={styles.formGrid}>
              <FormField label="نوع درخواست">
                <Select
                  onChange={(event) =>
                    update("purpose", event.target.value as ProgramRequestPurpose)
                  }
                  options={[
                    { label: purposeLabels.first, value: "first" },
                    { label: purposeLabels.next, value: "next" },
                    { label: purposeLabels.revision, value: "revision" }
                  ]}
                  value={draft.purpose}
                />
              </FormField>
              <FormField label="ترجیح ویزیت">
                <Select
                  onChange={(event) =>
                    update("assessmentMode", event.target.value as ProgramAssessmentMode)
                  }
                  options={[
                    { label: "آنلاین", value: "online" },
                    { label: "حضوری", value: "in_person" }
                  ]}
                  value={draft.assessmentMode}
                />
              </FormField>
            </div>

            <fieldset className={styles.sectionFieldset}>
              <legend>بخش‌های موردنیاز</legend>
              <div className={styles.sectionGrid}>
                {sectionOptions.map((section) => (
                  <Checkbox
                    checked={draft.sections.includes(section.id)}
                    key={section.id}
                    label={`برنامهٔ ${section.label}`}
                    onChange={(event) => toggleSection(section.id, event.target.checked)}
                  />
                ))}
              </div>
            </fieldset>

            {draft.sections.includes("workout") ? (
              <div className={styles.formGrid}>
                <FormField hint="تعداد جلسه در هر هفته" label="جلسهٔ تمرین در هفته">
                  <Select
                    onChange={(event) =>
                      update(
                        "sessionsPerWeek",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    options={Array.from({ length: 7 }, (_, index) => ({
                      label: `${index + 1} جلسه`,
                      value: String(index + 1)
                    }))}
                    placeholder="تعیین نشده"
                    value={draft.sessionsPerWeek == null ? "" : String(draft.sessionsPerWeek)}
                  />
                </FormField>
                <FormField label="محیط تمرین">
                  <Select
                    onChange={(event) => update("trainingEnvironment", event.target.value)}
                    options={[
                      { label: "باشگاه", value: "gym" },
                      { label: "خانه", value: "home" },
                      { label: "فضای باز", value: "outdoors" },
                      { label: "سایر", value: "other" }
                    ]}
                    placeholder="انتخاب کنید"
                    value={draft.trainingEnvironment}
                  />
                </FormField>
              </div>
            ) : null}

            <div className={styles.formGrid}>
              <FormField label="هدف این دوره">
                <Textarea
                  onChange={(event) => update("goal", event.target.value)}
                  placeholder="مثلاً افزایش قدرت، کاهش وزن یا بهترشدن در یک حرکت"
                  rows={3}
                  value={draft.goal}
                />
              </FormField>
              <FormField label="آسیب یا محدودیت تازه">
                <Textarea
                  onChange={(event) => update("injuryNotes", event.target.value)}
                  placeholder="اگر مورد تازه‌ای هست بنویسید؛ در غیر این صورت خالی بگذارید."
                  rows={3}
                  value={draft.injuryNotes}
                />
              </FormField>
              {draft.sections.includes("workout") ? (
                <FormField label="زمان و شرایط تمرین">
                  <Input
                    onChange={(event) => update("trainingTimeNotes", event.target.value)}
                    placeholder="مثلاً عصرها، حدود یک ساعت"
                    value={draft.trainingTimeNotes}
                  />
                </FormField>
              ) : null}
              <FormField label="خواب و تغذیه">
                <Textarea
                  onChange={(event) => update("sleepNotes", event.target.value)}
                  placeholder="نکته‌ای که مربی برای برنامه‌ریزی بداند"
                  rows={3}
                  value={draft.sleepNotes}
                />
              </FormField>
              {draft.sections.includes("nutrition") || draft.sections.includes("supplement") ? (
                <FormField label="حساسیت یا محدودیت غذایی و مکمل">
                  <Textarea
                    onChange={(event) => update("nutritionNotes", event.target.value)}
                    placeholder="موارد مهم را کوتاه بنویسید."
                    rows={3}
                    value={draft.nutritionNotes}
                  />
                </FormField>
              ) : null}
            </div>
            <p className={styles.hint}>
              درخواست برنامه به دورهٔ بادی‌چک وابسته نیست. اطلاعات این فرم برای مربی ثبت می‌شود و
              بخشی از تاریخچهٔ درخواست شما می‌ماند.
            </p>
          </Card>
          {feedback ? (
            <p className={styles.feedback} role="status">
              {feedback}
            </p>
          ) : null}
          <Button
            disabled={submitting || draft.sections.length === 0}
            fullWidth
            onClick={() => void submit()}
          >
            {submitting ? "در حال ثبت…" : "ارسال درخواست برای مربی"}
          </Button>
        </div>
      )}
    </main>
  );
}

function sectionLabel(section: ProgramRequestSection): string {
  return sectionOptions.find((item) => item.id === section)?.label ?? section;
}
