import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SearchContentSchema, SearchContentShape, searchContent } from './tools/search_content.js';
import { parseQuery } from './tools/parse_query.js';
import { getNodeMetadata } from './lib/wloClient.js';
import { buildDocumentFromMetadata, mapNodesToSearchResults } from './lib/results.js';

function readText(relPath: string): string {
  const full = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(full, 'utf-8');
}

function readJson(relPath: string): string {
  const text = readText(relPath);
  // Ensure well-formatted
  return JSON.stringify(JSON.parse(text), null, 2);
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'wlo-mcp-server', version: '0.1.0' });

  // Resources: filters
  server.registerResource(
    'filters/subjects',
    'resource://filters/subjects.json',
    {
      title: 'Subjects (Labels → URIs)',
      description: 'Deutsche Fächer-Labels gemappt auf WLO URIs',
      mimeType: 'application/json'
    },
    async (uri: URL) => ({ contents: [{ uri: uri.href, text: readJson('resources/filters/subjects.json') }] })
  );

  server.registerResource(
    'filters/educational_contexts',
    'resource://filters/educational_contexts.json',
    {
      title: 'Educational Contexts (Labels → URIs)',
      description: 'Bildungsstufen-Labels gemappt auf WLO URIs',
      mimeType: 'application/json'
    },
    async (uri: URL) => ({ contents: [{ uri: uri.href, text: readJson('resources/filters/educational_contexts.json') }] })
  );

  server.registerResource(
    'filters/media_types',
    'resource://filters/media_types.json',
    {
      title: 'Media Types (Labels → URIs)',
      description: 'Inhaltstypen-Labels gemappt auf WLO URIs',
      mimeType: 'application/json'
    },
    async (uri: URL) => ({ contents: [{ uri: uri.href, text: readJson('resources/filters/media_types.json') }] })
  );

  server.registerResource(
    'filters/licenses',
    'resource://filters/licenses.json',
    {
      title: 'Licenses',
      description: 'Lizenzcodes (optional, derzeit nicht in search_content genutzt)',
      mimeType: 'application/json'
    },
    async (uri: URL) => ({ contents: [{ uri: uri.href, text: readJson('resources/filters/licenses.json') }] })
  );

  // Prompt as resource
  server.registerResource(
    'prompts/map_nl_to_filters',
    'resource://prompts/map_nl_to_filters.txt',
    {
      title: 'Prompt: Map NL to Filters',
      description: 'Few-shot/Instruktion: Freitext → gültige search_content Parameter',
      mimeType: 'text/plain'
    },
    async (uri: URL) => ({ contents: [{ uri: uri.href, text: readText('resources/prompts/map_nl_to_filters.txt') }] })
  );

  // Optional: register as MCP Prompt too
  server.registerPrompt(
    'map_nl_to_filters',
    {
      title: 'Map NL to Filters',
      description: 'Hilfstext und Beispiele zum Abbilden von Freitext in deterministische Parameter',
      argsSchema: {}
    },
    () => ({
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: readText('resources/prompts/map_nl_to_filters.txt')
          }
        }
      ]
    })
  );

  const SearchToolInput = z.object({ query: z.string().min(1) });
  const FetchToolInput = z.object({ id: z.string().min(1) });

  // Tool: search (OpenAI/Claude compatible)
  server.registerTool(
    'search',
    {
      title: 'WLO Suche (Freitext → Ergebnisse)',
      description: 'Akzeptiert Freitext, mappt ihn heuristisch auf WLO-Filter und liefert eine Ergebnisliste (id/title/url).',
      inputSchema: SearchToolInput.shape
    },
    async ({ query }: { query: string }) => {
      const parsed = parseQuery({ query_text: query });
      const suggested = parsed.suggested_params ?? {};
      const args = {
        ...suggested,
        q: suggested.q ?? query,
        page: suggested.page ?? 1,
        per_page: Math.min(suggested.per_page ?? 10, 20),
        content_type: suggested.content_type ?? 'FILES'
      } as Record<string, unknown>;

      const res = await searchContent(args);
      const results = mapNodesToSearchResults(res.nodes ?? []);
      const payload = {
        results,
        resolved_filters: res.resolved_filters,
        total_results: res.nodes?.length ?? 0
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }]
      };
    }
  );

  // Tool: fetch (OpenAI/Claude compatible)
  server.registerTool(
    'fetch',
    {
      title: 'WLO Dokument abrufen',
      description: 'Liefert Titel, Text, URL und Metadaten eines WLO-Knotens basierend auf seiner ID.',
      inputSchema: FetchToolInput.shape
    },
    async ({ id }: { id: string }) => {
      const metadata = await getNodeMetadata(id);
      const document = buildDocumentFromMetadata(id, metadata);
      return {
        content: [{ type: 'text', text: JSON.stringify(document) }]
      };
    }
  );

  // Optional Expert Tool: search_content (deterministic Parameter)
  server.registerTool(
    'search_content',
    {
      title: 'WLO Suche (strukturierte Parameter)',
      description: 'Deterministische Suche mit exakt definierten Parametern (q/subject/educational_context/media_type/source/page/per_page/content_type).',
      inputSchema: SearchContentShape
    },
    async (args: unknown) => {
      const params = SearchContentSchema.parse(args);
      const res = await searchContent(params);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
      };
    }
  );

  // Optional Helper: parse_query (Freitext → Parametervorschlag)
  server.registerTool(
    'parse_query',
    {
      title: 'Freitext → Parameterheuristik',
      description: 'Analysiert Freitext und schlägt Parameter für `search_content` vor (liefert confidence & notes).',
      inputSchema: { query_text: z.string().min(1) }
    },
    async ({ query_text }: { query_text: string }) => {
      const out = parseQuery({ query_text });
      return {
        content: [{ type: 'text', text: JSON.stringify(out, null, 2) }]
      };
    }
  );

  return server;
}
