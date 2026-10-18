import { BACKEND_URL } from '../config/api';

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
