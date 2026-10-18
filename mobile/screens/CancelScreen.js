import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';
import { ErrorText, InfoCard, Loading, PillButton, Screen } from '../components/AppParts';

// Cancel a booking (plotline "cancelShift"). The backend computes exactly
// what cancelling costs right now — grace window, Premium's free late
// cancel, or forfeiture — so the user sees the real consequence first.
export default function CancelScreen({ sessionToken, bookingId, navigate, onBack }) {
  const [preview, setPreview] = useState(null);
  const [keepSolo, setKeepSolo] = useState(false);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(sessionToken, `/bookings/${bookingId}/cancel-preview`).then(setPreview).catch(setError);
  }, [sessionToken, bookingId]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setDone(await api(sessionToken, `/bookings/${bookingId}/cancel`, { method: 'POST', body: { keep_spot_solo: keepSolo } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen key="done" title="Cancelled" footer={<PrimaryButton label="Back to home" onPress={() => navigate('home', {}, { reset: true })} />}>
        <Text style={s.h2}>{keepSolo ? "You're going solo" : 'Your shift is cancelled'}</Text>
        <Text style={s.rationale}>
          {done.deeds_outcome === 'released' ? `Your ${done.amount} Deeds are back in your balance. ` : ''}
          {done.deeds_outcome === 'forfeited' ? `Your ${done.amount} Deeds went to the org. ` : ''}
          {done.partner_name ? `${done.partner_name} has been told and offered a new partner or their Deeds back.` : ''}
        </Text>
      </Screen>
    );
  }
  if (!preview) return <Screen title="Cancel shift" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;

  const free = preview.deeds_outcome !== 'forfeited';
  return (
    <Screen
      title="Cancel shift"
      onBack={onBack}
      footer={<PrimaryButton label="Confirm cancellation" onPress={confirm} disabled={busy} loading={busy} />}
    >
      <Text style={s.eyebrow}>Cancel shift</Text>
      <Text style={s.h2}>{preview.partner_name ? `Cancel your shift with ${preview.partner_name}?` : 'Cancel your spot?'}</Text>
      <Text style={s.rationale}>{preview.hours_before_shift} hours before the shift starts.</Text>
      <InfoCard
        tone={free ? 'ok' : 'warn'}
        title={free ? (preview.deeds_outcome === 'none' ? 'No Deeds involved' : "✓ You'll get your Deeds back") : '⚠ Your Deeds go to the org'}
        body={preview.message}
      />
      {preview.partner_message ? <InfoCard body={preview.partner_message} /> : null}
      {preview.can_keep_spot_solo ? (
        <TouchableOpacity style={[s.toggleRow, { marginTop: 16 }]} onPress={() => setKeepSolo((v) => !v)}>
          <Text style={s.toggleLabel}>Keep my spot and go solo instead</Text>
          <View style={[s.switchTrack, keepSolo && s.switchTrackOn]}>
            <View style={[s.switchThumb, keepSolo && s.switchThumbOn]} />
          </View>
        </TouchableOpacity>
      ) : null}
      <ErrorText error={error} />
      <PillButton label="Never mind, keep it" ghost onPress={onBack} style={{ marginTop: 18 }} />
    </Screen>
  );
}
