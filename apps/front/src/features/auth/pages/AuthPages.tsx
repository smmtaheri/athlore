import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { LogIn, UserPlus } from "lucide-react";
import { Button, Card, FormField, Input, PageTitle } from "../../../components/ui";
import { appConfig } from "../../../app/config/appConfig";
import { LoginMethodSelector, type LoginMethod } from "../components/LoginMethodSelector";
import { ApiError, persianMessageForApiError } from "../../../shared/api/errors";
import { validateIranMobileInput } from "../../../shared/phone/iranMobile";
import { useAuth } from "../context/AuthContext";
import type { LoginCodeRequestResult } from "../services/authRepository";
import styles from "./auth.module.css";

interface AuthErrors {
  email?: string;
  fullName?: string;
  password?: string;
  phoneNumber?: string;
  submit?: string;
}

export function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeRequest, setCodeRequest] = useState<LoginCodeRequestResult | null>(null);
  const [method, setMethod] = useState<LoginMethod>("password");
  const [errors, setErrors] = useState<AuthErrors>({});
  const [saving, setSaving] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();

  const requestCode = async () => {
    const phoneError = validateIranMobileInput(phoneNumber);
    if (phoneError) {
      setErrors({ phoneNumber: phoneError });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await auth.requestLoginCode({
        phoneNumber: phoneNumber.trim(),
        role: "coach"
      });
      setCodeRequest(result);
      setCode("");
    } catch (error) {
      setErrors({ submit: mapAuthError(error, "ارسال کد انجام نشد؛ دوباره تلاش کنید.") });
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: AuthErrors = {};
    const phoneError = validateIranMobileInput(phoneNumber);
    if (phoneError) nextErrors.phoneNumber = phoneError;
    const loginMethod = appConfig.loginOtpEnabled ? method : "password";
    if (loginMethod === "password" && !password) nextErrors.password = "رمز عبور الزامی است.";
    if (loginMethod === "code" && codeRequest && !code.trim()) {
      nextErrors.password = "کد یک‌بارمصرف را وارد کنید.";
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (loginMethod === "code" && !codeRequest) {
      await requestCode();
      return;
    }

    setSaving(true);
    try {
      await auth.login({
        code: loginMethod === "code" ? code.trim() : undefined,
        method: loginMethod,
        password: loginMethod === "password" ? password : undefined,
        phoneNumber: phoneNumber.trim(),
        role: "coach"
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrors({
        submit:
          loginMethod === "code" && error instanceof ApiError && error.status === 401
            ? "کد ورود نادرست است یا ورود با کد برای این حساب مجاز نیست؛ کد را بررسی کنید یا با رمز عبور وارد شوید."
            : mapAuthError(error, "ورود انجام نشد. اطلاعات را بررسی کنید.")
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      footer={
        appConfig.publicRegistrationEnabled ? (
          <>
            حساب ندارید؟ <Link to="/register">ثبت نام مربی</Link>
          </>
        ) : (
          <>حساب مربی توسط مدیر سامانه ساخته می‌شود. در صورت فراموشی رمز، با مدیر تماس بگیرید.</>
        )
      }
      icon={<LogIn size={22} />}
      title="ورود مربی"
    >
      <form className={styles.form} onSubmit={submit}>
        {errors.submit ? (
          <div className={styles.errorAlert} role="alert">
            {errors.submit}
          </div>
        ) : null}
        <FormField error={errors.phoneNumber} htmlFor="login-phone" label="شماره موبایل" required>
          <Input
            autoComplete="tel"
            disabled={saving}
            id="login-phone"
            inputMode="tel"
            onChange={(event) => {
              setPhoneNumber(event.target.value);
              setCodeRequest(null);
              setCode("");
              setErrors({});
            }}
            placeholder="9121234567"
            type="tel"
            value={phoneNumber}
          />
        </FormField>
        <p className={styles.loginMethodHint}>
          شماره را با ۹۱۲…، ۰۹۱۲…، ۹۸۹۱۲… یا +۹۸۹۱۲… وارد کنید؛ سیستم خودش آن را یکسان‌سازی می‌کند.
        </p>
        {appConfig.loginOtpEnabled ? (
          <LoginMethodSelector
            disabled={saving}
            method={method}
            onChange={(next) => {
              setMethod(next);
              setCodeRequest(null);
              setCode("");
              setErrors({});
            }}
          />
        ) : null}
        {method === "password" || !appConfig.loginOtpEnabled ? (
          <FormField error={errors.password} htmlFor="login-password" label="رمز عبور" required>
            <Input
              autoComplete="current-password"
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </FormField>
        ) : codeRequest ? (
          <>
            <p className={styles.loginMethodHint} role="status">
              {codeRequest.message}
            </p>
            <FormField error={errors.password} htmlFor="login-code" label="کد یک‌بارمصرف" required>
              <Input
                autoComplete="one-time-code"
                autoFocus
                disabled={saving}
                id="login-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </FormField>
            <Button
              disabled={saving}
              onClick={() => void requestCode()}
              type="button"
              variant="ghost"
            >
              ارسال دوباره کد
            </Button>
          </>
        ) : (
          <p className={styles.loginMethodHint}>برای دریافت کد ورود، «ارسال کد» را بزنید.</p>
        )}
        <Button fullWidth iconStart={<LogIn size={18} />} isLoading={saving} type="submit">
          {method === "code" && appConfig.loginOtpEnabled
            ? codeRequest
              ? "ورود با کد"
              : "ارسال کد"
            : "ورود به داشبورد"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [errors, setErrors] = useState<AuthErrors>({});
  const [saving, setSaving] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();

  if (!appConfig.publicRegistrationEnabled) {
    return (
      <AuthShell
        footer={
          <>
            <Link to="/login">بازگشت به ورود مربی</Link>
          </>
        }
        icon={<UserPlus size={22} />}
        title="ثبت‌نام غیرفعال است"
      >
        <div className={styles.errorAlert}>
          ثبت‌نام عمومی غیرفعال است. برای ساخت حساب مربی با مدیر سامانه تماس بگیرید.
        </div>
        <Button fullWidth onClick={() => navigate("/login", { replace: true })} type="button">
          رفتن به صفحه ورود
        </Button>
      </AuthShell>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateAuth({ email, fullName, password, phoneNumber }, true);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      await auth.register({ email, fullName, password, phoneNumber });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErrors({ submit: mapAuthError(error, "ثبت نام انجام نشد. دوباره تلاش کنید.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      footer={
        <>
          قبلاً ثبت نام کرده‌اید؟ <Link to="/login">ورود مربی</Link>
        </>
      }
      icon={<UserPlus size={22} />}
      title="ثبت نام مربی"
    >
      <form className={styles.form} onSubmit={submit}>
        {errors.submit ? <div className={styles.errorAlert}>{errors.submit}</div> : null}
        <FormField
          error={errors.fullName}
          htmlFor="register-full-name"
          label="نام و نام خانوادگی"
          required
        >
          <Input
            autoComplete="name"
            id="register-full-name"
            onChange={(event) => setFullName(event.target.value)}
            value={fullName}
          />
        </FormField>
        <FormField error={errors.email} htmlFor="register-email" label="ایمیل" required>
          <Input
            autoComplete="email"
            id="register-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </FormField>
        <FormField
          error={errors.phoneNumber}
          htmlFor="register-phone"
          label="شماره موبایل"
          required
        >
          <Input
            autoComplete="tel"
            id="register-phone"
            inputMode="tel"
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="مثلا ۰۹۱۲۱۲۳۴۵۶۷"
            value={phoneNumber}
          />
        </FormField>
        <FormField error={errors.password} htmlFor="register-password" label="رمز عبور" required>
          <Input
            autoComplete="new-password"
            id="register-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </FormField>
        <Button fullWidth iconStart={<UserPlus size={18} />} isLoading={saving} type="submit">
          ساخت حساب مربی
        </Button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  children,
  footer,
  icon,
  title
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <main className={styles.authPage}>
      <Card className={styles.authCard} padding="lg">
        <span aria-hidden className={styles.iconWrap}>
          {icon}
        </span>
        <div className={styles.header}>
          <p className={styles.brandName}>{appConfig.displayName}</p>
          <PageTitle>{title}</PageTitle>
          <p>ورود امن با حساب مربی برای مدیریت شاگردها و برنامه‌ها</p>
        </div>
        {children}
        <p className={styles.footer}>{footer}</p>
      </Card>
    </main>
  );
}

function validateAuth(
  values: { email: string; fullName?: string; password: string; phoneNumber?: string },
  register = false
) {
  const errors: AuthErrors = {};

  if (register && !values.fullName?.trim()) {
    errors.fullName = "نام مربی الزامی است.";
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = "ایمیل معتبر وارد کنید.";
  }
  if (register) {
    const phoneError = validateIranMobileInput(values.phoneNumber ?? "");
    if (phoneError) {
      errors.phoneNumber = phoneError;
    }
  }
  if (values.password.length < 8) {
    errors.password = "رمز عبور حداقل ۸ کاراکتر باشد.";
  }

  return errors;
}

function mapAuthError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "conflict" || error.code === "coach_phone_already_exists") {
      if (error.code === "coach_phone_already_exists") {
        return "این شماره موبایل قبلاً برای یک مربی ثبت شده است.";
      }
      return "این ایمیل قبلاً ثبت شده است.";
    }
    if (error.code === "registration_disabled") {
      return "ثبت‌نام عمومی غیرفعال است. با مدیر سامانه تماس بگیرید.";
    }
    return persianMessageForApiError(error);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
