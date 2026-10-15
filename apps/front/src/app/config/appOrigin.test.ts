import { describe, expect, it } from "vitest";
import {
  absoluteSurfaceUrl,
  appDomains,
  coachPaths,
  publicAbsoluteUrl,
  publicPaths,
  resolveAppSurface,
  studentLoginUrl,
  studentPaths
} from "./appOrigin";

describe("appOrigin", () => {
  it("maps the three canonical hostnames to isolated surfaces", () => {
    expect(resolveAppSurface({ hostname: appDomains.public })).toBe("public");
    expect(resolveAppSurface({ hostname: appDomains.coach })).toBe("coach");
    expect(resolveAppSurface({ hostname: appDomains.student })).toBe("student");
  });

  it("does not recognize an unconfigured production hostname", () => {
    expect(resolveAppSurface({ hostname: "46.249.103.94" })).toBe("invalid");
  });

  it("keeps the student surface when its hostname is also used for public share links", () => {
    const stageDomains = {
      ...appDomains,
      public: "stage.student.athlore.ir",
      coach: "stage.coach.athlore.ir",
      student: "stage.student.athlore.ir"
    };

    expect(
      resolveAppSurface({ hostname: "stage.student.athlore.ir" }, stageDomains)
    ).toBe("student");
  });

  it("builds absolute URLs on the requested surface", () => {
    expect(absoluteSurfaceUrl("coach", coachPaths.login, { protocol: "https:" })).toBe(
      "https://coach.athlore.ir/login"
    );
    expect(studentLoginUrl({ protocol: "https:" })).toBe("https://student.athlore.ir/login");
    expect(publicAbsoluteUrl("/api/v1/shared/pdf/demo", { protocol: "https:" })).toBe(
      "https://athlore.ir/api/v1/shared/pdf/demo"
    );
  });

  it("exposes only final surface paths", () => {
    expect(publicPaths.home).toBe("/");
    expect(coachPaths.login).toBe("/login");
    expect(studentPaths.login).toBe("/login");
    expect(studentPaths.dashboard).toBe("/dashboard");
    expect(studentPaths.visits).toBe("/visits");
    expect(studentPaths.bodyCheck).toBe("/body-check");
  });
});
