import { Image, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { onboardingStyles as s } from '../theme/onboardingStyles';

// Liability waiver / consent form: a photo of the org's own signed waiver,
// or the platform default. value is { uri, base64, mime } | 'default' | null.
export default function WaiverPicker({ value, onChange }) {
  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      onChange({ uri: asset.uri, base64: asset.base64, mime: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
    }
  }
  const uploaded = value && value !== 'default';
  return (
    <View>
      <TouchableOpacity style={s.locateCard} onPress={pick}>
        {uploaded ? (
          <>
            <Image source={{ uri: value.uri }} style={{ width: 120, height: 90, borderRadius: 8 }} />
            <Text style={[s.successText, { marginTop: 8 }]}>✓ Waiver chosen — tap to replace</Text>
          </>
        ) : (
          <>
            <Text style={s.pin}>📄</Text>
            <Text style={[s.optionTitle, { marginTop: 8 }]}>Tap to upload a photo of your waiver</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={s.toggleRow} onPress={() => onChange(value === 'default' ? null : 'default')}>
        <Text style={s.toggleLabel}>Use the platform's default waiver instead</Text>
        <View style={[s.switchTrack, value === 'default' && s.switchTrackOn]}><View style={[s.switchThumb, value === 'default' && s.switchThumbOn]} /></View>
      </TouchableOpacity>
    </View>
  );
}

export function waiverBody(value) {
  return value === 'default' ? { use_default: true } : { mime: value.mime, data_base64: value.base64 };
}
