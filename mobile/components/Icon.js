import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme/colors';

// Icon set for direction B: 24 grid, 2px round-cap stroke, no fill.
// icons:start
const ICONS = {
  'arrow-left': { paths: ['M19 12H5', 'M12 19l-7-7 7-7'] },
  'arrow-right': { paths: ['M5 12h14', 'M12 5l7 7-7 7'] },
  'arrow-up': { paths: ['M12 19V5', 'M5 12l7-7 7 7'] },
  'chevron-left': { paths: ['M15 6l-6 6 6 6'] },
  'chevron-right': { paths: ['M9 6l6 6-6 6'] },
  'chevron-down': { paths: ['M6 9l6 6 6-6'] },
  'chevron-up': { paths: ['M6 15l6-6 6 6'] },
  check: { paths: ['M5 12.5l4.5 4.5L19 7.5'] },
  close: { paths: ['M6 6l12 12', 'M18 6L6 18'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  minus: { paths: ['M5 12h14'] },
  calendar: { paths: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'] },
  clock: { circles: [[12, 12, 9]], paths: ['M12 7v5l3 2'] },
  sun: {
    circles: [[12, 12, 4]],
    paths: ['M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
  },
  person: { circles: [[12, 8, 4]], paths: ['M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1'] },
  people: {
    circles: [[9, 8, 3.5]],
    paths: ['M2.5 20v-.5A5.5 5.5 0 0 1 8 14h2a5.5 5.5 0 0 1 5.5 5.5v.5', 'M15.5 4.7a3.5 3.5 0 0 1 0 6.6', 'M18.2 14.3a5.5 5.5 0 0 1 3.3 5.2v.5'],
  },
  'shield-check': { paths: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z', 'M8.5 12l2.5 2.5 4.5-5'] },
  alert: { circles: [[12, 12, 9]], paths: ['M12 7.5v5.5', 'M12 16.5h.01'] },
  info: { circles: [[12, 12, 9]], paths: ['M12 11v5.5', 'M12 7.5h.01'] },
  coin: { circles: [[12, 12, 9], [12, 12, 4.5]], paths: [] },
  bell: { paths: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z', 'M10.3 21a2 2 0 0 0 3.4 0'] },
  chat: { paths: ['M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-4.9A8.5 8.5 0 1 1 21 11.5z'] },
  settings: { circles: [[16, 7, 2], [8, 17, 2]], paths: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10'] },
  'map-pin': { circles: [[12, 9.5, 2.5]], paths: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z'] },
  heart: { paths: ['M12 20s-8-4.6-8-10.2A4.5 4.5 0 0 1 12 7.4a4.5 4.5 0 0 1 8 2.4C20 15.4 12 20 12 20z'] },
  star: { paths: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z'] },
  search: { circles: [[11, 11, 7]], paths: ['M20 20l-4-4'] },
  edit: { paths: ['M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'] },
  camera: { circles: [[12, 13.5, 3.5]], paths: ['M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'] },
  upload: { paths: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'] },
  file: { paths: ['M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'] },
  lock: { paths: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V7.5a4 4 0 0 1 8 0V11'] },
  logout: { paths: ['M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4', 'M15 8l4 4-4 4', 'M19 12H9'] },
  flag: { paths: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'] },
  send: { paths: ['M21 3L3 10.5l7 3 3 7L21 3z', 'M10 13.5L21 3'] },
  'thumb-up': { paths: ['M3 10h4v11H3z', 'M7 10l4-7c1.7 0 2.7 1.4 2.4 3L13 10h6.1a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7'] },
  'thumb-down': { flip: true, paths: ['M3 10h4v11H3z', 'M7 10l4-7c1.7 0 2.7 1.4 2.4 3L13 10h6.1a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7'] },
};
// icons:end

export const ICON_NAMES = Object.keys(ICONS);

// Decorative by default; pass accessibilityLabel to expose it as an image.
export default function Icon({ name, size = 24, color = colors.ink, strokeWidth = 2, accessibilityLabel, style }) {
  const def = ICONS[name];
  if (!def) return null;
  const labelled = Boolean(accessibilityLabel);
  // Keep the stroke at least 2px on screen when the icon is drawn smaller than its 24 grid.
  const stroke = size < 24 ? (strokeWidth * 24) / size : strokeWidth;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={labelled ? accessibilityLabel : undefined}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      {(def.circles ?? []).map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} transform={def.flip ? 'translate(0 24) scale(1 -1)' : undefined} />
      ))}
      {def.paths.map((d) => (
        <Path key={d} d={d} transform={def.flip ? 'translate(0 24) scale(1 -1)' : undefined} />
      ))}
    </Svg>
  );
}
