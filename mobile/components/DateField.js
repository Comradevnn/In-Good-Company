import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { font, touch, type } from '../theme/tokens';
import Icon from './Icon';
import { ErrorLine } from './Controls';
import { formatDate, parseDate } from '../screens/dates';

// A form field that picks a calendar day with the native date picker instead
// of free typing, so the value is always a real YYYY-MM-DD date. Android opens
// its dialog; iOS shows a wheel under the field (better than the inline
// calendar for dates years away, like a date of birth) with a Done link.
// `value` is a YYYY-MM-DD string, or '' when nothing is picked yet; the wheel
// then starts at `initialDate`. An optional `error` message gives the field its error chrome.
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-14" -> "Sat, Nov 14" (the person's own calendar day, no timezone shift), or with
// `withYear` -> "Nov 14, 2026" for dates where the year is the point (a date of birth, an
// ID's expiry). Anything that is not a real YYYY-MM-DD comes back unchanged.
export function readableDate(value, { withYear = false } = {}) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = parseDate(value);
  if (Number.isNaN(d.getTime()) || formatDate(d) !== value) return value;
  if (withYear) return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${SHORT_DAYS[d.getDay()]}, ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function DateField({ label, value, onChange, placeholder = 'Choose a date', initialDate, minimumDate, maximumDate, error, showYear = false }) {
  const [open, setOpen] = useState(false);
  const shown = value ? readableDate(value, { withYear: showYear }) : '';
  const current = value ? parseDate(value) : (initialDate ?? new Date());

  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [
          s.input,
          styles.field,
          error && { borderColor: colors.danger, backgroundColor: colors.dangerTint },
          pressed && !error && { backgroundColor: colors.surfacePressed },
        ]}
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown || placeholder}`}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[value ? type.fieldValue : { fontFamily: font.textMedium, fontSize: 17 }, { color: value ? colors.ink : colors.ink3, flexShrink: 1 }]}
        >
          {shown || placeholder}
        </Text>
        <Icon name={error ? 'alert' : 'calendar'} size={24} color={error ? colors.danger : value ? colors.ink : colors.ink3} />
      </Pressable>
      {error ? <ErrorLine message={error} style={{ marginTop: 10 }} /> : null}
      {open ? (
        <>
          <DateTimePicker
            value={current}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_, date) => {
              if (Platform.OS !== 'ios') setOpen(false);
              if (date) onChange(formatDate(date));
            }}
            onDismiss={() => setOpen(false)}
          />
          {Platform.OS === 'ios' ? (
            <Text style={styles.done} accessibilityRole="button" onPress={() => {
              // A wheel left untouched never fires onValueChange; Done keeps the date it shows.
              if (!value) onChange(formatDate(current));
              setOpen(false);
            }}>
              Done
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Grows past 56 rather than clipping when the text is large; the value shrinks to one line first.
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, height: undefined, minHeight: touch.field },
  done: {
    fontFamily: font.textBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'right',
    textDecorationLine: 'underline',
    paddingVertical: 13,
  },
});
