import { colors } from './colors';

// Person and overlap colours, derived on the client from user ids (nothing is stored per user).
export const PERSON_KEYS = ['person1', 'person2', 'person3'];

// FNV-1a 32-bit, so the same id gets the same colour on every device.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function personKeyFor(userId, meId) {
  if (userId != null && String(userId) === String(meId)) return 'you';
  return PERSON_KEYS[hash(String(userId ?? '')) % PERSON_KEYS.length];
}

export const personColorFor = (userId, meId) => colors[personKeyFor(userId, meId)];

// Your disc carries a white icon; everyone else's carries an ink initial.
export const onPersonColor = (key) => (key === 'you' ? colors.onYou : colors.ink);

const LENS_FOR_PERSON = { person1: 'lens1', person2: 'lens2', person3: 'lens3' };

function lensKey(keyA, keyB) {
  const other = keyA === 'you' ? keyB : keyB === 'you' ? keyA : null;
  return LENS_FOR_PERSON[other] || 'lensOthers';
}

export const lensFor = (keyA, keyB) => colors[lensKey(keyA, keyB)];
export const onLensFor = (keyA, keyB) => (lensKey(keyA, keyB) === 'lensOthers' ? colors.ink : colors.onLens);
