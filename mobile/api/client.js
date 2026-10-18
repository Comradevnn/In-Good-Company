import { BACKEND_URL } from '../config/api';

// A session ends server-side when the account signs in somewhere else (one
// session per account) or logs out. Every authenticated call to the backend
// — through api() below or a raw fetch elsewhere — goes through this
// wrapper, so a 401 signs the app out cleanly instead of stranding the user
// on an error screen. Installed once by App.js.
let unauthorizedHandler = null;
let installed = false;

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

export function installAuthInterceptor() {
  if (installed) return;
  installed = true;
  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const authHeader = init?.headers?.Authorization ?? init?.headers?.authorization;
    const isAuthRoute = /\/auth\/(login|signup|logout)$/.test(url);
    if (response.status === 401 && authHeader && url.startsWith(BACKEND_URL) && !isAuthRoute && unauthorizedHandler) {
      const handler = unauthorizedHandler;
      unauthorizedHandler = null; // once per session; App re-registers on sign-in
      handler();
    }
    return response;
  };
}

// Thin fetch wrapper for the lifecycle routes. Throws an Error carrying the
// backend's message and machine-readable `code` (e.g. 'insufficient_deeds',
// 'monthly_cap_reached') so screens can show the right next step.
export async function api(sessionToken, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.code = data.code;
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

// "in 3h 20m" / "2 days" style countdowns for deadlines.
export function timeUntil(iso, nowMs) {
  const ms = Date.parse(iso) - (nowMs ?? Date.now());
  if (ms <= 0) return 'now';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.round(hours / 24)} days`;
}
