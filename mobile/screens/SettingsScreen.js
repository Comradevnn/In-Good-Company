import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import OnboardingTopBar from '../components/OnboardingTopBar';

// Account settings: lets a signed-in user reopen and resubmit any
// onboarding screen via the existing PATCH /users/me / POST /users routes,
// instead of there being no way to edit a profile after onboarding.
function parseJsonArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summarize(profile) {
  const interestTags = profile.interest_tags ? parseJsonArray(profile.interest_tags) : [];
  const causeTags = profile.cause_tags ? parseJsonArray(profile.cause_tags) : [];

  const basicProfile = [profile.display_name, profile.age, profile.occupation]
    .filter(Boolean)
    .join(', ') || 'Not set';

  let location = 'Not set';
  if (profile.location_city) location = profile.location_city;
  else if (profile.location_lat != null && profile.location_lng != null) location = 'Location saved';

  let causeOrOrg = 'Not set';
  if (profile.prospective_org_name) causeOrOrg = profile.prospective_org_name;
  else if (causeTags.length > 0) causeOrOrg = causeTags.join(', ');

  const partnerPrefs = profile.partner_prefs_confirmed
    ? `${profile.gender_pref === 'same_gender_only' ? 'Same gender only' : 'Any gender'}, ${
        profile.seeking === 'friendship_only' ? 'friendship only' : 'open to romance'
      }`
    : 'Not set';

  let availability = 'Not set';
  if (profile.availability_window_start && profile.availability_window_end) {
    availability = `${profile.availability_window_start} to ${profile.availability_window_end}, ${profile.travel_radius_miles} mi, ${profile.volunteering_frequency ?? ''}`.trim();
  }

  return {
    basicProfile,
    hobbies: interestTags.join(', '),
    location,
    causeOrOrg,
    partnerPrefs,
    availability,
    verification: profile.verified ? 'Verified (preview)' : 'Not verified',
  };
}

function Row({ label, value, onPress }) {
  return (
    <TouchableOpacity style={rowStyle} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1 }}>
        <Text style={rowLabel}>{label}</Text>
        <Text style={rowValue}>{value}</Text>
      </View>
      {onPress ? <Text style={s.optionArrow}>→</Text> : null}
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ profile, onBack, onEditSection, onVerify, onLogOut }) {
  const summary = summarize(profile ?? {});

  return (
    <View style={s.container}>
      <OnboardingTopBar title="Account settings" onBack={onBack} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={s.h2}>Account settings</Text>
        <Text style={[s.rationale, { marginBottom: 8 }]}>
          Edit anything below — changes save the same way they did during onboarding.
        </Text>

        <Row label="Basic profile" value={summary.basicProfile} onPress={() => onEditSection('quickProfile')} />
        <Row label="Location" value={summary.location} onPress={() => onEditSection('location')} />
        <Row label="Causes / org" value={summary.causeOrOrg} onPress={() => onEditSection('orgOrCause')} />
        <Row label="Partner preferences" value={summary.partnerPrefs} onPress={() => onEditSection('partnerPrefs')} />
        <Row label="Availability" value={summary.availability} onPress={() => onEditSection('availability')} />
        <Row label="Verification" value={summary.verification} onPress={onVerify} />

        {/* Testing convenience (multi-account demo prep) — no confirmation
            dialog, per the ask; just clears the token and drops to signup. */}
        <Text style={logOutLink} onPress={onLogOut}>
          Log out
        </Text>
      </ScrollView>
    </View>
  );
}

const logOutLink = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13.5,
  color: colors.danger,
  textAlign: 'center',
  marginTop: 24,
};

const rowStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: 14,
  padding: 14,
  marginTop: 10,
  backgroundColor: colors.surface,
};
const rowLabel = {
  fontFamily: 'Inter_600SemiBold',
  fontSize: 13,
  color: colors.inkSoft,
};
const rowValue = {
  fontFamily: 'Inter_400Regular',
  fontSize: 14.5,
  color: colors.ink,
  marginTop: 3,
};
