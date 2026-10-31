import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';
import { Headline, Icon, Input, KeyboardScroll } from '../components/AppParts';
import PrimaryButton from '../components/PrimaryButton';
import { patchProfile } from '../auth/api';
import { detectLocation, geocodePlace } from '../location/geocode';

// Locate card + manual fallback. Auto-detect uses device geolocation (expo-location) and
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
      <KeyboardScroll
        header={<OnboardingTopBar step={step} total={total} title={title} onBack={onBack} />}
        footer={<PrimaryButton label="Continue" onPress={handleContinue} disabled={!canSubmit} loading={submitting} error={error} />}
      >
        <Headline>Where are you volunteering?</Headline>
        <Text style={s.rationale}>
          We use this to find nearby shifts and match you with someone close enough that
          getting there is easy — nothing else.
        </Text>

        <Pressable
          onPress={handleDetect}
          disabled={detecting}
          accessibilityRole="button"
          accessibilityLabel={`${detected ? detected.label : detecting ? 'Detecting…' : 'Use my current location'}, ${detected ? 'Tap to re-detect' : 'Tap to detect from your device'}`}
          accessibilityState={{ busy: detecting }}
          style={({ pressed }) => [styles.locateCard, pressed && { backgroundColor: colors.tintPressed }]}
        >
          <View style={styles.iconWell}>
            <Icon name="map-pin" size={24} color={colors.ink} />
          </View>
          <View style={styles.locateText}>
            <Text style={[type.subtitle, { color: colors.ink }]}>
              {detected ? detected.label : detecting ? 'Detecting…' : 'Use my current location'}
            </Text>
            <Text style={[type.bodyS, { color: colors.ink2 }]}>
              {detected ? 'Tap to re-detect' : 'Tap to detect from your device'}
            </Text>
          </View>
        </Pressable>

        <Input
          wrapperStyle={s.field}
          label="Or enter your city manually"
          placeholder="San Jose, CA"
          value={manualCity}
          onChangeText={(text) => {
            setManualCity(text);
            if (text) setDetected(null);
          }}
        />
      </KeyboardScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  locateCard: {
    marginTop: 24,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: colors.tint,
  },
  iconWell: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  locateText: { flex: 1 },
});
