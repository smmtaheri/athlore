import type { ReactNode } from "react";
import { useState } from "react";
import { CalendarDays, Dumbbell, FileDown, KeyRound, Pencil, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { Button, Card, FormField, Input, Modal, StatusBadge } from "../../../components/ui";
import { studentLoginUrl } from "../../../app/config/appOrigin";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { downloadStudentProfilePdf } from "../../../shared/api/exportPdf";
import { formatIranMobileDisplay } from "../../../shared/phone/iranMobile";
import { studentsRepository } from "../services/studentsRepository";
import type { StudentActivateLoginResult } from "../types/monthlyVisit";
import type { Student, StudentPortalStatus } from "../types/student";
import { goalLabels, genderLabels, trainingLevelLabels } from "../types/options";
import { StudentStatusBadge } from "./StudentStatusBadge";
import styles from "./students.module.css";

export interface StudentProfileHeaderProps {
  onStudentUpdated?: (student: Student) => void;
  student: Student;
}

const portalStatusLabel: Record<StudentPortalStatus, string> = {
  active: "فعال و قابل ورود",
  disabled: "غیرفعال",
  not_started: "فعال نشده",
  password_reset_required: "نیازمند تغییر رمز پس از ریست",
  pending_activation: "نیازمند تغییر رمز اولیه"
};

const portalStatusVariant: Record<
  StudentPortalStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  active: "success",
  disabled: "danger",
  not_started: "neutral",
  password_reset_required: "warning",
  pending_activation: "warning"
};

type PasswordModalMode = "activate" | "reset" | null;

export function StudentProfileHeader({ onStudentUpdated, student }: StudentProfileHeaderProps) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [passwordModal, setPasswordModal] = useState<PasswordModalMode>(null);
  const [initialPassword, setInitialPassword] = useState("");
  const [portalUsername, setPortalUsername] = useState("");
  const [credentials, setCredentials] = useState<StudentActivateLoginResult | null>(null);
  const portal = student.portalAccess;
  const portalStatus = portal?.status ?? "not_started";

  const refreshStudent = async () => {
    const next = await studentsRepository.getById(student.id);
    if (next && onStudentUpdated) {
      onStudentUpdated(next);
    }
    return next;
  };

  const exportPdf = async () => {
    setExportError("");
    setExporting(true);
    try {
      await downloadStudentProfilePdf(student.id);
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "خروجی PDF اطلاعات شاگرد انجام نشد."
      );
    } finally {
      setExporting(false);
    }
  };

  const submitInitialPassword = async () => {
    if (!passwordModal) return;
    const password = initialPassword.trim();
    const username = portalUsername.trim();
    if (passwordModal === "activate" && username.length < 3) {
      setActionError("نام کاربری باید حداقل ۳ کاراکتر باشد.");
      return;
    }
    if (password.length < 4) {
      setActionError("رمز اولیه باید حداقل ۴ کاراکتر باشد.");
      return;
    }
    setActionError("");
    setBusy(true);
    try {
      const result =
        passwordModal === "reset"
          ? studentsRepository.resetPortalPassword
            ? await studentsRepository.resetPortalPassword(student.id, password)
            : await studentsRepository.activateLogin!(student.id, true, password)
          : studentsRepository.setPortalInitialPassword
            ? await studentsRepository.setPortalInitialPassword(student.id, username, password)
            : await studentsRepository.activateLogin!(student.id, true, password);
      setCredentials(result);
      setPasswordModal(null);
      setInitialPassword("");
      setPortalUsername("");
      await refreshStudent();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : error instanceof Error
            ? error.message
            : "ثبت رمز اولیه انجام نشد."
      );
    } finally {
      setBusy(false);
    }
  };

  const deactivatePortal = async () => {
    setActionError("");
    setBusy(true);
    try {
      if (!studentsRepository.deactivatePortal) {
        throw new Error("غیرفعال‌سازی در این حالت در دسترس نیست.");
      }
      await studentsRepository.deactivatePortal(student.id);
      await refreshStudent();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "غیرفعال‌سازی انجام نشد."
      );
    } finally {
      setBusy(false);
    }
  };

  const reactivatePortal = async () => {
    setActionError("");
    setBusy(true);
    try {
      if (!studentsRepository.reactivatePortal) {
        throw new Error("فعال‌سازی مجدد در این حالت در دسترس نیست.");
      }
      await studentsRepository.reactivatePortal(student.id);
      await refreshStudent();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? persianMessageForApiError(error)
          : "فعال‌سازی مجدد انجام نشد."
      );
    } finally {
      setBusy(false);
    }
  };

  const shownPassword = credentials?.initialPassword || credentials?.temporaryPassword;
  const loginUrl = studentLoginUrl();
  return (
    <Card className={styles.profileHeaderCard}>
      <div className={styles.profileHeaderMain}>
        <span aria-hidden className={styles.profileAvatar}>
          <UserRound size={44} />
        </span>
        <div className={styles.profileIdentity}>
          <div className={styles.profileNameRow}>
            <h2>{student.fullName}</h2>
            <StudentStatusBadge status={student.status} />
          </div>
          <p>
            {goalLabels[student.goals.primaryGoal]} -{" "}
            {trainingLevelLabels[student.trainingBackground.level]} - {genderLabels[student.gender]}
            {student.phoneNumber ? ` - ${formatIranMobileDisplay(student.phoneNumber)}` : ""}
          </p>
          <div className={styles.profileNameRow}>
            <span>دسترسی پنل شاگرد:</span>
            <StatusBadge variant={portalStatusVariant[portalStatus]}>
              {portalStatusLabel[portalStatus]}
            </StatusBadge>
            {portal?.username ? <span>نام کاربری: {portal.username}</span> : null}
          </div>
        </div>
      </div>

      <div className={styles.profileSummaryGrid}>
        <ProfileSummaryItem
          label="سطح تمرین"
          value={trainingLevelLabels[student.trainingBackground.level]}
        />
        <ProfileSummaryItem label="وزن فعلی" value={`${student.weightKg} کیلوگرم`} />
        <ProfileSummaryItem label="وضعیت" value={<StudentStatusBadge status={student.status} />} />
        <ProfileSummaryItem label="آخرین ویزیت" value={student.summary.lastVisitDate} />
      </div>

      {exportError ? (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          {exportError}
        </div>
      ) : null}
      {actionError ? (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          {actionError}
        </div>
      ) : null}

      <div className={styles.profileActions}>
        <Button
          iconStart={<CalendarDays size={18} />}
          onClick={() => navigate(`/students/${student.id}/visits/new`)}
        >
          ثبت ویزیت جدید
        </Button>
        <Button
          iconStart={<Dumbbell size={18} />}
          onClick={() => navigate("/programs/new")}
          variant="secondary"
        >
          تولید برنامه
        </Button>
        <Button
          iconStart={<FileDown size={18} />}
          disabled={exporting}
          isLoading={exporting}
          onClick={exportPdf}
          variant="secondary"
        >
          خروجی PDF اطلاعات شاگرد
        </Button>
        {portalStatus === "not_started" || portalStatus === "pending_activation" ? (
          <Button
            disabled={busy}
            iconStart={<KeyRound size={18} />}
            onClick={() => {
              setActionError("");
              setInitialPassword("");
              setPortalUsername(portal?.username || "");
              setPasswordModal("activate");
            }}
            variant="secondary"
          >
            فعال‌سازی پنل شاگرد
          </Button>
        ) : null}
        {portalStatus === "active" || portalStatus === "password_reset_required" ? (
          <Button
            disabled={busy}
            iconStart={<KeyRound size={18} />}
            onClick={() => {
              setActionError("");
              setInitialPassword("");
              setPasswordModal("reset");
            }}
            variant="secondary"
          >
            ریست رمز پنل شاگرد
          </Button>
        ) : null}
        {portal?.username && portalStatus !== "not_started" ? (
          <Button
            disabled={busy}
            onClick={async () => {
              const next = window.prompt("نام کاربری جدید شاگرد", portal.username || "");
              if (!next || next.trim().length < 3) {
                return;
              }
              setBusy(true);
              setActionError("");
              try {
                if (!studentsRepository.setPortalUsername) {
                  throw new Error("ویرایش نام کاربری در دسترس نیست.");
                }
                await studentsRepository.setPortalUsername(student.id, next.trim());
                await refreshStudent();
              } catch (error) {
                setActionError(
                  error instanceof ApiError
                    ? persianMessageForApiError(error)
                    : error instanceof Error
                      ? error.message
                      : "ویرایش نام کاربری انجام نشد."
                );
              } finally {
                setBusy(false);
              }
            }}
            variant="secondary"
          >
            ویرایش نام کاربری
          </Button>
        ) : null}
        {portalStatus === "disabled" ? (
          <Button disabled={busy} onClick={reactivatePortal} variant="secondary">
            فعال‌سازی دوباره
          </Button>
        ) : null}
        {portalStatus !== "not_started" && portalStatus !== "disabled" ? (
          <Button disabled={busy} onClick={deactivatePortal} variant="danger">
            غیرفعال کردن دسترسی
          </Button>
        ) : null}
        <Button
          iconStart={<Pencil size={18} />}
          onClick={() => navigate(`/students/${student.id}/edit`)}
          variant="secondary"
        >
          ویرایش اطلاعات
        </Button>
      </div>

      <Modal
        footer={
          <div className={styles.profileActions}>
            <Button
              onClick={() => {
                setPasswordModal(null);
                setInitialPassword("");
                setPortalUsername("");
              }}
              variant="secondary"
            >
              انصراف
            </Button>
            <Button disabled={busy} isLoading={busy} onClick={submitInitialPassword}>
              ثبت رمز اولیه
            </Button>
          </div>
        }
        onClose={() => {
          setPasswordModal(null);
          setInitialPassword("");
          setPortalUsername("");
        }}
        open={passwordModal !== null}
        title={
          passwordModal === "reset" ? "ریست رمز پنل شاگرد" : "فعال‌سازی پنل شاگرد"
        }
      >
        <div className={styles.formGrid}>
          <p className={styles.actionHint}>
            نام کاربری را مربی تعیین می‌کند. رمز اولیه فقط برای ورود اول (یا پس از ریست) است و شاگرد
            باید بلافاصله رمز جدید خودش را تعیین کند. برای تست می‌توانید از ۱۲۳۴۵۶ استفاده کنید.
          </p>
          {passwordModal === "activate" ? (
            <FormField htmlFor="portal-username" label="نام کاربری شاگرد" required>
              <Input
                autoComplete="off"
                id="portal-username"
                onChange={(event) => setPortalUsername(event.target.value)}
                value={portalUsername}
              />
            </FormField>
          ) : null}
          <FormField htmlFor="portal-initial-password" label="رمز اولیه" required>
            <Input
              autoComplete="new-password"
              id="portal-initial-password"
              onChange={(event) => setInitialPassword(event.target.value)}
              type="password"
              value={initialPassword}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        footer={
          <div className={styles.profileActions}>
            <Button onClick={() => setCredentials(null)} variant="secondary">
              بستن
            </Button>
          </div>
        }
        onClose={() => setCredentials(null)}
        open={Boolean(credentials)}
        title="رمز اولیه پنل شاگرد"
      >
        {credentials ? (
          <div className={styles.formGrid}>
            {shownPassword ? (
              <p>
                رمز اولیه: <strong>{shownPassword}</strong>
              </p>
            ) : null}
            {credentials.username ? (
              <p>
                نام کاربری فعلی: <strong>{credentials.username}</strong>
              </p>
            ) : null}
            <p className={styles.actionHint}>
              این رمز فقط همین لحظه نمایش داده می‌شود و بعداً قابل بازیابی نیست. شاگرد با نام کاربری و
              همین رمز اولیه وارد می‌شود و بلافاصله رمز دائمی خود را تعیین می‌کند.
            </p>
            <p className={styles.actionHint}>
              برای ورود شاگرد، این آدرس را برای او ارسال کنید: {loginUrl}
            </p>
            {credentials.purpose === "password_reset" ? (
              <p className={styles.actionHint}>
                رمز قبلی نامعتبر شد. نام کاربری و داده‌های شاگرد حفظ می‌شوند.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

interface ProfileSummaryItemProps {
  label: string;
  value: ReactNode;
}

function ProfileSummaryItem({ label, value }: ProfileSummaryItemProps) {
  return (
    <div className={styles.profileSummaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
