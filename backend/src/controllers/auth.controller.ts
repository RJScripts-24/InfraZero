import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  createAppToken,
  parseJwtWithoutVerification,
  stableUserId,
} from '../services/authToken.service';

const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const fallbackName = (provider: 'google' | 'github', seed: string): string =>
  `${provider[0].toUpperCase()}${provider.slice(1)} User ${seed.slice(0, 6)}`;

export const googleLogin = (req: Request, res: Response): void => {
  const token = pickString(req.body?.token);
  if (!token) {
    res.status(400).json({ error: 'token is required.' });
    return;
  }

  const payload = parseJwtWithoutVerification(token);
  const externalId = pickString(payload?.sub) || crypto.createHash('sha256').update(token).digest('hex');
  const id = stableUserId('google', externalId);
  const name = pickString(payload?.name) || fallbackName('google', externalId);
  const avatar = pickString(payload?.picture);
  const sessionToken = createAppToken({
    id,
    name,
    avatar,
    email: pickString(payload?.email),
    provider: 'google',
  });

  res.status(200).json({
    user: { id, name, avatar: avatar || '' },
    token: sessionToken,
  });
};

export const githubLogin = (req: Request, res: Response): void => {
  const code = pickString(req.body?.code);
  if (!code) {
    res.status(400).json({ error: 'code is required.' });
    return;
  }

  const id = stableUserId('github', code);
  const name = fallbackName('github', code);
  const sessionToken = createAppToken({
    id,
    name,
    provider: 'github',
  });

  res.status(200).json({
    user: { id, name, avatar: '' },
    token: sessionToken,
  });
};

export const guestLogin = (_req: Request, res: Response): void => {
  const id = stableUserId('guest', crypto.randomUUID());
  const name = 'Guest User';
  const tier = 'Research';
  const sessionToken = createAppToken(
    {
      id,
      name,
      tier,
      provider: 'guest',
    },
    60 * 60 * 24
  );

  res.status(200).json({
    user: {
      id,
      name,
      tier,
    },
    token: sessionToken,
  });
};
