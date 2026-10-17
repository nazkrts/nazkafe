import * as SecureStore from 'expo-secure-store';

// Android emülatöründe bilgisayarın localhost'u 10.0.2.2'dir; gerçek telefonda bilgisayarın yerel IP'sini yaz.
// Örnek: EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/v1 npx expo start
export const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/v1';
const KEY = 'kafe_tokens';

let tokens = null;
let onLogout = () => {};

export const setLogoutHandler = (fn) => (onLogout = fn);

export async function loadTokens() {
  try {
    const s = await SecureStore.getItemAsync(KEY);
    tokens = s ? JSON.parse(s) : null;
  } catch {
    tokens = null;
  }
  return !!tokens;
}

export async function setTokens(t) {
  tokens = t ? { access_token: t.access_token, refresh_token: t.refresh_token } : null;
  try {
    if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* güvenli depo kullanılamıyorsa oturum yalnızca bellekte kalır */
  }
}

export const refreshTokenValue = () => tokens?.refresh_token;

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
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { error: { message: 'Sunucuya ulaşılamadı. Bağlantını kontrol et.', code: 'NETWORK' } });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

async function refresh() {
  if (!tokens) return false;
  try {
    await setTokens(await raw('POST', '/auth/refresh', { refresh_token: tokens.refresh_token }, false));
    return true;
  } catch {
    return false;
  }
}

export async function api(method, path, body) {
  try {
    return await raw(method, path, body, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (await refresh()) return raw(method, path, body, true);
      await setTokens(null);
      onLogout();
    }
    throw e;
  }
}

export const publicApi = (method, path, body) => raw(method, path, body, false);
