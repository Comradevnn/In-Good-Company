import { palettes } from './palettes';
import { withDerived } from './palettes/derive';

// Changing the app's colours is this one line (or EXPO_PUBLIC_PALETTE=<name> when starting Metro).
export const DEFAULT_PALETTE = 'calmTonalShade';

export function resolvePaletteName(requested) {
  if (requested && Object.prototype.hasOwnProperty.call(palettes, requested)) return requested;
  if (requested && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`Unknown palette "${requested}", using ${DEFAULT_PALETTE}.`);
  }
  return DEFAULT_PALETTE;
}

// Expo only inlines EXPO_PUBLIC_ variables written exactly like this.
export const paletteName = resolvePaletteName(process.env.EXPO_PUBLIC_PALETTE);

const active = withDerived(palettes[paletteName]);

// TEMPORARY (redesign in progress): old colour names mapped onto role tokens. Removed once every
// screen uses role tokens; do not use these in new code.
const LEGACY = {
  bg: active.paper,
  bgDeep: active.tint,
  inkSoft: active.ink2,
  moss: active.ink,
  mossDark: active.ink,
  mossTint: active.fieldTint,
  ochre: active.ink2, // mostly used as text colour, so a readable role rather than the pale accent
  ochreTint: active.accentTint,
  teal: active.ink2,
  tealTint: active.tint,
  line: active.edge,
};
export const LEGACY_COLOR_KEYS = Object.keys(LEGACY);

export const colors = { ...LEGACY, ...active };
