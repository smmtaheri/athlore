import { apiRequest } from "../../../shared/api/client";
import {
  nutritionTemplateFromApi,
  supplementTemplateFromApi
} from "../../../shared/adapters/apiAdapters";
import type { NutritionTemplateSummary, SupplementTemplateSummary } from "../types/coachRules";

/**
 * Client for the coach-owned review workflow on nutrition/supplement
 * templates. As of this change the Backend only exposes bulk import and the
 * read-only `/coach-rules/` aggregate — these PATCH endpoints are FE stubs
 * for the paths a Backend agent is expected to add:
 *   PATCH /api/v1/me/nutrition-templates/{id}/
 *   PATCH /api/v1/me/supplement-templates/{id}/
 * Until they exist, calls will fail with a 404 `not_found` ApiError, which
 * the UI surfaces as a normal Persian error message.
 */
export interface NutritionSupplementTemplatesRepository {
  approveNutritionTemplate(id: string): Promise<NutritionTemplateSummary>;
  approveSupplementTemplate(id: string): Promise<SupplementTemplateSummary>;
}

const REVIEW_APPROVAL_PATCH_BODY = {
  is_eligible_for_auto_select: true,
  needs_coach_review: false,
  status: "active"
};

export function createNutritionSupplementTemplatesRepository(): NutritionSupplementTemplatesRepository {
  return {
    async approveNutritionTemplate(id) {
      const dto = await apiRequest<Record<string, unknown>>(`/me/nutrition-templates/${id}/`, {
        body: REVIEW_APPROVAL_PATCH_BODY,
        method: "PATCH"
      });
      return nutritionTemplateFromApi(dto);
    },
    async approveSupplementTemplate(id) {
      const dto = await apiRequest<Record<string, unknown>>(`/me/supplement-templates/${id}/`, {
        body: REVIEW_APPROVAL_PATCH_BODY,
        method: "PATCH"
      });
      return supplementTemplateFromApi(dto);
    }
  };
}

export const nutritionSupplementTemplatesRepository =
  createNutritionSupplementTemplatesRepository();
