import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { __resetApiClientStateForTests, apiRequest } from "./client";
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
});
