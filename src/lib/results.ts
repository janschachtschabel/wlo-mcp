import { getWloBaseUrl } from './wloClient.js';
import type { WLOSearchResponseNode } from '../types.js';

type Properties = Record<string, string[] | undefined> | undefined;

const TITLE_KEYS = ['cclom:title', 'cm:title', 'cm:name'];
const DESCRIPTION_KEYS = ['cclom:general_description', 'cm:description'];

function firstNonEmptyValue(props: Properties, key: string): string | undefined {
  const values = props?.[key];
  if (!values) return undefined;
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function joinValues(values: string[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  const filtered = values.map((value) => value?.trim()).filter((value) => Boolean(value && value.length));
  if (!filtered.length) return undefined;
  return filtered.join(', ');
}

export function buildNodeUrl(nodeId: string): string {
  const base = getWloBaseUrl();
  return `${base}/edu-sharing/components/render?nodeId=${encodeURIComponent(nodeId)}`;
}

export function resolveTitle(props: Properties, fallback: string): string {
  for (const key of TITLE_KEYS) {
    const value = firstNonEmptyValue(props, key);
    if (value) {
      return value;
    }
  }
  return fallback;
}

function resolveDescription(props: Properties): string | undefined {
  for (const key of DESCRIPTION_KEYS) {
    const value = firstNonEmptyValue(props, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export interface MinimalSearchResult {
  id: string;
  title: string;
  url: string;
}

export function mapNodesToSearchResults(nodes: WLOSearchResponseNode[]): MinimalSearchResult[] {
  const results: MinimalSearchResult[] = [];
  for (const node of nodes) {
    const props = node.properties ?? {};
    const uuid = firstNonEmptyValue(props, 'sys:node-uuid') ?? node.ref?.id;
    if (!uuid) continue;
    const title = resolveTitle(props, uuid);
    const permalink = firstNonEmptyValue(props, 'virtual:permalink');
    const wwwUrl = firstNonEmptyValue(props, 'ccm:wwwurl');
    const url = permalink ?? wwwUrl ?? buildNodeUrl(uuid);
    results.push({ id: uuid, title, url });
  }
  return results;
}

export interface DocumentResult {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string[] | undefined>;
}

export function buildDocumentFromMetadata(nodeId: string, metadata: any): DocumentResult {
  const props: Record<string, string[] | undefined> = metadata?.node?.properties ?? metadata?.properties ?? {};

  const nodeRefId = metadata?.node?.ref?.id;
  const nodeUuid = firstNonEmptyValue(props, 'sys:node-uuid') ?? nodeRefId ?? nodeId;

  const title = resolveTitle(props, nodeUuid);
  const description = resolveDescription(props);
  const subjects = joinValues(props['ccm:taxonidDisplay']);
  const license = firstNonEmptyValue(props, 'ccm:license');
  const authors = joinValues(props['cclom:lifeCycleContributeAuthor']);
  const keywords = joinValues(props['cclom:keyword']);

  const textParts = [
    description ? `Beschreibung: ${description}` : undefined,
    subjects ? `Fächer: ${subjects}` : undefined,
    license ? `Lizenz: ${license}` : undefined,
    authors ? `Autor:innen: ${authors}` : undefined,
    keywords ? `Schlagwörter: ${keywords}` : undefined
  ].filter(Boolean) as string[];

  const text = textParts.length ? textParts.join('\n') : JSON.stringify(props, null, 2);

  const permalink = firstNonEmptyValue(props, 'virtual:permalink');
  const wwwUrl = firstNonEmptyValue(props, 'ccm:wwwurl');
  const primaryUrl = permalink ?? wwwUrl ?? buildNodeUrl(nodeUuid);

  const metadataRecord: Record<string, string[] | undefined> = { ...props };
  metadataRecord['resolved:node-uuid'] = [nodeUuid];
  if (nodeRefId) metadataRecord['resolved:node-ref'] = [nodeRefId];
  if (permalink) metadataRecord['resolved:permalink'] = [permalink];
  if (wwwUrl) metadataRecord['resolved:source-url'] = [wwwUrl];

  return {
    id: nodeUuid,
    title,
    text,
    url: primaryUrl,
    metadata: metadataRecord
  };
}
