export type AuthProvider = 'google' | 'github' | 'guest';

export interface AuthenticatedUser {
  id: string;
  name?: string;
  avatar?: string;
  email?: string;
  tier?: string;
  provider: AuthProvider;
}
