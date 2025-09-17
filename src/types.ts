export type Filters = {
  subjects: Record<string, string>;
  educational_contexts: Record<string, string>;
  media_types: Record<string, string>;
  licenses: Record<string, string>;
};

export interface SearchContentParams {
  q?: string;
  subject?: string; // deutsches Label
  educational_context?: string; // deutsches Label
  media_type?: string; // deutsches Label
  source?: string; // freier Text (Publisher)
  page?: number; // default 1
  per_page?: number; // default 20
  content_type?: 'FILES' | 'FOLDERS'; // default FILES
}

export interface WLOCriterion {
  property: string;
  values: string[];
}

export interface WLOSearchResponseNode {
  ref?: { id?: string };
  properties: Record<string, string[] | undefined>;
  type?: string;
  isDirectory?: boolean;
}

export interface WLOSearchResponse {
  nodes: WLOSearchResponseNode[];
}

export interface SearchContentResolvedFilter {
  label: string;
  property: string;
  value: string;
}

export interface SearchContentResolvedFilters {
  subject?: SearchContentResolvedFilter;
  educational_context?: SearchContentResolvedFilter;
  media_type?: SearchContentResolvedFilter;
  source?: SearchContentResolvedFilter;
}

export interface SearchContentResult extends WLOSearchResponse {
  page: number;
  per_page: number;
  criteria: WLOCriterion[];
  resolved_filters: SearchContentResolvedFilters;
}
