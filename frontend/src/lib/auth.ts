const TOKEN_KEY = 'iz_token';
const USER_KEY = 'iz_user';
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const saveSession = (token: string, user: any) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const getUser = (): any | null => {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
};

export const isTemporaryGuest = (): boolean => {
  const user = getUser();
  return Boolean(user?.isGuest || user?.tier === 'temporary');
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isLoggedIn = (): boolean => !!getToken();

const resolveApiUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (!API_BASE) {
    return url;
  }
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
};

// Use this for all API calls that need auth
export const authFetch = (url: string, options: RequestInit = {}) => {
  const token = getToken();
  const shouldAttachAuth = Boolean(token) && !isTemporaryGuest();
  return fetch(resolveApiUrl(url), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(shouldAttachAuth ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
};
