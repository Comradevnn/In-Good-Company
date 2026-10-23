import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, touch, type } from '../theme/tokens';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { Chip, ErrorLine, ErrorText, Field, Headline, Icon, Input, Screen } from '../components/AppParts';
import { geocodePlace } from '../location/geocode';

// List a shift (plotline "orgListShift"). Date and times come from native
// pickers in the org's local time; the form checks what the backend checks
// (future date, end after start, sensible capacity) before submitting.
const CAUSES = ['Food banks & shelters', 'Animal welfare', 'Environmental cleanups', 'Youth mentorship', 'Elder care', 'Community organizing'];
const DAYTIME_START_HOUR = 7;
const DAYTIME_END_HOUR = 19;

const pad = (n) => String(n).padStart(2, '0');
// Local calendar day / wall-clock time — never toISOString(), which is UTC.
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (base, hours, minutes) => {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
};
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

export default function OrgShiftFormScreen({ sessionToken, onDone, onBack }) {
  const inThreeDays = new Date(Date.now() + 3 * 86400000);
  const [title, setTitle] = useState('');
  const [cause, setCause] = useState(null);
  const [date, setDate] = useState(inThreeDays);
  const [start, setStart] = useState(at(inThreeDays, 9, 0));
  const [end, setEnd] = useState(at(inThreeDays, 11, 30));
  const [picker, setPicker] = useState(null); // 'date' | 'start' | 'end' | null
  const [capacity, setCapacity] = useState('6');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const capacityNumber = Number(capacity);
  const problems = {
    date: date < today ? 'Pick a date in the future.' : null,
    times: minutesOf(end) <= minutesOf(start) ? 'The shift must end after it starts.' : null,
    capacity: !Number.isInteger(capacityNumber) || capacityNumber < 1 || capacityNumber > 500 ? 'Capacity must be a whole number from 1 to 500.' : null,
  };
  const daytime = minutesOf(start) >= DAYTIME_START_HOUR * 60 && minutesOf(end) <= DAYTIME_END_HOUR * 60;
  const valid = title.trim() && cause && !problems.date && !problems.times && !problems.capacity;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      // A different shift location is placed on the map; otherwise the
      // shift inherits the org's own coordinates (server side).
      const where = location.trim() ? await geocodePlace(location) : null;
      if (location.trim() && !where) throw new Error("We couldn't find that shift location on a map — check it, or leave it blank to use your org's address.");
      await api(sessionToken, '/orgs/mine/shifts', {
        method: 'POST',
        body: {
          title: title.trim(), cause_tags: [cause], date: ymd(date), start_time: hm(start), end_time: hm(end), capacity: capacityNumber,
          location_label: location.trim() || undefined, description,
          ...(where ? { location_lat: where.lat, location_lng: where.lng } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const pickerButton = (label, value, which, flex, icon, error) => (
    <Field label={label} style={[s.field, flex && { flex: 1 }]}>
      <Pressable
        style={({ pressed }) => [styles.pickerField, error && styles.pickerFieldError, pressed && { backgroundColor: colors.surfacePressed }]}
        onPress={() => setPicker(picker === which ? null : which)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ expanded: picker === which }}
      >
        <Text style={styles.pickerValue}>{value}</Text>
        <Icon name={icon} size={24} color={colors.ink} />
      </Pressable>
    </Field>
  );
  const onPick = (which) => (_, picked) => {
    if (Platform.OS !== 'ios') setPicker(null);
    if (!picked) return;
    if (which === 'date') {
      setDate(picked);
      setStart(at(picked, start.getHours(), start.getMinutes()));
      setEnd(at(picked, end.getHours(), end.getMinutes()));
    } else if (which === 'start') setStart(at(date, picked.getHours(), picked.getMinutes()));
    else setEnd(at(date, picked.getHours(), picked.getMinutes()));
  };
  const timeLabel = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen title="List a shift" onBack={onBack} footer={<PrimaryButton label="Publish shift" onPress={publish} disabled={!valid || busy} loading={busy} />}>
      <Headline>List your shift</Headline>
      <Text style={[s.rationale, { marginTop: 8 }]}>This is what volunteers will see when they're matched to it.</Text>

      <Input wrapperStyle={s.field} label="Shift title" value={title} onChangeText={setTitle} placeholder="Dog socializing" maxLength={100} />
      <Field label="Cause area" style={s.field}>
        <View style={styles.chips}>
          {CAUSES.map((c) => (
            <Chip key={c} label={c} selected={cause === c} onPress={() => setCause(c)} />
          ))}
        </View>
      </Field>

      {pickerButton('Date', date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), 'date', false, 'calendar', problems.date)}
      {picker === 'date' ? (
        <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={today} onChange={onPick('date')} />
      ) : null}
      <ErrorLine message={problems.date} style={styles.problem} />

      <View style={s.row}>
        {pickerButton('Starts', timeLabel(start), 'start', true, 'clock', problems.times)}
        {pickerButton('Ends', timeLabel(end), 'end', true, 'clock', problems.times)}
      </View>
      {picker === 'start' || picker === 'end' ? (
        <DateTimePicker
          value={picker === 'start' ? start : end}
          mode="time"
          minuteInterval={15}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPick(picker)}
        />
      ) : null}
      <ErrorLine message={problems.times} style={styles.problem} />
      {!problems.times && !daytime ? (
        <Text style={[s.rationale, { marginTop: 8 }]}>This runs outside daytime hours. That's fine — daytime shifts just get a small tag volunteers can see.</Text>
      ) : null}

      <Input
        wrapperStyle={s.field}
        label="Capacity (volunteers)"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="number-pad"
        maxLength={3}
        error={problems.capacity}
      />
      <Input wrapperStyle={s.field} label="Location" value={location} onChangeText={setLocation} placeholder="Leave blank to use your org's address" maxLength={100} />
      <Input
        wrapperStyle={s.field}
        label="Description"
        multiline
        value={description}
        onChangeText={setDescription}
        placeholder="What will volunteers actually be doing?"
        maxLength={1000}
      />
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerField: {
    height: touch.field,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: radii.field,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  pickerFieldError: { borderColor: colors.danger, backgroundColor: colors.dangerTint },
  pickerValue: { ...type.fieldValue, color: colors.ink, flexShrink: 1 },
  problem: { marginTop: 10 },
});
