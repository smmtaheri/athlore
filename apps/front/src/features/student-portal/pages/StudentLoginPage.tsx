import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { KeyRound, LogIn } from "lucide-react";
import { Button, Card, FormField, Input, PageTitle } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { studentPaths } from "../../../app/config/appOrigin";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { useAuth } from "../../auth";
import authStyles from "../../auth/pages/auth.module.css";
import styles from "../components/studentPortal.module.css";

type LoginPhase = "credentials" | "forced_password_change";

export function StudentLoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LoginPhase>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  const showForcedChange =
    phase === "forced_password_change" ||
    (auth.session?.role === "student" && Boolean(auth.session.mustChangePassword));
  const lockedUsername = auth.session?.username || username;

  if (auth.status === "loading") {
    return null;
  }

  if (
    auth.status === "authenticated" &&
    auth.session?.role === "student" &&
    !auth.session.mustChangePassword &&
    !showForcedChange
  ) {
    return <Navigate replace to={studentPaths.dashboard} />;
  }

  const loginErrorMessage = (err: unknown) => {
    if (err instanceof ApiError && err.message) {
      return err.message;
    }
    if (err instanceof ApiError) {
      return persianMessageForApiError(err);
    }
    return "نام کاربری یا رمز عبور نادرست است.";
  };

  const submitNormalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!username.trim() || !password) {
      setError("نام کاربری و رمز عبور الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const session = await auth.login({ username: username.trim(), password });
      if (session?.mustChangePassword) {
        setPassword("");
        setPhase("forced_password_change");
        return;
      }
      navigate(studentPaths.dashboard, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submitForcedPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("رمز عبور جدید باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("تأیید رمز عبور با رمز جدید یکسان نیست.");
      return;
    }
    setSaving(true);
    try {
      const result = await auth.completeStudentSetup({
        password: newPassword,
        passwordConfirm: newPasswordConfirm
      });
      const nextUsername = result?.username || lockedUsername;
      setPhase("credentials");
      setUsername(nextUsername);
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setInfo("رمز عبور با موفقیت تغییر کرد. لطفاً دوباره با نام کاربری و رمز جدید وارد شوید.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || persianMessageForApiError(err)
          : "ثبت رمز جدید انجام نشد."
      );
    } finally {
      setSaving(false);
    }
  };

  if (showForcedChange) {
    return (
      <main className={authStyles.authPage}>
        <Card className={authStyles.authCard} padding="lg">
          <span aria-hidden className={authStyles.iconWrap}>
            <KeyRound size={22} />
          </span>
          <div className={authStyles.header}>
            <p className={authStyles.brandName}>{appConfig.displayName}</p>
            <PageTitle>تغییر رمز عبور</PageTitle>
            <p>برای ادامه، رمز عبور خود را تغییر دهید.</p>
            {lockedUsername ? (
              <p className={styles.muted}>نام کاربری: {lockedUsername}</p>
            ) : null}
          </div>
          <form className={styles.form} onSubmit={submitForcedPasswordChange}>
            {error ? <div className={styles.errorAlert}>{error}</div> : null}
            <FormField htmlFor="setup-password" label="رمز عبور جدید" required>
              <Input
                autoComplete="new-password"
                id="setup-password"
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </FormField>
            <FormField htmlFor="setup-password-confirm" label="تأیید رمز عبور جدید" required>
              <Input
                autoComplete="new-password"
                id="setup-password-confirm"
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                type="password"
                value={newPasswordConfirm}
              />
            </FormField>
            <Button isLoading={saving} type="submit">
              ثبت رمز جدید
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className={authStyles.authPage}>
      <Card className={authStyles.authCard} padding="lg">
        <span aria-hidden className={authStyles.iconWrap}>
          <LogIn size={22} />
        </span>
        <div className={authStyles.header}>
          <p className={authStyles.brandName}>{appConfig.displayName}</p>
          <PageTitle>ورود شاگرد</PageTitle>
          <p>با نام کاربری و رمز عبوری که مربی در اختیار شما گذاشته وارد شوید.</p>
        </div>
        <form className={styles.form} onSubmit={submitNormalLogin}>
          {error ? <div className={styles.errorAlert}>{error}</div> : null}
          {info ? <div className={styles.infoAlert}>{info}</div> : null}
          <FormField htmlFor="student-login-username" label="نام کاربری" required>
            <Input
              autoComplete="username"
              id="student-login-username"
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </FormField>
          <FormField htmlFor="student-login-password" label="رمز عبور" required>
            <Input
              autoComplete="current-password"
              id="student-login-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </FormField>
          <Button isLoading={saving} type="submit">
            ورود
          </Button>
        </form>
      </Card>
    </main>
  );
}
