// Backend istemcisi: tokenları saklar, 401'de bir kez yenilemeyi dener.
const BASE = '/v1';
const KEY = 'kafe_tokens';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
function save(t) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* depolama kapalıysa oturum yalnızca bellekte kalır */
  }
}

let tokens = load();
let onLogout = () => {};

export const setLogoutHandler = (fn) => (onLogout = fn);
export const hasSession = () => !!tokens;
export const setTokens = (t) => {
  tokens = t ? { access_token: t.access_token, refresh_token: t.refresh_token } : null;
  save(tokens);
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Bir hata oluştu.');
    this.status = status;
    this.code = body?.error?.code || 'ERROR';
  }
}

async function raw(method, path, body, auth) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && tokens) headers.authorization = `Bearer ${tokens.access_token}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

async function refresh() {
  if (!tokens) return false;
  try {
    const t = await raw('POST', '/auth/refresh', { refresh_token: tokens.refresh_token }, false);
    setTokens(t);
    return true;
  } catch {
    return false;
  }
}

export async function api(method, path, body) {
  try {
    return await raw(method, path, body, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refresh())) {
      return raw(method, path, body, true);
    }
    if (e instanceof ApiError && e.status === 401) {
      setTokens(null);
      onLogout();
    }
    throw e;
  }
}

export const publicApi = (method, path, body) => raw(method, path, body, false);
