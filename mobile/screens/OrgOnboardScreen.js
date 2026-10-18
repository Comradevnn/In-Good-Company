import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, Screen } from '../components/AppParts';
import { detectLocation, geocodePlace } from '../location/geocode';
import WaiverPicker, { waiverBody } from '../components/WaiverPicker';

// Org onboarding (plotline "orgOnboard"): the basics we need to verify a
// nonprofit, the causes it works on, and its liability waiver / consent
// form — a photo of its own, or the platform default. Shifts can be listed
// right away but stay hidden from volunteers until the org is verified.
const CAUSES = ['Food banks & shelters', 'Animal welfare', 'Environmental cleanups', 'Youth mentorship', 'Elder care', 'Community organizing'];

export default function OrgOnboardScreen({ sessionToken, onDone, onLogOut }) {
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [causes, setCauses] = useState([]);
  const [waiver, setWaiver] = useState(null); // { uri, base64, mime } | 'default'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null); // { lat, lng } — needed so travel distance applies
  // Set once the org row exists, so a failed waiver upload retries only that step.
  const [orgCreated, setOrgCreated] = useState(false);

  async function useCurrentLocation() {
    setError(null);
    try {
      const found = await detectLocation();
      setCoords({ lat: found.lat, lng: found.lng });
      if (!location.trim() && found.label) setLocation(found.label);
    } catch (err) {
      setError(err);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!orgCreated) {
        const where = coords ?? await geocodePlace(location);
        if (!where) {
          throw new Error("We couldn't find that location on a map. Check the spelling, or tap \"Use my current location\".");
        }
        setCoords(where);
        try {
          await api(sessionToken, '/orgs', {
            method: 'POST',
            body: {
              name, registration_number: registration, website: website.trim() || undefined, location_label: location, description, mission_tags: causes,
              location_lat: where.lat, location_lng: where.lng,
            },
          });
        } catch (err) {
          if (err.status !== 409) throw err; // 409: created on an earlier try
        }
        setOrgCreated(true);
      }
      await api(sessionToken, '/orgs/mine/waiver', { method: 'POST', body: waiverBody(waiver) });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim() && registration.trim() && location.trim() && causes.length && waiver;
  return (
    <Screen footer={<PrimaryButton label="Continue" onPress={submit} disabled={!ready || busy} loading={busy} />}>
      <Text style={s.eyebrow}>For organizations</Text>
      <Text style={s.h2}>Let's get to know you</Text>
      <Text style={s.rationale}>A few basics so we can verify you're a real nonprofit. You'll list your first shift right after this.</Text>
      {[
        ['Organization name', name, setName, 'Your organization'],
        ['501(c)(3) or equivalent', registration, setRegistration, 'EIN / registration number'],
        ['Organization website', website, setWebsite, 'https://yourorg.org'],
      ].map(([label, value, set, placeholder]) => (
        <View key={label} style={s.field}>
          <Text style={s.label}>{label}</Text>
          <TextInput style={s.input} value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.inkSoft} autoCapitalize={label.includes('website') ? 'none' : 'sentences'} />
        </View>
      ))}
      <View style={s.field}>
        <Text style={s.label}>Where you are</Text>
        <TextInput
          style={s.input}
          value={location}
          onChangeText={(text) => { setLocation(text); setCoords(null); }}
          placeholder="Street address, neighborhood or city"
          placeholderTextColor={colors.inkSoft}
        />
        <TouchableOpacity onPress={useCurrentLocation}>
          <Text style={[s.label, { marginTop: 8, color: colors.mossDark }]}>
            {coords ? '✓ Location found — shown to volunteers by distance' : 'Use my current location ›'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={s.field}>
        <Text style={s.label}>What you do</Text>
        <TextInput style={[s.input, s.textarea]} multiline value={description} onChangeText={setDescription} placeholder="A sentence or two volunteers will see" placeholderTextColor={colors.inkSoft} />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Causes you work on</Text>
        <View style={s.chipGrid}>
          {CAUSES.map((c) => {
            const on = causes.includes(c);
            return (
              <TouchableOpacity key={c} style={[s.chip, on && s.chipSelected]} onPress={() => setCauses((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}>
                <Text style={[s.chipText, on && s.chipTextSelected]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={s.field}>
        <Text style={s.label}>Liability waiver</Text>
        <Text style={[s.rationale, { marginTop: 0, marginBottom: 8 }]}>Upload a photo of your own signed waiver, or use our default form.</Text>
        <WaiverPicker value={waiver} onChange={setWaiver} />
      </View>
      <ErrorText error={error} />
      <Text style={{ marginTop: 22, textAlign: 'center', color: colors.danger, fontFamily: 'Inter_600SemiBold' }} onPress={onLogOut}>Log out</Text>
    </Screen>
  );
}
