import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from '../src/serverCommon.js';

export default async function handler(req: any, res: any) {
  // Basic CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Mcp-Session-Id, Authorization, X-Api-Key');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // API Key Auth (optional): If MCP_API_KEY is set, require header match
  const requiredKey: string | undefined = process.env.MCP_API_KEY;
  if (requiredKey) {
    const authHeader = req.headers?.authorization as string | undefined;
    const apiKeyHeader = (req.headers?.['x-api-key'] || req.headers?.['X-Api-Key']) as string | undefined;
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;
    const provided = apiKeyHeader || bearer;
    if (!provided || provided !== requiredKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: invalid or missing API key' },
        id: null
      });
      return;
    }
  }

  if (req.method !== 'POST') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    return;
  }

  try {
    // Stateless: new transport/server per request
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();

    res.on('close', () => {
      try { transport.close(); } catch {}
      try { server.close(); } catch {}
    });

    await server.connect(transport);
    await transport.handleRequest(req as any, res as any, req.body as any);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}
