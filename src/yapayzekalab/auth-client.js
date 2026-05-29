export const ACCESS_TOKEN_KEY = 'yz_access_token';
export const REFRESH_TOKEN_KEY = 'yz_refresh_token';
export const WHATSAPP_PENDING_TOKEN_KEY = 'whatsapp_pending_token';
export const TELEGRAM_LINK_PAYLOAD_KEY = 'telegram_link_payload';
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
export const getWhatsappPendingToken = () => readToken(WHATSAPP_PENDING_TOKEN_KEY);
export const getTelegramLinkPayload = () => {
  const raw = readToken(TELEGRAM_LINK_PAYLOAD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

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

export const storeWhatsappPendingToken = (pendingToken) => {
  const s = storage();
  if (!s || !pendingToken) return;
  s.setItem(WHATSAPP_PENDING_TOKEN_KEY, pendingToken);
};

export const storeTelegramLinkPayload = (payload) => {
  const s = storage();
  if (!s || !payload) return;
  s.setItem(TELEGRAM_LINK_PAYLOAD_KEY, JSON.stringify(payload));
};

export const clearWhatsappPendingToken = () => {
  const s = storage();
  if (!s) return;
  s.removeItem(WHATSAPP_PENDING_TOKEN_KEY);
};

export const clearTelegramLinkPayload = () => {
  const s = storage();
  if (!s) return;
  s.removeItem(TELEGRAM_LINK_PAYLOAD_KEY);
};

export const clearStoredAuth = () => {
  const s = storage();
  if (!s) return;
  s.removeItem(ACCESS_TOKEN_KEY);
  s.removeItem(REFRESH_TOKEN_KEY);
  s.removeItem(WHATSAPP_PENDING_TOKEN_KEY);
  s.removeItem(TELEGRAM_LINK_PAYLOAD_KEY);
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
