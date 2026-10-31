import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii } from '../theme/tokens';
import Icon from './Icon';
import { Toggle } from './Controls';

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
      <Pressable
        style={({ pressed }) => [s.locateCard, pressed && { backgroundColor: colors.tintPressed }]}
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={uploaded ? 'Waiver chosen — tap to replace' : 'Tap to upload a photo of your waiver'}
      >
        {uploaded ? (
          <>
            <Image source={{ uri: value.uri }} style={{ width: 120, height: 90, borderRadius: radii.field }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Icon name="check" size={20} color={colors.success} />
              <Text style={[s.successText, { marginTop: 0 }]}>Waiver chosen — tap to replace</Text>
            </View>
          </>
        ) : (
          <>
            <Icon name="file" size={32} color={colors.ink} />
            <Text style={[s.optionTitle, { marginTop: 12, textAlign: 'center' }]}>Tap to upload a photo of your waiver</Text>
          </>
        )}
      </Pressable>
      <Toggle
        value={value === 'default'}
        onValueChange={() => onChange(value === 'default' ? null : 'default')}
        label="Use the platform's default waiver instead"
        style={{ marginTop: 12 }}
      />
    </View>
  );
}

export function waiverBody(value) {
  return value === 'default' ? { use_default: true } : { mime: value.mime, data_base64: value.base64 };
}
