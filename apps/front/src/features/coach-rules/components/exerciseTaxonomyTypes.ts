export type TaxonomyRegion = {
  id: string;
  key: string;
  name: string;
  name_en: string;
  is_active: boolean;
  sort_order: number;
};

export type TaxonomyMuscle = {
  id: string;
  key: string;
  name: string;
  name_en: string;
  is_active: boolean;
  sort_order: number;
  regions: TaxonomyRegion[];
};

export type ExerciseTaxonomy = {
  equipment: Array<{ key: string; name: string; name_en?: string; is_active?: boolean }>;
  levels: Array<{ key: string; name: string }>;
  muscles: TaxonomyMuscle[];
};
