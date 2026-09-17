import { appConfig } from "../../app/config/appConfig";
import { ApiError } from "./errors";
import {
  clearAuthSession,
  getInMemoryRefreshToken,
  readAuthSession,
  setInMemoryRefreshToken,
  writeAuthSession,
  type ApiAuthSession
} from "./session";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  auth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skip refresh+retry (used by refresh itself). */
  skipRefresh?: boolean;
}

type SessionListener = (session: ApiAuthSession | null) => void;

let refreshPromise: Promise<boolean> | null = null;
const sessionListeners = new Set<SessionListener>();

export function subscribeAuthSession(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSession(session: ApiAuthSession | null) {
  for (const listener of sessionListeners) {
    listener(session);
  }
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const base = appConfig.apiBaseUrl.replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const joined = `${base}${normalized}`;
  // Relative bases (e.g. `/api/v1` from the Compose/Nginx image) need an
  // origin — `new URL('/api/v1/...')` alone throws in the browser.
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://127.0.0.1";
  const url =
    joined.startsWith("http://") || joined.startsWith("https://")
      ? new URL(joined)
      : new URL(joined.startsWith("/") ? joined : `/${joined}`, origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError({
      code: response.status >= 500 ? "server_error" : "malformed_response",
      message: "پاسخ خطا قابل خواندن نبود.",
      status: response.status
    });
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "object" &&
    (payload as { error: { code?: string; message?: string; details?: Record<string, unknown> } })
      .error
  ) {
    const err = (
      payload as { error: { code: string; message: string; details?: Record<string, unknown> } }
    ).error;
    return new ApiError({
      code: err.code || "server_error",
      message: err.message || "خطا",
      status: response.status,
      details: err.details || {}
    });
  }

  return new ApiError({
    code: "malformed_response",
    message: "ساختار خطای سرور نامعتبر است.",
    status: response.status
  });
}

/**
 * Refreshes the access token. Production Backend must set an HttpOnly
 * refresh cookie on `/auth/login/`, `/auth/refresh/` (and clear it on
 * `/auth/logout/`) for this to keep working across page reloads — the FE
 * always sends `credentials: 'include'` so that cookie is attached
 * automatically once the Backend sets it. Until then, this falls back to
 * the in-memory refresh token (see `session.ts`), which is lost on reload —
 * refresh then fails and the user is asked to log in again.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const session = readAuthSession();
    const refreshToken = getInMemoryRefreshToken();
    if (!session) {
      clearAuthSession();
      emitSession(null);
      return false;
    }

    try {
      const response = await fetch(buildUrl("/auth/refresh/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(refreshToken ? { refresh: refreshToken } : {}),
        credentials: "include"
      });

      if (!response.ok) {
        clearAuthSession();
        emitSession(null);
        return false;
      }

      const data = (await response.json()) as { access: string; refresh?: string };
      if (!data.access) {
        clearAuthSession();
        emitSession(null);
        return false;
      }

      // Rotated refresh (if the Backend still returns one in the body) stays in memory only.
      setInMemoryRefreshToken(data.refresh || refreshToken);
      const next: ApiAuthSession = {
        ...session,
        accessToken: data.access,
        token: data.access
      };
      writeAuthSession(next);
      emitSession(next);
      return true;
    } catch {
      clearAuthSession();
      emitSession(null);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const useAuth = options.auth !== false;
  if (useAuth) {
    const session = readAuthSession();
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      // Required so the Backend's HttpOnly refresh cookie (once set) is sent/received.
      credentials: "include"
    });
  } catch {
    throw new ApiError({
      code: "network_error",
      message: "Network unavailable",
      status: 0
    });
  }

  if (
    response.status === 401 &&
    useAuth &&
    !options.skipRefresh &&
    path !== "/auth/refresh/" &&
    path !== "/auth/login/" &&
    path !== "/auth/register/"
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipRefresh: true });
    }
    throw new ApiError({
      code: "token_expired",
      message: "Session expired",
      status: 401
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({
      code: "malformed_response",
      message: "Invalid JSON response",
      status: response.status
    });
  }
}

export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf8[1].trim();
    }
  }
  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header);
  return plain?.[2]?.trim() || null;
}

export interface ApiDownloadResult {
  blob: Blob;
  filename: string | null;
  contentType: string | null;
}

export async function apiDownload(
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiDownloadResult> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/pdf, application/octet-stream, */*",
    ...options.headers
  };
  const useAuth = options.auth !== false;
  if (useAuth) {
    const session = readAuthSession();
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      signal: options.signal,
      credentials: "include"
    });
  } catch {
    throw new ApiError({
      code: "network_error",
      message: "Network unavailable",
      status: 0
    });
  }

  if (response.status === 401 && useAuth && !options.skipRefresh && path !== "/auth/refresh/") {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiDownload(path, { ...options, skipRefresh: true });
    }
    throw new ApiError({
      code: "token_expired",
      message: "Session expired",
      status: 401
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const blob = await response.blob();
  return {
    blob,
    filename: parseContentDispositionFilename(response.headers.get("Content-Disposition")),
    contentType: response.headers.get("Content-Type")
  };
}

/** Multipart upload (Body Check photos, etc.). Do not set JSON Content-Type. */
export async function apiUploadFormData<T>(
  path: string,
  formData: FormData,
  options: Omit<ApiRequestOptions, "body"> = {}
): Promise<T> {
  const method = options.method ?? "POST";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers
  };
  const useAuth = options.auth !== false;
  if (useAuth) {
    const session = readAuthSession();
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: formData,
      signal: options.signal,
      credentials: "include"
    });
  } catch {
    throw new ApiError({
      code: "network_error",
      message: "Network unavailable",
      status: 0
    });
  }

  if (response.status === 401 && useAuth && !options.skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiUploadFormData<T>(path, formData, { ...options, skipRefresh: true });
    }
    throw new ApiError({
      code: "token_expired",
      message: "Session expired",
      status: 401
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function apiLogoutRemote(): Promise<void> {
  const refreshToken = getInMemoryRefreshToken();
  try {
    await apiRequest("/auth/logout/", {
      method: "POST",
      body: refreshToken ? { refresh: refreshToken } : {},
      skipRefresh: true
    });
  } catch {
    // Local cleanup still required when network is unavailable.
  }
  clearAuthSession();
  emitSession(null);
}

/** Test helper — expose refresh single-flight for unit tests. */
export function __resetApiClientStateForTests() {
  refreshPromise = null;
}
