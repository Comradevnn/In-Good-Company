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

export const colors = withDerived(palettes[paletteName]);
