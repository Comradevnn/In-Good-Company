import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, Screen } from '../components/AppParts';
import { geocodePlace } from '../location/geocode';

// List a shift (plotline "orgListShift"). Times are in the org's local time.
const CAUSES = ['Food banks & shelters', 'Animal welfare', 'Environmental cleanups', 'Youth mentorship', 'Elder care', 'Community organizing'];

function inDays(n) {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function OrgShiftFormScreen({ sessionToken, onDone, onBack }) {
  const [title, setTitle] = useState('');
  const [cause, setCause] = useState(null);
  const [date, setDate] = useState(inDays(3));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('11:30');
  const [capacity, setCapacity] = useState('6');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
          title, cause_tags: [cause], date, start_time: start, end_time: end, capacity: Number(capacity), location_label: location || undefined, description,
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

  const field = (label, value, set, props = {}) => (
    <View style={[s.field, props.flex && { flex: 1 }]}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={set} placeholderTextColor={colors.inkSoft} {...props} />
    </View>
  );

  return (
    <Screen title="List a shift" onBack={onBack} footer={<PrimaryButton label="Publish shift" onPress={publish} disabled={!title || !cause || busy} loading={busy} />}>
      <Text style={s.eyebrow}>For organizations</Text>
      <Text style={s.h2}>List your shift</Text>
      <Text style={s.rationale}>This is what volunteers will see when they're matched to it.</Text>
      {field('Shift title', title, setTitle, { placeholder: 'Dog socializing' })}
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
      {field('Date (YYYY-MM-DD)', date, setDate)}
      <View style={s.row}>
        {field('Starts (HH:MM)', start, setStart, { flex: true })}
        {field('Ends (HH:MM)', end, setEnd, { flex: true })}
      </View>
      {field('Capacity (volunteers)', capacity, setCapacity, { keyboardType: 'number-pad' })}
      {field('Location', location, setLocation, { placeholder: 'Defaults to your org address' })}
      <View style={s.field}>
        <Text style={s.label}>Description</Text>
        <TextInput style={[s.input, s.textarea]} multiline value={description} onChangeText={setDescription} placeholder="What will volunteers actually be doing?" placeholderTextColor={colors.inkSoft} />
      </View>
      <ErrorText error={error} />
    </Screen>
  );
}
