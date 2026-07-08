import Constants from 'expo-constants';

// Matches backend/index.js's `process.env.PORT || 3000`.
const BACKEND_PORT = 3000;

// Expo Go/dev-client report the address they connected through as
// `hostUri` (e.g. "192.168.1.42:8081", Metro's port). We reuse the IP
// from that and swap in the backend's own port, so the app finds the
// right backend automatically on whatever network the phone/computer
// is on, without any file needing to be edited.
export function getBackendUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.hostUri;

  if (!hostUri) {
    console.warn(
      'Could not read Constants.expoConfig.hostUri (not running under Expo Go/dev client) — falling back to localhost.'
    );
    return `http://localhost:${BACKEND_PORT}`;
  }

  const host = hostUri.split(':')[0];
  return `http://${host}:${BACKEND_PORT}`;
}

export const BACKEND_URL = getBackendUrl();
