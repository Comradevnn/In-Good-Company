import { useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, Screen } from '../components/AppParts';
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

  const pickerButton = (label, value, which, flex) => (
    <View style={[s.field, flex && { flex: 1 }]}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.input} onPress={() => setPicker(picker === which ? null : which)}>
        <Text style={{ fontFamily: 'Inter_400Regular', color: colors.ink }}>{value}</Text>
      </TouchableOpacity>
    </View>
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
      <Text style={s.eyebrow}>For organizations</Text>
      <Text style={s.h2}>List your shift</Text>
      <Text style={s.rationale}>This is what volunteers will see when they're matched to it.</Text>

      <View style={s.field}>
        <Text style={s.label}>Shift title</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Dog socializing" placeholderTextColor={colors.inkSoft} maxLength={100} />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Cause area</Text>
        <View style={s.chipGrid}>
          {CAUSES.map((c) => (
            <TouchableOpacity key={c} style={[s.chip, cause === c && s.chipSelected]} onPress={() => setCause(c)}>
              <Text style={[s.chipText, cause === c && s.chipTextSelected]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {pickerButton('Date', date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), 'date')}
      {picker === 'date' ? (
        <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={today} onChange={onPick('date')} />
      ) : null}
      {problems.date ? <Text style={s.errorText}>{problems.date}</Text> : null}

      <View style={s.row}>
        {pickerButton('Starts', timeLabel(start), 'start', true)}
        {pickerButton('Ends', timeLabel(end), 'end', true)}
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
      {problems.times ? <Text style={s.errorText}>{problems.times}</Text> : null}
      {!problems.times && !daytime ? (
        <Text style={[s.rationale, { marginTop: 8 }]}>This runs outside daytime hours. That's fine — daytime shifts just get a small tag volunteers can see.</Text>
      ) : null}

      <View style={s.field}>
        <Text style={s.label}>Capacity (volunteers)</Text>
        <TextInput style={s.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={3} placeholderTextColor={colors.inkSoft} />
        {problems.capacity ? <Text style={s.errorText}>{problems.capacity}</Text> : null}
      </View>
      <View style={s.field}>
        <Text style={s.label}>Location</Text>
        <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Leave blank to use your org's address" placeholderTextColor={colors.inkSoft} maxLength={100} />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Description</Text>
        <TextInput style={[s.input, s.textarea]} multiline value={description} onChangeText={setDescription} placeholder="What will volunteers actually be doing?" placeholderTextColor={colors.inkSoft} maxLength={1000} />
      </View>
      <ErrorText error={error} />
    </Screen>
  );
}
