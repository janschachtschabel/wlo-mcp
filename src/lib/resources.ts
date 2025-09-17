import fs from 'fs';
import path from 'path';
import { Filters } from '../types.js';

let cache: Filters | null = null;

function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function loadFilters(): Filters {
  if (cache) return cache;
  const base = path.resolve(process.cwd(), 'resources', 'filters');
  const subjects = readJson(path.join(base, 'subjects.json')) as Record<string, string>;
  const educational_contexts = readJson(path.join(base, 'educational_contexts.json')) as Record<string, string>;
  const media_types = readJson(path.join(base, 'media_types.json')) as Record<string, string>;
  const licenses = readJson(path.join(base, 'licenses.json')) as Record<string, string>;
  cache = { subjects, educational_contexts, media_types, licenses };
  return cache;
}

export function resolveLabelStrict(
  map: Record<string, string>,
  label?: string
): { ok: true; uri: string; label: string } | { ok: false; message: string; allowed: string[] } {
  if (!label) return { ok: false, message: 'Kein Label angegeben', allowed: Object.keys(map) };
  // exact match first
  if (map[label]) return { ok: true, uri: map[label], label };
  // case-insensitive fallback
  const lower = label.toLowerCase();
  const found = Object.entries(map).find(([k]) => k.toLowerCase() === lower);
  if (found) {
    const [canonicalLabel, uri] = found;
    return { ok: true, uri, label: canonicalLabel };
  }
  return { ok: false, message: `Unbekanntes Label: "${label}"`, allowed: Object.keys(map) };
}
