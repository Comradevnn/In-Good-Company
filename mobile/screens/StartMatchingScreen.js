import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, type } from '../theme/tokens';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import {
  Card, ErrorText, Field, Headline, Icon, InfoCard, Input, LinkButton, Loading, Screen, SectionTitle, Toggle,
} from '../components/AppParts';

// "Find your next shift": confirms the dates/distance from the user's saved
// availability (editable via the existing AvailabilityScreen), lets them
// choose between an existing buddy and someone new, and starts the search.
const ERROR_ACTIONS = {
  verification_incomplete: ['Verify your ID', 'verify'],
  insufficient_deeds: ['Get Deeds', 'deeds'],
  monthly_cap_reached: ['See Premium', 'premium'],
  ineligible_data_incomplete: ['Add causes', 'editCauses'],
};

export default function StartMatchingScreen({ sessionToken, profile, buddy, navigate, onBack }) {
  const [home, setHome] = useState(null);
  const [buddyId, setBuddyId] = useState(buddy?.user_id ?? null);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [anyone, setAnyone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, '/me/home').then(setHome).catch(setError);
  }, [sessionToken]);

  const start = profile?.availability_window_start;
  const end = profile?.availability_window_end;
  const today = home ? home.today : null; // platform-local calendar day
  const datesStale = !start || !end || (today && end <= today);

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      await api(sessionToken, '/requests', {
        method: 'POST',
        body: {
          window_start: start,
          window_end: end,
          travel_radius_miles: profile.travel_radius_miles,
          buddy_user_id: buddyId ?? undefined,
          match_preference: anyone && !buddyId ? 'anyone' : 'best',
          ...(ageMin ? { age_min: Number(ageMin) } : {}),
          ...(ageMax ? { age_max: Number(ageMax) } : {}),
        },
      });
      navigate('waiting', {}, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!home) return <Screen title="Find a shift" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const action = error?.code ? ERROR_ACTIONS[error.code] : null;

  return (
    <Screen
      title="Find a shift"
      onBack={onBack}
      footer={<PrimaryButton label="Start looking" onPress={handleStart} disabled={submitting || datesStale} loading={submitting} />}
    >
      <Headline>When can you go?</Headline>
      <Text style={[s.rationale, { marginTop: 8 }]}>We'll look for a partner and a shift that fits both of you in this window.</Text>

      <Pressable
        onPress={() => navigate('editAvailability')}
        accessibilityRole="button"
        accessibilityLabel="Change dates or distance"
        style={{ marginTop: 24 }}
      >
        {({ pressed }) => (
          <Card style={pressed && { backgroundColor: colors.tintPressed }}>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Dates</Text>
              <Text style={styles.lineValue}>{start && end ? `${start} to ${end}` : 'Not set'}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Travel distance</Text>
              <Text style={styles.lineValue}>{profile?.travel_radius_miles ?? '—'} mi</Text>
            </View>
            <Text style={styles.changeLink}>Change dates or distance</Text>
          </Card>
        )}
      </Pressable>
      {datesStale ? <InfoCard tone="warn" title="Pick new dates" body="Your saved dates have passed — tap above to choose new ones." /> : null}

      {home.buddies.length ? (
        <>
          <SectionTitle title="Who with?" />
          {[{ user_id: null, display_name: 'Meet someone new' }, ...home.buddies].map((b) => {
            const selected = buddyId === b.user_id;
            const title = b.user_id ? `Go with ${b.display_name}` : b.display_name;
            const subtitle = b.user_id ? `We'll pair you once ${b.display_name} picks overlapping dates too.` : 'Open to a new volunteer partner.';
            return (
              <Pressable
                key={b.user_id ?? 'new'}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && { backgroundColor: selected ? colors.fieldPressed : colors.tintPressed },
                ]}
                onPress={() => setBuddyId(b.user_id)}
                accessibilityRole="radio"
                accessibilityLabel={`${title}. ${subtitle}`}
                accessibilityState={{ selected }}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionSubtitle}>{subtitle}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <Icon name="check" size={18} color={colors.onInk} /> : null}
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}

      {home.match_options?.anyone_available && !buddyId ? (
        <Toggle
          style={{ marginTop: 24 }}
          value={anyone}
          onValueChange={setAnyone}
          label="Match me with anyone available"
          description={anyone
            ? "We'll pair you with the first good partner who fits your dates — usually sooner."
            : "Off: we take our time to find you a really good match. Booking early gives us the most time."}
        />
      ) : null}

      {home.premium.tier === 'premium' ? (
        <Field label="Partner age range (Premium, optional)" style={{ marginTop: 24 }}>
          <View style={[s.row, { marginTop: 8 }]}>
            <Input wrapperStyle={styles.flex} placeholder="Min" accessibilityLabel="Minimum age" keyboardType="number-pad" value={ageMin} onChangeText={setAgeMin} />
            <Input wrapperStyle={styles.flex} placeholder="Max" accessibilityLabel="Maximum age" keyboardType="number-pad" value={ageMax} onChangeText={setAgeMax} />
          </View>
          <Text style={[s.rationale, { marginTop: 8 }]}>Only narrows your own matches — it never moves you ahead of anyone.</Text>
        </Field>
      ) : null}

      <Card tone="ink" style={{ marginTop: 24 }}>
        <View style={styles.line}>
          <Text style={styles.inkLabel}>Deeds available</Text>
          <Text style={styles.inkValue}>{home.deeds.available}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.inkLabel}>Held when you confirm a shift</Text>
          <Text style={styles.inkValue}>{home.deeds.shift_price}</Text>
        </View>
        <Text style={styles.inkFine}>
          Nothing is held until you've seen the exact shift and said yes. Show up and they come straight back.
        </Text>
      </Card>
      {home.deeds.available < home.deeds.shift_price ? (
        <LinkButton label="Get Deeds" align="left" onPress={() => navigate('deeds')} style={{ marginTop: 8 }} />
      ) : null}

      <ErrorText error={error} />
      {action ? <LinkButton label={action[0]} align="left" onPress={() => navigate(action[1])} style={{ marginTop: 8 }} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  lineLabel: { ...type.bodyS, color: colors.ink2, flexShrink: 1 },
  lineValue: { ...type.label, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  changeLink: { ...type.body, fontFamily: type.label.fontFamily, color: colors.ink, textDecorationLine: 'underline', marginTop: 8 },
  option: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 16,
    borderRadius: radii.notice, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.tint,
  },
  optionSelected: { borderColor: colors.ink, backgroundColor: colors.selected },
  optionText: { flex: 1 },
  optionTitle: { ...type.subtitle, color: colors.ink },
  optionSubtitle: { ...type.bodyS, color: colors.ink, marginTop: 2 },
  radio: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: colors.ink, backgroundColor: colors.ink },
  inkLabel: { ...type.bodyS, color: colors.onInk2, flexShrink: 1 },
  inkValue: { ...type.titleS, color: colors.accent },
  inkFine: { ...type.bodyS, color: colors.onInk2, marginTop: 8 },
});
