import type { AuthSession, AuthUser } from "../../features/auth/services/authRepository";

/**
 * Session hardening (v4): the persisted session contains metadata only.
 * Access and refresh tokens never live in Web Storage. Access session metadata lives in `sessionStorage`
 * (tab-scoped, cleared when the tab/browser closes) instead of `localStorage`.
 * A new tab restores that session through the HttpOnly refresh cookie.
 *
 * The refresh token itself is kept ONLY in an in-memory module variable
 * (`inMemoryRefreshToken`) — never written to any Web Storage. Reloading the
 * tab loses it, which means a stale access token cannot be silently renewed
 * after reload; the browser can instead use the HttpOnly refresh cookie
 * (see `client.ts`) to bootstrap a new access session. The in-memory token
 * remains only as a fallback for the current tab.
 */
export const AUTH_SESSION_STORAGE_KEY = "coach-assistant.auth.session.v4";

/** Pre-hardening keys — persisted tokens in Web Storage. Cleared for security. */
const LEGACY_AUTH_SESSION_LOCALSTORAGE_KEY = "coach-assistant.auth.session.v2";
const LEGACY_AUTH_SESSION_SESSIONSTORAGE_KEY = "coach-assistant.auth.session.v3";

export type AuthRole = "coach" | "student";

export interface CoachProfileView {
  controlMode: string;
  defaultSessionMinutes: number;
  displayName: string;
  id: string;
  styleNotes: string;
}

export interface StudentSessionView {
  coachId: string;
  fullName: string;
  id: string;
  phoneNumber?: string | null;
}

/** Runtime shape — token fields are intentionally never persisted. */
export interface ApiAuthSession extends AuthSession {
  accessToken: string;
  coach?: CoachProfileView;
  mustChangePassword?: boolean;
  role: AuthRole;
  student?: StudentSessionView;
  username?: string | null;
}

type PersistedApiAuthSession = Omit<ApiAuthSession, "accessToken" | "token">;

let inMemoryAccessToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

/** Access tokens live here only — never in localStorage/sessionStorage. */
export function setInMemoryAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}

/** Refresh tokens live here only — never in localStorage/sessionStorage. */
export function setInMemoryRefreshToken(token: string | null): void {
  inMemoryRefreshToken = token;
}

export function getInMemoryRefreshToken(): string | null {
  return inMemoryRefreshToken;
}

function isSessionMetadata(value: unknown): value is PersistedApiAuthSession {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as PersistedApiAuthSession).user?.email !== "string"
  ) {
    return false;
  }
  const role = (value as PersistedApiAuthSession).role;
  if (role === "coach") {
    return typeof (value as PersistedApiAuthSession).coach?.id === "string";
  }
  if (role === "student") {
    return typeof (value as PersistedApiAuthSession).student?.id === "string";
  }
  // Legacy coach sessions without role field.
  return typeof (value as PersistedApiAuthSession).coach?.id === "string";
}

export function isApiAuthSession(value: unknown): value is ApiAuthSession {
  return (
    isSessionMetadata(value) &&
    typeof (value as ApiAuthSession).accessToken === "string" &&
    typeof (value as ApiAuthSession).token === "string"
  );
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage) {
    return storage;
  }
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

/** Best-effort cleanup of the pre-hardening localStorage session (contained a refresh token). */
function clearLegacyLocalStorageSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(LEGACY_AUTH_SESSION_LOCALSTORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_AUTH_SESSION_SESSIONSTORAGE_KEY);
  } catch {
    // Ignore storage access errors (e.g. disabled storage).
  }
}

clearLegacyLocalStorageSession();

export function readAuthSession(storage?: Storage | null): ApiAuthSession | null {
  const store = resolveStorage(storage);
  if (!store) {
    return null;
  }
  const raw = store.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSessionMetadata(parsed)) {
      const accessToken = getInMemoryAccessToken();
      if (!accessToken) {
        return null;
      }
      const session = {
        ...parsed,
        accessToken,
        token: accessToken
      } as ApiAuthSession;
      if (!session.role && session.coach) {
        return { ...session, role: "coach" };
      }
      return session;
    }
  } catch {
    // ignore
  }
  store.removeItem(AUTH_SESSION_STORAGE_KEY);
  return null;
}

export function writeAuthSession(session: ApiAuthSession, storage?: Storage | null): void {
  setInMemoryAccessToken(session.accessToken);
  const store = resolveStorage(storage);
  const metadata = { ...session, accessToken: undefined, token: undefined };
  store?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(metadata));
}

export function clearAuthSession(storage?: Storage | null): void {
  const store = resolveStorage(storage);
  store?.removeItem(AUTH_SESSION_STORAGE_KEY);
  setInMemoryAccessToken(null);
  setInMemoryRefreshToken(null);
  clearLegacyLocalStorageSession();
}

function userFromPayload(payload: {
  created_at: string;
  email: string;
  full_name: string;
  id: string;
}): AuthUser {
  return {
    createdAt: payload.created_at,
    email: payload.email || "",
    fullName: payload.full_name,
    id: String(payload.id)
  };
}

export function buildSessionFromAuthPayload(payload: {
  coach?: {
    control_mode: string;
    default_session_minutes: number;
    display_name: string;
    id: string;
    style_notes: string;
  };
  must_change_password?: boolean;
  role?: string;
  setup_required?: boolean;
  student?: {
    coach_id: string;
    full_name: string;
    id: string;
    phone_number?: string | null;
  };
  tokens: { access: string; refresh: string };
  user: { created_at: string; email: string; full_name: string; id: string };
  username?: string | null;
}): { refreshToken: string; session: ApiAuthSession } {
  const user = userFromPayload(payload.user);
  if (payload.role === "student" || payload.student) {
    if (!payload.student) {
      throw new Error("Student session payload is incomplete.");
    }
    const mustChange = Boolean(payload.must_change_password ?? payload.setup_required);
    return {
      refreshToken: payload.tokens.refresh || "",
      session: {
        accessToken: payload.tokens.access,
        mustChangePassword: mustChange,
        role: "student",
        student: {
          coachId: String(payload.student.coach_id),
          fullName: payload.student.full_name,
          id: String(payload.student.id),
          phoneNumber: payload.student.phone_number
        },
        token: payload.tokens.access,
        user,
        username: payload.username ?? null
      }
    };
  }
  if (!payload.coach) {
    throw new Error("Coach session payload is incomplete.");
  }
  return {
    refreshToken: payload.tokens.refresh || "",
    session: {
      accessToken: payload.tokens.access,
      coach: {
        controlMode: payload.coach.control_mode,
        defaultSessionMinutes: payload.coach.default_session_minutes,
        displayName: payload.coach.display_name,
        id: payload.coach.id,
        styleNotes: payload.coach.style_notes
      },
      role: "coach",
      token: payload.tokens.access,
      user
    }
  };
}
