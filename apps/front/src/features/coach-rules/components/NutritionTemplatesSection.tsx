import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Card, EmptyState, StatusBadge } from "../../../components/ui";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import {
  nutritionSupplementTemplatesRepository,
  type NutritionSupplementTemplatesRepository
} from "../services/nutritionSupplementTemplatesRepository";
import type { NutritionTemplateSummary } from "../types/coachRules";
import styles from "../../programs/components/programFlow.module.css";

export interface NutritionTemplatesSectionProps {
  onTemplatesChange: (templates: NutritionTemplateSummary[]) => void;
  repository?: NutritionSupplementTemplatesRepository;
  templates?: NutritionTemplateSummary[];
}

export function NutritionTemplatesSection({
  onTemplatesChange,
  repository = nutritionSupplementTemplatesRepository,
  templates
}: NutritionTemplatesSectionProps) {
  const [feedback, setFeedback] = useState("");
  const [pendingId, setPendingId] = useState<string>();

  const approve = async (template: NutritionTemplateSummary) => {
    setPendingId(template.id);
    setFeedback("");
    try {
      const updated = await repository.approveNutritionTemplate(template.id);
      onTemplatesChange((templates ?? []).map((item) => (item.id === updated.id ? updated : item)));
      setFeedback(`«${updated.name}» تایید و فعال شد.`);
    } catch (error) {
      setFeedback(
        error instanceof ApiError ? persianMessageForApiError(error) : "تایید قالب غذایی انجام نشد."
      );
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <Card className={styles.pageStack}>
      <SectionHeader
        description="فهرست قالب‌های غذایی مرجعی که موتور تولید می‌تواند به‌صورت خودکار انتخاب کند. قالب‌هایی که نیاز به بازبینی مربی دارند باید پیش از فعال‌سازی بررسی شوند."
        title="برنامه غذایی مرجع"
      />
      {feedback ? (
        <div
          className={`${styles.alert} ${
            feedback.includes("نشد") ? styles.alertError : styles.alertSuccess
          }`}
          role="status"
        >
          {feedback}
        </div>
      ) : null}

      {!templates || templates.length === 0 ? (
        <EmptyState
          description="این بخش هنوز داده‌ای از سرور دریافت نکرده است. فعال‌سازی و بازبینی قالب‌های غذایی فعلاً از طریق API یا پنل مدیریت انجام می‌شود."
          title="قالب غذایی‌ای برای نمایش نیست"
        />
      ) : (
        <ul className={styles.reviewList}>
          {templates.map((template) => (
            <li className={styles.editableCard} key={template.id}>
              <div className={styles.ruleCardHeader}>
                <div>
                  <strong>{template.name}</strong>
                  {template.goal ? <p>{template.goal}</p> : null}
                </div>
                <div className={styles.actionIconGroup}>
                  <StatusBadge variant={template.status === "active" ? "success" : "neutral"}>
                    {template.status === "active" ? "فعال" : template.status}
                  </StatusBadge>
                  {template.needsCoachReview ? (
                    <StatusBadge variant="warning">نیاز به بازبینی مربی</StatusBadge>
                  ) : (
                    <StatusBadge variant="success">بازبینی شده</StatusBadge>
                  )}
                  {template.isEligibleForAutoSelect ? (
                    <StatusBadge variant="info">واجد انتخاب خودکار</StatusBadge>
                  ) : null}
                </div>
              </div>
              {template.notes ? <p>{template.notes}</p> : null}
              <Button
                disabled={!template.needsCoachReview && template.isEligibleForAutoSelect}
                iconStart={<CheckCircle2 size={16} />}
                isLoading={pendingId === template.id}
                onClick={() => approve(template)}
                size="sm"
              >
                تایید و فعال‌سازی
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SectionHeader({ description, title }: { description: string; title: string }) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
    </div>
  );
}
