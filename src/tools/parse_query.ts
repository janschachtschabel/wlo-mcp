import { loadFilters } from '../lib/resources.js';

export interface ParseQueryInput {
  query_text: string;
}

export interface ParseQueryOutput {
  suggested_params: {
    q?: string;
    subject?: string;
    educational_context?: string;
    media_type?: string;
    source?: string;
    page?: number;
    per_page?: number;
    content_type?: 'FILES' | 'FOLDERS';
  };
  confidence: number; // 0..1
  notes: string;
}

function findLabel(text: string, labels: string[]): string | undefined {
  const lc = text.toLowerCase();
  // Prefer longest label match
  const sorted = labels.sort((a, b) => b.length - a.length);
  return sorted.find(l => lc.includes(l.toLowerCase()));
}

export function parseQuery(input: ParseQueryInput): ParseQueryOutput {
  const text = input.query_text.trim();
  const filters = loadFilters();

  let subject: string | undefined = findLabel(text, Object.keys(filters.subjects));
  let media_type: string | undefined = findLabel(text, Object.keys(filters.media_types));

  // Educational context heuristics
  let educational_context: string | undefined;
  const lc = text.toLowerCase();
  if (/(grundschule|primarstufe|klasse\s*[1-4]\b)/.test(lc)) {
    educational_context = 'Primarstufe';
  } else if (/(sek\s*i|sekundarstufe\s*i|klasse\s*(5|6|7|8|9|10)\b)/.test(lc)) {
    educational_context = 'Sekundarstufe I';
  } else if (/(sek\s*ii|sekundarstufe\s*ii|oberstufe|klasse\s*(11|12|13)\b)/.test(lc)) {
    educational_context = 'Sekundarstufe II';
  }

  // Source: only set if explicitly requested (e.g., "von Klexikon", "nur Klexikon", "Quelle: Klexikon")
  let source: string | undefined;
  const wantsSource = /(\bvon\b|\bvom\b|\bnur\b|quelle\s*:|\bquelle\b|publisher|anbieter|herausgeber|plattform)/i.test(text);
  if (wantsSource && /\bklexikon\b/i.test(text)) {
    source = 'Klexikon';
  }

  // q: try to keep meaningful remainder
  let cleaned = text
    .replace(/sek\s*ii|sekundarstufe\s*ii|sek\s*i|sekundarstufe\s*i|grundschule|primarstufe|oberstufe|klasse\s*\d+/gi, '')
    .replace(/arbeitsblatt|video|bild|audio|animation|interaktiv(es)?\s*medium|lernspiel|präsentation|unterrichtsidee|unterrichtsplan|webseite|quelle|tool|bildungsangebot|event|wettbewerb|sammlung|sonstiges/gi, '');
  // remove publisher token from q only if we actually set source
  if (source) {
    cleaned = cleaned.replace(/\bklexikon\b/gi, '');
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  let q = cleaned as string;
  if (!q) q = undefined as any;

  const suggested_params: ParseQueryOutput['suggested_params'] = {
    q,
    subject,
    educational_context,
    media_type,
    source,
    page: 1,
    per_page: 20,
    content_type: 'FILES'
  };

  const hitCount = [q, subject, educational_context, media_type, source].filter(Boolean).length;
  const confidence = Math.min(1, 0.2 * hitCount + 0.2); // simple heuristic

  const notes = [
    subject ? `Fach erkannt: ${subject}` : undefined,
    educational_context ? `Bildungsstufe erkannt: ${educational_context}` : undefined,
    media_type ? `Inhaltstyp erkannt: ${media_type}` : undefined,
    source ? `Quelle erkannt: ${source}` : undefined,
    q ? `Suchbegriff: ${q}` : undefined
  ].filter(Boolean).join(' | ');

  return { suggested_params, confidence, notes };
}
