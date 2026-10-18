import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, InfoCard, Loading, PillButton, Screen } from '../components/AppParts';

// "Find your next shift": confirms the dates/distance from the user's saved
// availability (editable via the existing AvailabilityScreen), lets them
// choose between an existing buddy and someone new, and starts the search.
const ERROR_ACTIONS = {
  verification_incomplete: ['Verify your ID', 'verify'],
  insufficient_deeds: ['Get Deeds', 'deeds'],
  monthly_cap_reached: ['See Premium', 'premium'],
};

export default function StartMatchingScreen({ sessionToken, profile, buddy, navigate, onBack }) {
  const [home, setHome] = useState(null);
  const [buddyId, setBuddyId] = useState(buddy?.user_id ?? null);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, '/me/home').then(setHome).catch(setError);
  }, [sessionToken]);

  const start = profile?.availability_window_start;
  const end = profile?.availability_window_end;
  const today = home ? home.now.slice(0, 10) : null;
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
      <Text style={s.eyebrow}>Next availability</Text>
      <Text style={s.h2}>When can you go?</Text>
      <Text style={s.rationale}>We'll look for a partner and a shift that fits both of you in this window.</Text>

      <TouchableOpacity style={[app.depositBox]} onPress={() => navigate('editAvailability')}>
        <View style={app.depositLine}>
          <Text style={app.depositLabel}>Dates</Text>
          <Text style={app.depositTotal}>{start && end ? `${start} → ${end}` : 'Not set'}</Text>
        </View>
        <View style={app.depositLine}>
          <Text style={app.depositLabel}>Travel distance</Text>
          <Text style={app.depositTotal}>{profile?.travel_radius_miles ?? '—'} mi</Text>
        </View>
        <Text style={[app.finetext, { color: colors.mossDark, fontFamily: 'Inter_600SemiBold' }]}>Change dates or distance ›</Text>
      </TouchableOpacity>
      {datesStale ? <InfoCard tone="warn" title="Pick new dates" body="Your saved dates have passed — tap above to choose new ones." /> : null}

      {home.buddies.length ? (
        <>
          <Text style={[s.label, { marginTop: 22 }]}>Who with?</Text>
          {[{ user_id: null, display_name: 'Meet someone new' }, ...home.buddies].map((b) => {
            const selected = buddyId === b.user_id;
            return (
              <TouchableOpacity key={b.user_id ?? 'new'} style={[s.optionCard, selected && { borderColor: colors.moss, backgroundColor: colors.mossTint }]} onPress={() => setBuddyId(b.user_id)}>
                <View style={s.optionTextWrap}>
                  <Text style={s.optionTitle}>{b.user_id ? `Go with ${b.display_name}` : b.display_name}</Text>
                  <Text style={s.optionSubtitle}>
                    {b.user_id ? `We'll pair you once ${b.display_name} picks overlapping dates too.` : 'Open to a new volunteer partner.'}
                  </Text>
                </View>
                <Text style={s.optionArrow}>{selected ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      ) : null}

      {home.premium.tier === 'premium' ? (
        <View style={s.field}>
          <Text style={s.label}>Partner age range (Premium, optional)</Text>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Min" keyboardType="number-pad" value={ageMin} onChangeText={setAgeMin} placeholderTextColor={colors.inkSoft} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Max" keyboardType="number-pad" value={ageMax} onChangeText={setAgeMax} placeholderTextColor={colors.inkSoft} />
          </View>
          <Text style={s.rationale}>Only narrows your own matches — it never moves you ahead of anyone.</Text>
        </View>
      ) : null}

      <View style={app.depositBox}>
        <View style={app.depositLine}>
          <Text style={app.depositLabel}>Deeds available</Text>
          <Text style={app.depositTotal}>{home.deeds.available}</Text>
        </View>
        <View style={app.depositLine}>
          <Text style={app.depositLabel}>Held when you confirm a shift</Text>
          <Text style={app.depositTotal}>{home.deeds.shift_price}</Text>
        </View>
        <Text style={app.finetext}>
          Nothing is held until you've seen the exact shift and said yes. Show up and they come straight back.
        </Text>
      </View>
      {home.deeds.available < home.deeds.shift_price ? (
        <PillButton label="Get Deeds" ghost onPress={() => navigate('deeds')} style={{ marginTop: 12 }} />
      ) : null}

      <ErrorText error={error} />
      {action ? <PillButton label={action[0]} onPress={() => navigate(action[1])} style={{ marginTop: 12 }} /> : null}
    </Screen>
  );
}
