import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, Loading, PillButton, RatingIcons, Screen } from '../components/AppParts';

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
        <View style={app.doneWrap}>
          <View style={app.doneBadge}><Text style={app.doneBadgeText}>✓</Text></View>
          <Text style={[s.h2, { textAlign: 'center' }]}>Nice work.</Text>
          <Text style={[s.rationale, { textAlign: 'center', fontSize: 14.5, maxWidth: 280 }]}>
            {form.hours} hours at {form.shift.org_name}{form.partner ? `, with ${form.partner.display_name}` : ''}.
            {result?.became_buddies ? ` You and ${form.partner.display_name} both said yes — you're volunteer buddies now.` : ' See you again soon.'}
          </Text>
        </View>
        <Text style={[app.quietLink, { marginTop: 24 }]} onPress={() => navigate('home', {}, { reset: true })}>Go to your dashboard</Text>
      </Screen>
    );
  }

  const needsOrg = !form.org_rated;
  const needsPartner = form.partner && !form.partner_rated;
  const ready = (!needsOrg || (operational && fit)) && (!needsPartner || again !== null);

  return (
    <Screen key="form" title="Rate your shift" onBack={onBack} footer={<PrimaryButton label="Submit" onPress={submit} disabled={!ready || busy} loading={busy} />}>
      <Text style={s.eyebrow}>Shift complete</Text>
      <Text style={s.h2}>How'd it go?</Text>

      {needsOrg ? (
        <>
          <View style={{ marginTop: 20 }}>
            <Text style={app.h3}>Rate {form.shift.org_name}</Text>
            <Text style={s.rationale}>Was it well-run — clear instructions, enough real work to do? This shows publicly on their profile.</Text>
            <RatingIcons value={operational} onChange={setOperational} />
          </View>
          <View style={{ marginTop: 18 }}>
            <Text style={[s.label, { color: '#20291F' }]}>Did this cause resonate with you?</Text>
            <RatingIcons value={fit} onChange={setFit} />
            <Text style={app.privateNote}>🔒 Private — only tunes your own matching, never shown to the org{form.partner ? ` or ${form.partner.display_name}` : ''}.</Text>
          </View>
        </>
      ) : null}

      {needsPartner ? (
        <>
          <View style={app.divider} />
          <Text style={app.h3}>How about {form.partner.display_name}?</Text>
          <TouchableOpacity style={[s.toggleRow]} onPress={() => setShowedUp((v) => !v)}>
            <Text style={s.toggleLabel}>They showed up</Text>
            <View style={[s.switchTrack, showedUp && s.switchTrackOn]}><View style={[s.switchThumb, showedUp && s.switchThumbOn]} /></View>
          </TouchableOpacity>
          <Text style={[s.rationale, { marginTop: 16, fontFamily: 'Inter_600SemiBold' }]}>Would you volunteer with them again?</Text>
          <View style={app.thumbRow}>
            <TouchableOpacity style={[app.thumbBtn, again === true && app.thumbBtnUp]} onPress={() => setAgain(true)} accessibilityLabel="Yes">
              <Text style={{ fontSize: 24 }}>👍</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[app.thumbBtn, again === false && app.thumbBtnDown]} onPress={() => setAgain(false)} accessibilityLabel="No">
              <Text style={{ fontSize: 24 }}>👎</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.rationale, { marginTop: 10 }]}>
            If you both say yes, you become volunteer buddies ({form.buddy_slots.used} of {form.buddy_slots.cap} buddy slots used). Otherwise nothing happens and neither of you is told how the other answered. A 👎 also means we won't pair you two again.
          </Text>
        </>
      ) : null}

      {form.org_rating_of_you ? (
        <View style={app.safetyCard}>
          <Text style={app.safetyTitle}>What {form.shift.org_name} said about your shift</Text>
          <Text style={app.safetyBody}>Attendance: {form.org_rating_of_you.attendance} · Contribution: {form.org_rating_of_you.contribution}</Text>
          <PillButton
            label={form.org_rating_public ? 'Shown on your profile — hide it' : 'Show it on your profile'}
            ghost
            onPress={togglePublic}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}
      <ErrorText error={error} />
    </Screen>
  );
}
