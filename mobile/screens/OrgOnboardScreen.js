import { useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, Screen } from '../components/AppParts';

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

  async function pickWaiver() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      setWaiver({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(sessionToken, '/orgs', {
        method: 'POST',
        body: { name, registration_number: registration, website, location_label: location, description, mission_tags: causes },
      });
      await api(sessionToken, '/orgs/mine/waiver', {
        method: 'POST',
        body: waiver === 'default' ? { use_default: true } : { mime: waiver.mime, data_base64: waiver.base64 },
      });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim() && registration.trim() && causes.length && waiver;
  return (
    <Screen footer={<PrimaryButton label="Continue" onPress={submit} disabled={!ready || busy} loading={busy} />}>
      <Text style={s.eyebrow}>For organizations</Text>
      <Text style={s.h2}>Let's get to know you</Text>
      <Text style={s.rationale}>A few basics so we can verify you're a real nonprofit. You'll list your first shift right after this.</Text>
      {[
        ['Organization name', name, setName, 'Your organization'],
        ['501(c)(3) or equivalent', registration, setRegistration, 'EIN / registration number'],
        ['Organization website', website, setWebsite, 'https://yourorg.org'],
        ['Where you are', location, setLocation, 'Neighborhood, city'],
      ].map(([label, value, set, placeholder]) => (
        <View key={label} style={s.field}>
          <Text style={s.label}>{label}</Text>
          <TextInput style={s.input} value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.inkSoft} autoCapitalize={label.includes('website') ? 'none' : 'sentences'} />
        </View>
      ))}
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
        <TouchableOpacity style={s.locateCard} onPress={pickWaiver}>
          {waiver && waiver !== 'default' ? (
            <>
              <Image source={{ uri: waiver.uri }} style={{ width: 120, height: 90, borderRadius: 8 }} />
              <Text style={[s.successText, { marginTop: 8 }]}>✓ Waiver uploaded — tap to replace</Text>
            </>
          ) : (
            <>
              <Text style={s.pin}>📄</Text>
              <Text style={[s.optionTitle, { marginTop: 8 }]}>Tap to upload a photo of your waiver</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleRow]} onPress={() => setWaiver(waiver === 'default' ? null : 'default')}>
          <Text style={s.toggleLabel}>Use the platform's default waiver instead</Text>
          <View style={[s.switchTrack, waiver === 'default' && s.switchTrackOn]}><View style={[s.switchThumb, waiver === 'default' && s.switchThumbOn]} /></View>
        </TouchableOpacity>
      </View>
      <ErrorText error={error} />
      <Text style={{ marginTop: 22, textAlign: 'center', color: colors.danger, fontFamily: 'Inter_600SemiBold' }} onPress={onLogOut}>Log out</Text>
    </Screen>
  );
}
