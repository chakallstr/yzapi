export const ACCESS_TOKEN_KEY = 'yz_access_token';
export const REFRESH_TOKEN_KEY = 'yz_refresh_token';
export const LEGACY_ACCESS_TOKEN_KEY = 'userAccessToken';
export const LEGACY_REFRESH_TOKEN_KEY = 'userRefreshToken';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readToken = (...keys) => {
  const s = storage();
  if (!s) return '';
  for (const key of keys) {
    const value = s.getItem(key);
    if (value) return value;
  }
  return '';
};

export const getAccessToken = () => readToken(ACCESS_TOKEN_KEY, LEGACY_ACCESS_TOKEN_KEY);
export const getRefreshToken = () => readToken(REFRESH_TOKEN_KEY, LEGACY_REFRESH_TOKEN_KEY);

export const hasStoredAuth = () => Boolean(getAccessToken());

export const storeAuthTokens = ({ accessToken, refreshToken }) => {
  const s = storage();
  if (!s) return;
  if (accessToken) {
    s.setItem(ACCESS_TOKEN_KEY, accessToken);
    s.setItem(LEGACY_ACCESS_TOKEN_KEY, accessToken);
  }
  if (refreshToken) {
    s.setItem(REFRESH_TOKEN_KEY, refreshToken);
    s.setItem(LEGACY_REFRESH_TOKEN_KEY, refreshToken);
  }
};

export const clearStoredAuth = () => {
  const s = storage();
  if (!s) return;
  s.removeItem(ACCESS_TOKEN_KEY);
  s.removeItem(REFRESH_TOKEN_KEY);
  s.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  s.removeItem(LEGACY_REFRESH_TOKEN_KEY);
};

const sessionExpiredError = () => new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.');

export const refreshAuthTokens = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearStoredAuth();
    throw sessionExpiredError();
  }

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.accessToken) {
    clearStoredAuth();
    throw sessionExpiredError();
  }

  storeAuthTokens(body);
  return body;
};

const withAuthHeaders = (headers = {}) => {
  const next = { ...headers };
  const token = getAccessToken();
  if (token) next.Authorization = `Bearer ${token}`;
  return next;
};

export const authFetch = async (url, options = {}, retryOnUnauthorized = true) => {
  const response = await fetch(url, {
    ...options,
    headers: withAuthHeaders(options.headers || {}),
  });

  if (response.status === 401 && retryOnUnauthorized && !String(url).includes('/api/auth/refresh') && getRefreshToken()) {
    await refreshAuthTokens();
    return authFetch(url, options, false);
  }

  return response;
};

export const apiJson = async (url, options = {}) => {
  const body = options.body === undefined
    ? undefined
    : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
  const response = await authFetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `İstek başarısız (${response.status})`);
  }
  return data;
};
