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
    const id = node.ref?.id;
    if (!id) continue;
    const props = node.properties ?? {};
    const title = resolveTitle(props, id);
    results.push({ id, title, url: buildNodeUrl(id) });
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

  const title = resolveTitle(props, nodeId);
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

  return {
    id: nodeId,
    title,
    text,
    url: buildNodeUrl(nodeId),
    metadata: props
  };
}
