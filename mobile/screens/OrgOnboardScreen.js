import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { Chip, ErrorText, Field, Headline, Input, LinkButton, ListRow, Screen } from '../components/AppParts';
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
      <Headline style={styles.headline}>Let's get to know you</Headline>
      <Text style={s.rationale}>A few basics so we can verify you're a real nonprofit. You'll list your first shift right after this.</Text>
      {[
        ['Organization name', name, setName, 'Your organization'],
        ['501(c)(3) or equivalent', registration, setRegistration, 'EIN / registration number'],
        ['Organization website', website, setWebsite, 'https://yourorg.org'],
      ].map(([label, value, set, placeholder]) => (
        <Input
          key={label}
          wrapperStyle={s.field}
          label={label}
          value={value}
          onChangeText={set}
          placeholder={placeholder}
          autoCapitalize={label.includes('website') ? 'none' : 'sentences'}
        />
      ))}
      <Input
        wrapperStyle={s.field}
        label="Where you are"
        value={location}
        onChangeText={(text) => { setLocation(text); setCoords(null); }}
        placeholder="Street address, neighborhood or city"
      />
      <ListRow
        style={styles.locate}
        icon={coords ? 'check' : 'map-pin'}
        label={coords ? 'Location found — shown to volunteers by distance' : 'Use my current location'}
        onPress={useCurrentLocation}
      />
      <Input
        wrapperStyle={s.field}
        label="What you do"
        multiline
        value={description}
        onChangeText={setDescription}
        placeholder="A sentence or two volunteers will see"
      />
      <Field label="Causes you work on" style={s.field}>
        <View style={styles.chips}>
          {CAUSES.map((c) => {
            const on = causes.includes(c);
            return <Chip key={c} label={c} selected={on} onPress={() => setCauses((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))} />;
          })}
        </View>
      </Field>
      <Field label="Liability waiver" style={s.field}>
        <Text style={[s.rationale, styles.waiverNote]}>Upload a photo of your own signed waiver, or use our default form.</Text>
        <WaiverPicker value={waiver} onChange={setWaiver} />
      </Field>
      <ErrorText error={error} />
      <LinkButton label="Log out" danger onPress={onLogOut} style={styles.logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headline: { marginBottom: 8 },
  locate: { marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  waiverNote: { marginTop: 0, marginBottom: 8 },
  logout: { marginTop: 16 },
});
