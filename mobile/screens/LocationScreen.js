import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';

// Matches the "location" screen in specs/plotline.html: locate-card +
// manual fallback. Auto-detect uses real device geolocation (expo-location)
// and stores lat/lng. The manual fallback here is a plain city text field
// rather than plotline's full state/city dropderown dataset — there's no
// geocoding step to turn a typed city into coordinates either way, so a
// manual entry only ever sets location_city, never lat/lng.
export default function LocationScreen({ sessionToken, step, total, onNext, initialValues, title, onBack }) {
  const hasSavedCoords = initialValues?.location_lat != null && initialValues?.location_lng != null;

  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(
    hasSavedCoords
      ? { lat: initialValues.location_lat, lng: initialValues.location_lng, label: 'Previously saved location' }
      : null
  ); // { lat, lng, label } | null
  const [manualCity, setManualCity] = useState(!hasSavedCoords ? initialValues?.location_city ?? '' : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDetect() {
    setError(null);
    setDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied — use the manual field below instead.');
      }
      const position = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const label = place ? [place.city, place.region].filter(Boolean).join(', ') : 'Location detected';
      setDetected({ lat: position.coords.latitude, lng: position.coords.longitude, label });
    } catch (err) {
      setError(err.message);
    } finally {
      setDetecting(false);
    }
  }

  const canSubmit = (detected || manualCity.trim().length > 0) && !submitting;

  async function handleContinue() {
    setError(null);
    setSubmitting(true);
    try {
      const fields = detected
        ? { location_lat: detected.lat, location_lng: detected.lng }
        : { location_city: manualCity.trim() };
      const updated = await patchProfile(sessionToken, fields);
      onNext(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.container}>
      <OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {step != null ? <Text style={s.eyebrow}>Step {step} of {total}</Text> : null}
        <Text style={s.h2}>Where are you volunteering?</Text>
        <Text style={s.rationale}>
          We use this to find nearby shifts and match you with someone close enough that
          getting there is easy — nothing else.
        </Text>

        <View style={s.locateCard}>
          <Text style={s.pin}>📍</Text>
          <Text style={{ fontFamily: 'Inter_600SemiBold', marginTop: 6, color: colors.ink }}>
            {detected ? detected.label : detecting ? 'Detecting…' : 'Use my current location'}
          </Text>
          <Text style={[s.rationale, { marginTop: 2 }]} onPress={handleDetect}>
            {detected ? 'Tap to re-detect' : 'Tap to detect from your device'}
          </Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Or enter your city manually</Text>
          <TextInput
            style={s.input}
            placeholder="San Jose, CA"
            placeholderTextColor={colors.inkSoft}
            value={manualCity}
            onChangeText={(text) => {
              setManualCity(text);
              if (text) setDetected(null);
            }}
          />
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
      <PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} />
    </View>
  );
}
