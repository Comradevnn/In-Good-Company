import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';

// Home screen shown after onboarding/login, replacing the old "You're all
// set" placeholder. Just displays what GET /users/me already returns — no
// new backend logic, no dashboard widgets.
function parseJsonArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function Field({ label, value }) {
  return (
    <View style={fieldRow}>
      <Text style={fieldLabel}>{label}</Text>
      <Text style={fieldValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen({ profile, onVerify, onFindMatch, onDeeds, onSettings }) {
  const causeTags = profile?.cause_tags ? parseJsonArray(profile.cause_tags) : [];
  const interestTags = profile?.interest_tags ? parseJsonArray(profile.interest_tags) : [];

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingTop: 30 }]}>
        <Text style={s.h2}>Hi, {profile?.display_name ?? 'there'}</Text>
        <Text style={[s.rationale, { marginBottom: 8 }]}>Your profile so far.</Text>

        <View style={card}>
          <Field label="Name" value={profile?.display_name || 'Not set'} />
          <Field label="Age" value={profile?.age ?? 'Not set'} />
          <Field label="Occupation" value={profile?.occupation || 'Not set'} />
          <Field label="Verified" value={profile?.verified ? 'Verified (preview)' : 'Not verified'} />
          <Field label="Causes" value={causeTags.length ? causeTags.join(', ') : 'Not set'} />
          <Field label="Interests" value={interestTags.length ? interestTags.join(', ') : 'Not set'} />
          <Field
            label="Gender preference"
            value={profile?.gender_pref === 'same_gender_only' ? 'Same gender only' : 'Any'}
          />
          <Field label="Deeds balance" value={`${profile?.deeds_balance ?? 0} Deeds`} />
        </View>

        <TouchableOpacity style={actionBtn} onPress={onVerify}>
          <Text style={actionBtnText}>{profile?.verified ? 'Verification' : 'Verify your ID'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={actionBtn} onPress={onFindMatch}>
          <Text style={actionBtnText}>Find a match (demo)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={actionBtn} onPress={onDeeds}>
          <Text style={actionBtnText}>Deeds (demo)</Text>
        </TouchableOpacity>
        <Text style={settingsLink} onPress={onSettings}>
          Account settings
        </Text>
      </ScrollView>
    </View>
  );
}

const card = {
  marginTop: 8,
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: 16,
  padding: 4,
  backgroundColor: colors.surface,
};
const fieldRow = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};
const fieldLabel = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 12.5,
  color: colors.inkSoft,
};
const fieldValue = {
  fontFamily: 'Inter_400Regular',
  fontSize: 13.5,
  color: colors.ink,
  flexShrink: 1,
  textAlign: 'right',
};
const actionBtn = {
  borderRadius: 999,
  paddingVertical: 12,
  alignItems: 'center',
  backgroundColor: colors.moss,
  marginTop: 14,
};
const actionBtnText = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 14,
  color: '#F6F4EA',
};
const settingsLink = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13.5,
  color: '#354E37',
  textAlign: 'center',
  marginTop: 18,
};
