import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiAuthRepository } from "./authApi";
import { clearAuthSession, setInMemoryRefreshToken } from "./session";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  };
}

describe("API auth bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setInMemoryRefreshToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearAuthSession();
    vi.restoreAllMocks();
  });

  it("restores a new tab from the HttpOnly refresh cookie", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth/refresh/")) {
        return jsonResponse({ access: "access-from-cookie" });
      }
      expect(String(url)).toContain("/me/");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer access-from-cookie"
      );
      return jsonResponse({
        coach: {
          control_mode: "balanced",
          default_session_minutes: 60,
          display_name: "Coach",
          id: "coach-1",
          style_notes: ""
        },
        role: "coach",
        user: {
          created_at: "2026-08-06T00:00:00Z",
          email: "coach@example.com",
          full_name: "Coach",
          id: "user-1"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await createApiAuthRepository().getSession();

    expect(session).toMatchObject({
      role: "coach",
      token: "access-from-cookie",
      user: { email: "coach@example.com" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem("coach-assistant.auth.session.v3")).toContain(
      "access-from-cookie"
    );
  });

  it("stays anonymous when the refresh cookie is expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "token_expired", message: "expired", details: {} } },
          401
        )
      )
    );

    expect(await createApiAuthRepository().getSession()).toBeNull();
    expect(window.sessionStorage.getItem("coach-assistant.auth.session.v3")).toBeNull();
  });
});
