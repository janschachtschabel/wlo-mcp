import type { IncomingMessage } from 'http';
import { webcrypto } from 'crypto';

const issuer = process.env.OAUTH_ISSUER;
const jwksUri = process.env.OAUTH_JWKS_URL;
const tokenEndpoint = process.env.OAUTH_TOKEN_ENDPOINT;
const audience = process.env.OAUTH_AUDIENCE;
const authorizationServers = process.env.OAUTH_AUTHORIZATION_SERVERS;
const userAgent = process.env.MCP_USER_AGENT || 'wlo-mcp/0.1 (+https://wirlernenonline.de)';

const { subtle } = webcrypto;

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 60;

type SupportedAlg = 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512';

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number | string;
  nbf?: number | string;
  [key: string]: unknown;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

let jwksCache: { fetchedAt: number; keys: Jwk[] } | null = null;

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = 'unauthorized') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isOAuthConfigured(): boolean {
  return Boolean(issuer && jwksUri && tokenEndpoint);
}

function getAuthorizationHeader(req: IncomingMessage): string | undefined {
  const headers = req.headers ?? {};
  const raw = headers['authorization'] ?? headers['Authorization'];
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.find(Boolean);
  }
  return raw;
}

async function fetchJwks(): Promise<Jwk[]> {
  if (!jwksUri) {
    throw new AuthError('OAuth JWKS URI not configured', 500, 'server_error');
  }

  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const response = await fetch(jwksUri, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': userAgent
    }
  });

  if (!response.ok) {
    throw new AuthError(`JWKS fetch failed (${response.status})`, 500, 'server_error');
  }

  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? (body.keys as Jwk[]) : [];
  if (!keys.length) {
    throw new AuthError('JWKS did not contain any keys', 500, 'server_error');
  }

  jwksCache = { fetchedAt: Date.now(), keys };
  return keys;
}

async function selectVerificationKey(header: JwtHeader): Promise<Jwk> {
  const keys = await fetchJwks();

  if (header.kid) {
    const match = keys.find((key) => key.kid === header.kid);
    if (match) {
      return match;
    }
  }

  if (keys.length === 1) {
    return keys[0];
  }

  throw new AuthError('No matching JWKS key found for token', 401, 'invalid_token');
}

function getAlgorithmParams(alg: SupportedAlg): { name: string; hash: string; saltLength?: number } {
  switch (alg) {
    case 'RS256':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    case 'RS384':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' };
    case 'RS512':
      return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' };
    case 'PS256':
      return { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 };
    case 'PS384':
      return { name: 'RSA-PSS', hash: 'SHA-384', saltLength: 48 };
    case 'PS512':
      return { name: 'RSA-PSS', hash: 'SHA-512', saltLength: 64 };
    default:
      throw new AuthError(`Unsupported JWT algorithm: ${alg}`, 401, 'invalid_token');
  }
}

function decodeJson(segment: string): any {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    throw new AuthError('Failed to decode JWT', 401, 'invalid_token');
  }
}

function normalizeNumericClaim(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function validatePayload(payload: JwtPayload): void {
  const now = Math.floor(Date.now() / 1000);
  const exp = normalizeNumericClaim(payload.exp);
  const nbf = normalizeNumericClaim(payload.nbf);

  if (typeof exp === 'number' && now - CLOCK_TOLERANCE_SECONDS >= exp) {
    throw new AuthError('Access token expired', 401, 'token_expired');
  }

  if (typeof nbf === 'number' && nbf - CLOCK_TOLERANCE_SECONDS > now) {
    throw new AuthError('Access token not yet valid', 401, 'token_inactive');
  }

  if (issuer && payload.iss && payload.iss !== issuer) {
    throw new AuthError('Unexpected issuer', 401, 'invalid_token');
  }

  if (issuer && payload.iss === undefined) {
    throw new AuthError('Issuer claim missing in token', 401, 'invalid_token');
  }

  if (audience) {
    const audClaim = payload.aud;
    const matches = Array.isArray(audClaim)
      ? audClaim.includes(audience)
      : audClaim === audience;
    if (!matches) {
      throw new AuthError('Unexpected audience', 401, 'invalid_token');
    }
  }
}

async function verifyJwt(token: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Invalid JWT format', 401, 'invalid_token');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJson(headerSegment) as JwtHeader;

  if (!header?.alg) {
    throw new AuthError('JWT header missing alg', 401, 'invalid_token');
  }

  if (!['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'].includes(header.alg)) {
    throw new AuthError(`Unsupported JWT algorithm: ${header.alg}`, 401, 'invalid_token');
  }

  const algorithm = getAlgorithmParams(header.alg as SupportedAlg);
  const jwk = await selectVerificationKey(header);

  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new AuthError('Unsupported JWKS key type', 401, 'invalid_token');
  }

  const publicKey = await subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: algorithm.name, hash: { name: algorithm.hash } },
    false,
    ['verify']
  );

  const signature = Buffer.from(signatureSegment, 'base64url');
  const data = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const verifyParams: any = { name: algorithm.name };

  if (algorithm.name === 'RSA-PSS') {
    verifyParams.saltLength = algorithm.saltLength ?? 32;
  }

  const verified = await subtle.verify(verifyParams, publicKey, signature, data);
  if (!verified) {
    throw new AuthError('Access token signature invalid', 401, 'invalid_token');
  }

  const payload = decodeJson(payloadSegment) as JwtPayload;
  validatePayload(payload);

  return payload;
}

export async function ensureAuthorized(req: IncomingMessage): Promise<void> {
  if (!isOAuthConfigured()) {
    return;
  }

  const header = getAuthorizationHeader(req);
  if (!header) {
    throw new AuthError('Missing Authorization header', 401, 'missing_authorization');
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthError('Authorization header must use the Bearer scheme', 401, 'invalid_authorization_scheme');
  }

  const token = match[1].trim();
  if (!token) {
    throw new AuthError('Bearer token is empty', 401, 'invalid_token');
  }

  try {
    await verifyJwt(token);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError('Authorization failed', 401, 'unauthorized');
  }
}

export interface OAuthMetadata {
  issuer: string;
  token_endpoint: string;
  jwks_uri: string;
  authorization_servers?: string[];
  resource?: string;
}

export function getOAuthMetadata(): OAuthMetadata | null {
  if (!isOAuthConfigured()) {
    return null;
  }

  const metadata: OAuthMetadata = {
    issuer: issuer as string,
    token_endpoint: tokenEndpoint as string,
    jwks_uri: jwksUri as string
  };

  if (authorizationServers) {
    metadata.authorization_servers = authorizationServers
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (audience) {
    metadata.resource = audience;
  }

  return metadata;
}
