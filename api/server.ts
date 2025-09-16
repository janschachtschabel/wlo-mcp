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

  if (req.method !== 'POST') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    return;
  }

  try {
    // Stateless: new transport/server per request
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer();

    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP Handler Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: null
    });
  }
}
