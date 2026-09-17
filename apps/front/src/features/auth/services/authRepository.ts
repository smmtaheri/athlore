import { appConfig } from "../../../app/config/appConfig";
import { createApiAuthRepository } from "../../../shared/api/authApi";
import type { AuthRole, StudentSessionView } from "../../../shared/api/session";

export const AUTH_STORAGE_KEY = "coach-assistant.auth.v1";

export interface AuthUser {
  createdAt: string;
  email: string;
  fullName: string;
  id: string;
}

export interface AuthSession {
  mustChangePassword?: boolean;
  role?: AuthRole;
  student?: StudentSessionView;
  token: string;
  user: AuthUser;
  username?: string | null;
}

export interface RegisterInput {
  email: string;
  fullName: string;
  password: string;
  phoneNumber: string;
}

export interface LoginInput {
  email?: string;
  password: string;
  username?: string;
}

export interface StudentCompleteSetupInput {
  password: string;
  passwordConfirm: string;
}

export interface StudentCompleteSetupResult {
  mustLoginAgain: boolean;
  setupComplete: boolean;
  username: string;
}

export interface AuthRepository {
  completeStudentSetup?(input: StudentCompleteSetupInput): Promise<StudentCompleteSetupResult>;
  getSession(): Promise<AuthSession | null>;
  login(input: LoginInput): Promise<AuthSession>;
  logout(): Promise<void>;
  register(input: RegisterInput): Promise<AuthSession>;
}

const sampleUser: AuthUser = {
  createdAt: "2026-07-31T00:00:00.000Z",
  email: "arman@example.com",
  fullName: "آرمان واعظی",
  id: "arman-vaezi"
};

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

function isSession(value: unknown): value is AuthSession {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as AuthSession).token === "string" &&
    typeof (value as AuthSession).user?.email === "string"
  );
}

/** LocalStorage mock repository — used by unit tests and VITE_USE_MOCK_API. */
export function createAuthRepository(storage = getStorage()): AuthRepository {
  const read = (): AuthSession | null => {
    if (!storage) {
      return null;
    }

    const raw = storage.getItem(AUTH_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isSession(parsed)) {
        return parsed;
      }
    } catch {
      // Invalid auth data should not block the app.
    }

    storage.removeItem(AUTH_STORAGE_KEY);
    return null;
  };

  const write = (session: AuthSession) => {
    storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  };

  return {
    async completeStudentSetup(input) {
      if (input.password.length < 8 || input.password !== input.passwordConfirm) {
        throw new Error("Invalid setup input.");
      }
      const current = read();
      const username = current?.username || "student";
      storage?.removeItem(AUTH_STORAGE_KEY);
      return {
        mustLoginAgain: true,
        setupComplete: true,
        username
      };
    },
    async getSession() {
      return read();
    },
    async login(input) {
      if ((!input.email?.trim() && !input.username?.trim()) || !input.password) {
        throw new Error("Credentials are required.");
      }

      if (input.username?.trim()) {
        const session: AuthSession = {
          mustChangePassword: false,
          role: "student",
          student: {
            coachId: "coach-1",
            fullName: "شاگرد آزمایشی",
            id: "student-mock-1",
            phoneNumber: "+989121111111"
          },
          token: "mock-student-token",
          user: {
            createdAt: new Date().toISOString(),
            email: "",
            fullName: "شاگرد آزمایشی",
            id: input.username.trim()
          },
          username: input.username.trim()
        };
        // Mock: password "must-change" forces setup state for UI tests.
        if (input.password === "must-change") {
          session.mustChangePassword = true;
        }
        write(session);
        return session;
      }

      const user =
        input.email!.trim().toLowerCase() === sampleUser.email
          ? sampleUser
          : {
              ...sampleUser,
              email: input.email!.trim().toLowerCase(),
              fullName: "مربی"
            };
      const session = createSession(user);
      write(session);
      return session;
    },
    async logout() {
      storage?.removeItem(AUTH_STORAGE_KEY);
    },
    async register(input) {
      if (!input.email.trim() || !input.fullName.trim() || input.password.length < 6) {
        throw new Error("Invalid register input.");
      }

      const session = createSession({
        createdAt: new Date().toISOString(),
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName.trim(),
        id: createUserId(input.fullName)
      });
      write(session);
      return session;
    }
  };
}

function createSession(user: AuthUser): AuthSession {
  return {
    role: "coach",
    token: `mock-token-${user.id}`,
    user
  };
}

function createUserId(fullName: string) {
  return (
    fullName
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "coach"
  );
}

export const authRepository = appConfig.useMockRepositories
  ? createAuthRepository()
  : createApiAuthRepository();
