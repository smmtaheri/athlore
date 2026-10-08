import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../features/auth/context/AuthContext";
import { apiRequest } from "../api/client";
import { ApiError, persianMessageForApiError } from "../api/errors";
import { appConfig } from "../../app/config/appConfig";
import { type Calendar, getCalendar, setCalendar, subscribeCalendar } from "./calendar";

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const calendar = useSyncExternalStore(subscribeCalendar, getCalendar);
  const identity = session ? `${session.role}:${session.user.id}` : "anonymous";
  const authenticated = Boolean(session);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const data =
          authenticated && !appConfig.useMockRepositories
            ? await apiRequest<{ calendar: Calendar }>("/me/date-settings/")
            : await Promise.resolve({ calendar: "persian" as Calendar });
        if (!active) return;
        if (data.calendar !== "persian" && data.calendar !== "gregory")
          throw new Error("تنظیم تقویم معتبر نیست.");
        setCalendar(data.calendar);
        setLoaded(identity);
        setError("");
      } catch (cause: unknown) {
        if (active)
          setError(
            cause instanceof ApiError
              ? persianMessageForApiError(cause)
              : "دریافت تنظیم تقویم ناموفق بود."
          );
      } finally {
        pending = false;
      }
    }
    void load();
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [identity, attempt, authenticated]);
  if (session && !appConfig.useMockRepositories && loaded !== identity) {
    return (
      <div role="status" style={{ padding: "2rem" }}>
        {error || "در حال دریافت تنظیمات تاریخ…"}
        {error ? (
          <button onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button>
        ) : null}
      </div>
    );
  }
  // Switching calendars remounts forms so unsaved date values cannot change meaning.
  return (
    <div key={`${status}:${identity}:${calendar}`}>
      {error && loaded === identity ? (
        <div role="alert">
          {error} <button onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
