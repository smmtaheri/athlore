import { appConfig } from "../../../app/config/appConfig";
import { createApiCoachRulesRepository } from "../../../shared/api/repositories";
import { coachRulesFixture } from "../fixtures/coachRules";
import type { CoachRules } from "../types/coachRules";

export const COACH_RULES_STORAGE_KEY = "coach-assistant.coach-rules.v1";

export interface CoachRulesRepository {
  get(): Promise<CoachRules>;
  reset(): Promise<CoachRules>;
  save(rules: CoachRules): Promise<CoachRules>;
}

function getStorage(storage?: Storage): Storage | undefined {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

export function cloneCoachRules(rules: CoachRules): CoachRules {
  return JSON.parse(JSON.stringify(rules)) as CoachRules;
}

function isCoachRules(value: unknown): value is CoachRules {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as CoachRules).templates) &&
    Array.isArray((value as CoachRules).levels) &&
    Array.isArray((value as CoachRules).injuries)
  );
}

export function createCoachRulesRepository(storage = getStorage()): CoachRulesRepository {
  const read = (): CoachRules => {
    if (!storage) {
      return cloneCoachRules(coachRulesFixture);
    }

    const raw = storage.getItem(COACH_RULES_STORAGE_KEY);

    if (!raw) {
      const fixture = cloneCoachRules(coachRulesFixture);
      storage.setItem(COACH_RULES_STORAGE_KEY, JSON.stringify(fixture));
      return fixture;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (isCoachRules(parsed)) {
        return cloneCoachRules(parsed);
      }
    } catch {
      // Invalid local data should fall back to fixture.
    }

    const fallback = cloneCoachRules(coachRulesFixture);
    storage.setItem(COACH_RULES_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  };

  const write = (rules: CoachRules) => {
    if (storage) {
      storage.setItem(COACH_RULES_STORAGE_KEY, JSON.stringify(rules));
    }
  };

  return {
    async get() {
      return read();
    },
    async reset() {
      const fixture = cloneCoachRules(coachRulesFixture);
      write(fixture);
      return fixture;
    },
    async save(rules) {
      const nextRules: CoachRules = {
        ...cloneCoachRules(rules),
        updatedAt: new Date().toISOString()
      };
      write(nextRules);
      return nextRules;
    }
  };
}

export const coachRulesRepository = appConfig.useMockRepositories
  ? createCoachRulesRepository()
  : createApiCoachRulesRepository();
