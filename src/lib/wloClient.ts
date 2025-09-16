import axios from 'axios';
import { WLOCriterion, WLOSearchResponse } from '../types.js';

const BASE_URL = process.env.WLO_BASE_URL || 'https://redaktion.openeduhub.net';

export function getWloBaseUrl(): string {
  return BASE_URL;
}

export interface NgSearchRequest {
  contentType: 'FILES' | 'FOLDERS';
  maxItems: number;
  skipCount: number;
  propertyFilter?: string; // default -all-
  criteria: WLOCriterion[];
}

export async function ngSearch(req: NgSearchRequest): Promise<WLOSearchResponse> {
  const searchParams = new URLSearchParams({
    contentType: req.contentType,
    maxItems: String(req.maxItems),
    skipCount: String(req.skipCount),
    propertyFilter: req.propertyFilter ?? '-all-'
  });

  const url = `${BASE_URL}/edu-sharing/rest/search/v1/queries/-home-/mds_oeh/ngsearch?${searchParams.toString()}`;
  const { data } = await axios.post(url, { criteria: req.criteria }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  return data as WLOSearchResponse;
}

export async function getNodeMetadata(nodeId: string): Promise<any> {
  const encoded = encodeURIComponent(nodeId);
  const url = `${BASE_URL}/edu-sharing/rest/node/v1/nodes/${encoded}/metadata?propertyFilter=-all-`;
  const { data } = await axios.get(url, {
    headers: { 'Accept': 'application/json' }
  });
  return data;
}
