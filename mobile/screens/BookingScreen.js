import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { onboardingStyles as s } from '../theme/onboardingStyles';
import { api } from '../api/client';
import { ErrorText, InfoCard, Loading, PillButton, Screen, ShiftCard } from '../components/AppParts';
import DevClockBar from '../components/DevClockBar';

// A booking without a partner: a solo RSVP, or a spot kept after a pairing
// ended. No Deeds are held; cancelling just frees the spot.
export default function BookingScreen({ sessionToken, bookingId, navigate, onBack }) {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api(sessionToken, `/bookings/${bookingId}`).then((b) => {
      if (b.pairing && b.pairing.status !== 'cancelled') navigate('pairing', { pairingId: b.pairing.id }, { replace: true });
      else setBooking(b);
    }).catch(setError);
  }, [sessionToken, bookingId, navigate]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (!booking) return <Screen title="Your spot" onBack={onBack}>{error ? <ErrorText error={error} /> : <Loading />}</Screen>;
  const attended = booking.status === 'attended';
  return (
    <Screen title="Your spot" onBack={onBack}>
      <Text style={s.eyebrow}>{booking.kind === 'solo' ? 'Solo spot' : 'Your shift'}</Text>
      <Text style={s.h2}>{booking.shift.when_label}</Text>
      {booking.status === 'confirmed' && !booking.started ? (
        <Text style={s.rationale}>You're booked. We'll still try to pair you with someone before it starts — if we do, you'll get a proposal to confirm.</Text>
      ) : null}
      <ShiftCard shift={booking.shift} />
      {booking.started && booking.status === 'confirmed' ? (
        <InfoCard title="It's shift time" body="Find the staff when you arrive and they will check you in." />
      ) : null}
      {attended ? <InfoCard tone="ok" title="✓ You're checked in" body="Thanks for showing up." /> : null}
      {attended && booking.ended ? <PillButton label="Rate the shift" onPress={() => navigate('rating', { bookingId })} style={{ marginTop: 14 }} /> : null}
      {booking.status === 'confirmed' && !booking.started ? (
        <Text style={[{ marginTop: 22, textAlign: 'center', color: '#B4543A', fontFamily: 'Inter_600SemiBold' }]} onPress={() => navigate('cancel', { bookingId })}>
          Can't make it? Cancel your spot
        </Text>
      ) : null}
      <PillButton label="Back to home" ghost onPress={() => navigate('home', {}, { reset: true })} style={{ marginTop: 18 }} />
      <DevClockBar sessionToken={sessionToken} onAdvanced={load} jumps={[['→ shift start', booking.shift.starts_at], ['→ shift end', booking.shift.ends_at]]} />
    </Screen>
  );
}
