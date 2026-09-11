// backend/src/services/oauth.service.ts
import crypto from 'crypto';
import { logger } from '../utils/logger';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

interface GoogleJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified: boolean;
}

export interface GitHubIdentity {
  id: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export class OAuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
    this.name = 'OAuthError';
  }
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

let jwksCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;

/**
 * Fetches Google's signing keys, honouring the Cache-Control max-age they ship.
 *
 * Google rotates these keys; caching without an expiry would eventually reject
 * every valid login, and not caching at all would add a network round-trip to
 * every single sign-in.
 */
const getGoogleKeys = async (): Promise<GoogleJwk[]> => {
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }

  const response = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new OAuthError('Could not reach Google to verify the sign-in.', 502);
  }

  const body = (await response.json()) as { keys: GoogleJwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600);

  jwksCache = { keys: body.keys ?? [], expiresAt: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
};

const base64UrlToBuffer = (value: string): Buffer => Buffer.from(value, 'base64url');

/**
 * Verifies a Google ID token end to end: RS256 signature against Google's
 * published keys, then issuer, audience and expiry.
 *
 * The previous implementation decoded the token without checking anything, which
 * meant anyone could sign in as anyone by hand-crafting a payload.
 */
export const verifyGoogleIdToken = async (
  idToken: string,
  expectedClientId: string,
): Promise<GoogleIdentity> => {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new OAuthError('Malformed Google credential.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    throw new OAuthError('Malformed Google credential.');
  }

  if (header.alg !== 'RS256') {
    throw new OAuthError(`Unsupported token algorithm: ${header.alg}`);
  }

  const keys = await getGoogleKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // Key rotation mid-flight: drop the cache so the next attempt refetches.
    jwksCache = null;
    throw new OAuthError('Google signing key not recognised. Please try again.');
  }

  const publicKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
  const signatureValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    base64UrlToBuffer(signatureB64),
  );

  if (!signatureValid) {
    throw new OAuthError('Google credential signature is invalid.');
  }

  if (!GOOGLE_ISSUERS.has(String(payload.iss))) {
    throw new OAuthError('Google credential has an unexpected issuer.');
  }

  if (String(payload.aud) !== expectedClientId) {
    throw new OAuthError('Google credential was issued for a different application.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new OAuthError('Google credential has expired. Please sign in again.');
  }

  if (!payload.sub) {
    throw new OAuthError('Google credential is missing a subject.');
  }

  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    emailVerified: payload.email_verified === true,
  };
};

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Exchanges the OAuth callback `code` for an access token, then reads the
 * profile behind it.
 *
 * Requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET. Without them this throws a
 * clear configuration error rather than silently minting a session for a code it
 * never validated.
 */
export const exchangeGitHubCode = async (code: string, redirectUri?: string): Promise<GitHubIdentity> => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new OAuthError(
      'GitHub sign-in is not configured on this server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      503,
    );
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenResponse.ok) {
    throw new OAuthError('GitHub rejected the sign-in request.', 502);
  }

  const tokenBody = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenBody.error || !tokenBody.access_token) {
    logger.warn(`[OAuth] GitHub code exchange failed: ${tokenBody.error_description || tokenBody.error}`);
    throw new OAuthError(tokenBody.error_description || 'GitHub sign-in failed. The code may have expired.');
  }

  const headers = {
    Authorization: `Bearer ${tokenBody.access_token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'InfraZero',
  };

  const profileResponse = await fetch('https://api.github.com/user', {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!profileResponse.ok) {
    throw new OAuthError('Could not read your GitHub profile.', 502);
  }

  const profile = (await profileResponse.json()) as {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  };

  // A GitHub user with a private email returns null above; the /user/emails
  // endpoint still exposes the primary verified address under the user:email
  // scope the sign-in already requested.
  let email = profile.email ?? undefined;
  if (!email) {
    try {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        email = emails.find((entry) => entry.primary && entry.verified)?.email;
      }
    } catch {
      // Non-fatal: the account is still usable without an email on file.
    }
  }

  return {
    id: String(profile.id),
    login: profile.login,
    name: profile.name || profile.login,
    email,
    avatarUrl: profile.avatar_url,
  };
};
