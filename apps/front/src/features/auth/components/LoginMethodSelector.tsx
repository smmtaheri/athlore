import styles from "../pages/auth.module.css";

export type LoginMethod = "password" | "code";

export function LoginMethodSelector({
  method,
  onChange
}: {
  method: LoginMethod;
  onChange: (method: LoginMethod) => void;
}) {
  return (
    <div aria-label="روش ورود" className={styles.loginMethodSwitch} role="group">
      <button
        aria-pressed={method === "password"}
        className={styles.loginMethodButton}
        onClick={() => onChange("password")}
        type="button"
      >
        رمز عبور
      </button>
      <button
        aria-pressed={method === "code"}
        className={styles.loginMethodButton}
        onClick={() => onChange("code")}
        type="button"
      >
        ورود با کد یک‌بارمصرف
      </button>
    </div>
  );
}
