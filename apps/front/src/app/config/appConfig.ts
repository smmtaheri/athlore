/** Frontend runtime configuration. Secrets never belong here. */

function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  // Sensible local default compatible with Backend CORS (Vite on :5173).
  return "http://127.0.0.1:8000/api/v1";
}

function resolvePublicRegistrationEnabled(): boolean {
  const raw = (import.meta.env.VITE_PUBLIC_REGISTRATION_ENABLED as string | undefined)
    ?.trim()
    .toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  // Default: disabled (admin provisions coaches).
  return false;
}

export const appConfig = {
  displayName: "Athlore",
  panelLabel: "پنل مربی",
  tagline: "مربیگری تو، هوشمندتر.",
  apiBaseUrl: resolveApiBaseUrl(),
  publicRegistrationEnabled: resolvePublicRegistrationEnabled(),
  /**
   * Unit tests keep localStorage repositories.
   * Production/dev runtime uses Backend APIs unless VITE_USE_MOCK_API=true.
   */
  useMockRepositories:
    import.meta.env.MODE === "test" || import.meta.env.VITE_USE_MOCK_API === "true"
} as const;
