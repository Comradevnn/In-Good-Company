import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';
import { detectLocation, geocodePlace } from '../location/geocode';

// Matches the "location" screen in specs/plotline.html: locate-card +
// manual fallback. Auto-detect uses device geolocation (expo-location) and
// stores lat/lng plus the reverse-geocoded city. The manual fallback is a
// plain city field (not plotline's full state/city dropdown dataset); a typed
// city is geocoded to coordinates too, so the travel-distance limit applies.
// If geocoding finds nothing, the city is saved alone and the user is told
// distance limits won't apply until a location is detected.
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
  const [geocodeWarned, setGeocodeWarned] = useState(false);
  const [error, setError] = useState(null);

  async function handleDetect() {
    setError(null);
    setDetecting(true);
    try {
      setDetected(await detectLocation());
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
      let fields;
      if (detected) {
        fields = { location_lat: detected.lat, location_lng: detected.lng };
        if (detected.label && detected.label !== 'Previously saved location' && detected.label !== 'Location detected') {
          fields.location_city = detected.label;
        }
      } else {
        const coords = await geocodePlace(manualCity);
        fields = { location_city: manualCity.trim(), location_lat: coords?.lat ?? null, location_lng: coords?.lng ?? null };
        if (!coords && !geocodeWarned) {
          // Tell them once, then let them continue with the city alone.
          setGeocodeWarned(true);
          setError("We couldn't place that city on a map, so distance limits won't apply until you detect your location. Tap Continue again to save it anyway.");
          return;
        }
      }
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
