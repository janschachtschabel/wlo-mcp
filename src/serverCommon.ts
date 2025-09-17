import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SearchContentSchema, SearchContentShape, searchContent } from './tools/search_content.js';
import { getNodeMetadata } from './lib/wloClient.js';
import { parseQuery } from './tools/parse_query.js';
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

  // Tool: search_content
  server.registerTool(
    'search_content',
    {
      title: 'WLO Suche (deterministisch)',
      description: 'Sucht Inhalte/Sammlungen bei WLO anhand von Parametern. Unbekannte Labels werden abgelehnt und die erlaubten Alternativen gelistet.',
      inputSchema: SearchContentShape
    },
    async (args: unknown) => {
      const res = await searchContent(args as any);
      return {
        content: [
          { type: 'text', text: JSON.stringify(res, null, 2) }
        ]
      };
    }
  );

  // Tool: parse_query (optional)
  server.registerTool(
    'parse_query',
    {
      title: 'Freitext → Parametervorschlag',
      description: 'Parst Freitext in einen Vorschlag für search_content-Parameter (mit confidence & notes).',
      inputSchema: { query_text: z.string().min(1) }
    },
    async ({ query_text }: { query_text: string }) => {
      const out = parseQuery({ query_text });
      return {
        content: [
          { type: 'text', text: JSON.stringify(out, null, 2) }
        ]
      };
    }
  );

  // OpenAI connectors compatibility: 'search' tool
  // Arguments: { query: string }
  // Returns: { results: [{ id, title, url }] }
  server.registerTool(
    'search',
    {
      title: 'OpenAI-compatible search',
      description: 'Returns minimal results for OpenAI connectors (id, title, url).',
      inputSchema: { query: z.string().min(1) }
    },
    async ({ query }: { query: string }) => {
      // Parse free text to suggested filters, then run deterministic search
      const parsed = parseQuery({ query_text: query });
      const p = parsed.suggested_params || {} as any;
      const args: any = {
        q: p.q || query,
        page: 1,
        per_page: 10,
        content_type: 'FILES'
      };
      if (p.subject) args.subject = p.subject;
      if (p.educational_context) args.educational_context = p.educational_context;
      if (p.media_type) args.media_type = p.media_type;
      if (p.source) args.source = p.source; // only when explicitly requested per heuristics
      const res = await searchContent(args);
      const results = mapNodesToSearchResults(res.nodes || []);
      const payload = { results, resolved_filters: res.resolved_filters };
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  );

  // OpenAI connectors compatibility: 'fetch' tool
  // Arguments: { id: string }
  // Returns: { id, title, text, url, metadata }
  server.registerTool(
    'fetch',
    {
      title: 'OpenAI-compatible fetch',
      description: 'Returns a single document object (id, title, text, url, metadata) for a given id.',
      inputSchema: { id: z.string().min(1) }
    },
    async ({ id }: { id: string }) => {
      const meta = await getNodeMetadata(id);
      const document = buildDocumentFromMetadata(id, meta);
      return { content: [{ type: 'text', text: JSON.stringify(document) }] };
    }
  );

  return server;
}
