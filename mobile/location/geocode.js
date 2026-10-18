import * as Location from 'expo-location';

// Coordinates are what make the travel-distance limit apply (matching skips
// the distance check when either side has none), so both the device-location
// and typed-place paths try to produce them.

// Typed place → { lat, lng } or null. iOS geocodes without an API key;
// Android needs location permission first.
export async function geocodePlace(text) {
  const query = text?.trim();
  if (!query) return null;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') await Location.requestForegroundPermissionsAsync();
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  } catch {
    return null;
  }
}

// Device location → { lat, lng, label }. Throws a readable error.
export async function detectLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied — type your city instead.');
  const position = await Location.getCurrentPositionAsync({});
  let label = 'Location detected';
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    if (place) label = [place.city, place.region].filter(Boolean).join(', ') || label;
  } catch {
    // Keep the generic label; the coordinates are what matter.
  }
  return { lat: position.coords.latitude, lng: position.coords.longitude, label };
}
