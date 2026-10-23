import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { type } from '../theme/tokens';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import {
  Chip, DiscPair, ErrorText, Headline, Icon, InfoCard, LinkButton, Loading, PillButton, RatingIcons, Screen,
  SectionHeader, Toggle,
} from '../components/AppParts';

// The signed-in user's id is not passed to this screen; discs use the same placeholder as Home.
const ME = 'me';

// After the shift (plotline "rating" + "done"): rate the org on two separate
// axes — how well-run it was (public) and whether the cause was for you
// (private, only tunes your own matching) — then your partner. Saying you'd
// volunteer together again is private: if you both say yes you become
// buddies, otherwise neither of you is told anything.
export default function RatingScreen({ sessionToken, bookingId, navigate, onBack }) {
  const [form, setForm] = useState(null);
  const [operational, setOperational] = useState(null);
  const [fit, setFit] = useState(null);
  const [showedUp, setShowedUp] = useState(true);
  const [again, setAgain] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, `/bookings/${bookingId}/rating-form`).then(setForm).catch(setError);
  }, [sessionToken, bookingId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = {};
      if (!form.org_rated) Object.assign(body, { org_operational: operational, personal_fit: fit });
      if (form.partner && !form.partner_rated) Object.assign(body, { partner_showed_up: showedUp, volunteer_again: again });
      setResult(await api(sessionToken, `/bookings/${bookingId}/ratings`, { method: 'POST', body }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic() {
    await api(sessionToken, `/bookings/${bookingId}/org-rating-visibility`, { method: 'POST', body: { public: !form.org_rating_public } });
    setForm((f) => ({ ...f, org_rating_public: !f.org_rating_public }));
  }

  if (!form) return <Screen title="Rate your shift" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;

  if (result || (form.org_rated && (!form.partner || form.partner_rated))) {
    return (
      <Screen key="done" footer={<PrimaryButton label="Find your next shift" onPress={() => navigate('startMatching', {}, { replace: true })} />}>
        <View style={styles.done}>
          <DiscPair r={80} d={100} meId={form.partner ? ME : undefined} partnerId={form.partner ? (form.partner.user_id ?? form.partner.display_name) : undefined}>
            <Icon name="check" size={32} color={colors.onLens} />
          </DiscPair>
        </View>
        <Headline style={{ marginTop: 24 }}>Nice work.</Headline>
        <Text style={styles.body}>
          {form.hours} hours at {form.shift.org_name}{form.partner ? `, with ${form.partner.display_name}` : ''}.
          {result?.became_buddies ? ` You and ${form.partner.display_name} both said yes — you're volunteer buddies now.` : ' See you again soon.'}
        </Text>
        <LinkButton label="Go to your dashboard" onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const needsOrg = !form.org_rated;
  const needsPartner = form.partner && !form.partner_rated;
  const ready = (!needsOrg || (operational && fit)) && (!needsPartner || again !== null);

  return (
    <Screen key="form" title="Rate your shift" onBack={onBack} footer={<PrimaryButton label="Submit" onPress={submit} disabled={!ready || busy} loading={busy} />}>
      <Headline>How'd it go?</Headline>

      {needsOrg ? (
        <>
          <SectionHeader title={`Rate ${form.shift.org_name}`} />
          <Text style={styles.body}>Was it well-run — clear instructions, enough real work to do? This shows publicly on their profile.</Text>
          <RatingIcons value={operational} onChange={setOperational} />
          <Text style={styles.question}>Did this cause resonate with you?</Text>
          <RatingIcons value={fit} onChange={setFit} />
          <InfoCard body={`Private — only tunes your own matching, never shown to the org${form.partner ? ` or ${form.partner.display_name}` : ''}.`} />
        </>
      ) : null}

      {needsPartner ? (
        <>
          <SectionHeader title={`How about ${form.partner.display_name}?`} />
          <Toggle label="They showed up" value={showedUp} onValueChange={setShowedUp} />
          <Text style={styles.question}>Would you volunteer with them again?</Text>
          <View style={styles.thumbRow}>
            <Chip label="Yes" selected={again === true} onPress={() => setAgain(true)} />
            <Chip label="No" selected={again === false} onPress={() => setAgain(false)} />
          </View>
          <Text style={[styles.body, { marginTop: 12 }]}>
            If you both say yes, you become volunteer buddies ({form.buddy_slots.used} of {form.buddy_slots.cap} buddy slots used). Otherwise nothing happens and neither of you is told how the other answered. A thumbs down also means we won't pair you two again.
          </Text>
        </>
      ) : null}

      {form.org_rating_of_you ? (
        <InfoCard
          tone="warn"
          title={`What ${form.shift.org_name} said about your shift`}
          body={`Attendance: ${form.org_rating_of_you.attendance}\nContribution: ${form.org_rating_of_you.contribution}`}
        >
          <PillButton
            label={form.org_rating_public ? 'Shown on your profile — hide it' : 'Show it on your profile'}
            ghost
            onPress={togglePublic}
            style={{ marginTop: 12 }}
          />
        </InfoCard>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { marginTop: 24 },
  body: { ...type.bodyS, color: colors.ink2, marginTop: 4 },
  question: { ...type.subtitle, color: colors.ink, marginTop: 24 },
  thumbRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
