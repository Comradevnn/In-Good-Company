import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { radii, type } from '../theme/tokens';
import { api } from '../api/client';
import { Avatar, Button, Card, ErrorText, Input, LinkButton, Loading, PillButton, RatingIcons, Screen, ShiftCard, Tag } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// Shift-day roster for org staff: first name and verified badge only, a
// check-in button (which returns the volunteer's held Deeds), a no-show
// button once the shift has started, and the post-shift rating of each
// volunteer's attendance and contribution, separately. A shift that hasn't
// started can be cancelled here; the reason stays with the org and our team.
const REASON_MAX = 200;
export default function OrgRosterScreen({ sessionToken, shiftId, onBack }) {
  const [data, setData] = useState(null);
  const [rating, setRating] = useState({});
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadFailed = useRef(false);
  // A recovered load clears only the error a failed load left, not one from an action.
  const load = useCallback(() => api(sessionToken, `/orgs/mine/shifts/${shiftId}/roster`).then((d) => {
    setData(d);
    if (loadFailed.current) { loadFailed.current = false; setError(null); }
  }).catch((err) => { loadFailed.current = true; setError(err); }), [sessionToken, shiftId]);
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

  async function cancelShift() {
    setCancelling(true);
    setError(null);
    try {
      const out = await api(sessionToken, `/orgs/mine/shifts/${shiftId}/cancel`, { method: 'POST', body: reason.trim() ? { reason: reason.trim() } : {} });
      const n = out.volunteers_notified ?? 0;
      setNotice(n === 0 ? 'This shift is cancelled. Nobody was booked.' : `This shift is cancelled. ${n} ${n === 1 ? 'volunteer was' : 'volunteers were'} told.`);
      setConfirming(false);
      setReason('');
    } catch (err) {
      if (err.code === 'already_cancelled' || err.code === 'shift_started') {
        setNotice(err.code === 'already_cancelled' ? 'This shift was already cancelled.' : 'This shift has already started, so it can no longer be cancelled.');
        setConfirming(false);
      } else {
        setError(err);
      }
    } finally {
      setCancelling(false);
      await load();
    }
  }

  if (!data) return <Screen title="Roster" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const { shift, roster } = data;
  const cancelled = shift.status === 'cancelled';
  const canCancel = !cancelled && Date.parse(shift.starts_at) > Date.now();
  const STATUS = { confirmed: 'Booked', attended: 'Checked in', no_show: 'No-show', unverified: 'Not recorded' };
  return (
    <Screen title="Roster" onBack={onBack}>
      {cancelled ? <Tag label="Cancelled" tone="ink" style={styles.cancelledTag} /> : null}
      <ShiftCard shift={{ ...shift, org_name: shift.org?.name || shift.title }} eyebrow={cancelled ? 'Cancelled shift' : `${shift.capacity_booked} of ${shift.capacity_total} spots booked`} />
      {notice ? <Text style={[s.rationale, { marginTop: 12 }]}>{notice}</Text> : null}
      {cancelled ? null : (
        <Text style={[s.rationale, { marginTop: 12 }]}>Check people in as they arrive — that's what confirms they showed up. Mark a no-show only once the shift has started.</Text>
      )}
      {roster.length === 0 && !cancelled ? <Text style={[s.rationale, { marginTop: 16 }]}>Nobody is booked yet.</Text> : null}
      {roster.map((r) => {
        const draft = rating[r.booking_id] ?? {};
        return (
          <View key={r.booking_id} style={styles.row}>
            <View style={styles.top}>
              {/* The roster carries no user id, so the booking id picks a stable disc colour. */}
              <Avatar name={r.first_name} size={48} userId={r.booking_id} meId={null} />
              <View style={styles.who}>
                <Text style={styles.name}>{r.first_name}</Text>
                <Text style={styles.sub}>{r.paired ? 'Paired' : 'Solo'}</Text>
                {r.verified_badge ? (
                  <Tag label="Verified" tone="outline" icon="shield-check" style={styles.badge} />
                ) : (
                  <Text style={styles.sub}>Badge not confirmed</Text>
                )}
              </View>
              <Tag label={STATUS[r.status]} icon={r.status === 'attended' ? 'check' : undefined} />
            </View>
            {r.status === 'confirmed' && !cancelled ? (
              <View style={styles.actions}>
                <PillButton label="Check in" accessibilityLabel={`Check in ${r.first_name}`} onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/check-in`)} style={styles.flex} />
                <PillButton label="No-show" accessibilityLabel={`Mark ${r.first_name} as a no-show`} ghost onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/no-show`)} style={styles.flex} />
              </View>
            ) : null}
            {['attended', 'no_show'].includes(r.status) ? (
              r.rating ? (
                <Text style={[styles.sub, { marginTop: 12 }]}>Rated — attendance {r.rating.attendance}/5, contribution {r.rating.contribution}/5</Text>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={s.label}>Attendance</Text>
                  <RatingIcons label={`Attendance for ${r.first_name}`} value={draft.attendance} onChange={(v) => setRating((p) => ({ ...p, [r.booking_id]: { ...draft, attendance: v } }))} />
                  <Text style={[s.label, { marginTop: 16 }]}>Contribution</Text>
                  <RatingIcons label={`Contribution for ${r.first_name}`} value={draft.contribution} onChange={(v) => setRating((p) => ({ ...p, [r.booking_id]: { ...draft, contribution: v } }))} />
                  <PillButton
                    label="Save rating"
                    accessibilityLabel={`Save rating for ${r.first_name}`}
                    disabled={!(draft.attendance && draft.contribution)}
                    onPress={() => act(`/orgs/mine/bookings/${r.booking_id}/rate`, draft)}
                    style={{ marginTop: 16 }}
                  />
                </View>
              )
            ) : null}
          </View>
        );
      })}
      <ErrorText error={error} />
      {canCancel && confirming ? (
        <Card tone="field" style={{ marginTop: 24 }}>
          <Text style={styles.confirmTitle}>Cancel this shift?</Text>
          <Text style={[styles.sub, { marginTop: 8 }]}>Everyone booked gets their Deeds back and a message that the shift is off.</Text>
          <Input
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            maxLength={REASON_MAX}
            multiline
            placeholder="Volunteers don't see this."
            wrapperStyle={{ marginTop: 16 }}
          />
          <Button label="Cancel this shift" onPress={cancelShift} disabled={cancelling} loading={cancelling} style={{ marginTop: 16 }} />
          <Button label="Keep the shift" ghost onPress={() => { setConfirming(false); setReason(''); }} disabled={cancelling} style={{ marginTop: 12 }} />
        </Card>
      ) : null}
      {canCancel && !confirming ? <LinkButton label="Cancel this shift" danger onPress={() => setConfirming(true)} style={{ marginTop: 24 }} /> : null}
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={[['To shift start', shift.starts_at], ['To shift end', shift.ends_at]]} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancelledTag: { alignSelf: 'flex-start', marginBottom: 12 },
  confirmTitle: { ...type.subtitleL, color: colors.ink },
  row: { borderRadius: radii.card, padding: 20, marginTop: 8, backgroundColor: colors.tint },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  who: { flex: 1, alignItems: 'flex-start' },
  name: { ...type.subtitleL, color: colors.ink },
  sub: { ...type.bodyS, color: colors.ink2 },
  badge: { marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  flex: { flex: 1 },
});
