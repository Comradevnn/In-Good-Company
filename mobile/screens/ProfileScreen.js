import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import PrimaryButton from '../components/PrimaryButton';
import { Card, Heading, LinkButton, ListRow, PersonDisc, Screen } from '../components/AppParts';

// Profile summary, reachable from the home dashboard (HomeScreen). Just
// displays what GET /users/me already returns.
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
    <View style={styles.fieldRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen({ profile, onVerify, onFindMatch, onDeeds, onSettings, onBack }) {
  const causeTags = profile?.cause_tags ? parseJsonArray(profile.cause_tags) : [];
  const interestTags = profile?.interest_tags ? parseJsonArray(profile.interest_tags) : [];

  return (
    <Screen
      title={onBack ? 'Your profile' : undefined}
      onBack={onBack}
      footer={<PrimaryButton label="Find a shift" onPress={onFindMatch} />}
    >
      <PersonDisc personKey="you" size={64} accessibilityLabel="You" />
      <Heading level="titleL" style={{ marginTop: 16 }} accessibilityRole="header">
        Hi, {profile?.display_name ?? 'there'}
      </Heading>
      <Text style={[type.bodyS, { color: colors.ink2, marginTop: 4 }]}>Your profile so far.</Text>

      <Card style={{ marginTop: 16, gap: 12 }}>
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
      </Card>

      <ListRow
        icon="shield-check"
        label={profile?.verified ? 'Verification' : 'Verify your ID'}
        onPress={onVerify}
        style={{ marginTop: 16 }}
      />
      <ListRow icon="coin" label="Deeds" onPress={onDeeds} />
      <LinkButton label="Account settings" onPress={onSettings} style={{ marginTop: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldRow: {},
  fieldLabel: { ...type.bodyS, color: colors.ink2 },
  fieldValue: { ...type.fieldValue, color: colors.ink, marginTop: 2 },
});
