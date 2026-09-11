import { NextFunction, Request, Response } from 'express';
import {
  createAppToken,
  stableUserId,
} from '../services/authToken.service';
import { OAuthError, exchangeGitHubCode, verifyGoogleIdToken } from '../services/oauth.service';
import * as users from '../services/users.repository';
import { AuthenticatedRequest } from '../types/request';
import { logger } from '../utils/logger';

const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const handleOAuthError = (error: unknown, res: Response, next: NextFunction): void => {
  if (error instanceof OAuthError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  next(error);
};

export const googleLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = pickString(req.body?.token);
    if (!token) {
      res.status(400).json({ error: 'token is required.' });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({
        error: 'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID.',
      });
      return;
    }

    const identity = await verifyGoogleIdToken(token, clientId);
    const id = stableUserId('google', identity.sub);

    const user = await users.upsertUser({
      id,
      provider: 'google',
      providerUserId: identity.sub,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.picture,
    });

    logger.info(`[Auth] Google sign-in for ${user.id}`);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name ?? 'InfraZero User',
        email: user.email ?? '',
        avatar: user.avatarUrl ?? '',
        provider: 'google',
      },
      token: createAppToken({
        id: user.id,
        name: user.name ?? undefined,
        avatar: user.avatarUrl ?? undefined,
        email: user.email ?? undefined,
        provider: 'google',
      }),
    });
  } catch (error) {
    handleOAuthError(error, res, next);
  }
};

export const githubLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = pickString(req.body?.code);
    if (!code) {
      res.status(400).json({ error: 'code is required.' });
      return;
    }

    const identity = await exchangeGitHubCode(code, pickString(req.body?.redirectUri));
    const id = stableUserId('github', identity.id);

    const user = await users.upsertUser({
      id,
      provider: 'github',
      providerUserId: identity.id,
      email: identity.email,
      name: identity.name || identity.login,
      avatarUrl: identity.avatarUrl,
    });

    logger.info(`[Auth] GitHub sign-in for ${user.id}`);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name ?? identity.login,
        email: user.email ?? '',
        avatar: user.avatarUrl ?? '',
        provider: 'github',
      },
      token: createAppToken({
        id: user.id,
        name: user.name ?? identity.login,
        avatar: user.avatarUrl ?? undefined,
        email: user.email ?? undefined,
        provider: 'github',
      }),
    });
  } catch (error) {
    handleOAuthError(error, res, next);
  }
};

/**
 * Returns the signed-in user, reading through to the database so a profile
 * edited in Settings is reflected without forcing a re-login.
 */
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const persisted = await users.getUserById(authUser.id);

    if (!persisted) {
      res.status(404).json({ error: 'Account no longer exists.' });
      return;
    }

    res.status(200).json({
      id: persisted.id,
      name: persisted.name ?? 'InfraZero User',
      email: persisted.email ?? '',
      avatar: persisted.avatarUrl ?? '',
      provider: persisted.provider ?? authUser.provider,
      createdAt: persisted.createdAt,
      projectCount: await users.countUserProjects(persisted.id),
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const name = pickString(req.body?.name);

    if (!name || name.length > 80) {
      res.status(400).json({ error: 'name is required (1-80 characters).' });
      return;
    }

    const updated = await users.updateUserName(authUser.id, name);
    if (!updated) {
      res.status(404).json({ error: 'Account no longer exists.' });
      return;
    }

    res.status(200).json({
      id: updated.id,
      name: updated.name ?? name,
      email: updated.email ?? '',
      avatar: updated.avatarUrl ?? '',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permanently deletes the account.
 *
 * Projects, simulations and GhostTrace analyses all cascade from users, so this
 * one statement removes everything. Requires the caller to echo back their own
 * user id, so a stray DELETE cannot wipe an account by accident.
 */
export const deleteAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = (req as AuthenticatedRequest).authUser;
    const confirmation = pickString(req.body?.confirmUserId);

    if (confirmation !== authUser.id) {
      res.status(400).json({
        error: 'Account deletion must be confirmed with your own user id.',
      });
      return;
    }

    const deleted = await users.deleteUser(authUser.id);
    if (!deleted) {
      res.status(404).json({ error: 'Account no longer exists.' });
      return;
    }

    logger.info(`[Auth] Account deleted: ${authUser.id}`);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
