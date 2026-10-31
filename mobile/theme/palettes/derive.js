// Pressed-state tokens (direction B, section 7: fills step one shade darker),
// derived from each palette so they follow any palette swap.
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Plain sRGB channel interpolation from a towards b by t (0..1), uppercase hex.
export function mix(a, b, t) {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  const channels = ra.map((v, i) => Math.round(v + (rb[i] - v) * t).toString(16).padStart(2, '0'));
  return `#${channels.join('').toUpperCase()}`;
}

export function withDerived(p) {
  return {
    ...p,
    inkPressed: mix(p.ink, '#000000', 0.35),
    surfacePressed: mix(p.surface, p.ink, 0.08),
    tintPressed: mix(p.tint, p.ink, 0.08),
    fieldPressed: mix(p.field, p.ink, 0.12),
    accentPressed: mix(p.accent, p.ink, 0.10),
  };
}
