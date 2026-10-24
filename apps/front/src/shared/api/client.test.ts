import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, persianMessageForApiError } from "./errors";
import { __resetApiClientStateForTests, apiRequest, apiUploadFormData } from "./client";
import {
  AUTH_SESSION_STORAGE_KEY,
  clearAuthSession,
  setInMemoryRefreshToken,
  writeAuthSession,
  type ApiAuthSession
} from "./session";

const sampleSession: ApiAuthSession = {
  accessToken: "access-1",
  coach: {
    controlMode: "balanced",
    defaultSessionMinutes: 60,
    displayName: "Coach",
    id: "coach-1",
    styleNotes: ""
  },
  role: "coach",
  token: "access-1",
  user: {
    createdAt: "2026-08-06T00:00:00Z",
    email: "a@example.com",
    fullName: "Coach",
    id: "1"
  }
};

describe("apiRequest", () => {
  beforeEach(() => {
    __resetApiClientStateForTests();
    window.localStorage.clear();
    window.sessionStorage.clear();
    writeAuthSession(sampleSession);
    setInMemoryRefreshToken("refresh-1");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearAuthSession();
    __resetApiClientStateForTests();
  });

  it("never persists the refresh token to localStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true })
      })
    );

    await apiRequest("/me/");

    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    const stored = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain("access-1");
    expect(stored).not.toContain("refresh-1");
    expect(stored).not.toContain("accessToken");
    expect(stored).not.toContain("refreshToken");
  });

  it("sends credentials: 'include' so an HttpOnly refresh cookie can be attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/me/");

    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("attaches bearer token and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiRequest<{ ok: boolean }>("/me/");
    expect(data.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer access-1");
  });

  it("parses backend error envelope and field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "validation_error",
            message: "bad",
            details: { email: ["required"] }
          }
        })
      })
    );

    await expect(apiRequest("/students/", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "validation_error",
      fieldErrors: { email: ["required"] }
    });
  });

  it("explains HTML permission-denied responses from the edge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => {
          throw new SyntaxError("HTML error page");
        }
      })
    );

    const error = await apiRequest("/me/visits/visit-1/", { method: "PATCH", body: {} }).catch(
      (error) => error
    );
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error("Expected an API error");
    expect(error).toMatchObject({
      code: "permission_denied",
      message: "",
      status: 403
    });
    expect(persianMessageForApiError(error)).toContain("اجازه انجام این عملیات داده نشد");
  });

  it("shares one refresh for concurrent 401s and retries once", async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth/refresh/")) {
        refreshCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ access: "access-2", refresh: "refresh-2" })
        };
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth === "Bearer access-1") {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: "authentication_required", message: "expired", details: {} }
          })
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: auth })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      apiRequest<{ value: string }>("/students/"),
      apiRequest<{ value: string }>("/programs/")
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.value).toContain("access-2");
    expect(b.value).toContain("access-2");
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toContain("access-2");
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("clears session when refresh fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh/")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: "token_expired", message: "gone", details: {} }
          })
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: "authentication_required", message: "expired", details: {} }
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/me/")).rejects.toBeInstanceOf(ApiError);
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("maps network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/me/")).rejects.toMatchObject({ code: "network_error" });
  });

  it("reports multipart upload progress and refreshes expired authentication before retrying", async () => {
    const sent: Array<{ headers: Record<string, string>; body: FormData; credentials: boolean }> =
      [];
    class FakeUpload {
      headers: Record<string, string> = {};
      withCredentials = false;
      status = 0;
      responseText = "";
      upload: {
        onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
      } = {};
      onload?: () => void;
      onerror?: () => void;
      onabort?: () => void;
      open = vi.fn();
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      getResponseHeader() {
        return "application/json";
      }
      abort() {
        this.onabort?.();
      }
      send(body: FormData) {
        sent.push({ headers: this.headers, body, credentials: this.withCredentials });
        this.status = sent.length === 1 ? 401 : 202;
        this.responseText = JSON.stringify(
          this.status === 401 ? { detail: "expired" } : { queued: true }
        );
        queueMicrotask(() => {
          this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
          this.onload?.();
        });
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeUpload);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access: "access-2" }) })
    );
    try {
      const body = new FormData();
      body.append("file", new File(["video"], "demo.mp4"));
      const onUploadProgress = vi.fn();
      await expect(
        apiUploadFormData("/exercises/exercise-1/media/", body, { onUploadProgress })
      ).resolves.toEqual({ queued: true });
      expect(sent).toHaveLength(2);
      expect(sent[0].headers.Authorization).toBe("Bearer access-1");
      expect(sent[1].headers.Authorization).toBe("Bearer access-2");
      expect(sent[0].headers["Content-Type"]).toBeUndefined();
      expect(sent[1].body).toBe(body);
      expect(sent.every((item) => item.credentials)).toBe(true);
      expect(onUploadProgress).toHaveBeenCalledWith(50);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
