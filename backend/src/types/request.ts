import { Request } from 'express';
import { AuthenticatedUser } from './auth';

export interface AuthenticatedRequest extends Request {
  authUser: AuthenticatedUser;
}
