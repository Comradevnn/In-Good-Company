import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { font } from '../theme/tokens';
import { lensFor, onPersonColor, personKeyFor } from '../theme/people';
import Icon from './Icon';

// The signature move of direction B: a person is a flat disc in their own colour, and where two
// discs overlap a solid pre-mixed lens holds the shift. Geometry per design-candidates/B/direction.md.

const decorative = { accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true };

function resolveKey({ personKey, userId, meId }) {
  if (personKey) return personKey;
  if (userId != null) return personKeyFor(userId, meId);
  return 'person1';
}

// A solid disc: your own shows a person icon, everyone else an ink initial. ring draws a 3px ring.
export function PersonDisc({ size = 48, personKey, userId, meId, initial, ring = false, style, accessibilityLabel }) {
  const key = resolveKey({ personKey, userId, meId });
  const label = accessibilityLabel ? { accessible: true, accessibilityRole: 'image', accessibilityLabel } : decorative;
  return (
    <View
      {...label}
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[key] },
        ring && { borderWidth: 3, borderColor: colors.ring },
        style,
      ]}
    >
      {key === 'you' ? (
        <Icon name="person" size={Math.round(size * 0.5)} color={onPersonColor(key)} />
      ) : (
        <Text allowFontScaling={false} style={[styles.initial, { fontSize: size * 0.42, lineHeight: size * 0.5, color: onPersonColor(key) }]}>
          {String(initial ?? '?').slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

// Overlapping pair: discs of radius r whose centres are d apart, with the lens between them.
// children sit over the lens as ordinary views, so text scales and stays accessible; leftContent and
// rightContent sit on the visible part of each disc. Pass meId and partnerId to take the colours from
// the people palette instead of colourA, colourB and lens, or partnerKey (a person key such as
// 'person1') when there is no partner id to hash.
export function DiscPair({
  r = 60, d = 70, colourA, colourB, lens, meId, partnerId, partnerKey, ring = false,
  youIcon = false, initial, leftContent, rightContent, children, style, accessibilityLabel,
}) {
  let a = colourA;
  let b = colourB;
  let l = lens;
  if (partnerKey || (meId != null && partnerId != null)) {
    const keyA = 'you';
    const keyB = partnerKey ?? personKeyFor(partnerId, meId);
    a = a ?? colors[keyA];
    b = b ?? colors[keyB];
    l = l ?? lensFor(keyA, keyB);
  }
  a = a ?? colors.you;
  b = b ?? colors.person1;
  l = l ?? colors.lens1;

  const dist = Math.min(d, 2 * r - 2);
  const width = dist + 2 * r;
  const height = 2 * r;
  const cy = r;
  const mx = r + dist / 2;
  const h = Math.sqrt(r * r - (dist / 2) * (dist / 2));
  const lensWidth = 2 * r - dist;
  const lensPath = `M ${mx},${cy - h} A ${r} ${r} 0 0 0 ${mx},${cy + h} A ${r} ${r} 0 0 0 ${mx},${cy - h} Z`;
  // The stroke is centred on the circle's edge, so a ringed circle is drawn 1.5 smaller to keep the
  // whole ring inside the Svg bounds. The lens path stays on the full r.
  const ringProps = ring ? { stroke: colors.ring, strokeWidth: 3 } : {};
  const discR = ring ? r - 1.5 : r;
  const iconSize = Math.round(Math.min(r * 0.45, dist * 0.55));
  const label = accessibilityLabel ? { accessible: true, accessibilityRole: 'image', accessibilityLabel } : {};
  const hide = accessibilityLabel ? {} : decorative;

  return (
    <View style={[{ width, height }, style]} {...label}>
      <View style={StyleSheet.absoluteFill} {...hide}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Circle cx={r} cy={cy} r={discR} fill={a} {...ringProps} />
          <Circle cx={r + dist} cy={cy} r={discR} fill={b} {...ringProps} />
          <Path d={lensPath} fill={l} />
        </Svg>
      </View>
      {leftContent || youIcon ? (
        <View style={[styles.slot, { left: 0, top: 0, width: dist, height }]}>
          {leftContent ?? <Icon name="person" size={iconSize} color={colors.onYou} />}
        </View>
      ) : null}
      {rightContent || initial ? (
        <View style={[styles.slot, { left: 2 * r, top: 0, width: dist, height }]}>
          {rightContent ?? (
            <Text allowFontScaling={false} style={[styles.initial, { fontSize: iconSize, lineHeight: iconSize * 1.2, color: colors.ink }]}>
              {String(initial).slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
      ) : null}
      {children ? (
        <View style={[styles.slot, { left: mx - (lensWidth * 0.9) / 2, top: cy - h, width: lensWidth * 0.9, height: 2 * h }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

// The expired state: the same two discs pushed apart (A top left, B bottom right), with a dashed ring
// where the shift was. dx and dy default to the comp's proportions.
export function DiscPairApart({
  r = 80, dx = r * 2.17, dy = r * 1.52, colourA, colourB, meId, partnerId, emptyRing = true, ringColor, style, accessibilityLabel,
}) {
  let a = colourA;
  let b = colourB;
  if (meId != null && partnerId != null) {
    a = a ?? colors.you;
    b = b ?? colors[personKeyFor(partnerId, meId)];
  }
  a = a ?? colors.you;
  b = b ?? colors.person1;
  const width = dx + 2 * r;
  const height = dy + 2 * r;
  const label = accessibilityLabel ? { accessible: true, accessibilityRole: 'image', accessibilityLabel } : decorative;
  return (
    <View style={[{ width, height }, style]} {...label}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Circle cx={r} cy={r} r={r} fill={a} />
        <Circle cx={r + dx} cy={r + dy} r={r} fill={b} />
        {emptyRing ? (
          <Circle
            cx={r + dx / 2}
            cy={r + dy / 2}
            r={r * 0.26}
            fill="none"
            stroke={ringColor ?? colors.emptyRing}
            strokeWidth={4}
            strokeDasharray="3 10"
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
    </View>
  );
}

// Groups of three or more: discs overlapping by 16 with a 3px ring and no lens.
// people: [{ userId, name } | { personKey, name }]; meId picks the signed-in user's own colour.
export function DiscRow({ people = [], size = 48, meId, style }) {
  return (
    <View style={[styles.row, style]} {...decorative}>
      {people.map((p, i) => (
        <PersonDisc
          key={p.userId ?? p.personKey ?? i}
          size={size}
          personKey={p.personKey}
          userId={p.userId}
          meId={meId}
          initial={p.name ?? p.initial}
          ring
          style={i > 0 ? { marginLeft: -16 } : null}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: font.black, textAlign: 'center', includeFontPadding: false },
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
