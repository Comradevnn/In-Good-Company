import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font, touch, type } from '../theme/tokens';
import Icon from './Icon';
import { addDays, CALENDAR_DAYS, dayLabel, monthGrid, monthTitle, WEEKDAY_NAMES } from '../screens/availabilityPrefill';
import { formatDate, parseDate } from '../screens/dates';

// A month grid for picking the date range of a search: tap a start day, then an end day (a third tap
// starts over). Under each day a small mark says how a search for that day looks, as the server
// reports it, and nothing else about other people. The marks differ in shape as well as colour, and
// every day carries a spoken label.
const DOT_KINDS = {
  green: { label: 'Good chance', spoken: 'good chance', color: () => colors.success, shape: 'round' },
  yellow: { label: 'Spots, but filling up or no partner yet', spoken: 'spots, but filling up or no partner yet', color: () => colors.caution, shape: 'diamond' },
  red: { label: 'Nothing that fits yet', spoken: 'nothing that fits yet', color: () => colors.danger, shape: 'square' },
};
const HEADER_DAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => WEEKDAY_NAMES[d]);
const DOT = 8;

function Dot({ kind, size = DOT }) {
  const k = DOT_KINDS[kind];
  const shape = k.shape === 'round'
    ? { borderRadius: size / 2 }
    : k.shape === 'diamond'
      ? { transform: [{ rotate: '45deg' }, { scale: 0.85 }], borderRadius: 1 }
      : { borderRadius: 1 };
  return <View style={[{ width: size, height: size, backgroundColor: k.color() }, shape]} />;
}

// A dot on a small surface-coloured backing so it reads on any day fill.
function BackedDot({ kind }) {
  return (
    <View style={styles.dotBacking}>
      <Dot kind={kind} />
    </View>
  );
}

// start/end: YYYY-MM-DD. today: Date at local midnight. weekdays: chosen day numbers (empty = any).
// dots: { 'YYYY-MM-DD': 'green' | 'yellow' | 'red' } (may be empty). loadFailed: show the grid without marks.
export default function AvailabilityCalendar({ start, end, today, weekdays, dots, loadFailed, onPickDay }) {
  const first = formatDate(today);
  const last = formatDate(addDays(today, CALENDAR_DAYS - 1));
  const firstMonth = today.getFullYear() * 12 + today.getMonth();
  const lastDate = parseDate(last);
  const lastMonth = lastDate.getFullYear() * 12 + lastDate.getMonth();
  const startDate = parseDate(start);
  const [shown, setShown] = useState(() => Math.min(Math.max(startDate.getFullYear() * 12 + startDate.getMonth(), firstMonth), lastMonth));
  const clampMonth = (d) => Math.min(Math.max(d.getFullYear() * 12 + d.getMonth(), firstMonth), lastMonth);
  useEffect(() => { setShown(clampMonth(parseDate(start))); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = Math.floor(shown / 12);
  const month = shown % 12;
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);

  function renderDay(day, index) {
    if (!day) return <View key={`pad-${index}`} style={styles.cell} />;
    const date = parseDate(day);
    const num = date.getDate();
    const disabled = day < first || day > last;
    const isEdge = day === start || day === end;
    const inRange = day > start && day < end;
    const muted = !disabled && weekdays.length > 0 && !weekdays.includes(date.getDay());
    const rawKind = !disabled && !muted ? dots?.[day] : null;
    const kind = rawKind && Object.prototype.hasOwnProperty.call(DOT_KINDS, rawKind) ? rawKind : null;
    const parts = [dayLabel(day)];
    if (disabled) parts.push(day < first ? 'passed' : 'too far ahead');
    else {
      if (muted) parts.push('not one of your free days');
      else if (kind) parts.push(DOT_KINDS[kind].spoken);
      if (day === start && day === end) parts.push('start and end date');
      else if (day === start) parts.push('start date');
      else if (day === end) parts.push('end date');
      else if (inRange) parts.push('in your dates');
    }
    return (
      <Pressable
        key={day}
        disabled={disabled}
        onPress={() => onPickDay(day)}
        accessibilityRole="button"
        accessibilityLabel={parts.join(', ')}
        accessibilityState={{ selected: isEdge || inRange, disabled }}
        style={styles.cell}
      >
        {({ pressed }) => (
          <View style={[styles.dayInner, inRange && styles.inRange, isEdge && styles.edge, pressed && !disabled && !isEdge && { backgroundColor: colors.tintPressed }]}>
            <Text style={[styles.num, (disabled || muted) && styles.numOff, isEdge && styles.numEdge]}>{num}</Text>
            <View style={styles.dotSlot}>
              {kind ? <BackedDot kind={kind} /> : null}
            </View>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => setShown(shown - 1)}
          disabled={shown <= firstMonth}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: shown <= firstMonth }}
          style={[styles.nav, shown <= firstMonth && styles.navOff]}
        >
          <Icon name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.month} accessibilityRole="header">{monthTitle(year, month)}</Text>
        <Pressable
          onPress={() => setShown(shown + 1)}
          disabled={shown >= lastMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: shown >= lastMonth }}
          style={[styles.nav, shown >= lastMonth && styles.navOff]}
        >
          <Icon name="chevron-right" size={24} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.weekRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {HEADER_DAYS.map((name) => (
          <Text key={name} style={styles.headerCell}>{name.slice(0, 1)}</Text>
        ))}
      </View>
      {weeks.map((week, i) => (
        <View key={`${year}-${month}-${i}`} style={styles.weekRow}>
          {week.map(renderDay)}
        </View>
      ))}

      {loadFailed ? (
        <Text style={styles.note}>We couldn't check how busy each day is just now. You can still pick your dates.</Text>
      ) : (
        <View style={styles.legend}>
          {Object.entries(DOT_KINDS).map(([kind, k]) => (
            <View key={kind} style={styles.legendItem}>
              <Dot kind={kind} />
              <Text style={styles.legendText}>{k.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  month: { ...type.subtitle, color: colors.ink, flexShrink: 1, textAlign: 'center' },
  nav: {
    width: touch.min, height: touch.min, borderRadius: touch.min / 2, borderWidth: 2, borderColor: colors.ink,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  navOff: { borderColor: colors.offBg, opacity: 0.5 },
  weekRow: { flexDirection: 'row' },
  headerCell: { flex: 1, textAlign: 'center', ...type.caption, color: colors.ink2, paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 0.85, minHeight: touch.min, padding: 1 },
  dayInner: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inRange: { backgroundColor: colors.selected },
  edge: { backgroundColor: colors.ink },
  num: { fontFamily: font.textBold, fontSize: 16, lineHeight: 22, color: colors.ink },
  numOff: { color: colors.ink3 },
  numEdge: { color: colors.onInk },
  dotBacking: { backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 2 },
  dotSlot: { height: 12, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  legend: { marginTop: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { ...type.caption, color: colors.ink2, flexShrink: 1 },
  note: { ...type.bodyS, color: colors.ink2, marginTop: 12 },
});
