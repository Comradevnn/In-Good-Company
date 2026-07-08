import { BACKEND_URL } from '../config/api';

// PATCHes the logged-in user's profile with whatever fields the calling
// screen collected. Throws with the backend's error message on failure.
export async function patchProfile(sessionToken, fields) {
  const response = await fetch(`${BACKEND_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(fields),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong saving that.');
  }
  return data;
}
