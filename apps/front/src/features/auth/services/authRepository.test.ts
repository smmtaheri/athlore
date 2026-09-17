import { describe, expect, it } from "vitest";
import { AUTH_STORAGE_KEY, createAuthRepository } from "./authRepository";

describe("authRepository", () => {
  it("logs in sample coach and persists session", async () => {
    const storage = window.localStorage;
    storage.clear();
    const repository = createAuthRepository(storage);

    const session = await repository.login({
      email: "arman@example.com",
      password: "123456"
    });

    expect(session.user.fullName).toBe("آرمان واعظی");
    expect(await repository.getSession()).toEqual(session);
  });

  it("recovers safely from corrupted localStorage", async () => {
    const storage = window.localStorage;
    storage.setItem(AUTH_STORAGE_KEY, "{broken");
    const repository = createAuthRepository(storage);

    expect(await repository.getSession()).toBeNull();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
