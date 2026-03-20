import crypto from 'crypto';
import { env } from '../config/env';
import { AuthenticatedUser, AuthProvider } from '../types/auth';

interface AppTokenPayload {
  sub: string;
  name?: string;
  avatar?: string;
  email?: string;
  tier?: string;
  provider: AuthProvider;
  iat: number;
  exp: number;
}

const TOKEN_PREFIX = 'iz1';
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, 'utf8').toString('base64url');

const base64UrlDecode = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8');

const getSigningSecret = (): string => env.WEBHOOK_SECRET;

const toUuidFromSeed = (seed: string): string => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = `4${hash.slice(13, 16)}`;
  const variantNibble = (parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8;
  const part4 = `${variantNibble.toString(16)}${hash.slice(17, 20)}`;
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

export const stableUserId = (provider: AuthProvider, externalId: string): string =>
  toUuidFromSeed(`${provider}:${externalId}`);

const signToken = (payloadB64: string): string =>
  crypto.createHmac('sha256', getSigningSecret()).update(payloadB64).digest('base64url');

export const createAppToken = (
  user: Omit<AuthenticatedUser, 'provider'> & { provider: AuthProvider },
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload: AppTokenPayload = {
    sub: user.id,
    name: user.name,
    avatar: user.avatar,
    email: user.email,
    tier: user.tier,
    provider: user.provider,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signToken(payloadB64);
  return `${TOKEN_PREFIX}.${payloadB64}.${signature}`;
};

export const verifyAppToken = (token: string): AuthenticatedUser | null => {
  const [prefix, payloadB64, signature] = token.split('.');
  if (!prefix || !payloadB64 || !signature || prefix !== TOKEN_PREFIX) {
    return null;
  }

  const expectedSig = signToken(payloadB64);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as AppTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now || !payload.sub) {
      return null;
    }

    return {
      id: payload.sub,
      name: payload.name,
      avatar: payload.avatar,
      email: payload.email,
      tier: payload.tier,
      provider: payload.provider,
    };
  } catch {
    return null;
  }
};

export const parseJwtWithoutVerification = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};
