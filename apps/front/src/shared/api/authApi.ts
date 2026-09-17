import { apiLogoutRemote, apiRequest } from "./client";
import {
  buildSessionFromAuthPayload,
  clearAuthSession,
  readAuthSession,
  setInMemoryRefreshToken,
  writeAuthSession,
  type CoachProfileView
} from "./session";
import type {
  AuthRepository,
  AuthSession,
  LoginInput,
  RegisterInput,
  StudentCompleteSetupInput,
  StudentCompleteSetupResult
} from "../../features/auth/services/authRepository";

type AuthPayload = {
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
};

export interface ApiAuthRepository extends AuthRepository {
  bootstrapFromMe(): Promise<AuthSession | null>;
  completeStudentSetup(input: StudentCompleteSetupInput): Promise<StudentCompleteSetupResult>;
  getCoach(): Promise<CoachProfileView | null>;
  updateCoach(
    patch: Partial<{
      controlMode: string;
      defaultSessionMinutes: number;
      displayName: string;
      styleNotes: string;
    }>
  ): Promise<CoachProfileView>;
}

function persistPayload(payload: AuthPayload): AuthSession {
  const { refreshToken, session } = buildSessionFromAuthPayload(payload);
  setInMemoryRefreshToken(refreshToken || null);
  writeAuthSession(session);
  return session;
}

export function createApiAuthRepository(): ApiAuthRepository {
  return {
    async getSession() {
      const stored = readAuthSession();
      if (!stored) {
        return null;
      }
      try {
        const me = await apiRequest<{
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
          user: { created_at: string; email: string; full_name: string; id: string };
          username?: string | null;
        }>("/me/");
        if (me.role === "student" || me.student) {
          if (!me.student) {
            clearAuthSession();
            return null;
          }
          const next = {
            ...stored,
            mustChangePassword: Boolean(me.must_change_password ?? me.setup_required),
            role: "student" as const,
            student: {
              coachId: String(me.student.coach_id),
              fullName: me.student.full_name,
              id: String(me.student.id),
              phoneNumber: me.student.phone_number
            },
            user: {
              createdAt: me.user.created_at,
              email: me.user.email || "",
              fullName: me.user.full_name,
              id: String(me.user.id)
            },
            username: me.username ?? null
          };
          writeAuthSession(next);
          return next;
        }
        if (!me.coach) {
          clearAuthSession();
          return null;
        }
        const next = {
          ...stored,
          coach: {
            controlMode: me.coach.control_mode,
            defaultSessionMinutes: me.coach.default_session_minutes,
            displayName: me.coach.display_name,
            id: me.coach.id,
            styleNotes: me.coach.style_notes
          },
          role: "coach" as const,
          user: {
            createdAt: me.user.created_at,
            email: me.user.email,
            fullName: me.user.full_name,
            id: String(me.user.id)
          }
        };
        writeAuthSession(next);
        return next;
      } catch {
        return stored;
      }
    },
    async bootstrapFromMe() {
      return this.getSession();
    },
    async login(input: LoginInput) {
      if (input.username?.trim()) {
        const payload = await apiRequest<AuthPayload>("/student/login/", {
          method: "POST",
          auth: false,
          skipRefresh: true,
          body: { username: input.username.trim(), password: input.password }
        });
        return persistPayload(payload);
      }
      const payload = await apiRequest<AuthPayload>("/auth/login/", {
        method: "POST",
        auth: false,
        skipRefresh: true,
        body: { email: input.email?.trim(), password: input.password }
      });
      return persistPayload(payload);
    },
    async completeStudentSetup(input: StudentCompleteSetupInput) {
      const payload = await apiRequest<{
        message?: string;
        must_login_again?: boolean;
        setup_complete?: boolean;
        username?: string | null;
      }>("/student/complete-setup/", {
        method: "POST",
        body: {
          password: input.password,
          password_confirm: input.passwordConfirm
        }
      });
      clearAuthSession();
      setInMemoryRefreshToken(null);
      const result: StudentCompleteSetupResult = {
        mustLoginAgain: Boolean(payload.must_login_again ?? true),
        setupComplete: Boolean(payload.setup_complete ?? true),
        username: payload.username?.trim() || ""
      };
      return result;
    },
    async register(input: RegisterInput) {
      const payload = await apiRequest<AuthPayload>("/auth/register/", {
        method: "POST",
        auth: false,
        skipRefresh: true,
        body: {
          email: input.email.trim(),
          full_name: input.fullName.trim(),
          password: input.password,
          phone_number: input.phoneNumber.trim()
        }
      });
      return persistPayload(payload);
    },
    async logout() {
      await apiLogoutRemote();
    },
    async getCoach() {
      return readAuthSession()?.coach ?? null;
    },
    async updateCoach(patch) {
      const body: Record<string, unknown> = {};
      if (patch.displayName !== undefined) body.display_name = patch.displayName;
      if (patch.styleNotes !== undefined) body.style_notes = patch.styleNotes;
      if (patch.controlMode !== undefined) body.control_mode = patch.controlMode;
      if (patch.defaultSessionMinutes !== undefined) {
        body.default_session_minutes = patch.defaultSessionMinutes;
      }
      const coach = await apiRequest<{
        control_mode: string;
        default_session_minutes: number;
        display_name: string;
        id: string;
        style_notes: string;
      }>("/me/coach/", { method: "PATCH", body });
      const session = readAuthSession();
      const view: CoachProfileView = {
        controlMode: coach.control_mode,
        defaultSessionMinutes: coach.default_session_minutes,
        displayName: coach.display_name,
        id: coach.id,
        styleNotes: coach.style_notes
      };
      if (session) {
        writeAuthSession({
          ...session,
          coach: view,
          role: "coach",
          user: { ...session.user, fullName: view.displayName }
        });
      }
      return view;
    }
  };
}

export function clearLocalAuthOnly() {
  clearAuthSession();
}
