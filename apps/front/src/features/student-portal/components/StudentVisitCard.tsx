import { Calendar } from "lucide-react";
import { Button, Card, StatusBadge } from "../../../components/ui";
import type { StudentVisit } from "../../students/types/monthlyVisit";
import {
  formatVisitDate,
  formatVisitDeadline,
  isVisitOpenForStudent,
  studentVisitStatusLabel,
  studentVisitStatusVariant,
  visitActionLabel,
  visitDisplayTitle
} from "../utils/studentVisitUi";
import styles from "../components/studentPortal.module.css";

export function StudentVisitCard({
  onOpen,
  visit
}: {
  onOpen: (visitId: string) => void;
  visit: StudentVisit;
}) {
  const open = isVisitOpenForStudent(visit);
  const expired = visit.status === "waiting_for_student" && Boolean(visit.isExpired);
  const action = visitActionLabel(visit);
  const deadline = formatVisitDeadline(visit);
  const visitDate = formatVisitDate(visit);
  const canPrimaryNavigate =
    open ||
    visit.status === "finalized" ||
    expired ||
    visit.status === "student_submitted" ||
    visit.status === "coach_review";

  return (
    <Card
      className={`${styles.visitCard} ${open ? styles.visitCardOpen : ""} ${expired ? styles.visitCardMuted : ""}`}
    >
      <div className={styles.visitCardTop}>
        <h3 className={styles.visitCardTitle}>{visitDisplayTitle()}</h3>
        <StatusBadge variant={studentVisitStatusVariant(visit)}>
          {studentVisitStatusLabel(visit)}
        </StatusBadge>
      </div>

      <div className={styles.visitMeta}>
        {visitDate ? (
          <span className={styles.visitMetaItem}>
            <Calendar aria-hidden size={14} />
            {visitDate}
          </span>
        ) : null}
        {deadline && (open || expired) ? (
          <span className={styles.visitMetaItem}>
            <Calendar aria-hidden size={14} />
            مهلت: {deadline}
          </span>
        ) : null}
      </div>

      {expired ? (
        <p className={styles.muted}>مهلت ارسال این ویزیت تمام شده و امکان تکمیل وجود ندارد.</p>
      ) : null}
      {visit.status === "student_submitted" ? (
        <p className={styles.muted}>پاسخ شما ارسال شده و منتظر بررسی مربی است.</p>
      ) : null}
      {visit.status === "coach_review" ? (
        <p className={styles.muted}>مربی در حال بررسی این ویزیت است.</p>
      ) : null}

      {action && canPrimaryNavigate ? (
        <div className={styles.visitActions}>
          <Button
            onClick={() => onOpen(visit.id)}
            size="sm"
            variant={open ? "primary" : "secondary"}
          >
            {action}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
