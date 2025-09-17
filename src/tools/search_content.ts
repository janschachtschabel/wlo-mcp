import { z } from 'zod';
import { loadFilters, resolveLabelStrict } from '../lib/resources.js';
import { ngSearch } from '../lib/wloClient.js';
import {
  SearchContentParams,
  WLOCriterion,
  SearchContentResult,
  SearchContentResolvedFilters
} from '../types.js';

export const SearchContentShape = {
  q: z.string().trim().min(1).optional(),
  subject: z.string().trim().optional(),
  educational_context: z.string().trim().optional(),
  media_type: z.string().trim().optional(),
  source: z.string().trim().optional(),
  page: z.number().int().min(1).default(1).optional(),
  per_page: z.number().int().min(1).max(100).default(20).optional(),
  content_type: z.enum(['FILES', 'FOLDERS']).default('FILES').optional()
} as const;

export const SearchContentSchema = z.object(SearchContentShape).strict();

export type SearchContentInput = z.infer<typeof SearchContentSchema>;

export async function searchContent(input: SearchContentParams): Promise<SearchContentResult> {
  const params = SearchContentSchema.parse(input);
  const { subjects, educational_contexts, media_types } = loadFilters();

  const criteria: WLOCriterion[] = [];
  const resolvedFilters: SearchContentResolvedFilters = {};

  if (params.q) {
    criteria.push({ property: 'ngsearchword', values: [params.q] });
  }

  if (params.subject) {
    const m = resolveLabelStrict(subjects, params.subject);
    if (!m.ok) {
      throw new Error(`${m.message}. Gültige Werte (subjects): ${m.allowed.join(', ')}`);
    }
    criteria.push({ property: 'virtual:taxonid', values: [m.uri] });
    resolvedFilters.subject = { label: m.label, property: 'virtual:taxonid', value: m.uri };
  }

  if (params.educational_context) {
    const m = resolveLabelStrict(educational_contexts, params.educational_context);
    if (!m.ok) {
      throw new Error(`${m.message}. Gültige Werte (educational_context): ${m.allowed.join(', ')}`);
    }
    criteria.push({ property: 'ccm:educationalcontext', values: [m.uri] });
    resolvedFilters.educational_context = { label: m.label, property: 'ccm:educationalcontext', value: m.uri };
  }

  if (params.media_type) {
    const m = resolveLabelStrict(media_types, params.media_type);
    if (!m.ok) {
      throw new Error(`${m.message}. Gültige Werte (media_type): ${m.allowed.join(', ')}`);
    }
    criteria.push({ property: 'ccm:oeh_lrt_aggregated', values: [m.uri] });
    resolvedFilters.media_type = { label: m.label, property: 'ccm:oeh_lrt_aggregated', value: m.uri };
  }

  if (params.source) {
    criteria.push({ property: 'ccm:oeh_publisher_combined', values: [params.source] });
    resolvedFilters.source = {
      label: params.source,
      property: 'ccm:oeh_publisher_combined',
      value: params.source
    };
  }

  const perPage = params.per_page ?? 20;
  const page = params.page ?? 1;
  const skipCount = (page - 1) * perPage;

  try {
    const res = await ngSearch({
      contentType: params.content_type ?? 'FILES',
      maxItems: perPage,
      skipCount,
      criteria,
      propertyFilter: '-all-'
    });

    return {
      ...res,
      page,
      per_page: perPage,
      criteria,
      resolved_filters: resolvedFilters
    };
  } catch (error: any) {
    if (error?.response?.status) {
      const status = error.response.status;
      const statusText = error.response.statusText || 'WLO request failed';
      throw new Error(`WLO Suche fehlgeschlagen (${status} ${statusText})`);
    }
    throw error;
  }
}
