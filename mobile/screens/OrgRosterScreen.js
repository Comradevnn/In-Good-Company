import { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { app } from '../theme/appStyles';
import { api } from '../api/client';
import { Avatar, ErrorText, Loading, PillButton, RatingIcons, Screen, ShiftCard } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// Shift-day roster for org staff: first name and verified badge only, a
// check-in button (which returns the volunteer's held Deeds), a no-show
// button once the shift has started, and the post-shift rating of each
// volunteer's attendance and contribution, separately.
export default function OrgRosterScreen({ sessionToken, shiftId, onBack }) {
  const [data, setData] = useState(null);
  const [rating, setRating] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(() => api(sessionToken, `/orgs/mine/shifts/${shiftId}/roster`).then(setData).catch(setError), [sessionToken, shiftId]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(path, body) {
    setError(null);
    try {
      await api(sessionToken, path, { method: 'POST', body });
      await load();
    } catch (err) {
      setError(err);
    }
  }

  if (!data) return <Screen title="Roster" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const { shift, roster } = data;
  return (
    <Screen title="Roster" onBack={onBack}>
      <ShiftCard shift={{ ...shift, org_name: shift.title }} eyebrow={`${shift.capacity_booked} of ${shift.capacity_total} spots booked`} />
      <Text style={[s.rationale, { marginTop: 12 }]}>Check people in as they arrive — that's what confirms they showed up. Mark a no-show only once the shift has started.</Text>
      {roster.length === 0 ? <Text style={[s.rationale, { marginTop: 16 }]}>Nobody is booked yet.</Text> : null}
      {roster.map((r) => {
        const draft = rating[r.booking_id] ?? {};
        return (
          <View key={r.booking_id} style={[app.partnerCard, { padding: 14 }]}>
            <View style={app.partnerTop}>
              <Avatar name={r.first_name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={app.buddyName}>{r.first_name}{r.paired ? ' · paired' : ' · solo'}</Text>
                {r.verified_badge ? <View style={app.badgeVerified}><Text style={app.badgeVerifiedText}>✓ Verified</Text></View> : <Text style={app.buddySub}>Badge not confirmed</Text>}
              </View>
              <Text style={app.buddySub}>{{ confirmed: 'Booked', attended: '✓ Checked in', no_show: 'No-show', unverified: 'Not recorded' }[r.status]}</Text>
            </View>
            {r.status === 'confirmed' ? (
              <View style={app.yesNoRow}>
                <PillButton label="Check in" onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/check-in`)} style={{ flex: 1 }} />
                <PillButton label="No-show" ghost onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/no-show`)} style={{ flex: 1 }} />
              </View>
            ) : null}
            {['attended', 'no_show'].includes(r.status) ? (
              r.rating ? (
                <Text style={[app.finetext]}>Rated — attendance {r.rating.attendance}/5, contribution {r.rating.contribution}/5</Text>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <Text style={s.label}>Attendance</Text>
                  <RatingIcons value={draft.attendance} onChange={(v) => setRating((p) => ({ ...p, [r.booking_id]: { ...draft, attendance: v } }))} />
                  <Text style={[s.label, { marginTop: 10 }]}>Contribution</Text>
                  <RatingIcons value={draft.contribution} onChange={(v) => setRating((p) => ({ ...p, [r.booking_id]: { ...draft, contribution: v } }))} />
                  <TouchableOpacity
                    style={[app.pillBtn, { marginTop: 10, alignSelf: 'flex-start' }, !(draft.attendance && draft.contribution) && { opacity: 0.5 }]}
                    disabled={!(draft.attendance && draft.contribution)}
                    onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/rate`, draft)}
                  >
                    <Text style={app.pillBtnText}>Save rating</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : null}
          </View>
        );
      })}
      <ErrorText error={error} />
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={[['→ shift start', shift.starts_at], ['→ shift end', shift.ends_at]]} />
    </Screen>
  );
}
