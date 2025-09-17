import { getOAuthMetadata } from '../../src/lib/auth.js';

export const config = {
  runtime: 'nodejs20.x'
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const metadata = getOAuthMetadata();
  if (!metadata) {
    res.status(404).json({ error: 'OAuth not configured' });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json(metadata);
}
