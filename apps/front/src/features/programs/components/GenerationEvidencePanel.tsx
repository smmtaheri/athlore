import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Card, StatusBadge } from "../../../components/ui";
import { fetchGenerationRunEvidence } from "../../../shared/api/repositories";
import type {
  GeneratedProgram,
  GenerationEvidence,
  GenerationEvidenceReplacement
} from "../types/generatedProgram";
import styles from "./programFlow.module.css";

export interface GenerationEvidencePanelProps {
  fetchEvidence?: (generationRunId: string) => Promise<GenerationEvidence>;
  program: GeneratedProgram;
}

/**
 * Structured, non-AI-prose explanation of why a Draft program was generated
 * the way it was. Renders `program.evidence` immediately (from the Program
 * detail response) and lazily enriches it with `GET /generation-runs/{id}/`
 * when `program.generationRunId` is available. Renders nothing when no
 * generation data exists at all (e.g. a manually created draft).
 */
export function GenerationEvidencePanel({
  fetchEvidence = fetchGenerationRunEvidence,
  program
}: GenerationEvidencePanelProps) {
  // Extra fields fetched lazily from GET /generation-runs/{id}/, keyed by run id so a
  // change of program (and therefore generationRunId) triggers a fresh fetch instead of
  // showing stale data. `program.evidence` itself is never mirrored into state — it's
  // used directly (and merged with the fetch result) at render time below. `status` is
  // only ever set from the fetch's async callbacks, never synchronously in the effect
  // body — "loading" is instead derived at render time from the run id we're waiting on.
  const [fetchedEvidence, setFetchedEvidence] = useState<{
    generationRunId: string;
    value: GenerationEvidence;
  } | null>(null);
  const [status, setStatus] = useState<"error" | "idle">("idle");
  const [errorRunId, setErrorRunId] = useState<string | null>(null);

  useEffect(() => {
    if (
      !program.generationRunId ||
      fetchedEvidence?.generationRunId === program.generationRunId ||
      errorRunId === program.generationRunId
    ) {
      return;
    }

    let isMounted = true;
    const runId = program.generationRunId;
    fetchEvidence(runId)
      .then((full) => {
        if (!isMounted) {
          return;
        }
        setFetchedEvidence({ generationRunId: runId, value: full });
        setStatus("idle");
      })
      .catch(() => {
        if (isMounted) {
          setErrorRunId(runId);
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [errorRunId, fetchEvidence, fetchedEvidence?.generationRunId, program.generationRunId]);

  const evidence =
    fetchedEvidence && fetchedEvidence.generationRunId === program.generationRunId
      ? { ...program.evidence, ...fetchedEvidence.value }
      : program.evidence;

  const isLoadingFullEvidence =
    Boolean(program.generationRunId) &&
    fetchedEvidence?.generationRunId !== program.generationRunId &&
    errorRunId !== program.generationRunId;

  if (program.status !== "draft") {
    return null;
  }

  if (!evidence && !isLoadingFullEvidence) {
    return null;
  }

  return (
    <Card className={styles.pageStack} data-testid="generation-evidence-panel">
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>چرا این برنامه ساخته شد؟</h2>
          <p className={styles.sectionDescription}>
            اطلاعات ساختاری موتور تولید — بدون توضیح آزاد یا متن تولیدشده توسط هوش مصنوعی.
          </p>
        </div>
        {isLoadingFullEvidence ? (
          <StatusBadge variant="info">در حال دریافت جزئیات کامل…</StatusBadge>
        ) : null}
      </div>

      {status === "error" ? (
        <p role="alert">
          دریافت جزئیات کامل از GenerationRun انجام نشد. موارد موجود در ادامه نمایش داده می‌شود.
        </p>
      ) : null}

      {evidence ? (
        <dl className={styles.metaList}>
          <EvidenceRow label="نسخه موتور تولید" value={evidence.generatorVersion || "—"} />
          <EvidenceRow label="قالب" value={evidence.templateName || evidence.templateId || "—"} />
          <EvidenceRow label="هدف شاگرد" value={evidence.studentGoal || "—"} />
          <EvidenceRow label="سطح شاگرد" value={evidence.studentLevel || "—"} />
          <EvidenceRow
            label="تعداد روز"
            value={evidence.daysPerWeek ? String(evidence.daysPerWeek) : "—"}
          />
          <EvidenceRow
            label="ویزیت مرجع"
            value={
              evidence.visitDate
                ? `${evidence.visitDate}${evidence.visitId ? ` (#${evidence.visitId})` : ""}`
                : "بدون ویزیت مرجع"
            }
          />
          <EvidenceRow
            label="عضلات ضعیف"
            value={<ChipList items={evidence.muscleFocus.weakMuscles} />}
          />
          <EvidenceRow
            label="عضلات دارای اولویت"
            value={<ChipList items={evidence.muscleFocus.priorityMuscles} />}
          />
          <EvidenceRow
            label="قوانین آسیب اعمال‌شده"
            value={<ChipList items={evidence.injuryRules} />}
          />
          <EvidenceRow
            label="حرکات حذف‌شده"
            value={<ChipList items={evidence.exerciseSelection.excludedMovements} />}
          />
          <EvidenceRow
            label="جایگزینی حرکات"
            value={<ReplacementList items={evidence.exerciseSelection.replacements} />}
          />
          <EvidenceRow
            label="حرکات ترجیحی"
            value={<ChipList items={evidence.exerciseSelection.preferred} />}
          />
          <EvidenceRow
            label="سابقه تاریخی استفاده‌شده"
            value={<ChipList items={evidence.exerciseSelection.historical} />}
          />
          <EvidenceRow label="تجهیزات" value={<ChipList items={evidence.equipment} />} />
          <EvidenceRow
            label="دلایل انتخاب تغذیه"
            value={<ChipList items={evidence.nutritionSupplement.nutritionSelectionReasons} />}
          />
          <EvidenceRow
            label="دلایل انتخاب مکمل"
            value={<ChipList items={evidence.nutritionSupplement.supplementSelectionReasons} />}
          />
          <EvidenceRow label="هشدارها" value={<ChipList items={evidence.warnings} />} />
          <EvidenceRow label="شناسه RuleSet" value={<code>{evidence.ruleSetId || "—"}</code>} />
          <EvidenceRow
            label="شناسه شاگرد (UUID)"
            value={<code>{evidence.studentId || program.studentId}</code>}
          />
          <EvidenceRow
            label="شناسه GenerationRun"
            value={<code>{evidence.generationRunId || "—"}</code>}
          />
        </dl>
      ) : null}
    </Card>
  );
}

function EvidenceRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.metaRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) {
    return <span>—</span>;
  }
  return (
    <span className={styles.chipList}>
      {items.map((item) => (
        <span className={styles.chip} key={item}>
          {item}
        </span>
      ))}
    </span>
  );
}

function ReplacementList({ items }: { items: GenerationEvidenceReplacement[] }) {
  if (!items.length) {
    return <span>—</span>;
  }
  return (
    <ul className={styles.metaList}>
      {items.map((item, index) => (
        <li key={`${item.from}-${item.to}-${index}`}>
          {item.from} ← {item.to}
          {item.reason ? ` (${item.reason})` : ""}
        </li>
      ))}
    </ul>
  );
}
