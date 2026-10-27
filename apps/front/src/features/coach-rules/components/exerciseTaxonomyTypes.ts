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
  movement_patterns?: Array<{ key: string; name: string }>;
  joints?: Array<{ key: string; name: string }>;
  mechanics?: Array<{ key: string; name: string }>;
  prescription_units?: Array<{ key: string; name: string }>;
  equipment: Array<{ key: string; name: string; name_en?: string; is_active?: boolean }>;
  levels: Array<{ key: string; name: string }>;
  muscles: TaxonomyMuscle[];
};
