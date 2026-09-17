/** Canonical host and route configuration for the three Athlore surfaces. */

export type AppSurface = "coach" | "invalid" | "public" | "student";

export const publicPaths = {
  home: "/"
} as const;

export const coachPaths = {
  dashboard: "/dashboard",
  login: "/login",
  register: "/register"
} as const;

export const studentPaths = {
  bodyCheck: "/body-check",
  dashboard: "/dashboard",
  login: "/login",
  visits: "/visits"
} as const;

interface LocationLike {
  hostname?: string;
  origin?: string;
  protocol?: string;
}

const DEFAULT_DOMAINS = {
  coach: "coach.athlore.ir",
  public: "athlore.ir",
  student: "student.athlore.ir"
} as const;

function normalizeDomain(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return normalized || fallback;
}

export const appDomains = {
  coach: normalizeDomain(import.meta.env.VITE_COACH_DOMAIN, DEFAULT_DOMAINS.coach),
  public: normalizeDomain(import.meta.env.VITE_PUBLIC_DOMAIN, DEFAULT_DOMAINS.public),
  student: normalizeDomain(import.meta.env.VITE_STUDENT_DOMAIN, DEFAULT_DOMAINS.student)
} as const;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Resolve the surface from the browser host. Production has no host fallback. */
export function resolveAppSurface(
  locationLike: LocationLike | null | undefined = typeof window !== "undefined"
    ? window.location
    : null
): AppSurface {
  const hostname = locationLike?.hostname?.trim().toLowerCase() || "";
  if (hostname === appDomains.public) return "public";
  if (hostname === appDomains.coach) return "coach";
  if (hostname === appDomains.student) return "student";

  if (import.meta.env.DEV && isLocalHost(hostname)) {
    const configured = import.meta.env.VITE_DEV_APP_SURFACE?.trim().toLowerCase();
    if (configured === "public" || configured === "coach" || configured === "student") {
      return configured;
    }
    return "coach";
  }

  return "invalid";
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function protocolFor(locationLike: LocationLike | null | undefined): string {
  if (locationLike?.protocol === "http:" && import.meta.env.DEV) return "http";
  return "https";
}

/** Build an absolute URL on a specific Athlore surface. */
export function absoluteSurfaceUrl(
  surface: Exclude<AppSurface, "invalid">,
  path: string,
  locationLike: LocationLike | null | undefined = typeof window !== "undefined"
    ? window.location
    : null
): string {
  const domain = appDomains[surface];
  return `${protocolFor(locationLike)}://${domain}${normalizePath(path)}`;
}

export function publicAbsoluteUrl(
  path: string,
  locationLike: LocationLike | null | undefined = typeof window !== "undefined"
    ? window.location
    : null
): string {
  return absoluteSurfaceUrl("public", path, locationLike);
}

export function studentLoginUrl(
  locationLike: LocationLike | null | undefined = typeof window !== "undefined"
    ? window.location
    : null
): string {
  return absoluteSurfaceUrl("student", studentPaths.login, locationLike);
}
