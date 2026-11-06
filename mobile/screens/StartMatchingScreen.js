import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, type } from '../theme/tokens';
import { api } from '../api/client';
import { weekdaysSummary } from './availabilityPrefill';
import { readableDate } from '../components/DateField';
import {
  Button, Card, Chip, ErrorState, Field, Footer, Headline, Icon, InfoCard, Input, LinkButton, Loading, Screen, SectionTitle, Toggle,
} from '../components/AppParts';

// "Find your next shift": confirms the dates/distance from the user's saved
// availability (editable via the existing AvailabilityScreen), lets them
// choose between an existing buddy and someone new, and starts the search.
// Every code POST /requests can return gets a next step: [button label, view, navigate options].
const CHANGE_DATES = ['Change dates or days', 'editAvailability'];
const ERROR_ACTIONS = {
  verification_incomplete: ['Verify your ID', 'verify'],
  insufficient_deeds: ['Get Deeds', 'deeds'],
  monthly_cap_reached: ['See Premium', 'premium'],
  premium_required: ['See Premium', 'premium'],
  ineligible_data_incomplete: ['Add causes', 'editCauses'],
  request_open: ['See your search', 'waiting', { replace: true }],
  account_review: ['Back to home', 'home'],
  matching_paused: ['Back to home', 'home'],
  no_weekday_in_window: CHANGE_DATES,
  invalid_weekdays: CHANGE_DATES,
  window_in_past: CHANGE_DATES,
  window_too_soon: CHANGE_DATES,
  invalid_window: CHANGE_DATES,
};
const MAX_HOBBY_FILTER = 3; // the most hobbies the search can ask for

// The person's own hobbies from the profile's JSON text (strings only, short enough to send).
function parseHobbies(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((h) => typeof h === 'string' && h.trim() && h.length <= 40) : [];
  } catch {
    return [];
  }
}

export default function StartMatchingScreen({ sessionToken, profile, buddy, navigate, onBack }) {
  const [home, setHome] = useState(null);
  const [buddyId, setBuddyId] = useState(buddy?.user_id ?? null);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [anyone, setAnyone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hobbyFilter, setHobbyFilter] = useState([]);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  function loadHome() {
    setLoadError(null);
    api(sessionToken, '/me/home').then(setHome).catch(setLoadError);
  }
  useEffect(loadHome, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const hobbies = parseHobbies(profile?.interest_tags);

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
          ...(hobbyFilter.length ? { hobby_filter: hobbyFilter } : {}),
        },
      });
      navigate('waiting', {}, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!home) {
    return (
      <Screen title="Find a shift" onBack={onBack}>
        {loadError ? (
          <ErrorState title="We couldn't load this" body="Check your connection and try again." onRetry={loadHome} retryLabel="Try again" />
        ) : <Loading />}
      </Screen>
    );
  }
  const action = error?.code ? ERROR_ACTIONS[error.code] : null;

  return (
    <Screen
      title="Find a shift"
      onBack={onBack}
      footer={(
        <Footer error={error}>
          {action ? <LinkButton label={action[0]} align="left" onPress={() => navigate(action[1], {}, action[2])} style={{ marginBottom: 8 }} /> : null}
          <Button label="Start looking" onPress={handleStart} disabled={submitting || datesStale} loading={submitting} />
        </Footer>
      )}
    >
      <Headline>When can you go?</Headline>
      <Text style={[s.rationale, { marginTop: 8 }]}>We'll look for a partner and a shift that fits both of you in this window.</Text>

      <Pressable
        onPress={() => navigate('editAvailability')}
        accessibilityRole="button"
        accessibilityLabel="Change dates, days or distance"
        style={{ marginTop: 24 }}
      >
        {({ pressed }) => (
          <Card style={pressed && { backgroundColor: colors.tintPressed }}>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Dates</Text>
              <Text style={styles.lineValue}>{start && end ? `${readableDate(start)} to ${readableDate(end)}` : 'Not set'}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Days</Text>
              <Text style={styles.lineValue}>{weekdaysSummary(profile?.availability_weekdays)}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.lineLabel}>Travel distance</Text>
              <Text style={styles.lineValue}>{profile?.travel_radius_miles ?? '—'} mi</Text>
            </View>
            <Text style={styles.changeLink}>Change dates, days or distance</Text>
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
                accessibilityState={{ checked: selected, selected }}
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

      {home.premium.tier === 'premium' && hobbies.length ? (
        <Field label="Shares one of my hobbies (Premium, optional)" style={{ marginTop: 24 }}>
          <View style={styles.chipGrid}>
            {hobbies.map((hobby) => {
              const selected = hobbyFilter.includes(hobby);
              return (
                <Chip
                  key={hobby}
                  label={hobby}
                  role="checkbox"
                  selected={selected}
                  disabled={!selected && hobbyFilter.length >= MAX_HOBBY_FILTER}
                  onPress={() => setHobbyFilter((list) => (selected ? list.filter((h) => h !== hobby) : [...list, hobby]))}
                />
              );
            })}
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
      {home.deeds.available < home.deeds.shift_price && error?.code !== 'insufficient_deeds' ? (
        <LinkButton label="Get Deeds" align="left" onPress={() => navigate('deeds')} style={{ marginTop: 8 }} />
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
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
