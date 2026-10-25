import { useState } from "react";
import { PhoneNumberInput } from "../../../shared/phone/PhoneNumberInput";
import { Navigate, useNavigate } from "react-router";
import { KeyRound, LogIn } from "lucide-react";
import { Button, Card, FormField, Input, PageTitle } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { studentPaths } from "../../../app/config/appOrigin";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { validateMobileInput } from "../../../shared/phone/mobile";
import { athleteFacingText } from "../../../shared/athleteWording";
import { useAuth } from "../../auth";
import { useCodeResendCooldown } from "../../auth/hooks/useCodeResendCooldown";
import { LoginMethodSelector, type LoginMethod } from "../../auth/components/LoginMethodSelector";
import type { LoginCodeRequestResult } from "../../auth/services/authRepository";
import authStyles from "../../auth/pages/auth.module.css";
import styles from "../components/studentPortal.module.css";

type LoginPhase = "credentials" | "forced_password_change";

export function StudentLoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LoginPhase>("credentials");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeRequest, setCodeRequest] = useState<LoginCodeRequestResult | null>(null);
  const { secondsRemaining, setSecondsRemaining } = useCodeResendCooldown();
  const [method, setMethod] = useState<LoginMethod>("password");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  const showForcedChange =
    phase === "forced_password_change" ||
    (auth.session?.role === "student" && Boolean(auth.session.mustChangePassword));
  const lockedPhoneNumber = auth.session?.student?.phoneNumber || phoneNumber;

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
      return athleteFacingText(err.message);
    }
    if (err instanceof ApiError) {
      return athleteFacingText(persianMessageForApiError(err));
    }
    return "شماره موبایل یا اطلاعات ورود نادرست است.";
  };

  const requestCode = async () => {
    const phoneError = validateMobileInput(phoneNumber);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setError("");
    setInfo("");
    setSaving(true);
    try {
      const result = await auth.requestLoginCode({
        phoneNumber: phoneNumber.trim(),
        role: "student"
      });
      setCodeRequest(result);
      setCode("");
      setSecondsRemaining(result.retryAfterSeconds || 0);
    } catch (err) {
      if (err instanceof ApiError && err.code === "sms_delivery_unavailable") {
        setCodeRequest(null);
        setCode("");
        setSecondsRemaining(60);
      }
      setError(
        err instanceof ApiError
          ? athleteFacingText(persianMessageForApiError(err))
          : "ارسال کد انجام نشد؛ دوباره تلاش کنید."
      );
    } finally {
      setSaving(false);
    }
  };

  const submitNormalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");
    const phoneError = validateMobileInput(phoneNumber);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const loginMethod = appConfig.loginOtpEnabled ? method : "password";
    if (loginMethod === "password" && !password) {
      setError("رمز عبور را وارد کنید.");
      return;
    }
    if (loginMethod === "code" && !codeRequest) {
      await requestCode();
      return;
    }
    if (loginMethod === "code" && !code.trim()) {
      setError("کد یک‌بارمصرف را وارد کنید.");
      return;
    }
    setSaving(true);
    try {
      const session = await auth.login({
        code: loginMethod === "code" ? code.trim() : undefined,
        method: loginMethod,
        password: loginMethod === "password" ? password : undefined,
        phoneNumber: phoneNumber.trim(),
        role: "student"
      });
      if (session?.mustChangePassword) {
        setPassword("");
        setPhase("forced_password_change");
        return;
      }
      navigate(studentPaths.dashboard, { replace: true });
    } catch (err) {
      setError(
        loginMethod === "code" && err instanceof ApiError && err.status === 401
          ? "کد ورود نادرست است، منقضی شده یا قبلاً استفاده شده؛ کد جدید بگیرید یا با رمز عبور وارد شوید."
          : loginErrorMessage(err)
      );
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
      await auth.completeStudentSetup({
        password: newPassword,
        passwordConfirm: newPasswordConfirm
      });
      setPhase("credentials");
      setPhoneNumber(lockedPhoneNumber);
      setPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setInfo("رمز عبور با موفقیت تغییر کرد. لطفاً دوباره با شماره موبایل و رمز جدید وارد شوید.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? athleteFacingText(err.message || persianMessageForApiError(err))
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
            {lockedPhoneNumber ? (
              <p className={styles.muted}>شماره موبایل: {lockedPhoneNumber}</p>
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
          <PageTitle>ورود ورزشکار</PageTitle>
          <p>با شماره موبایل خود و رمز عبور یا کد یک‌بارمصرف وارد شوید.</p>
        </div>
        <form className={styles.form} onSubmit={submitNormalLogin}>
          {error ? (
            <div className={styles.errorAlert} role="alert">
              {error}
            </div>
          ) : null}
          {info ? <div className={styles.infoAlert}>{info}</div> : null}
          <FormField htmlFor="student-login-phone" label="شماره موبایل" required>
            <PhoneNumberInput
              autoComplete="tel"
              disabled={saving}
              id="student-login-phone"
              aria-describedby="student-login-phone-help"
              inputMode="tel"
              onValueChange={(phone) => {
                setPhoneNumber(phone);
                setCodeRequest(null);
                setSecondsRemaining(0);
                setCode("");
                setError("");
              }}
              value={phoneNumber}
            />
          </FormField>
          <p className={authStyles.loginMethodHint} id="student-login-phone-help">
            کشور و شمارهٔ موبایلی را انتخاب کنید که مربی در پروفایل شما ثبت کرده است، نه نام کاربری.
            برای شمارهٔ خارج از ایران فعلاً با رمز عبور وارد شوید.
          </p>
          {appConfig.loginOtpEnabled ? (
            <LoginMethodSelector
              disabled={saving}
              method={method}
              onChange={(next) => {
                setMethod(next);
                setCodeRequest(null);
                setSecondsRemaining(0);
                setCode("");
                setError("");
              }}
            />
          ) : null}
          {method === "password" || !appConfig.loginOtpEnabled ? (
            <FormField htmlFor="student-login-password" label="رمز عبور" required>
              <Input
                autoComplete="current-password"
                id="student-login-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </FormField>
          ) : codeRequest ? (
            <>
              <p className={authStyles.loginMethodHint} role="status">
                {codeRequest.message}
              </p>
              <FormField htmlFor="student-login-code" label="کد یک‌بارمصرف" required>
                <Input
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={
                    codeRequest.deliveryMode === "sms" ? "کد ۶ رقمی پیامک‌شده" : "کد ورود"
                  }
                  autoFocus
                  disabled={saving}
                  id="student-login-code"
                  inputMode="numeric"
                  onChange={(event) => setCode(event.target.value)}
                  value={code}
                />
              </FormField>
              <Button
                disabled={saving || secondsRemaining > 0}
                onClick={() => void requestCode()}
                type="button"
                variant="ghost"
              >
                {secondsRemaining > 0
                  ? `ارسال دوباره کد (${secondsRemaining} ثانیه)`
                  : "ارسال دوباره کد"}
              </Button>
            </>
          ) : (
            <p className={authStyles.loginMethodHint}>برای دریافت کد ورود، «ارسال کد» را بزنید.</p>
          )}
          <Button
            disabled={method === "code" && !codeRequest && secondsRemaining > 0}
            isLoading={saving}
            type="submit"
          >
            {method === "code" && appConfig.loginOtpEnabled
              ? codeRequest
                ? "ورود با کد"
                : secondsRemaining > 0
                  ? `ارسال کد (${secondsRemaining} ثانیه)`
                  : "ارسال کد"
              : "ورود"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
