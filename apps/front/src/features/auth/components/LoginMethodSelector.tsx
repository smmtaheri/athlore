import styles from "../pages/auth.module.css";

export type LoginMethod = "password" | "code";

export function LoginMethodSelector({
  disabled = false,
  method,
  onChange
}: {
  disabled?: boolean;
  method: LoginMethod;
  onChange: (method: LoginMethod) => void;
}) {
  return (
    <div aria-label="روش ورود" className={styles.loginMethodSwitch} role="group">
      <button
        aria-pressed={method === "password"}
        className={styles.loginMethodButton}
        disabled={disabled}
        onClick={() => onChange("password")}
        type="button"
      >
        رمز عبور
      </button>
      <button
        aria-pressed={method === "code"}
        className={styles.loginMethodButton}
        disabled={disabled}
        onClick={() => onChange("code")}
        type="button"
      >
        ورود با کد یک‌بارمصرف
      </button>
    </div>
  );
}
