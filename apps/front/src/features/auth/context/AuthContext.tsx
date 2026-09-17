import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  authRepository,
  type AuthRepository,
  type AuthSession,
  type LoginInput,
  type RegisterInput,
  type StudentCompleteSetupInput,
  type StudentCompleteSetupResult
} from "../services/authRepository";
import { subscribeAuthSession } from "../../../shared/api/client";
import { appConfig } from "../../../app/config/appConfig";

interface AuthContextValue {
  completeStudentSetup: (input: StudentCompleteSetupInput) => Promise<StudentCompleteSetupResult>;
  login: (input: LoginInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  session: AuthSession | null;
  status: "loading" | "authenticated" | "anonymous";
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  repository = authRepository
}: {
  children: ReactNode;
  repository?: AuthRepository;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    let isMounted = true;
    repository.getSession().then((storedSession) => {
      if (!isMounted) {
        return;
      }
      setSession(storedSession);
      setStatus(storedSession ? "authenticated" : "anonymous");
    });

    return () => {
      isMounted = false;
    };
  }, [repository]);

  useEffect(() => {
    if (appConfig.useMockRepositories) {
      return;
    }
    return subscribeAuthSession((next) => {
      setSession(next);
      setStatus(next ? "authenticated" : "anonymous");
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      async completeStudentSetup(input) {
        if (!repository.completeStudentSetup) {
          throw new Error("Student setup is not available.");
        }
        const result = await repository.completeStudentSetup(input);
        setSession(null);
        setStatus("anonymous");
        return result;
      },
      async login(input) {
        const nextSession = await repository.login(input);
        setSession(nextSession);
        setStatus("authenticated");
        return nextSession;
      },
      async logout() {
        await repository.logout();
        setSession(null);
        setStatus("anonymous");
      },
      async register(input) {
        const nextSession = await repository.register(input);
        setSession(nextSession);
        setStatus("authenticated");
      },
      session,
      status
    }),
    [repository, session, status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    return {
      async completeStudentSetup() {
        return { mustLoginAgain: true, setupComplete: true, username: "" };
      },
      async login() {
        return {
          mustChangePassword: false,
          role: "student" as const,
          token: "",
          user: { createdAt: "", email: "", fullName: "", id: "" },
          username: null
        };
      },
      async logout() {
        return undefined;
      },
      async register() {
        return undefined;
      },
      session: null,
      status: "anonymous" as const
    };
  }

  return value;
}
