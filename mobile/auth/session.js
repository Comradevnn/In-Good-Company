import * as SecureStore from 'expo-secure-store';

// Session token lives in the phone's secure storage (Keychain / Keystore),
// so the user stays signed in across app restarts.
const TOKEN_KEY = 'session_token';

export async function saveSessionToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadSessionToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
