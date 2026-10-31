import { Text } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { Headline, LinkButton, ListRow, Screen } from '../components/AppParts';

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

export default function SettingsScreen({ profile, onBack, onEditSection, onVerify, onLogOut }) {
  const summary = summarize(profile ?? {});

  return (
    <Screen title="Account settings" onBack={onBack}>
      <Headline>Account settings</Headline>
      <Text style={[type.bodyS, { color: colors.ink2, marginTop: 8, marginBottom: 16 }]}>
        Edit anything below — changes save the same way they did during onboarding.
      </Text>

      <ListRow icon="person" label="Basic profile" sublabel={summary.basicProfile} onPress={() => onEditSection('quickProfile')} />
      <ListRow icon="map-pin" label="Location" sublabel={summary.location} onPress={() => onEditSection('location')} />
      <ListRow icon="heart" label="Causes / org" sublabel={summary.causeOrOrg} onPress={() => onEditSection('orgOrCause')} />
      <ListRow icon="people" label="Partner preferences" sublabel={summary.partnerPrefs} onPress={() => onEditSection('partnerPrefs')} />
      <ListRow icon="calendar" label="Availability" sublabel={summary.availability} onPress={() => onEditSection('availability')} />
      <ListRow icon="shield-check" label="Verification" sublabel={summary.verification} onPress={onVerify} />

      {/* Testing convenience (multi-account demo prep) — no confirmation
          dialog, per the ask; just clears the token and drops to signup. */}
      <LinkButton label="Log out" danger onPress={onLogOut} style={{ marginTop: 24 }} />
    </Screen>
  );
}
